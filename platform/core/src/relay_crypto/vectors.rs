//! Seam 1 (NEM-63): the shared wire vectors in
//! `packages/protocol/testdata/relay-crypto/vectors.json`. These tests rebuild
//! every vector from its inputs and open every fixture, as the TypeScript
//! suite does, so the two implementations cannot drift apart.

use ed25519_dalek::SigningKey;
use serde_json::Value;

use super::cpace::{
    self, CpaceError, Initiator, InitiatorMessage, PairingContext, PartyKeys, Responder,
    ResponderMessage,
};
use super::envelope::{
    self, AccessClientStatus, RequestHeader, RequestKeys, RequestPolicy, SealedPush, SealedRequest,
    SealedResponse,
};
use super::grant::{self, AccessGrant};
use super::hpke;
use super::projection::{self, SignedMembershipProjection};
use super::replay::ReplayWindow;
use super::session::{self, LocalSessionChallenge};

fn vectors() -> Value {
    let path = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../packages/protocol/testdata/relay-crypto/vectors.json"
    );
    let text = std::fs::read_to_string(path).expect("wire vectors are checked in");
    serde_json::from_str(&text).expect("wire vectors are JSON")
}

fn s(v: &Value) -> &str {
    v.as_str()
        .unwrap_or_else(|| panic!("expected a string, got {v}"))
}

fn h(v: &Value) -> Vec<u8> {
    hex::decode(s(v)).expect("hex")
}

fn h32(v: &Value) -> [u8; 32] {
    h(v).try_into().expect("32 bytes")
}

fn h64(v: &Value) -> [u8; 64] {
    h(v).try_into().expect("64 bytes")
}

fn n(v: &Value) -> u64 {
    v.as_u64()
        .unwrap_or_else(|| panic!("expected an integer, got {v}"))
}

struct Party {
    signing: SigningKey,
    signing_public: [u8; 32],
    encryption_secret: [u8; 32],
    encryption_public: [u8; 32],
}

impl Party {
    fn from(v: &Value) -> Self {
        let signing = SigningKey::from_bytes(&h32(&v["signingSecret"]));
        let party = Party {
            signing_public: h32(&v["signingPublic"]),
            encryption_secret: h32(&v["encryptionSecret"]),
            encryption_public: h32(&v["encryptionPublic"]),
            signing,
        };
        assert_eq!(
            party.signing.verifying_key().to_bytes(),
            party.signing_public
        );
        assert_eq!(
            hpke::public_key(&party.encryption_secret),
            party.encryption_public
        );
        party
    }

    fn keys(&self) -> PartyKeys {
        PartyKeys {
            signing_key: self.signing_public,
            encryption_key: self.encryption_public,
        }
    }
}

struct Keys {
    controller: Party,
    access_client: Party,
    impostor: Party,
}

fn keys(v: &Value) -> Keys {
    Keys {
        controller: Party::from(&v["keys"]["controller"]),
        access_client: Party::from(&v["keys"]["accessClient"]),
        impostor: Party::from(&v["keys"]["impostor"]),
    }
}

fn array(v: &Value) -> &Vec<Value> {
    v.as_array()
        .unwrap_or_else(|| panic!("expected an array, got {v}"))
}

fn find_request<'a>(v: &'a Value, name: &str) -> (&'a Value, RequestHeader, RequestKeys) {
    let request = array(&v["requests"])
        .iter()
        .find(|r| s(&r["name"]) == name)
        .unwrap_or_else(|| panic!("no request vector named {name}"));
    let header: RequestHeader =
        serde_json::from_value(request["sealed"]["header"].clone()).unwrap();
    let keys = RequestKeys {
        response_key: h32(&request["responseKey"]),
        push_key: h32(&request["pushKey"]),
    };
    (request, header, keys)
}

fn window_after(counters: &Value) -> ReplayWindow {
    array(counters)
        .iter()
        .fold(ReplayWindow::default(), |window, c| {
            window.accept(n(c)).unwrap()
        })
}

fn policy_from(v: &Value) -> (String, u64, u64) {
    (
        s(&v["controllerId"]).to_string(),
        n(&v["identityEpoch"]),
        n(&v["nowMs"]),
    )
}

fn status_for(state: &str, keys: &Keys) -> AccessClientStatus {
    match state {
        "active" => AccessClientStatus::Active {
            signing_key: keys.access_client.signing_public,
        },
        "tombstoned" => AccessClientStatus::Tombstoned,
        "unknown" => AccessClientStatus::Unknown,
        other => panic!("unknown Access Client state {other}"),
    }
}

#[test]
fn hpke_matches_rfc9180_a_2_1() {
    let v = &vectors()["hpkeRfc9180"];
    let (sk_r, pk_r) = hpke::derive_key_pair(&h(&v["ikmR"]));
    assert_eq!(sk_r, h32(&v["skRm"]));
    assert_eq!(pk_r, h32(&v["pkRm"]));

    let (enc, mut sender) =
        hpke::setup_base_sender_with_ikm(&pk_r, &h(&v["info"]), &h(&v["ikmE"])).unwrap();
    assert_eq!(enc, h32(&v["enc"]));
    let mut receiver = hpke::setup_base_receiver(&enc, &sk_r, &h(&v["info"])).unwrap();
    let encryptions = array(&v["encryptions"]);
    let last = encryptions.iter().map(|e| n(&e["seq"])).max().unwrap();
    for seq in 0..=last {
        let expected = encryptions.iter().find(|e| n(&e["seq"]) == seq);
        let (pt, aad) = match expected {
            Some(e) => (h(&e["pt"]), h(&e["aad"])),
            None => (b"filler".to_vec(), Vec::new()),
        };
        let ct = sender.seal(&aad, &pt);
        assert_eq!(receiver.open(&aad, &ct).unwrap(), pt);
        if let Some(e) = expected {
            assert_eq!(ct, h(&e["ct"]), "sequence {seq}");
        }
    }
    for e in array(&v["exports"]) {
        let mut out = vec![0u8; n(&e["length"]) as usize];
        sender.export(&h(&e["context"]), &mut out);
        assert_eq!(out, h(&e["value"]));
    }
}

#[test]
fn cpace_matches_draft_b_3() {
    let v = &vectors()["cpaceDraft"];
    let (prs, ci, sid) = (h(&v["prs"]), h(&v["ci"]), h(&v["sid"]));
    assert_eq!(
        cpace::generator_string(&prs, &ci, &sid),
        h(&v["generatorString"])
    );
    let g = cpace::calculate_generator(&prs, &ci, &sid);
    assert_eq!(g.compress().to_bytes(), h32(&v["generator"]));
    let ya = cpace::scalar_mult(&h32(&v["ya"]), &g);
    let yb = cpace::scalar_mult(&h32(&v["yb"]), &g);
    assert_eq!(ya, h32(&v["Ya"]));
    assert_eq!(yb, h32(&v["Yb"]));
    let k = h32(&v["K"]);
    assert_eq!(cpace::scalar_mult_vfy(&h32(&v["ya"]), &yb), Some(k));
    assert_eq!(cpace::scalar_mult_vfy(&h32(&v["yb"]), &ya), Some(k));
    let (ad_a, ad_b) = (h(&v["adA"]), h(&v["adB"]));
    assert_eq!(
        cpace::isk_ir(&sid, &k, &ya, &ad_a, &yb, &ad_b),
        h64(&v["iskIr"])
    );
    assert_eq!(
        cpace::sid_output_ir(&ya, &ad_a, &yb, &ad_b),
        h64(&v["sidOutputIr"])
    );
    let valid = &v["scalarMult"];
    assert_eq!(
        cpace::scalar_mult_vfy(&h32(&valid["s"]), &h(&valid["X"])),
        Some(h32(&valid["result"]))
    );
    for point in array(&v["invalidPoints"]) {
        assert_eq!(cpace::scalar_mult_vfy(&h32(&valid["s"]), &h(point)), None);
    }
}

#[test]
fn pairing_transcript_and_rejections() {
    let vectors = vectors();
    let keys = keys(&vectors);
    let v = &vectors["pairing"]["accepted"];
    let sid = h(&v["sid"]);
    let ctx = PairingContext {
        code: s(&v["code"]),
        controller_id: s(&v["controllerId"]),
        sid: &sid,
    };
    let start = || {
        Initiator::start_with_scalar(&ctx, &keys.access_client.keys(), h32(&v["initiatorScalar"]))
    };
    let respond = |msg: &InitiatorMessage| {
        Responder::respond_with_scalar(
            &ctx,
            &keys.controller.keys(),
            msg,
            h32(&v["responderScalar"]),
        )
    };

    let (initiator, msg_a) = start();
    assert_eq!(msg_a.ya, h32(&v["ya"]));
    assert_eq!(msg_a.ad_a, h(&v["adA"]));
    let (responder, msg_b) = respond(&msg_a).unwrap();
    assert_eq!(msg_b.yb, h32(&v["yb"]));
    assert_eq!(msg_b.ad_b, h(&v["adB"]));
    assert_eq!(msg_b.tag_b, h64(&v["tagB"]));
    let a = initiator.finish(&msg_b).unwrap();
    assert_eq!(a.tag_a, h64(&v["tagA"]));
    assert_eq!(a.isk, h64(&v["isk"]));
    assert_eq!(a.controller_keys, keys.controller.keys());
    let b = responder.confirm(&a.tag_a).unwrap();
    assert_eq!(b.isk, a.isk);
    assert_eq!(b.access_client_keys, keys.access_client.keys());

    let rejections = &vectors["pairing"]["rejections"];
    for r in array(&rejections["initiator"]) {
        let (initiator, _) = start();
        let reply = ResponderMessage {
            yb: h32(&r["yb"]),
            ad_b: h(&r["adB"]),
            tag_b: h64(&r["tagB"]),
        };
        let err: CpaceError = initiator.finish(&reply).unwrap_err();
        assert_eq!(err.to_string(), s(&r["expectedError"]), "{}", s(&r["name"]));
    }
    for r in array(&rejections["responder"]) {
        let msg = InitiatorMessage {
            ya: h32(&r["ya"]),
            ad_a: h(&r["adA"]),
        };
        let err = respond(&msg).err().unwrap();
        assert_eq!(err.to_string(), s(&r["expectedError"]), "{}", s(&r["name"]));
    }
    for r in array(&rejections["confirmation"]) {
        let msg = InitiatorMessage {
            ya: h32(&r["ya"]),
            ad_a: h(&r["adA"]),
        };
        let (responder, _) = respond(&msg).unwrap();
        let err = responder.confirm(&h(&r["tagA"])).unwrap_err();
        assert_eq!(err.to_string(), s(&r["expectedError"]), "{}", s(&r["name"]));
    }
}

#[test]
fn requests_seal_open_and_reject() {
    let vectors = vectors();
    let keys = keys(&vectors);
    let command = &vectors["requests"][0]["sealed"]["header"];
    let (controller_id, identity_epoch) = (
        s(&command["controllerId"]).to_string(),
        n(&command["identityEpoch"]),
    );
    let now_ms = n(&command["expiresAt"]) - 20_000;

    for v in array(&vectors["requests"]) {
        let name = s(&v["name"]);
        let sealed_to = match s(&v["sealedTo"]) {
            "controller" => &keys.controller,
            "impostor" => &keys.impostor,
            other => panic!("unknown recipient {other}"),
        };
        let expected: SealedRequest = serde_json::from_value(v["sealed"].clone()).unwrap();
        let (sealed, request_keys) = envelope::seal_request_with_ikm(
            expected.header.clone(),
            s(&v["plaintext"]).as_bytes(),
            &sealed_to.encryption_public,
            &keys.access_client.signing,
            &h(&v["ikmE"]),
        )
        .unwrap();
        assert_eq!(sealed, expected, "{name}");
        assert_eq!(request_keys.response_key, h32(&v["responseKey"]), "{name}");
        assert_eq!(request_keys.push_key, h32(&v["pushKey"]), "{name}");
        if s(&v["sealedTo"]) != "controller" {
            continue;
        }
        let opened = envelope::open_request(
            &expected,
            &keys.controller.encryption_secret,
            &RequestPolicy {
                controller_id: &controller_id,
                identity_epoch,
                now_ms,
            },
            |id| {
                assert_eq!(id, "ac_7f3a");
                status_for("active", &keys)
            },
            &ReplayWindow::default(),
        )
        .unwrap();
        assert_eq!(opened.plaintext, s(&v["plaintext"]).as_bytes(), "{name}");
        assert_eq!(opened.keys, request_keys, "{name}");
        assert_eq!(opened.window.highest, expected.header.counter, "{name}");
    }

    for r in array(&vectors["rejections"]["requests"]) {
        let sealed: SealedRequest = serde_json::from_value(r["sealed"].clone()).unwrap();
        let (controller_id, identity_epoch, now_ms) = policy_from(&r["policy"]);
        let err = envelope::open_request(
            &sealed,
            &keys.controller.encryption_secret,
            &RequestPolicy {
                controller_id: &controller_id,
                identity_epoch,
                now_ms,
            },
            |_| status_for(s(&r["accessClient"]), &keys),
            &window_after(&r["acceptedCounters"]),
        )
        .unwrap_err();
        assert_eq!(err.to_string(), s(&r["expectedError"]), "{}", s(&r["name"]));
    }
}

#[test]
fn responses_seal_open_and_reject() {
    let vectors = vectors();
    let keys = keys(&vectors);
    for v in array(&vectors["responses"]) {
        let (request, _, request_keys) = find_request(&vectors, s(&v["request"]));
        let request: SealedRequest = serde_json::from_value(request["sealed"].clone()).unwrap();
        let expected: SealedResponse = serde_json::from_value(v["sealed"].clone()).unwrap();
        let sealed = envelope::seal_response(
            &request,
            &request_keys,
            s(&v["plaintext"]).as_bytes(),
            &keys.controller.signing,
        )
        .unwrap();
        assert_eq!(sealed, expected);
        let plaintext = envelope::open_response(
            &expected,
            &request,
            &request_keys,
            &keys.controller.signing_public,
        )
        .unwrap();
        assert_eq!(plaintext, s(&v["plaintext"]).as_bytes());
    }
    for r in array(&vectors["rejections"]["responses"]) {
        let (request, _, request_keys) = find_request(&vectors, s(&r["request"]));
        let request: SealedRequest = serde_json::from_value(request["sealed"].clone()).unwrap();
        let sealed: SealedResponse = serde_json::from_value(r["sealed"].clone()).unwrap();
        let err = envelope::open_response(
            &sealed,
            &request,
            &request_keys,
            &keys.controller.signing_public,
        )
        .unwrap_err();
        assert_eq!(err.to_string(), s(&r["expectedError"]), "{}", s(&r["name"]));
    }
}

#[test]
fn pushes_seal_open_and_reject() {
    let vectors = vectors();
    let keys = keys(&vectors);
    let mut window = ReplayWindow::default();
    for v in array(&vectors["pushes"]) {
        let (_, watch, watch_keys) = find_request(&vectors, s(&v["request"]));
        let expected: SealedPush = serde_json::from_value(v["sealed"].clone()).unwrap();
        let sealed = envelope::seal_push(
            &watch,
            &watch_keys,
            n(&v["counter"]),
            s(&v["plaintext"]).as_bytes(),
            &keys.controller.signing,
        )
        .unwrap();
        assert_eq!(sealed, expected);
        let (plaintext, next) = envelope::open_push(
            &expected,
            &watch,
            &watch_keys,
            &keys.controller.signing_public,
            &window,
        )
        .unwrap();
        assert_eq!(plaintext, s(&v["plaintext"]).as_bytes());
        window = next;
    }
    for r in array(&vectors["rejections"]["pushes"]) {
        let (_, watch, watch_keys) = find_request(&vectors, s(&r["request"]));
        let sealed: SealedPush = serde_json::from_value(r["sealed"].clone()).unwrap();
        let err = envelope::open_push(
            &sealed,
            &watch,
            &watch_keys,
            &keys.controller.signing_public,
            &window_after(&r["acceptedCounters"]),
        )
        .unwrap_err();
        assert_eq!(err.to_string(), s(&r["expectedError"]), "{}", s(&r["name"]));
    }
}

#[test]
fn grants_issue_verify_and_reject() {
    let vectors = vectors();
    let keys = keys(&vectors);
    let controller_id = s(&vectors["pairing"]["accepted"]["controllerId"]);
    for v in array(&vectors["grants"]) {
        let g = &v["grant"];
        let expected = AccessGrant {
            controller_id: s(&g["controllerId"]).to_string(),
            access_client_id: s(&g["accessClientId"]).to_string(),
            membership_id: s(&g["membershipId"]).to_string(),
            signing_key: h32(&g["signingKey"]),
            encryption_key: h32(&g["encryptionKey"]),
            issued_at: n(&g["issuedAt"]),
        };
        assert_eq!(
            grant::issue_grant(&expected, &keys.controller.signing),
            s(&v["jws"])
        );
        let verified =
            grant::verify_grant(s(&v["jws"]), controller_id, &keys.controller.signing_public)
                .unwrap();
        assert_eq!(verified, expected);
    }
    for r in array(&vectors["rejections"]["grants"]) {
        let err = grant::verify_grant(s(&r["jws"]), controller_id, &keys.controller.signing_public)
            .unwrap_err();
        assert_eq!(err.to_string(), s(&r["expectedError"]), "{}", s(&r["name"]));
    }
}

#[test]
fn membership_projections_sign_verify_and_reject() {
    let vectors = vectors();
    let keys = keys(&vectors);
    let controller_id = s(&vectors["pairing"]["accepted"]["controllerId"]);
    for v in array(&vectors["membershipProjections"]) {
        let expected: SignedMembershipProjection =
            serde_json::from_value(v["signed"].clone()).unwrap();
        let signed =
            projection::sign_projection(expected.projection.clone(), &keys.controller.signing)
                .unwrap();
        assert_eq!(signed, expected, "{}", s(&v["name"]));
        assert_eq!(
            serde_json::to_value(&signed).unwrap(),
            v["signed"],
            "{}",
            s(&v["name"])
        );
        let verified =
            projection::verify_projection(&signed, controller_id, &keys.controller.signing_public)
                .unwrap();
        assert_eq!(verified, expected.projection);
    }
    for r in array(&vectors["rejections"]["membershipProjections"]) {
        let err = match serde_json::from_value::<SignedMembershipProjection>(r["signed"].clone()) {
            // An unknown field never deserializes: the TS twin calls it malformed.
            Err(_) => "malformed".to_string(),
            Ok(signed) => projection::verify_projection(
                &signed,
                controller_id,
                &keys.controller.signing_public,
            )
            .unwrap_err()
            .to_string(),
        };
        assert_eq!(err, s(&r["expectedError"]), "{}", s(&r["name"]));
    }
}

#[test]
fn local_session_challenges_sign_verify_and_reject() {
    let vectors = vectors();
    let keys = keys(&vectors);
    let challenge = |v: &Value| {
        (
            s(&v["controllerId"]).to_string(),
            s(&v["accessClientId"]).to_string(),
            h(&v["nonce"]),
        )
    };
    for v in array(&vectors["localSessions"]) {
        let (controller_id, access_client_id, nonce) = challenge(v);
        let c = LocalSessionChallenge {
            controller_id: &controller_id,
            access_client_id: &access_client_id,
            nonce: &nonce,
        };
        assert_eq!(
            hex::encode(session::sign_challenge(&keys.access_client.signing, &c)),
            s(&v["signature"])
        );
        session::verify_challenge(&keys.access_client.signing_public, &c, &h(&v["signature"]))
            .unwrap();
    }
    for r in array(&vectors["rejections"]["localSessions"]) {
        let (controller_id, access_client_id, nonce) = challenge(r);
        let c = LocalSessionChallenge {
            controller_id: &controller_id,
            access_client_id: &access_client_id,
            nonce: &nonce,
        };
        assert!(
            session::verify_challenge(&keys.access_client.signing_public, &c, &h(&r["signature"]))
                .is_err(),
            "{}",
            s(&r["name"])
        );
    }
}

#[test]
fn lan_refusals_sign_and_reject() {
    let vectors = vectors();
    let keys = keys(&vectors);
    let verifies = |v: &Value| {
        let nonce = h(&v["clientNonce"]);
        let refusal = session::LanRefusal {
            controller_id: s(&v["controllerId"]),
            access_client_id: s(&v["accessClientId"]),
            code: s(&v["code"]),
            client_nonce: &nonce,
        };
        let signature: [u8; 64] = h(&v["signature"]).try_into().unwrap();
        let valid = ed25519_dalek::VerifyingKey::from_bytes(&keys.controller.signing_public)
            .unwrap()
            .verify_strict(
                &session::refusal_message(&refusal),
                &ed25519_dalek::Signature::from_bytes(&signature),
            )
            .is_ok();
        (
            hex::encode(session::sign_refusal(&keys.controller.signing, &refusal)),
            valid,
        )
    };
    for v in array(&vectors["lanRefusals"]) {
        let (signature, valid) = verifies(v);
        assert_eq!(signature, s(&v["signature"]), "{}", s(&v["name"]));
        assert!(valid, "{}", s(&v["name"]));
    }
    for r in array(&vectors["rejections"]["lanRefusals"]) {
        assert!(!verifies(r).1, "{}", s(&r["name"]));
    }
}

#[test]
fn replay_window_steps() {
    for v in array(&vectors()["replayWindow"]) {
        let mut window = ReplayWindow::default();
        for step in array(&v["steps"]) {
            let (counter, expected) = (n(&step[0]), s(&step[1]));
            let outcome = match window.accept(counter) {
                Ok(next) => {
                    window = next;
                    "accepted".to_string()
                }
                Err(err) => err.to_string(),
            };
            assert_eq!(outcome, expected, "{}: counter {counter}", s(&v["name"]));
        }
    }
}
