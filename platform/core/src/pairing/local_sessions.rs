//! Local sessions: short-lived authorization the Controller gives an Access
//! Client on the home network after it signs a fresh Controller nonce.
//!
//! Sessions live in Controller memory only and name an Access Client, never a
//! role. Each request resolves the Access Client and its Membership again, so
//! revoking an Access Client or ending its Membership ends its Local sessions
//! on the next request.

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use axum::http::StatusCode;
use rand::Rng;
use uuid::Uuid;

use crate::api::error::{ApiError, ApiResult};
use crate::crypto::{random_token, sha256_hex};
use crate::pairing::access_clients::touch_access_client;
use crate::pairing::tombstones::access_client_status;
use crate::relay_crypto::envelope::{
    AccessClientStatus, TOMBSTONED_ACCESS_CLIENT, UNKNOWN_ACCESS_CLIENT,
};
use crate::relay_crypto::session::{
    LanRefusal, LocalSessionChallenge, NONCE_LEN, sign_refusal, verify_challenge,
};
use crate::relay_crypto::wire::b64url_encode;
use crate::state::AppState;

/// How long a Local session lasts. The Access Client renews it with a new
/// challenge before then.
pub const LOCAL_SESSION_TTL: Duration = Duration::from_secs(10 * 60);
/// How long a challenge nonce may wait for its signature.
pub const CHALLENGE_TTL: Duration = Duration::from_secs(60);
const MAX_CHALLENGES: usize = 256;

struct Session {
    access_client_id: Uuid,
    expires_at: Instant,
}

#[derive(Default)]
struct Inner {
    challenges: HashMap<[u8; NONCE_LEN], Instant>,
    /// Keyed by the SHA-256 of the session token.
    sessions: HashMap<String, Session>,
}

pub struct LocalSessions {
    inner: Mutex<Inner>,
    /// Access Clients whose sessions were just dropped, so open WebSockets
    /// authorized by them close at once.
    revoked: tokio::sync::broadcast::Sender<Uuid>,
}

impl Default for LocalSessions {
    fn default() -> Self {
        Self {
            inner: Mutex::default(),
            revoked: tokio::sync::broadcast::channel(64).0,
        }
    }
}

#[derive(Debug, Clone)]
pub struct OpenedSession {
    pub token: String,
    pub expires_in: Duration,
}

impl LocalSessions {
    fn lock(&self) -> std::sync::MutexGuard<'_, Inner> {
        self.inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    /// A fresh single-use nonce.
    pub fn issue_challenge(&self) -> [u8; NONCE_LEN] {
        let mut nonce = [0u8; NONCE_LEN];
        rand::rng().fill_bytes(&mut nonce);
        let now = Instant::now();
        let mut inner = self.lock();
        inner
            .challenges
            .retain(|_, issued| now.duration_since(*issued) < CHALLENGE_TTL);
        if inner.challenges.len() >= MAX_CHALLENGES
            && let Some(oldest) = inner
                .challenges
                .iter()
                .min_by_key(|(_, issued)| **issued)
                .map(|(nonce, _)| *nonce)
        {
            inner.challenges.remove(&oldest);
        }
        inner.challenges.insert(nonce, now);
        nonce
    }

    /// Spends a nonce. `false` when it was never issued, was spent or expired.
    fn take_challenge(&self, nonce: &[u8]) -> bool {
        let Ok(nonce) = <[u8; NONCE_LEN]>::try_from(nonce) else {
            return false;
        };
        self.lock()
            .challenges
            .remove(&nonce)
            .is_some_and(|issued| issued.elapsed() < CHALLENGE_TTL)
    }

    fn open(&self, access_client_id: Uuid) -> OpenedSession {
        let token = random_token();
        let now = Instant::now();
        let mut inner = self.lock();
        inner.sessions.retain(|_, session| session.expires_at > now);
        inner.sessions.insert(
            sha256_hex(&token),
            Session {
                access_client_id,
                expires_at: now + LOCAL_SESSION_TTL,
            },
        );
        OpenedSession {
            token,
            expires_in: LOCAL_SESSION_TTL,
        }
    }

    /// The Access Client a live session token names.
    pub fn resolve(&self, token: &str) -> Option<Uuid> {
        self.resolve_at(token, Instant::now())
    }

    fn resolve_at(&self, token: &str, now: Instant) -> Option<Uuid> {
        let inner = self.lock();
        inner
            .sessions
            .get(&sha256_hex(token))
            .filter(|session| session.expires_at > now)
            .map(|session| session.access_client_id)
    }

    /// Ends every Local session of an Access Client, and tells open
    /// WebSockets it authorized to close.
    pub fn drop_access_client(&self, access_client_id: Uuid) {
        self.lock()
            .sessions
            .retain(|_, session| session.access_client_id != access_client_id);
        let _ = self.revoked.send(access_client_id);
    }

    /// Access Client IDs as their sessions are dropped.
    pub fn revocations(&self) -> tokio::sync::broadcast::Receiver<Uuid> {
        self.revoked.subscribe()
    }
}

fn refused(code: &str, message: &str) -> ApiError {
    ApiError::new(StatusCode::UNAUTHORIZED, code, message)
}

/// A tombstoned Access Client, over LAN. Its keys never work again. Unsigned
/// on an ordinary request: the client opens a new Local session, whose
/// refusal is signed.
pub fn revoked() -> ApiError {
    refused(
        TOMBSTONED_ACCESS_CLIENT,
        "This Access Client was revoked. Create new keys and pair again at home.",
    )
}

/// A pair-again refusal of a Local session, signed with the Controller's
/// identity key over the Access Client's `client_nonce` ([`LanRefusal`]), so
/// the client can tell it from one anybody on the network could send.
fn signed_refusal(
    state: &AppState,
    error: ApiError,
    access_client_id: &str,
    client_nonce: &[u8; NONCE_LEN],
) -> ApiError {
    let signature = sign_refusal(
        &state.identity.keypair.signing_key,
        &LanRefusal {
            controller_id: &state.identity.controller_id,
            access_client_id,
            code: &error.code,
            client_nonce,
        },
    );
    error.with_details(Some(serde_json::json!({
        "refusalSignature": b64url_encode(&signature),
    })))
}

/// Opens a Local session for an Access Client that signed `nonce`. A refusal
/// that means "pair again" is signed over `client_nonce`.
pub async fn open_local_session(
    state: &AppState,
    access_client_id: &str,
    nonce: &[u8],
    signature: &[u8],
    client_nonce: &[u8; NONCE_LEN],
) -> ApiResult<OpenedSession> {
    // Spend the nonce first, so a refused signature cannot be retried on it.
    if !state.local_sessions.take_challenge(nonce) {
        return Err(refused(
            "invalid_challenge",
            "This challenge expired or was already used. Ask for a new one.",
        ));
    }
    let pair_again = |error| signed_refusal(state, error, access_client_id, client_nonce);
    let unknown = || {
        pair_again(refused(
            UNKNOWN_ACCESS_CLIENT,
            "This Access Client is not paired with this Controller. Pair it again at home.",
        ))
    };
    let id = Uuid::parse_str(access_client_id).map_err(|_| unknown())?;
    let signing_key = match access_client_status(&state.db, access_client_id)
        .await
        .map_err(ApiError::internal)?
    {
        AccessClientStatus::Active { signing_key } => signing_key,
        AccessClientStatus::Tombstoned => return Err(pair_again(revoked())),
        AccessClientStatus::Unknown => return Err(unknown()),
    };
    verify_challenge(
        &signing_key,
        &LocalSessionChallenge {
            controller_id: &state.identity.controller_id,
            access_client_id,
            nonce,
        },
        signature,
    )
    .map_err(|_| refused("bad_signature", "The challenge signature is not valid"))?;
    touch_access_client(&state.db, id)
        .await
        .map_err(ApiError::internal)?;
    Ok(state.local_sessions.open(id))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_challenge_is_spent_once() {
        let sessions = LocalSessions::default();
        let nonce = sessions.issue_challenge();
        assert!(sessions.take_challenge(&nonce));
        assert!(!sessions.take_challenge(&nonce));
        assert!(!sessions.take_challenge(&[0u8; NONCE_LEN]));
        assert!(!sessions.take_challenge(&nonce[..16]));
    }

    #[test]
    fn a_session_expires_after_its_lifetime() {
        let sessions = LocalSessions::default();
        let id = Uuid::new_v4();
        let opened = sessions.open(id);
        assert_eq!(opened.expires_in, LOCAL_SESSION_TTL);
        assert_eq!(sessions.resolve(&opened.token), Some(id));
        let later = Instant::now() + LOCAL_SESSION_TTL + Duration::from_secs(1);
        assert_eq!(sessions.resolve_at(&opened.token, later), None);
        assert_eq!(sessions.resolve("not-a-session"), None);
    }

    #[test]
    fn dropping_an_access_client_ends_only_its_sessions() {
        let sessions = LocalSessions::default();
        let (phone, tablet) = (Uuid::new_v4(), Uuid::new_v4());
        let a = sessions.open(phone);
        let b = sessions.open(phone);
        let c = sessions.open(tablet);
        sessions.drop_access_client(phone);
        assert_eq!(sessions.resolve(&a.token), None);
        assert_eq!(sessions.resolve(&b.token), None);
        assert_eq!(sessions.resolve(&c.token), Some(tablet));
    }
}
