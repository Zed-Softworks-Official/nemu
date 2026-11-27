//! Seam 2 (NEM-63 spec): Core's Relay handler in-process, fed sealed
//! envelopes from a fake Relay mailbox. The Access Client side seals with
//! Core's own `relay_crypto`, which the shared wire vectors tie to the
//! TypeScript client, and checks every reply against the Controller key it
//! pinned at pairing.
//!
//! These tests need the isolated test PostgreSQL
//! (`CAPABILITY_TEST_DATABASE_URL`), as the other database tests do.

use std::sync::Arc;

use diesel::prelude::*;
use ed25519_dalek::SigningKey;
use serde_json::{Value, json};
use uuid::Uuid;

use super::*;
use crate::crypto::{ControllerEncryptionKey, ControllerKeypair};
use crate::db::schema::{access_clients, command_outcomes, members, rooms, settings};
use crate::identity::ControllerIdentity;
use crate::pairing::access_clients::{AccessClientInput, insert_access_client};
use crate::pairing::members::insert_member;
use crate::relay_crypto::envelope::{open_response, seal_request};
use crate::relay_crypto::hpke;
use crate::relay_crypto::wire::{b64url_decode, b64url_encode};
use crate::state::{AppState, DbPool, HealthFlags};

const CONTROLLER_ID: &str = "nemu_00000000cafef00d";

async fn empty_home() -> DbPool {
    let pool = crate::db::test_pool();
    let conn = pool.get().await.unwrap();
    conn.interact(|conn| {
        // Replay windows and stored outcomes go with their Access Clients.
        diesel::delete(access_clients::table).execute(conn)?;
        diesel::delete(members::table).execute(conn)?;
        // Deleting Access Clients tombstones them, and tests reuse key seeds.
        diesel::sql_query("TRUNCATE access_client_tombstones").execute(conn)?;
        diesel::delete(settings::table.find(IDENTITY_EPOCH_SETTING)).execute(conn)
    })
    .await
    .unwrap()
    .unwrap();
    pool
}

fn app_state(pool: DbPool, identity: Arc<ControllerIdentity>) -> AppState {
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
        identity,
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

fn controller_identity() -> Arc<ControllerIdentity> {
    Arc::new(ControllerIdentity {
        controller_id: CONTROLLER_ID.to_string(),
        name: "Test Home".to_string(),
        keypair: ControllerKeypair::generate(),
        encryption_key: ControllerEncryptionKey::generate(),
    })
}

/// The Relay mailbox between one Access Client and Core: what the client
/// posts, Core handles; what Core posts back, the client reads.
struct Mailbox {
    state: AppState,
}

impl Mailbox {
    async fn deliver(&self, sealed: &SealedRequest) -> Option<SealedResponse> {
        handle_sealed_request(&self.state, sealed).await
    }
}

/// An Access Client paired with the Home, holding the Controller keys it
/// pinned at pairing.
struct Client {
    id: String,
    signing: SigningKey,
    controller_signing_key: [u8; 32],
    controller_encryption_key: [u8; 32],
    counter: u64,
    epoch: u64,
}

struct Sent {
    sealed: SealedRequest,
    keys: RequestKeys,
}

impl Client {
    fn header(&mut self, request_id: &str) -> RequestHeader {
        self.counter += 1;
        RequestHeader {
            controller_id: CONTROLLER_ID.into(),
            identity_epoch: self.epoch,
            access_client_id: self.id.clone(),
            request_id: request_id.into(),
            counter: self.counter,
            expires_at: now_ms() + 20_000,
        }
    }

    fn seal_with(&self, header: RequestHeader, action: &Value, signing: &SigningKey) -> Sent {
        let (sealed, keys) = seal_request(
            header,
            action.to_string().as_bytes(),
            &self.controller_encryption_key,
            signing,
        )
        .unwrap();
        Sent { sealed, keys }
    }

    fn seal(&mut self, request_id: &str, action: Value) -> Sent {
        let header = self.header(request_id);
        self.seal_with(header, &action, &self.signing.clone())
    }

    /// Opens Core's reply against the pinned Controller key.
    fn open(&self, sent: &Sent, reply: Option<SealedResponse>) -> Value {
        let reply = reply.expect("Core answers this request");
        let plaintext = open_response(
            &reply,
            &sent.sealed,
            &sent.keys,
            &self.controller_signing_key,
        )
        .expect("the reply opens with the pinned Controller key");
        serde_json::from_slice(&plaintext).unwrap()
    }
}

fn now_ms() -> u64 {
    u64::try_from(Utc::now().timestamp_millis()).unwrap()
}

struct Home {
    mailbox: Mailbox,
}

impl Home {
    async fn new() -> Self {
        let state = app_state(empty_home().await, controller_identity());
        Self {
            mailbox: Mailbox { state },
        }
    }

    fn state(&self) -> &AppState {
        &self.mailbox.state
    }

    /// Restarts Core on the same database and keys.
    fn restart(&self) -> Self {
        let state = self.state();
        Self {
            mailbox: Mailbox {
                state: app_state(state.db.clone(), state.identity.clone()),
            },
        }
    }

    async fn client(&self, user_id: &str, role: &str, seed: u8) -> Client {
        let member = insert_member(
            &self.state().db,
            Some(user_id),
            &format!("{user_id}@example.com"),
            None,
            role,
            "active",
            None,
        )
        .await
        .unwrap();
        let signing = SigningKey::from_bytes(&[seed; 32]);
        let id = Uuid::new_v4();
        insert_access_client(
            &self.state().db,
            AccessClientInput {
                id,
                member_id: member.id,
                label: "phone".into(),
                signing_key: signing.verifying_key().to_bytes(),
                encryption_key: hpke::public_key(&[seed.wrapping_add(100); 32]),
            },
            None,
        )
        .await
        .unwrap();
        let identity = &self.state().identity;
        Client {
            id: id.to_string(),
            signing,
            controller_signing_key: identity.keypair.signing_key.verifying_key().to_bytes(),
            controller_encryption_key: identity.encryption_key.public_key,
            counter: 0,
            epoch: INITIAL_IDENTITY_EPOCH,
        }
    }

    async fn exchange(&self, client: &Client, sent: &Sent) -> Value {
        client.open(sent, self.mailbox.deliver(&sent.sealed).await)
    }

    async fn count_rooms(&self, name: &str) -> i64 {
        let name = name.to_string();
        let conn = self.state().db.get().await.unwrap();
        conn.interact(move |conn| {
            rooms::table
                .filter(rooms::name.eq(name))
                .count()
                .get_result::<i64>(conn)
        })
        .await
        .unwrap()
        .unwrap()
    }
}

fn error_code(reply: &Value) -> &str {
    reply["error"]["code"].as_str().unwrap_or("")
}

#[tokio::test]
#[ignore = "requires the isolated PostgreSQL database created by the verification script"]
async fn a_sealed_request_is_answered_as_its_access_client() {
    let _home = crate::db::HOME_TABLES.lock().await;
    let home = Home::new().await;
    let mut client = home.client("user_owner", "owner", 1).await;

    let sent = client.seal("r1", json!({ "type": "getSession" }));
    // Convex sees the header and opaque bytes, never the action.
    let on_the_wire = serde_json::to_string(&sent.sealed).unwrap();
    assert!(!on_the_wire.contains("getSession"), "{on_the_wire}");

    let reply = home.exchange(&client, &sent).await;
    assert_eq!(reply, json!({ "type": "session", "role": "owner" }));
}

#[tokio::test]
#[ignore = "requires the isolated PostgreSQL database created by the verification script"]
async fn the_role_is_read_on_every_request() {
    let _home = crate::db::HOME_TABLES.lock().await;
    let home = Home::new().await;
    let mut client = home.client("user_member", "member", 2).await;

    let sent = client.seal("r1", json!({ "type": "getSession" }));
    assert_eq!(home.exchange(&client, &sent).await["role"], "member");

    let conn = home.state().db.get().await.unwrap();
    conn.interact(|conn| {
        diesel::update(members::table.filter(members::user_id.eq("user_member")))
            .set(members::role.eq("owner"))
            .execute(conn)
    })
    .await
    .unwrap()
    .unwrap();
    let sent = client.seal("r2", json!({ "type": "getSession" }));
    assert_eq!(home.exchange(&client, &sent).await["role"], "owner");
}

#[tokio::test]
#[ignore = "requires the isolated PostgreSQL database created by the verification script"]
async fn envelopes_for_another_home_or_garbled_ones_are_dropped() {
    let _home = crate::db::HOME_TABLES.lock().await;
    let home = Home::new().await;
    let mut client = home.client("user_owner", "owner", 1).await;

    let mut header = client.header("r1");
    header.controller_id = "nemu_00000000deadbeef".into();
    let sent = client.seal_with(header, &json!({ "type": "getSession" }), &client.signing);
    assert!(home.mailbox.deliver(&sent.sealed).await.is_none());

    let mut sent = client.seal("r2", json!({ "type": "getSession" }));
    sent.sealed.enc = "!!".into();
    assert!(home.mailbox.deliver(&sent.sealed).await.is_none());
}

#[tokio::test]
#[ignore = "requires the isolated PostgreSQL database created by the verification script"]
async fn a_retired_epoch_is_answered_with_the_current_one_and_readdressed() {
    let _home = crate::db::HOME_TABLES.lock().await;
    let home = Home::new().await;
    let mut client = home.client("user_owner", "owner", 1).await;
    // A restore moved the Home to epoch 2.
    let conn = home.state().db.get().await.unwrap();
    conn.interact(|conn| crate::identity::set_string(conn, IDENTITY_EPOCH_SETTING, "2"))
        .await
        .unwrap()
        .unwrap();

    let sent = client.seal("r1", json!({ "type": "getSession" }));
    let reply = home.exchange(&client, &sent).await;
    assert_eq!(error_code(&reply), "retired_epoch");
    assert_eq!(reply["error"]["details"]["identityEpoch"], 2);

    client.epoch = 2;
    let sent = client.seal("r1", json!({ "type": "getSession" }));
    assert_eq!(home.exchange(&client, &sent).await["type"], "session");
}

#[tokio::test]
#[ignore = "requires the isolated PostgreSQL database created by the verification script"]
async fn an_envelope_past_its_expiry_and_skew_is_refused() {
    let _home = crate::db::HOME_TABLES.lock().await;
    let home = Home::new().await;
    let mut client = home.client("user_owner", "owner", 1).await;
    let action = json!({ "type": "createRoom", "name": "Late Room" });

    let mut header = client.header("r1");
    header.expires_at = now_ms() - CLOCK_SKEW - 1_000;
    let sent = client.seal_with(header, &action, &client.signing);
    let reply = home.exchange(&client, &sent).await;
    assert_eq!(error_code(&reply), "request_expired");
    assert_eq!(home.count_rooms("Late Room").await, 0);

    // Inside the 60 seconds of skew it still runs.
    let mut header = client.header("r2");
    header.expires_at = now_ms() - CLOCK_SKEW + 5_000;
    let sent = client.seal_with(header, &action, &client.signing);
    assert_eq!(home.exchange(&client, &sent).await["type"], "room");
    assert_eq!(home.count_rooms("Late Room").await, 1);
}

const CLOCK_SKEW: u64 = crate::relay_crypto::envelope::CLOCK_SKEW_MS;

#[tokio::test]
#[ignore = "requires the isolated PostgreSQL database created by the verification script"]
async fn unknown_and_tombstoned_access_clients_are_told_to_pair_again() {
    let _home = crate::db::HOME_TABLES.lock().await;
    let home = Home::new().await;
    let mut client = home.client("user_owner", "owner", 1).await;
    let mut stranger = home.client("user_other", "member", 3).await;
    stranger.id = Uuid::new_v4().to_string();

    let sent = stranger.seal("r1", json!({ "type": "getSession" }));
    assert_eq!(
        error_code(&home.exchange(&stranger, &sent).await),
        "unknown_access_client"
    );

    let sent = client.seal("r2", json!({ "type": "revokeCurrent" }));
    assert_eq!(home.exchange(&client, &sent).await["ok"], true);
    // Revocation tombstoned it, so it can never come back.
    let sent = client.seal("r3", json!({ "type": "getSession" }));
    let reply = home.exchange(&client, &sent).await;
    assert_eq!(error_code(&reply), "tombstoned_access_client");
    assert!(
        reply["error"]["message"]
            .as_str()
            .unwrap()
            .contains("Pair it again")
    );
}

#[tokio::test]
#[ignore = "requires the isolated PostgreSQL database created by the verification script"]
async fn a_request_signed_by_another_key_gets_no_reply() {
    let _home = crate::db::HOME_TABLES.lock().await;
    let home = Home::new().await;
    let mut client = home.client("user_owner", "owner", 1).await;
    let impostor = SigningKey::from_bytes(&[42u8; 32]);

    let header = client.header("r1");
    let sent = client.seal_with(
        header,
        &json!({ "type": "createRoom", "name": "Forged Room" }),
        &impostor,
    );
    // Whoever signed it, the Controller answers nothing: a signed
    // `bad_signature` would let Convex make a client drop its keys.
    assert!(home.mailbox.deliver(&sent.sealed).await.is_none());
    assert_eq!(home.count_rooms("Forged Room").await, 0);
}

/// Convex rewrites a client's request in the mailbox. Nothing the Controller
/// sends back may open as the reply to the request the client sent, so no
/// refusal it earns can make that client drop its keys.
#[tokio::test]
#[ignore = "requires the isolated PostgreSQL database created by the verification script"]
async fn a_tampered_request_earns_no_reply_its_sender_accepts() {
    let _home = crate::db::HOME_TABLES.lock().await;
    let home = Home::new().await;
    let mut client = home.client("user_owner", "owner", 1).await;
    let sent = client.seal("r1", json!({ "type": "createRoom", "name": "Tampered" }));

    let mut flipped = sent.sealed.clone();
    let mut signature = b64url_decode(&flipped.signature).unwrap();
    signature[0] ^= 1;
    flipped.signature = b64url_encode(&signature);
    let mut recounted = sent.sealed.clone();
    recounted.header.counter += 7;
    let mut extended = sent.sealed.clone();
    extended.header.expires_at += 60_000;
    for tampered in [flipped, recounted, extended] {
        assert!(home.mailbox.deliver(&tampered).await.is_none());
    }

    // A rewrite the Controller refuses before the signature check
    // (expired) is answered, but bound to the rewritten request: it does not
    // open as the reply to the one the client sent.
    let mut expired = sent.sealed.clone();
    expired.header.expires_at = now_ms() - CLOCK_SKEW - 1_000;
    let reply = home
        .mailbox
        .deliver(&expired)
        .await
        .expect("an expired request is answered");
    assert_eq!(
        open_response(
            &reply,
            &sent.sealed,
            &sent.keys,
            &client.controller_signing_key
        )
        .unwrap_err(),
        RelayRejection::BadSignature
    );
    assert_eq!(home.count_rooms("Tampered").await, 0);

    // The untouched request still runs.
    assert_eq!(home.exchange(&client, &sent).await["type"], "room");
}

#[tokio::test]
#[ignore = "requires the isolated PostgreSQL database created by the verification script"]
async fn a_replayed_counter_is_refused_even_after_a_restart() {
    let _home = crate::db::HOME_TABLES.lock().await;
    let home = Home::new().await;
    let mut client = home.client("user_owner", "owner", 1).await;
    let sent = client.seal("r1", json!({ "type": "createRoom", "name": "Once Room" }));
    assert_eq!(home.exchange(&client, &sent).await["type"], "room");

    // Someone who recorded the envelope sends it again, to a restarted Core.
    let restarted = home.restart();
    let reply = restarted.exchange(&client, &sent).await;
    assert_eq!(error_code(&reply), "replayed");
    assert_eq!(reply["error"]["details"]["highestCounter"], 1);
    assert_eq!(home.count_rooms("Once Room").await, 1);
}

#[tokio::test]
#[ignore = "requires the isolated PostgreSQL database created by the verification script"]
async fn a_counter_behind_the_window_is_refused_with_the_highest_seen() {
    let _home = crate::db::HOME_TABLES.lock().await;
    let home = Home::new().await;
    let mut client = home.client("user_owner", "owner", 1).await;
    client.counter = 99;
    let sent = client.seal("r1", json!({ "type": "getSession" }));
    assert_eq!(home.exchange(&client, &sent).await["type"], "session");

    // A client that lost its counter starts again from 1.
    client.counter = 0;
    let sent = client.seal("r2", json!({ "type": "getSession" }));
    let reply = home.exchange(&client, &sent).await;
    assert_eq!(error_code(&reply), "outside_window");
    assert_eq!(reply["error"]["details"]["highestCounter"], 100);

    // Counters inside the window but out of order still work, which is what
    // several tabs sending at once look like.
    client.counter = 90;
    let sent = client.seal("r3", json!({ "type": "getSession" }));
    assert_eq!(home.exchange(&client, &sent).await["type"], "session");
}

#[tokio::test]
#[ignore = "requires the isolated PostgreSQL database created by the verification script"]
async fn a_retried_write_returns_its_stored_outcome_without_running_again() {
    let _home = crate::db::HOME_TABLES.lock().await;
    let home = Home::new().await;
    let mut client = home.client("user_owner", "owner", 1).await;
    let action = json!({ "type": "createRoom", "name": "Retry Room" });

    let first = client.seal("write-1", action.clone());
    let created = home.exchange(&client, &first).await;
    assert_eq!(created["type"], "room");

    // The reply was lost; the client seals the same request again under a
    // new counter.
    let retry = client.seal("write-1", action);
    assert_eq!(home.restart().exchange(&client, &retry).await, created);
    assert_eq!(home.count_rooms("Retry Room").await, 1);
}

#[tokio::test]
#[ignore = "requires the isolated PostgreSQL database created by the verification script"]
async fn a_reused_request_id_with_a_different_body_is_refused() {
    let _home = crate::db::HOME_TABLES.lock().await;
    let home = Home::new().await;
    let mut client = home.client("user_owner", "owner", 1).await;

    let first = client.seal("write-1", json!({ "type": "createRoom", "name": "First" }));
    assert_eq!(home.exchange(&client, &first).await["type"], "room");
    let other = client.seal("write-1", json!({ "type": "createRoom", "name": "Second" }));
    assert_eq!(
        error_code(&home.exchange(&client, &other).await),
        "request_id_reused"
    );
    assert_eq!(home.count_rooms("Second").await, 0);

    // Another Access Client's requestIds are its own.
    let mut other_client = home.client("user_two", "owner", 4).await;
    let theirs = other_client.seal("write-1", json!({ "type": "createRoom", "name": "Second" }));
    assert_eq!(home.exchange(&other_client, &theirs).await["type"], "room");
}

#[tokio::test]
#[ignore = "requires the isolated PostgreSQL database created by the verification script"]
async fn a_retried_command_returns_the_ledger_outcome_once() {
    let _home = crate::db::HOME_TABLES.lock().await;
    let home = Home::new().await;
    let mut client = home.client("user_owner", "owner", 1).await;
    let action = json!({
        "type": "command",
        "deviceId": Uuid::new_v4().to_string(),
        "payload": { "on": true },
    });

    let first = client.seal("cmd-1", action.clone());
    let outcome = home.exchange(&client, &first).await;
    assert_eq!(outcome["ok"], false);
    assert_eq!(error_code(&outcome), "device_not_found");
    let retry = client.seal("cmd-1", action);
    assert_eq!(home.exchange(&client, &retry).await, outcome);

    let ledger_id = store::command_ledger_id(client.id.parse().unwrap(), "cmd-1");
    let conn = home.state().db.get().await.unwrap();
    let rows = conn
        .interact(move |conn| {
            command_outcomes::table
                .filter(command_outcomes::command_id.eq(ledger_id))
                .count()
                .get_result::<i64>(conn)
        })
        .await
        .unwrap()
        .unwrap();
    assert_eq!(rows, 1);
}

#[tokio::test]
#[ignore = "requires the isolated PostgreSQL database created by the verification script"]
async fn reads_store_no_outcome() {
    let _home = crate::db::HOME_TABLES.lock().await;
    let home = Home::new().await;
    let mut client = home.client("user_owner", "owner", 1).await;

    let sent = client.seal("read-1", json!({ "type": "getSession" }));
    assert_eq!(home.exchange(&client, &sent).await["role"], "owner");
    // The same requestId may carry another read.
    let sent = client.seal("read-1", json!({ "type": "listMembers" }));
    assert_eq!(home.exchange(&client, &sent).await["type"], "members");
}

#[tokio::test]
#[ignore = "requires the isolated PostgreSQL database created by the verification script"]
async fn pairing_codes_and_wifi_credentials_stay_lan_only() {
    let _home = crate::db::HOME_TABLES.lock().await;
    let home = Home::new().await;
    let mut client = home.client("user_owner", "owner", 1).await;

    for action in [
        json!({ "type": "commissionMatter", "code": "34970112332" }),
        json!({ "type": "getMatterWifi" }),
        json!({ "type": "saveMatterWifi", "wifiSsid": "home", "wifiPassword": "hunter2" }),
    ] {
        let sent = client.seal("lan-only", action);
        let reply = home.exchange(&client, &sent).await;
        assert_eq!(error_code(&reply), "unsupported_action", "{reply}");
        for secret in ["34970112332", "hunter2"] {
            assert!(!reply.to_string().contains(secret), "{reply}");
        }
    }
}

// ---------------------------------------------------------------------------
// Capability-watch pushes (NEM-132)

use crate::relay::watches::{CAPABILITY_WATCH_TTL, CapabilityPushes};
use crate::relay_crypto::envelope::{SealedPush, open_push};
use crate::relay_crypto::replay::ReplayWindow;

/// A watch as its Access Client holds it: the registering request's header
/// and keys, and the pushes it has accepted so far.
struct Watching {
    sent: Sent,
    window: ReplayWindow,
}

impl Client {
    async fn watch(&mut self, home: &Home, request_id: &str, renews: Option<&str>) -> Watching {
        let mut action = json!({ "type": "watchCapabilityChanges" });
        if let Some(renews) = renews {
            action["renews"] = json!(renews);
        }
        let sent = self.seal(request_id, action);
        assert_eq!(
            home.exchange(self, &sent).await,
            json!({ "type": "capabilityWatchAck" })
        );
        Watching {
            sent,
            window: ReplayWindow::default(),
        }
    }

    /// Opens a push against the watch and the pinned Controller key.
    fn open_push(&self, watching: &mut Watching, push: &SealedPush) -> Value {
        let (plaintext, window) = open_push(
            push,
            &watching.sent.sealed.header,
            &watching.sent.keys,
            &self.controller_signing_key,
            &watching.window,
        )
        .expect("the push opens with the watch's key and the pinned Controller key");
        watching.window = window;
        serde_json::from_slice(&plaintext).unwrap()
    }
}

fn change(home: &Home) -> crate::events::DeviceEvent {
    crate::events::DeviceEvent::from_capability_snapshot(home.state().capabilities.snapshot())
}

fn pushes_on<'a>(pushes: &'a [SealedPush], watching: &Watching) -> Vec<&'a SealedPush> {
    pushes
        .iter()
        .filter(|push| push.header.request_id == watching.sent.sealed.header.request_id)
        .collect()
}

#[tokio::test]
#[ignore = "requires the isolated PostgreSQL database created by the verification script"]
async fn each_change_is_sealed_to_the_watch_with_a_rising_counter() {
    let _home = crate::db::HOME_TABLES.lock().await;
    let home = Home::new().await;
    let mut client = home.client("user_owner", "owner", 1).await;
    let mut pushes = CapabilityPushes::new(home.state().clone());
    let mut watching = client.watch(&home, "w1", None).await;
    let event = change(&home);

    let first = pushes.seal(&event).await;
    let second = pushes.seal(&event).await;
    assert_eq!((first.len(), second.len()), (1, 1));
    assert_eq!(first[0].header.counter, 1);
    assert_eq!(second[0].header.counter, 2);
    // Bound to the Access Client and the watch's request, nothing else.
    assert_eq!(first[0].header.access_client_id, client.id);
    assert_eq!(first[0].header.request_id, "w1");

    // Convex sees the push header and opaque bytes.
    let on_the_wire = serde_json::to_value(&first[0]).unwrap();
    let mut keys: Vec<_> = on_the_wire.as_object().unwrap().keys().cloned().collect();
    keys.sort();
    assert_eq!(keys, ["ciphertext", "header", "signature"]);
    assert!(!on_the_wire.to_string().contains("capabilitySnapshot"));

    let expected = serde_json::to_value(&event).unwrap();
    assert_eq!(client.open_push(&mut watching, &first[0]), expected);
    assert_eq!(client.open_push(&mut watching, &second[0]), expected);
    // The client refuses the same push twice.
    assert!(
        open_push(
            &first[0],
            &watching.sent.sealed.header,
            &watching.sent.keys,
            &client.controller_signing_key,
            &watching.window,
        )
        .is_err()
    );
}

#[tokio::test]
#[ignore = "requires the isolated PostgreSQL database created by the verification script"]
async fn a_renewal_replaces_only_the_watch_it_names() {
    let _home = crate::db::HOME_TABLES.lock().await;
    let home = Home::new().await;
    let mut client = home.client("user_owner", "owner", 1).await;
    let mut pushes = CapabilityPushes::new(home.state().clone());
    // Two tabs of one browser share an Access Client and watch separately.
    let tab_a = client.watch(&home, "tab-a-1", None).await;
    let mut tab_b = client.watch(&home, "tab-b-1", None).await;
    let mut tab_a_renewed = client.watch(&home, "tab-a-2", Some("tab-a-1")).await;

    let sealed = pushes.seal(&change(&home)).await;
    assert_eq!(sealed.len(), 2);
    assert!(pushes_on(&sealed, &tab_a).is_empty());
    // The renewed watch starts its own counter at 1, under its own key.
    let on_renewed = pushes_on(&sealed, &tab_a_renewed);
    assert_eq!(on_renewed[0].header.counter, 1);
    client.open_push(&mut tab_a_renewed, on_renewed[0]);
    let on_b = pushes_on(&sealed, &tab_b);
    client.open_push(&mut tab_b, on_b[0]);
}

#[tokio::test]
#[ignore = "requires the isolated PostgreSQL database created by the verification script"]
async fn a_watch_ends_at_its_ttl() {
    let _home = crate::db::HOME_TABLES.lock().await;
    let home = Home::new().await;
    let mut client = home.client("user_owner", "owner", 1).await;
    let mut pushes = CapabilityPushes::new(home.state().clone());
    client.watch(&home, "w1", None).await;

    let later =
        std::time::Instant::now() + CAPABILITY_WATCH_TTL + std::time::Duration::from_secs(1);
    assert!(pushes.seal_at(&change(&home), later).await.is_empty());
    // Expired for good: nothing comes back once the clock is "now" again.
    assert!(pushes.seal(&change(&home)).await.is_empty());
}

#[tokio::test]
#[ignore = "requires the isolated PostgreSQL database created by the verification script"]
async fn revoking_an_access_client_ends_its_watch_at_once() {
    let _home = crate::db::HOME_TABLES.lock().await;
    let home = Home::new().await;
    let mut phone = home.client("user_owner", "owner", 1).await;
    let mut laptop = home.client("user_owner_2", "owner", 2).await;
    let mut pushes = CapabilityPushes::new(home.state().clone());
    phone.watch(&home, "phone-w", None).await;
    let laptop_watch = laptop.watch(&home, "laptop-w", None).await;

    let sent = phone.seal("r1", json!({ "type": "revokeCurrent" }));
    assert_eq!(home.exchange(&phone, &sent).await["ok"], true);

    let sealed = pushes.seal(&change(&home)).await;
    assert_eq!(sealed.len(), 1, "only the laptop still watches");
    assert_eq!(pushes_on(&sealed, &laptop_watch).len(), 1);

    // A revoked client cannot register a new watch either.
    let sent = phone.seal("phone-w2", json!({ "type": "watchCapabilityChanges" }));
    assert_eq!(
        error_code(&home.exchange(&phone, &sent).await),
        "tombstoned_access_client"
    );
    assert_eq!(pushes.seal(&change(&home)).await.len(), 1);
}

#[tokio::test]
#[ignore = "requires the isolated PostgreSQL database created by the verification script"]
async fn removing_a_member_ends_their_watches_at_once() {
    let _home = crate::db::HOME_TABLES.lock().await;
    let home = Home::new().await;
    let mut owner = home.client("user_owner", "owner", 1).await;
    let mut member = home.client("user_member", "member", 2).await;
    let mut pushes = CapabilityPushes::new(home.state().clone());
    let owner_watch = owner.watch(&home, "owner-w", None).await;
    member.watch(&home, "member-w", None).await;

    let member_id = {
        let conn = home.state().db.get().await.unwrap();
        conn.interact(|conn| {
            members::table
                .filter(members::user_id.eq("user_member"))
                .select(members::id)
                .first::<Uuid>(conn)
        })
        .await
        .unwrap()
        .unwrap()
    };
    let sent = owner.seal(
        "r1",
        json!({ "type": "removeMember", "memberId": member_id.to_string() }),
    );
    assert_eq!(home.exchange(&owner, &sent).await["ok"], true);

    let sealed = pushes.seal(&change(&home)).await;
    assert_eq!(sealed.len(), 1);
    assert_eq!(pushes_on(&sealed, &owner_watch).len(), 1);
}

// ---------------------------------------------------------------------------
// Commissioning progress over Relay (NEM-123)

use crate::commissioning_progress::{
    CommissioningFailureReason, CommissioningProgress, CommissioningStep,
    parse_commissioning_progress,
};
use crate::events::{DeviceEvent, InterviewStatus};

/// Runs the push loop as the Relay client does, returning its sealed pushes.
fn push_loop(home: &Home) -> tokio::sync::mpsc::Receiver<SealedPush> {
    let (out, sealed) = tokio::sync::mpsc::channel(16);
    tokio::spawn(CapabilityPushes::new(home.state().clone()).run(out));
    sealed
}

async fn next_push(sealed: &mut tokio::sync::mpsc::Receiver<SealedPush>) -> SealedPush {
    tokio::time::timeout(std::time::Duration::from_secs(5), sealed.recv())
        .await
        .expect("a push within 5 s")
        .expect("the push loop is running")
}

/// What the adapter publishes on `bridge/commissioning`, as Core reads it.
fn adapter_step(home: &Home, payload: Value) {
    let progress = parse_commissioning_progress(&payload.to_string()).unwrap();
    home.state().emit(DeviceEvent::CommissioningStep(progress));
}

#[tokio::test]
#[ignore = "requires the isolated PostgreSQL database created by the verification script"]
async fn commissioning_progress_is_sealed_on_the_capability_watch() {
    let _home = crate::db::HOME_TABLES.lock().await;
    let home = Home::new().await;
    let mut owner = home.client("user_owner", "owner", 1).await;
    let mut member = home.client("user_member", "member", 2).await;
    let mut owner_watch = owner.watch(&home, "owner-w", None).await;
    let mut member_watch = member.watch(&home, "member-w", None).await;
    let mut sealed = push_loop(&home);

    // The older events carry free text, so they stay on the LAN WebSocket.
    home.state().emit(DeviceEvent::CommissionProgress {
        stage: "wifi".into(),
        message: Some("Sending your Wi-Fi details".into()),
    });
    home.state().emit(DeviceEvent::Interview {
        external_id: "commissioning".into(),
        status: InterviewStatus::Failed,
        error: Some("Use the 2.4 GHz network".into()),
        message: None,
    });
    adapter_step(&home, json!({ "status": "active", "step": "discovering" }));
    adapter_step(
        &home,
        json!({ "status": "failed", "step": "configuring_network", "reason": "network_rejected" }),
    );

    let mut pushes = Vec::new();
    for _ in 0..4 {
        pushes.push(next_push(&mut sealed).await);
    }
    let on_owner = pushes_on(&pushes, &owner_watch);
    let on_member = pushes_on(&pushes, &member_watch);
    assert_eq!((on_owner.len(), on_member.len()), (2, 2));
    // Each watch's own counter, as capability changes use.
    assert_eq!(
        on_owner
            .iter()
            .map(|p| p.header.counter)
            .collect::<Vec<_>>(),
        [1, 2]
    );

    // Convex sees the push header and opaque bytes, nothing of the step.
    for push in &pushes {
        let on_the_wire = serde_json::to_value(push).unwrap().to_string();
        for clear in ["commissioningStep", "discovering", "configuring_network"] {
            assert!(!on_the_wire.contains(clear), "{on_the_wire}");
        }
    }

    let discovering =
        json!({ "type": "commissioningStep", "status": "active", "step": "discovering" });
    let failed = json!({
        "type": "commissioningStep",
        "status": "failed",
        "step": "configuring_network",
        "reason": "network_rejected",
    });
    for (client, watching, pushes) in [
        (&owner, &mut owner_watch, &on_owner),
        (&member, &mut member_watch, &on_member),
    ] {
        assert_eq!(client.open_push(watching, pushes[0]), discovering);
        assert_eq!(client.open_push(watching, pushes[1]), failed);
    }

    // Progress and capability changes share the watch's counter.
    let event = change(&home);
    let next = CapabilityPushes::new(home.state().clone())
        .seal(&event)
        .await;
    let next = pushes_on(&next, &owner_watch);
    assert_eq!(next[0].header.counter, 3);
    assert_eq!(
        owner.open_push(&mut owner_watch, next[0]),
        serde_json::to_value(&event).unwrap()
    );
}

/// The privacy check of `commissioning_progress.rs`, carried through to the
/// Relay: whatever the adapter publishes, a watch only ever opens a step,
/// a status and a reason.
#[tokio::test]
#[ignore = "requires the isolated PostgreSQL database created by the verification script"]
async fn no_pairing_code_passcode_or_wifi_credential_reaches_a_watch() {
    let _home = crate::db::HOME_TABLES.lock().await;
    let home = Home::new().await;
    let mut client = home.client("user_owner", "owner", 1).await;
    let mut watching = client.watch(&home, "w1", None).await;
    let mut sealed = push_loop(&home);

    let secrets = [
        ("code", "34970112332"),
        ("pairingCode", "MT:Y.K9042C00KA0648G00"),
        ("passcode", "20202021"),
        ("wifiSsid", "home-ssid"),
        ("wifiPassword", "hunter2"),
        ("message", "pairing code 34970112332 refused"),
    ];
    for (key, value) in secrets {
        let mut payload = json!({ "status": "active", "step": "configuring_network" });
        payload[key] = json!(value);
        // Refused at the MQTT boundary, so never an event to push.
        assert!(parse_commissioning_progress(&payload.to_string()).is_err());
    }
    for progress in [
        CommissioningProgress::Active {
            step: CommissioningStep::ConfiguringNetwork,
        },
        CommissioningProgress::Completed {},
        CommissioningProgress::Failed {
            step: CommissioningStep::ConfiguringNetwork,
            reason: CommissioningFailureReason::NetworkRejected,
        },
    ] {
        home.state().emit(DeviceEvent::CommissioningStep(progress));
        let push = next_push(&mut sealed).await;
        let opened = client.open_push(&mut watching, &push);
        let mut keys: Vec<_> = opened.as_object().unwrap().keys().cloned().collect();
        keys.retain(|key| !["type", "status", "step", "reason"].contains(&key.as_str()));
        assert!(keys.is_empty(), "{opened}");
        let text = format!("{opened}{}", serde_json::to_string(&push).unwrap());
        for (_, secret) in secrets {
            assert!(!text.contains(secret), "{text}");
        }
    }
}
