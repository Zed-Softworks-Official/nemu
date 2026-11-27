//! Seam 2 (NEM-63 spec): Core's HTTP router in-process. Pairing with CPace,
//! Local sessions, revocation, and bearer tokens working alongside keys
//! until NEM-131. The Access Client side runs on Core's own CPace and
//! signing code, which the shared wire vectors tie to the TypeScript client.
//!
//! These tests need the isolated test PostgreSQL
//! (`CAPABILITY_TEST_DATABASE_URL`), as the other database tests do.

use std::sync::Arc;

use axum::Router;
use axum::body::Body;
use axum::http::{Request, StatusCode};
use diesel::prelude::*;
use ed25519_dalek::SigningKey;
use serde_json::{Value, json};
use tower::ServiceExt;

use crate::crypto::{ControllerEncryptionKey, ControllerKeypair};
use crate::db::schema::{access_clients, client_tokens, members, pairing_codes, settings};
use crate::identity::ControllerIdentity;
use crate::pairing::codes::{MAX_PAIRING_ATTEMPTS, mint_pairing_code};
use crate::pairing::exchange::RECOVERY_KEY_SETTING;
use crate::pairing::members::insert_member;
use crate::relay_crypto::cpace::{
    CpaceError, Initiator, PairingContext, PartyKeys, ResponderMessage,
};
use crate::relay_crypto::grant::verify_grant;
use crate::relay_crypto::hpke;
use crate::relay_crypto::session::{LocalSessionChallenge, sign_challenge};
use crate::relay_crypto::wire::{b64url_decode, b64url_encode};
use crate::state::{AppState, DbPool, HealthFlags};

const CONTROLLER_ID: &str = "nemu_00000000feedbeef";

async fn empty_home() -> DbPool {
    let pool = crate::db::test_pool();
    let conn = pool.get().await.unwrap();
    conn.interact(|conn| {
        diesel::delete(access_clients::table).execute(conn)?;
        diesel::delete(client_tokens::table).execute(conn)?;
        diesel::delete(members::table).execute(conn)?;
        diesel::delete(pairing_codes::table).execute(conn)?;
        diesel::delete(settings::table.find(RECOVERY_KEY_SETTING)).execute(conn)
    })
    .await
    .unwrap()
    .unwrap();
    pool
}

fn app_state(pool: DbPool) -> AppState {
    AppState {
        db: pool.clone(),
        history_query_pool: pool.clone(),
        history_query_slots: Arc::new(tokio::sync::Semaphore::new(1)),
        history_cursors: Arc::default(),
        registry: Arc::new(crate::devices::registry::DeviceRegistry::new()),
        state_cache: Arc::new(crate::devices::state_cache::StateCache::new()),
        capabilities: Arc::new(crate::capabilities::CapabilityService::new(
            pool.clone(),
            pool,
        )),
        mqtt: crate::mqtt::connection::test_handle(),
        events: tokio::sync::broadcast::channel(8).0,
        health: Arc::new(HealthFlags::default()),
        identity: Arc::new(ControllerIdentity {
            controller_id: CONTROLLER_ID.to_string(),
            name: "Test Home".to_string(),
            keypair: ControllerKeypair::generate(),
            encryption_key: ControllerEncryptionKey::generate(),
        }),
        convex_site_url: None,
        registration_secret: None,
        lan_ip: None,
        updater: Arc::new(crate::updater_control::SocketUpdater::new(
            "/nonexistent/nemu-updater.sock",
        )),
        capability_watches: Arc::default(),
        pairing_runs: Arc::default(),
        local_sessions: Arc::default(),
    }
}

struct Home {
    state: AppState,
    app: Router,
}

impl Home {
    async fn new() -> Self {
        let state = app_state(empty_home().await);
        let app = crate::api::router::router(state.clone());
        Self { state, app }
    }

    async fn call(
        &self,
        method: &str,
        path: &str,
        auth: Option<&str>,
        body: Option<Value>,
    ) -> (StatusCode, Value) {
        let mut request = Request::builder().method(method).uri(path);
        if let Some(auth) = auth {
            request = request.header("authorization", auth);
        }
        let request = match body {
            Some(body) => request
                .header("content-type", "application/json")
                .body(Body::from(body.to_string())),
            None => request.body(Body::empty()),
        }
        .unwrap();
        let response = self.app.clone().oneshot(request).await.unwrap();
        let status = response.status();
        let bytes = axum::body::to_bytes(response.into_body(), 1 << 20)
            .await
            .unwrap();
        let body = if bytes.is_empty() {
            Value::Null
        } else {
            serde_json::from_slice(&bytes).unwrap()
        };
        (status, body)
    }

    async fn pairing_code(&self) -> String {
        mint_pairing_code(&self.state.db).await.unwrap().code
    }

    async fn member(
        &self,
        user_id: Option<&str>,
        email: &str,
        role: &str,
        status: &str,
    ) -> uuid::Uuid {
        insert_member(&self.state.db, user_id, email, None, role, status, None)
            .await
            .unwrap()
            .id
    }

    fn controller_keys(&self) -> PartyKeys {
        PartyKeys {
            signing_key: self
                .state
                .identity
                .keypair
                .signing_key
                .verifying_key()
                .to_bytes(),
            encryption_key: self.state.identity.encryption_key.public_key,
        }
    }
}

/// An Access Client: its keys, and what pairing gave it.
struct Client {
    signing: SigningKey,
    keys: PartyKeys,
    access_client_id: String,
    membership_id: String,
    grant: String,
    pinned: PartyKeys,
}

fn new_keys(seed: u8) -> (SigningKey, PartyKeys) {
    let signing = SigningKey::from_bytes(&[seed; 32]);
    let keys = PartyKeys {
        signing_key: signing.verifying_key().to_bytes(),
        encryption_key: hpke::public_key(&[seed.wrapping_add(100); 32]),
    };
    (signing, keys)
}

fn identity_body(user_id: &str, email: &str) -> Value {
    json!({ "clientLabel": "phone", "userId": user_id, "email": email })
}

/// Why a pairing attempt stopped.
#[derive(Debug, PartialEq)]
enum PairFailure {
    /// The Controller refused a request.
    Refused(StatusCode, String),
    /// The Access Client's own check of the Controller failed.
    Client(CpaceError),
}

async fn try_pair_with(
    home: &Home,
    secret: &str,
    secret_kind: &str,
    seed: u8,
    identity: Value,
) -> Result<Client, PairFailure> {
    let (signing, keys) = new_keys(seed);
    let refused = |(status, body): (StatusCode, Value)| {
        PairFailure::Refused(
            status,
            body["error"]["code"].as_str().unwrap_or("").to_string(),
        )
    };

    let (status, run) = home
        .call(
            "POST",
            "/api/pairing/runs",
            None,
            Some(json!({ "secret": secret_kind })),
        )
        .await;
    if status != StatusCode::CREATED {
        return Err(refused((status, run)));
    }
    assert_eq!(run["controllerId"], CONTROLLER_ID);
    let run_id = run["runId"].as_str().unwrap().to_string();
    let sid = b64url_decode(run["sid"].as_str().unwrap()).unwrap();
    let ctx = PairingContext {
        code: secret,
        controller_id: CONTROLLER_ID,
        sid: &sid,
    };
    let (initiator, message) = Initiator::start(&ctx, &keys);

    let mut body = identity;
    body["ya"] = json!(b64url_encode(&message.ya));
    body["adA"] = json!(b64url_encode(&message.ad_a));
    let (status, reply) = home
        .call(
            "POST",
            &format!("/api/pairing/runs/{run_id}/exchange"),
            None,
            Some(body),
        )
        .await;
    if status != StatusCode::OK {
        return Err(refused((status, reply)));
    }
    let reply = ResponderMessage {
        yb: b64url_decode(reply["yb"].as_str().unwrap())
            .unwrap()
            .try_into()
            .unwrap(),
        ad_b: b64url_decode(reply["adB"].as_str().unwrap()).unwrap(),
        tag_b: b64url_decode(reply["tagB"].as_str().unwrap())
            .unwrap()
            .try_into()
            .unwrap(),
    };
    let outcome = initiator.finish(&reply).map_err(PairFailure::Client)?;

    let (status, paired) = home
        .call(
            "POST",
            &format!("/api/pairing/runs/{run_id}/confirm"),
            None,
            Some(json!({ "tagA": b64url_encode(&outcome.tag_a) })),
        )
        .await;
    if status != StatusCode::OK {
        return Err(refused((status, paired)));
    }
    Ok(Client {
        signing,
        keys,
        access_client_id: paired["accessClientId"].as_str().unwrap().to_string(),
        membership_id: paired["membershipId"].as_str().unwrap().to_string(),
        grant: paired["grant"].as_str().unwrap().to_string(),
        pinned: outcome.controller_keys,
    })
}

async fn try_pair(
    home: &Home,
    code: &str,
    seed: u8,
    identity: Value,
) -> Result<Client, PairFailure> {
    try_pair_with(home, code, "pairingCode", seed, identity).await
}

async fn pair(home: &Home, code: &str, seed: u8, identity: Value) -> Client {
    try_pair(home, code, seed, identity).await.unwrap()
}

async fn open_session(home: &Home, client: &Client) -> Result<String, (StatusCode, String)> {
    let (_, challenge) = home
        .call("POST", "/api/local-sessions/challenge", None, None)
        .await;
    let nonce = b64url_decode(challenge["nonce"].as_str().unwrap()).unwrap();
    let signature = sign_challenge(
        &client.signing,
        &LocalSessionChallenge {
            controller_id: CONTROLLER_ID,
            access_client_id: &client.access_client_id,
            nonce: &nonce,
        },
    );
    let (status, body) = home
        .call(
            "POST",
            "/api/local-sessions",
            None,
            Some(json!({
                "accessClientId": client.access_client_id,
                "nonce": b64url_encode(&nonce),
                "signature": b64url_encode(&signature),
            })),
        )
        .await;
    if status != StatusCode::CREATED {
        return Err((status, body["error"]["code"].as_str().unwrap().to_string()));
    }
    assert_eq!(body["expiresInSeconds"], 600);
    Ok(format!("NemuSession {}", body["session"].as_str().unwrap()))
}

fn code_of(response: &(StatusCode, Value)) -> (StatusCode, &str) {
    (
        response.0,
        response.1["error"]["code"].as_str().unwrap_or(""),
    )
}

fn wrong(code: &str) -> String {
    format!("{:06}", (code.parse::<u32>().unwrap() + 1) % 1_000_000)
}

#[tokio::test]
#[ignore = "requires the isolated PostgreSQL database created by the verification script"]
async fn the_first_owner_pairs_with_cpace_and_gets_a_local_session() {
    let _home = crate::db::HOME_TABLES.lock().await;
    let home = Home::new().await;
    let code = home.pairing_code().await;

    let owner = pair(
        &home,
        &code,
        1,
        identity_body("owner-1", "owner@example.com"),
    )
    .await;

    // The client pinned the real Controller keys, and the grant binds its own.
    assert_eq!(owner.pinned, home.controller_keys());
    let grant = verify_grant(&owner.grant, CONTROLLER_ID, &owner.pinned.signing_key).unwrap();
    assert_eq!(grant.access_client_id, owner.access_client_id);
    assert_eq!(grant.membership_id, owner.membership_id);
    assert_eq!(
        (grant.signing_key, grant.encryption_key),
        (owner.keys.signing_key, owner.keys.encryption_key)
    );

    // Nothing is authorized until a Local session is opened.
    assert_eq!(
        code_of(&home.call("GET", "/api/session", None, None).await),
        (StatusCode::UNAUTHORIZED, "unauthorized")
    );
    let session = open_session(&home, &owner).await.unwrap();
    let (status, body) = home.call("GET", "/api/session", Some(&session), None).await;
    assert_eq!((status, body), (StatusCode::OK, json!({ "role": "owner" })));
    let (status, members) = home.call("GET", "/api/members", Some(&session), None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(members["members"][0]["role"], "owner");

    // The WebSocket passes the session in its query.
    let token = session.strip_prefix("NemuSession ").unwrap();
    let (status, _) = home
        .call("GET", &format!("/api/session?session={token}"), None, None)
        .await;
    assert_eq!(status, StatusCode::OK);

    // The code is spent.
    assert_eq!(
        try_pair(
            &home,
            &code,
            2,
            identity_body("owner-1", "owner@example.com")
        )
        .await
        .err(),
        Some(PairFailure::Refused(
            StatusCode::UNAUTHORIZED,
            "invalid_code".into()
        ))
    );
}

#[tokio::test]
#[ignore = "requires the isolated PostgreSQL database created by the verification script"]
async fn a_wrong_code_fails_on_the_client_and_the_code_runs_out_of_guesses() {
    let _home = crate::db::HOME_TABLES.lock().await;
    let home = Home::new().await;
    let code = home.pairing_code().await;

    for _ in 0..MAX_PAIRING_ATTEMPTS {
        assert_eq!(
            try_pair(
                &home,
                &wrong(&code),
                3,
                identity_body("owner-1", "owner@example.com")
            )
            .await
            .err(),
            Some(PairFailure::Client(CpaceError::ConfirmationFailed))
        );
    }
    // Every run took a guess, so even the right code is now refused.
    assert_eq!(
        try_pair(
            &home,
            &code,
            3,
            identity_body("owner-1", "owner@example.com")
        )
        .await
        .err(),
        Some(PairFailure::Refused(
            StatusCode::UNAUTHORIZED,
            "invalid_code".into()
        ))
    );
    // A fresh code works.
    let code = home.pairing_code().await;
    pair(
        &home,
        &code,
        3,
        identity_body("owner-1", "owner@example.com"),
    )
    .await;
}

#[tokio::test]
#[ignore = "requires the isolated PostgreSQL database created by the verification script"]
async fn wrong_bearer_pairing_guesses_spend_the_code_too() {
    let _home = crate::db::HOME_TABLES.lock().await;
    let home = Home::new().await;
    let code = home.pairing_code().await;
    let legacy = |code: &str| json!({ "code": code, "clientLabel": "old phone", "userId": "owner-1", "email": "owner@example.com" });
    for _ in 0..MAX_PAIRING_ATTEMPTS {
        let response = home
            .call("POST", "/api/pair", None, Some(legacy(&wrong(&code))))
            .await;
        assert_eq!(
            code_of(&response),
            (StatusCode::UNAUTHORIZED, "invalid_code")
        );
    }
    let response = home
        .call("POST", "/api/pair", None, Some(legacy(&code)))
        .await;
    assert_eq!(
        code_of(&response),
        (StatusCode::UNAUTHORIZED, "invalid_code")
    );
}

#[tokio::test]
#[ignore = "requires the isolated PostgreSQL database created by the verification script"]
async fn expired_codes_and_runs_are_refused() {
    let _home = crate::db::HOME_TABLES.lock().await;
    let home = Home::new().await;
    let code = home.pairing_code().await;
    let conn = home.state.db.get().await.unwrap();
    conn.interact(|conn| {
        diesel::update(pairing_codes::table)
            .set(pairing_codes::expires_at.eq(chrono::Utc::now() - chrono::Duration::seconds(1)))
            .execute(conn)
    })
    .await
    .unwrap()
    .unwrap();
    assert_eq!(
        try_pair(
            &home,
            &code,
            4,
            identity_body("owner-1", "owner@example.com")
        )
        .await
        .err(),
        Some(PairFailure::Refused(
            StatusCode::UNAUTHORIZED,
            "invalid_code".into()
        ))
    );

    let response = home
        .call(
            "POST",
            &format!("/api/pairing/runs/{}/confirm", uuid::Uuid::new_v4()),
            None,
            Some(json!({ "tagA": "AA" })),
        )
        .await;
    assert_eq!(
        code_of(&response),
        (StatusCode::NOT_FOUND, "pairing_run_not_found")
    );
}

#[tokio::test]
#[ignore = "requires the isolated PostgreSQL database created by the verification script"]
async fn accepting_an_invitation_pairs_through_the_same_exchange() {
    let _home = crate::db::HOME_TABLES.lock().await;
    let home = Home::new().await;
    home.member(Some("owner-1"), "owner@example.com", "owner", "active")
        .await;
    let invited = home
        .member(None, "guest@example.com", "member", "pending")
        .await;

    let code = home.pairing_code().await;
    let guest = pair(
        &home,
        &code,
        5,
        identity_body("guest-1", "Guest@Example.com"),
    )
    .await;
    assert_eq!(guest.membership_id, invited.to_string());
    let session = open_session(&home, &guest).await.unwrap();
    let (_, body) = home.call("GET", "/api/session", Some(&session), None).await;
    assert_eq!(body, json!({ "role": "member" }));

    // An Account with no Membership or Invitation cannot pair.
    let code = home.pairing_code().await;
    assert_eq!(
        try_pair(
            &home,
            &code,
            6,
            identity_body("stranger", "stranger@example.com")
        )
        .await
        .err(),
        Some(PairFailure::Refused(
            StatusCode::FORBIDDEN,
            "not_a_member".into()
        ))
    );
}

#[tokio::test]
#[ignore = "requires the isolated PostgreSQL database created by the verification script"]
async fn the_role_is_looked_up_on_every_request() {
    let _home = crate::db::HOME_TABLES.lock().await;
    let home = Home::new().await;
    home.member(Some("owner-1"), "owner@example.com", "owner", "active")
        .await;
    home.member(Some("member-1"), "member@example.com", "member", "active")
        .await;
    let code = home.pairing_code().await;
    let client = pair(
        &home,
        &code,
        7,
        identity_body("member-1", "member@example.com"),
    )
    .await;
    let session = open_session(&home, &client).await.unwrap();

    assert_eq!(
        home.call("GET", "/api/session", Some(&session), None)
            .await
            .1,
        json!({ "role": "member" })
    );
    let invite = json!({ "email": "friend@example.com" });
    let response = home
        .call("POST", "/api/members", Some(&session), Some(invite.clone()))
        .await;
    assert_eq!(
        code_of(&response),
        (StatusCode::FORBIDDEN, "owner_required")
    );

    let conn = home.state.db.get().await.unwrap();
    conn.interact(|conn| {
        diesel::update(members::table.filter(members::user_id.eq("member-1")))
            .set(members::role.eq("owner"))
            .execute(conn)
    })
    .await
    .unwrap()
    .unwrap();

    // Same session, same grant: the promotion applies at once.
    assert_eq!(
        home.call("GET", "/api/session", Some(&session), None)
            .await
            .1,
        json!({ "role": "owner" })
    );
    let (status, _) = home
        .call("POST", "/api/members", Some(&session), Some(invite))
        .await;
    assert_eq!(status, StatusCode::CREATED);
}

#[tokio::test]
#[ignore = "requires the isolated PostgreSQL database created by the verification script"]
async fn local_sessions_refuse_bad_signatures_reused_nonces_and_unknown_clients() {
    let _home = crate::db::HOME_TABLES.lock().await;
    let home = Home::new().await;
    let code = home.pairing_code().await;
    let client = pair(
        &home,
        &code,
        8,
        identity_body("owner-1", "owner@example.com"),
    )
    .await;

    let (_, challenge) = home
        .call("POST", "/api/local-sessions/challenge", None, None)
        .await;
    let nonce = b64url_decode(challenge["nonce"].as_str().unwrap()).unwrap();
    let (impostor, _) = new_keys(9);
    let forged = sign_challenge(
        &impostor,
        &LocalSessionChallenge {
            controller_id: CONTROLLER_ID,
            access_client_id: &client.access_client_id,
            nonce: &nonce,
        },
    );
    let attempt = |signature: [u8; 64], id: String| json!({ "accessClientId": id, "nonce": b64url_encode(&nonce), "signature": b64url_encode(&signature) });
    let response = home
        .call(
            "POST",
            "/api/local-sessions",
            None,
            Some(attempt(forged, client.access_client_id.clone())),
        )
        .await;
    assert_eq!(
        code_of(&response),
        (StatusCode::UNAUTHORIZED, "bad_signature")
    );

    // The nonce was spent by the refused attempt.
    let genuine = sign_challenge(
        &client.signing,
        &LocalSessionChallenge {
            controller_id: CONTROLLER_ID,
            access_client_id: &client.access_client_id,
            nonce: &nonce,
        },
    );
    let response = home
        .call(
            "POST",
            "/api/local-sessions",
            None,
            Some(attempt(genuine, client.access_client_id.clone())),
        )
        .await;
    assert_eq!(
        code_of(&response),
        (StatusCode::UNAUTHORIZED, "invalid_challenge")
    );

    let stranger = Client {
        access_client_id: uuid::Uuid::new_v4().to_string(),
        ..client
    };
    assert_eq!(
        open_session(&home, &stranger).await,
        Err((StatusCode::UNAUTHORIZED, "unknown_access_client".into()))
    );
    let response = home
        .call(
            "GET",
            "/api/session",
            Some("NemuSession not-a-session"),
            None,
        )
        .await;
    assert_eq!(
        code_of(&response),
        (StatusCode::UNAUTHORIZED, "local_session_invalid")
    );
}

#[tokio::test]
#[ignore = "requires the isolated PostgreSQL database created by the verification script"]
async fn revoking_an_access_client_ends_its_local_sessions_at_once() {
    let _home = crate::db::HOME_TABLES.lock().await;
    let home = Home::new().await;
    let code = home.pairing_code().await;
    let owner = pair(
        &home,
        &code,
        10,
        identity_body("owner-1", "owner@example.com"),
    )
    .await;
    home.member(Some("member-1"), "member@example.com", "member", "active")
        .await;
    let code = home.pairing_code().await;
    let phone = pair(
        &home,
        &code,
        11,
        identity_body("member-1", "member@example.com"),
    )
    .await;
    let code = home.pairing_code().await;
    let tablet = pair(
        &home,
        &code,
        12,
        identity_body("member-1", "member@example.com"),
    )
    .await;
    let owner_session = open_session(&home, &owner).await.unwrap();
    let phone_session = open_session(&home, &phone).await.unwrap();
    let tablet_session = open_session(&home, &tablet).await.unwrap();

    // Owners see and revoke CPace Access Clients like bearer tokens.
    let (_, listed) = home
        .call("GET", "/api/tokens", Some(&owner_session), None)
        .await;
    let ids: Vec<&str> = listed["tokens"]
        .as_array()
        .unwrap()
        .iter()
        .map(|t| t["id"].as_str().unwrap())
        .collect();
    assert!(
        ids.contains(&phone.access_client_id.as_str())
            && ids.contains(&owner.access_client_id.as_str())
    );
    let (status, _) = home
        .call(
            "DELETE",
            &format!("/api/tokens/{}", tablet.access_client_id),
            Some(&owner_session),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    let response = home
        .call("GET", "/api/session", Some(&tablet_session), None)
        .await;
    assert_eq!(
        code_of(&response),
        (StatusCode::UNAUTHORIZED, "local_session_invalid")
    );

    // An Access Client revokes itself.
    let (status, _) = home
        .call("DELETE", "/api/tokens/current", Some(&phone_session), None)
        .await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    let response = home
        .call("GET", "/api/session", Some(&phone_session), None)
        .await;
    assert_eq!(
        code_of(&response),
        (StatusCode::UNAUTHORIZED, "local_session_invalid")
    );
    assert_eq!(
        open_session(&home, &phone).await,
        Err((StatusCode::UNAUTHORIZED, "unknown_access_client".into()))
    );
    assert_eq!(
        home.call("GET", "/api/session", Some(&owner_session), None)
            .await
            .0,
        StatusCode::OK
    );
}

#[tokio::test]
#[ignore = "requires the isolated PostgreSQL database created by the verification script"]
async fn leaving_a_home_ends_every_access_client_of_the_membership() {
    let _home = crate::db::HOME_TABLES.lock().await;
    let home = Home::new().await;
    home.member(Some("owner-1"), "owner@example.com", "owner", "active")
        .await;
    home.member(Some("member-1"), "member@example.com", "member", "active")
        .await;
    let code = home.pairing_code().await;
    let phone = pair(
        &home,
        &code,
        13,
        identity_body("member-1", "member@example.com"),
    )
    .await;
    let code = home.pairing_code().await;
    let tablet = pair(
        &home,
        &code,
        14,
        identity_body("member-1", "member@example.com"),
    )
    .await;
    let phone_session = open_session(&home, &phone).await.unwrap();
    let tablet_session = open_session(&home, &tablet).await.unwrap();

    let (status, _) = home
        .call("POST", "/api/members/leave", Some(&phone_session), None)
        .await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    for session in [&phone_session, &tablet_session] {
        let response = home.call("GET", "/api/session", Some(session), None).await;
        assert_eq!(
            code_of(&response),
            (StatusCode::UNAUTHORIZED, "local_session_invalid")
        );
    }
}

#[tokio::test]
#[ignore = "requires the isolated PostgreSQL database created by the verification script"]
async fn keys_already_bound_cannot_pair_again() {
    let _home = crate::db::HOME_TABLES.lock().await;
    let home = Home::new().await;
    let code = home.pairing_code().await;
    pair(
        &home,
        &code,
        15,
        identity_body("owner-1", "owner@example.com"),
    )
    .await;
    let code = home.pairing_code().await;
    assert_eq!(
        try_pair(
            &home,
            &code,
            15,
            identity_body("owner-1", "owner@example.com")
        )
        .await
        .err(),
        Some(PairFailure::Refused(
            StatusCode::CONFLICT,
            "access_client_keys_in_use".into()
        ))
    );
}

#[tokio::test]
#[ignore = "requires the isolated PostgreSQL database created by the verification script"]
async fn pairing_codes_are_open_only_until_the_first_access_client() {
    let _home = crate::db::HOME_TABLES.lock().await;
    let home = Home::new().await;
    let (status, _) = home.call("POST", "/api/pairing-code", None, None).await;
    assert_eq!(status, StatusCode::OK);

    let code = home.pairing_code().await;
    let owner = pair(
        &home,
        &code,
        16,
        identity_body("owner-1", "owner@example.com"),
    )
    .await;
    let response = home.call("POST", "/api/pairing-code", None, None).await;
    assert_eq!(
        code_of(&response),
        (StatusCode::UNAUTHORIZED, "unauthorized")
    );
    let session = open_session(&home, &owner).await.unwrap();
    let (status, body) = home
        .call("POST", "/api/pairing-code", Some(&session), None)
        .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["code"].as_str().unwrap().len(), 6);
}

#[tokio::test]
#[ignore = "requires the isolated PostgreSQL database created by the verification script"]
async fn bearer_tokens_keep_working_alongside_keys() {
    let _home = crate::db::HOME_TABLES.lock().await;
    let home = Home::new().await;
    let code = home.pairing_code().await;
    let (status, paired) = home
        .call(
            "POST",
            "/api/pair",
            None,
            Some(json!({ "code": code, "clientLabel": "old phone", "userId": "owner-1", "email": "owner@example.com" })),
        )
        .await;
    assert_eq!(status, StatusCode::OK);
    let bearer = format!("Bearer {}", paired["clientToken"].as_str().unwrap());
    assert_eq!(
        home.call("GET", "/api/session", Some(&bearer), None)
            .await
            .1,
        json!({ "role": "owner" })
    );

    // The bearer Owner mints a code, and a CPace client pairs with it.
    let (_, minted) = home
        .call("POST", "/api/pairing-code", Some(&bearer), None)
        .await;
    let client = pair(
        &home,
        minted["code"].as_str().unwrap(),
        17,
        identity_body("owner-1", "owner@example.com"),
    )
    .await;
    let session = open_session(&home, &client).await.unwrap();
    let (_, listed) = home.call("GET", "/api/tokens", Some(&session), None).await;
    assert_eq!(listed["tokens"].as_array().unwrap().len(), 2);
}

#[tokio::test]
#[ignore = "requires the isolated PostgreSQL database created by the verification script"]
async fn the_recovery_key_authorizes_only_a_new_owner_access_client() {
    let _home = crate::db::HOME_TABLES.lock().await;
    let home = Home::new().await;
    home.member(Some("owner-1"), "owner@example.com", "owner", "active")
        .await;
    home.member(Some("member-1"), "member@example.com", "member", "active")
        .await;
    let recovery_key = "ABCD-EFGH-JKLM-NPQR";

    assert_eq!(
        try_pair_with(
            &home,
            recovery_key,
            "recoveryKey",
            18,
            identity_body("owner-1", "owner@example.com")
        )
        .await
        .err(),
        Some(PairFailure::Refused(
            StatusCode::CONFLICT,
            "recovery_unavailable".into()
        ))
    );
    crate::identity::write_setting(&home.state.db, RECOVERY_KEY_SETTING, recovery_key)
        .await
        .unwrap();

    // A Pairing code is not the Recovery Key.
    let code = home.pairing_code().await;
    assert_eq!(
        try_pair_with(
            &home,
            &code,
            "recoveryKey",
            18,
            identity_body("owner-1", "owner@example.com")
        )
        .await
        .err(),
        Some(PairFailure::Client(CpaceError::ConfirmationFailed))
    );
    assert_eq!(
        try_pair_with(
            &home,
            recovery_key,
            "recoveryKey",
            19,
            identity_body("member-1", "member@example.com")
        )
        .await
        .err(),
        Some(PairFailure::Refused(
            StatusCode::FORBIDDEN,
            "owner_required".into()
        ))
    );
    let owner = try_pair_with(
        &home,
        recovery_key,
        "recoveryKey",
        20,
        identity_body("owner-1", "owner@example.com"),
    )
    .await
    .unwrap();
    let session = open_session(&home, &owner).await.unwrap();
    assert_eq!(
        home.call("GET", "/api/session", Some(&session), None)
            .await
            .1,
        json!({ "role": "owner" })
    );
}
