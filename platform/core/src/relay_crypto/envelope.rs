//! Sealed Relay requests, responses and pushes.
//!
//! A request is HPKE-sealed to the Controller's X25519 key with its clear
//! header as associated data, and the Access Client signs
//! `lv_cat(header, enc, ciphertext)` with Ed25519. The response key and the
//! push key are exported from the request's HPKE context. The Controller
//! seals the response under the response key (nonce counter 0) and each push
//! under the push key (nonce counter = push counter), and signs
//! `lv_cat(header, ciphertext)`.
//!
//! A response header also binds the SHA-256 of the whole request as the
//! Controller received it (header, `enc`, ciphertext and signature). The
//! response key comes from `enc` alone, so without that binding a reply to a
//! request Convex rewrote (a new counter, a flipped signature byte) would
//! open as the reply to the one the client sent.
//!
//! The header encodings below are what both sides sign and bind; the JSON
//! header is only how they travel.

use ed25519_dalek::{Signature, Signer, SigningKey, VerifyingKey};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use super::hpke;
use super::replay::{ReplayRejection, ReplayWindow};
use super::wire::{
    MAX_SAFE_INTEGER, b64url_decode, b64url_decode_32, b64url_decode_64, b64url_encode, lv_cat,
    u64_be,
};

pub const HPKE_INFO: &[u8] = b"nemu-relay-v1";
const REQUEST_LABEL: &[u8] = b"nemu-relay-request-v1";
const RESPONSE_LABEL: &[u8] = b"nemu-relay-response-v2";
const PUSH_LABEL: &[u8] = b"nemu-relay-push-v1";
const RESPONSE_KEY_LABEL: &[u8] = b"nemu-relay-response-key";
const PUSH_KEY_LABEL: &[u8] = b"nemu-relay-push-key";

/// Allowed clock skew past `expiresAt`.
pub const CLOCK_SKEW_MS: u64 = 60_000;
const MAX_ID_BYTES: usize = 256;

/// The error code for an Access Client the Controller does not know, over
/// LAN and Relay alike.
pub const UNKNOWN_ACCESS_CLIENT: &str = "unknown_access_client";
/// The error code for a revoked (tombstoned) Access Client, over LAN and
/// Relay alike.
pub const TOMBSTONED_ACCESS_CLIENT: &str = "tombstoned_access_client";

#[derive(Debug, Clone, Copy, PartialEq, Eq, thiserror::Error)]
pub enum RelayRejection {
    #[error("malformed")]
    Malformed,
    #[error("wrong_controller")]
    WrongController,
    #[error("retired_epoch")]
    RetiredEpoch,
    #[error("expired")]
    Expired,
    #[error("{}", UNKNOWN_ACCESS_CLIENT)]
    UnknownAccessClient,
    #[error("{}", TOMBSTONED_ACCESS_CLIENT)]
    TombstonedAccessClient,
    #[error("bad_signature")]
    BadSignature,
    #[error("replayed")]
    Replayed,
    #[error("outside_window")]
    OutsideWindow,
    /// A response or push whose header does not answer the request.
    #[error("mismatched_header")]
    MismatchedHeader,
    #[error("decrypt_failed")]
    DecryptFailed,
}

impl From<ReplayRejection> for RelayRejection {
    fn from(value: ReplayRejection) -> Self {
        match value {
            ReplayRejection::Replayed => RelayRejection::Replayed,
            ReplayRejection::OutsideWindow => RelayRejection::OutsideWindow,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RequestHeader {
    pub controller_id: String,
    pub identity_epoch: u64,
    pub access_client_id: String,
    pub request_id: String,
    pub counter: u64,
    /// Milliseconds since the Unix epoch.
    pub expires_at: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ResponseHeader {
    pub controller_id: String,
    pub identity_epoch: u64,
    pub access_client_id: String,
    pub request_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PushHeader {
    pub controller_id: String,
    pub identity_epoch: u64,
    pub access_client_id: String,
    /// The request that registered the watch.
    pub request_id: String,
    pub counter: u64,
}

fn valid_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= MAX_ID_BYTES
}

impl RequestHeader {
    pub fn encode(&self) -> Vec<u8> {
        lv_cat(&[
            REQUEST_LABEL,
            self.controller_id.as_bytes(),
            &u64_be(self.identity_epoch),
            self.access_client_id.as_bytes(),
            self.request_id.as_bytes(),
            &u64_be(self.counter),
            &u64_be(self.expires_at),
        ])
    }

    fn is_valid(&self) -> bool {
        valid_id(&self.controller_id)
            && valid_id(&self.access_client_id)
            && valid_id(&self.request_id)
            && self.identity_epoch <= MAX_SAFE_INTEGER
            && (1..=MAX_SAFE_INTEGER).contains(&self.counter)
            && self.expires_at <= MAX_SAFE_INTEGER
    }

    /// The header of the response to this request.
    pub fn response_header(&self) -> ResponseHeader {
        ResponseHeader {
            controller_id: self.controller_id.clone(),
            identity_epoch: self.identity_epoch,
            access_client_id: self.access_client_id.clone(),
            request_id: self.request_id.clone(),
        }
    }

    /// The header of push `counter` on the watch this request registered.
    pub fn push_header(&self, counter: u64) -> PushHeader {
        PushHeader {
            controller_id: self.controller_id.clone(),
            identity_epoch: self.identity_epoch,
            access_client_id: self.access_client_id.clone(),
            request_id: self.request_id.clone(),
            counter,
        }
    }
}

impl ResponseHeader {
    /// The bytes a response binds: this header and the digest of the exact
    /// request it answers ([`request_digest`]).
    pub fn encode(&self, request_digest: &[u8; 32]) -> Vec<u8> {
        lv_cat(&[
            RESPONSE_LABEL,
            self.controller_id.as_bytes(),
            &u64_be(self.identity_epoch),
            self.access_client_id.as_bytes(),
            self.request_id.as_bytes(),
            request_digest,
        ])
    }
}

impl PushHeader {
    pub fn encode(&self) -> Vec<u8> {
        lv_cat(&[
            PUSH_LABEL,
            self.controller_id.as_bytes(),
            &u64_be(self.identity_epoch),
            self.access_client_id.as_bytes(),
            self.request_id.as_bytes(),
            &u64_be(self.counter),
        ])
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SealedRequest {
    pub header: RequestHeader,
    /// base64url HPKE encapsulated key.
    pub enc: String,
    /// base64url HPKE ciphertext.
    pub ciphertext: String,
    /// base64url Ed25519 signature by the Access Client.
    pub signature: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SealedResponse {
    pub header: ResponseHeader,
    pub ciphertext: String,
    /// base64url Ed25519 signature by the Controller.
    pub signature: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SealedPush {
    pub header: PushHeader,
    pub ciphertext: String,
    pub signature: String,
}

/// Keys exported from a request's HPKE context. Both sides hold them: the
/// Access Client from sealing, the Controller from opening.
#[derive(Clone, PartialEq, Eq)]
pub struct RequestKeys {
    pub response_key: [u8; 32],
    pub push_key: [u8; 32],
}

impl std::fmt::Debug for RequestKeys {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("RequestKeys(***)")
    }
}

impl RequestKeys {
    fn export(ctx: &hpke::Context) -> Self {
        let mut keys = RequestKeys {
            response_key: [0u8; 32],
            push_key: [0u8; 32],
        };
        ctx.export(RESPONSE_KEY_LABEL, &mut keys.response_key);
        ctx.export(PUSH_KEY_LABEL, &mut keys.push_key);
        keys
    }
}

fn counter_nonce(counter: u64) -> [u8; hpke::NONCE_LEN] {
    let mut nonce = [0u8; hpke::NONCE_LEN];
    nonce[4..].copy_from_slice(&counter.to_be_bytes());
    nonce
}

fn verify(signing_key: &[u8; 32], message: &[u8], signature: &str) -> Result<(), RelayRejection> {
    let signature = b64url_decode_64(signature).ok_or(RelayRejection::Malformed)?;
    let key = VerifyingKey::from_bytes(signing_key).map_err(|_| RelayRejection::BadSignature)?;
    key.verify_strict(message, &Signature::from_bytes(&signature))
        .map_err(|_| RelayRejection::BadSignature)
}

// ---------------------------------------------------------------------------
// Requests

/// Seals a request with a random HPKE ephemeral key.
pub fn seal_request(
    header: RequestHeader,
    plaintext: &[u8],
    controller_encryption_key: &[u8; 32],
    access_client_signing_key: &SigningKey,
) -> Result<(SealedRequest, RequestKeys), RelayRejection> {
    let mut ikm = [0u8; 32];
    rand::Rng::fill_bytes(&mut rand::rng(), &mut ikm);
    seal_request_with_ikm(
        header,
        plaintext,
        controller_encryption_key,
        access_client_signing_key,
        &ikm,
    )
}

/// Seals a request with the HPKE ephemeral key derived from `ikm_e`, for wire
/// vectors.
pub fn seal_request_with_ikm(
    header: RequestHeader,
    plaintext: &[u8],
    controller_encryption_key: &[u8; 32],
    access_client_signing_key: &SigningKey,
    ikm_e: &[u8],
) -> Result<(SealedRequest, RequestKeys), RelayRejection> {
    if !header.is_valid() {
        return Err(RelayRejection::Malformed);
    }
    let aad = header.encode();
    let (enc, mut ctx) =
        hpke::setup_base_sender_with_ikm(controller_encryption_key, HPKE_INFO, ikm_e)
            .map_err(|_| RelayRejection::Malformed)?;
    let ciphertext = ctx.seal(&aad, plaintext);
    let signature = access_client_signing_key.sign(&lv_cat(&[&aad, &enc, &ciphertext]));
    let keys = RequestKeys::export(&ctx);
    Ok((
        SealedRequest {
            header,
            enc: b64url_encode(&enc),
            ciphertext: b64url_encode(&ciphertext),
            signature: b64url_encode(&signature.to_bytes()),
        },
        keys,
    ))
}

/// What the Controller knows about an Access Client when a request arrives.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AccessClientStatus {
    Active { signing_key: [u8; 32] },
    Tombstoned,
    Unknown,
}

/// The Controller's view of itself when it checks a request.
#[derive(Debug, Clone, Copy)]
pub struct RequestPolicy<'a> {
    pub controller_id: &'a str,
    pub identity_epoch: u64,
    pub now_ms: u64,
}

#[derive(Debug)]
pub struct OpenedRequest {
    pub header: RequestHeader,
    pub plaintext: Vec<u8>,
    pub keys: RequestKeys,
    /// The Access Client's replay window with this counter accepted. The
    /// caller persists it.
    pub window: ReplayWindow,
}

/// Opens a request on the Controller. Checks run in the spec's order and all
/// of them before decryption: wrong Home, retired identity epoch, expiry
/// (with [`CLOCK_SKEW_MS`]), unknown or tombstoned Access Client, signature,
/// and replayed counter.
pub fn open_request(
    sealed: &SealedRequest,
    controller_encryption_secret: &[u8; 32],
    policy: &RequestPolicy<'_>,
    lookup: impl FnOnce(&str) -> AccessClientStatus,
    window: &ReplayWindow,
) -> Result<OpenedRequest, RelayRejection> {
    let header = &sealed.header;
    if !header.is_valid() {
        return Err(RelayRejection::Malformed);
    }
    let enc = b64url_decode_32(&sealed.enc).ok_or(RelayRejection::Malformed)?;
    let ciphertext = b64url_decode(&sealed.ciphertext).ok_or(RelayRejection::Malformed)?;
    if header.controller_id != policy.controller_id {
        return Err(RelayRejection::WrongController);
    }
    if header.identity_epoch != policy.identity_epoch {
        return Err(RelayRejection::RetiredEpoch);
    }
    if policy.now_ms > header.expires_at.saturating_add(CLOCK_SKEW_MS) {
        return Err(RelayRejection::Expired);
    }
    let signing_key = match lookup(&header.access_client_id) {
        AccessClientStatus::Active { signing_key } => signing_key,
        AccessClientStatus::Tombstoned => return Err(RelayRejection::TombstonedAccessClient),
        AccessClientStatus::Unknown => return Err(RelayRejection::UnknownAccessClient),
    };
    let aad = header.encode();
    verify(
        &signing_key,
        &lv_cat(&[&aad, &enc, &ciphertext]),
        &sealed.signature,
    )?;
    let window = window.accept(header.counter)?;
    let mut ctx = hpke::setup_base_receiver(&enc, controller_encryption_secret, HPKE_INFO)
        .map_err(|_| RelayRejection::DecryptFailed)?;
    let plaintext = ctx
        .open(&aad, &ciphertext)
        .map_err(|_| RelayRejection::DecryptFailed)?;
    Ok(OpenedRequest {
        header: header.clone(),
        plaintext,
        keys: RequestKeys::export(&ctx),
        window,
    })
}

/// SHA-256 of `lv_cat(header, enc, ciphertext, signature)`: the request
/// exactly as sent. A response binds it, so it answers that request only.
pub fn request_digest(sealed: &SealedRequest) -> Result<[u8; 32], RelayRejection> {
    let enc = b64url_decode_32(&sealed.enc).ok_or(RelayRejection::Malformed)?;
    let ciphertext = b64url_decode(&sealed.ciphertext).ok_or(RelayRejection::Malformed)?;
    let signature = b64url_decode_64(&sealed.signature).ok_or(RelayRejection::Malformed)?;
    Ok(Sha256::digest(lv_cat(&[
        &sealed.header.encode(),
        &enc,
        &ciphertext,
        &signature,
    ]))
    .into())
}

/// The response and push keys of a request, from its HPKE encapsulation
/// alone. Nothing is decrypted and nothing about the sender is checked, so
/// these keys only let the Controller answer a request [`open_request`]
/// rejected with a sealed, signed rejection. Only whoever sealed the request
/// can open that answer, and the response binds the request as received
/// ([`request_digest`]), so it does not answer a request it was not.
pub fn reply_keys(
    sealed: &SealedRequest,
    controller_encryption_secret: &[u8; 32],
) -> Result<RequestKeys, RelayRejection> {
    let enc = b64url_decode_32(&sealed.enc).ok_or(RelayRejection::Malformed)?;
    let ctx = hpke::setup_base_receiver(&enc, controller_encryption_secret, HPKE_INFO)
        .map_err(|_| RelayRejection::Malformed)?;
    Ok(RequestKeys::export(&ctx))
}

// ---------------------------------------------------------------------------
// Responses

/// Seals the response to `request`, exactly as the Controller received it.
pub fn seal_response(
    request: &SealedRequest,
    keys: &RequestKeys,
    plaintext: &[u8],
    controller_signing_key: &SigningKey,
) -> Result<SealedResponse, RelayRejection> {
    let header = request.header.response_header();
    let aad = header.encode(&request_digest(request)?);
    let ciphertext = hpke::aead_seal(&keys.response_key, &counter_nonce(0), &aad, plaintext);
    let signature = controller_signing_key.sign(&lv_cat(&[&aad, &ciphertext]));
    Ok(SealedResponse {
        header,
        ciphertext: b64url_encode(&ciphertext),
        signature: b64url_encode(&signature.to_bytes()),
    })
}

/// Opens a response on the Access Client, against the request it sent and the
/// Controller signing key pinned at pairing. A reply the Controller sealed
/// to any other request, however close, fails its signature check.
pub fn open_response(
    sealed: &SealedResponse,
    request: &SealedRequest,
    keys: &RequestKeys,
    controller_signing_key: &[u8; 32],
) -> Result<Vec<u8>, RelayRejection> {
    if sealed.header != request.header.response_header() {
        return Err(RelayRejection::MismatchedHeader);
    }
    let ciphertext = b64url_decode(&sealed.ciphertext).ok_or(RelayRejection::Malformed)?;
    let aad = sealed.header.encode(&request_digest(request)?);
    verify(
        controller_signing_key,
        &lv_cat(&[&aad, &ciphertext]),
        &sealed.signature,
    )?;
    hpke::aead_open(&keys.response_key, &counter_nonce(0), &aad, &ciphertext)
        .map_err(|_| RelayRejection::DecryptFailed)
}

// ---------------------------------------------------------------------------
// Pushes

/// Seals push `counter` (starting at 1) on the watch `watch` registered.
pub fn seal_push(
    watch: &RequestHeader,
    keys: &RequestKeys,
    counter: u64,
    plaintext: &[u8],
    controller_signing_key: &SigningKey,
) -> Result<SealedPush, RelayRejection> {
    if !(1..=MAX_SAFE_INTEGER).contains(&counter) {
        return Err(RelayRejection::Malformed);
    }
    let header = watch.push_header(counter);
    let aad = header.encode();
    let ciphertext = hpke::aead_seal(&keys.push_key, &counter_nonce(counter), &aad, plaintext);
    let signature = controller_signing_key.sign(&lv_cat(&[&aad, &ciphertext]));
    Ok(SealedPush {
        header,
        ciphertext: b64url_encode(&ciphertext),
        signature: b64url_encode(&signature.to_bytes()),
    })
}

/// Opens a push on the Access Client. Returns the plaintext and the watch's
/// replay window with this push's counter accepted.
pub fn open_push(
    sealed: &SealedPush,
    watch: &RequestHeader,
    keys: &RequestKeys,
    controller_signing_key: &[u8; 32],
    window: &ReplayWindow,
) -> Result<(Vec<u8>, ReplayWindow), RelayRejection> {
    let counter = sealed.header.counter;
    if !(1..=MAX_SAFE_INTEGER).contains(&counter) {
        return Err(RelayRejection::Malformed);
    }
    if sealed.header != watch.push_header(counter) {
        return Err(RelayRejection::MismatchedHeader);
    }
    let ciphertext = b64url_decode(&sealed.ciphertext).ok_or(RelayRejection::Malformed)?;
    let aad = sealed.header.encode();
    verify(
        controller_signing_key,
        &lv_cat(&[&aad, &ciphertext]),
        &sealed.signature,
    )?;
    let window = window.accept(counter)?;
    let plaintext = hpke::aead_open(&keys.push_key, &counter_nonce(counter), &aad, &ciphertext)
        .map_err(|_| RelayRejection::DecryptFailed)?;
    Ok((plaintext, window))
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Fixture {
        controller_signing: SigningKey,
        controller_secret: [u8; 32],
        client_signing: SigningKey,
    }

    fn fixture() -> Fixture {
        Fixture {
            controller_signing: SigningKey::from_bytes(&[1u8; 32]),
            controller_secret: [2u8; 32],
            client_signing: SigningKey::from_bytes(&[3u8; 32]),
        }
    }

    fn header() -> RequestHeader {
        RequestHeader {
            controller_id: "nemu_0123456789abcdef".into(),
            identity_epoch: 1,
            access_client_id: "ac_1".into(),
            request_id: "req_1".into(),
            counter: 1,
            expires_at: 1_000_000,
        }
    }

    fn policy() -> RequestPolicy<'static> {
        RequestPolicy {
            controller_id: "nemu_0123456789abcdef",
            identity_epoch: 1,
            now_ms: 1_000_000,
        }
    }

    #[test]
    fn request_response_and_push_round_trip() {
        let f = fixture();
        let controller_public = hpke::public_key(&f.controller_secret);
        let client_key = f.client_signing.verifying_key().to_bytes();
        let (sealed, client_keys) = seal_request(
            header(),
            b"{\"type\":\"listDevices\"}",
            &controller_public,
            &f.client_signing,
        )
        .unwrap();

        let opened = open_request(
            &sealed,
            &f.controller_secret,
            &policy(),
            |_| AccessClientStatus::Active {
                signing_key: client_key,
            },
            &ReplayWindow::default(),
        )
        .unwrap();
        assert_eq!(opened.plaintext, b"{\"type\":\"listDevices\"}");
        assert_eq!(opened.keys, client_keys);
        assert_eq!(opened.window.highest, 1);

        let controller_public_signing = f.controller_signing.verifying_key().to_bytes();
        let response = seal_response(&sealed, &opened.keys, b"ok", &f.controller_signing).unwrap();
        assert_eq!(
            open_response(&response, &sealed, &client_keys, &controller_public_signing).unwrap(),
            b"ok"
        );

        let push = seal_push(
            &opened.header,
            &opened.keys,
            1,
            b"change",
            &f.controller_signing,
        )
        .unwrap();
        let (plaintext, window) = open_push(
            &push,
            &sealed.header,
            &client_keys,
            &controller_public_signing,
            &ReplayWindow::default(),
        )
        .unwrap();
        assert_eq!(plaintext, b"change");
        assert_eq!(
            open_push(
                &push,
                &sealed.header,
                &client_keys,
                &controller_public_signing,
                &window
            )
            .unwrap_err(),
            RelayRejection::Replayed
        );
    }

    #[test]
    fn reply_keys_match_the_senders_keys_without_opening() {
        let f = fixture();
        let controller_public = hpke::public_key(&f.controller_secret);
        let (sealed, keys) =
            seal_request(header(), b"x", &controller_public, &f.client_signing).unwrap();
        assert_eq!(reply_keys(&sealed, &f.controller_secret).unwrap(), keys);
        let garbled = SealedRequest {
            enc: "not-base64!".into(),
            ..sealed
        };
        assert_eq!(
            reply_keys(&garbled, &f.controller_secret).unwrap_err(),
            RelayRejection::Malformed
        );
    }

    #[test]
    fn a_response_signed_by_another_key_is_rejected() {
        let f = fixture();
        let controller_public = hpke::public_key(&f.controller_secret);
        let (sealed, keys) =
            seal_request(header(), b"x", &controller_public, &f.client_signing).unwrap();
        let impostor = SigningKey::from_bytes(&[9u8; 32]);
        let response = seal_response(&sealed, &keys, b"ok", &impostor).unwrap();
        let pinned = f.controller_signing.verifying_key().to_bytes();
        assert_eq!(
            open_response(&response, &sealed, &keys, &pinned).unwrap_err(),
            RelayRejection::BadSignature
        );
    }

    /// Convex rewrites a request; the Controller answers what it received
    /// (as it may for a refusal it sends without opening). That answer must
    /// not open as the reply to what the client sent.
    #[test]
    fn a_reply_to_a_rewritten_request_does_not_answer_the_original() {
        let f = fixture();
        let controller_public = hpke::public_key(&f.controller_secret);
        let (sealed, keys) =
            seal_request(header(), b"x", &controller_public, &f.client_signing).unwrap();
        let pinned = f.controller_signing.verifying_key().to_bytes();
        let mut recounted = sealed.clone();
        recounted.header.counter += 1;
        let mut extended = sealed.clone();
        extended.header.expires_at += 1;
        let mut resigned = sealed.clone();
        let mut signature = b64url_decode(&resigned.signature).unwrap();
        signature[63] ^= 1;
        resigned.signature = b64url_encode(&signature);
        for rewritten in [recounted, extended, resigned] {
            let reply_keys = reply_keys(&rewritten, &f.controller_secret).unwrap();
            assert_eq!(reply_keys, keys, "the keys come from enc alone");
            let response =
                seal_response(&rewritten, &reply_keys, b"refused", &f.controller_signing).unwrap();
            assert_eq!(
                open_response(&response, &sealed, &keys, &pinned).unwrap_err(),
                RelayRejection::BadSignature
            );
        }
    }

    #[test]
    fn checks_run_before_the_access_client_lookup() {
        let f = fixture();
        let controller_public = hpke::public_key(&f.controller_secret);
        let (sealed, _) =
            seal_request(header(), b"x", &controller_public, &f.client_signing).unwrap();
        let late = RequestPolicy {
            now_ms: 1_000_000 + CLOCK_SKEW_MS + 1,
            ..policy()
        };
        let err = open_request(
            &sealed,
            &f.controller_secret,
            &late,
            |_| panic!("lookup must not run for an expired envelope"),
            &ReplayWindow::default(),
        )
        .unwrap_err();
        assert_eq!(err, RelayRejection::Expired);
    }
}
