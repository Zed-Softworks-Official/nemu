//! Verified local pairing (ADR-0037): the Controller's side of CPace.
//!
//! A pairing run is three requests on the home network:
//!
//! 1. [`start_run`]: the Controller picks a fresh `sid`.
//! 2. [`exchange`]: the Access Client sends `Ya` and its public keys; the
//!    Controller answers with `Yb`, its public keys and its confirmation tag.
//!    This step takes one guess from the Pairing code.
//! 3. [`confirm`]: the Access Client sends its confirmation tag. Only then
//!    does the Controller spend the code, resolve the Membership and issue an
//!    Access grant.
//!
//! The same run covers a new Access Client, accepting an Invitation
//! (ADR-0020) and first-Owner bootstrap, all keyed by the Pairing code, and
//! Recovery Key Owner authorization (ADR-0012), keyed by the Recovery Key.
//! Runs live in Controller memory only.

use std::collections::{HashMap, VecDeque};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use axum::http::StatusCode;
use rand::Rng;
use uuid::Uuid;

use crate::api::error::{ApiError, ApiResult};
use crate::api::members::resolve_pairing_member;
use crate::audit::{AuditKind, AuditWrite};
use crate::db::models::Member;
use crate::pairing::access_clients::{
    AccessClientInput, AccessClientInsertError, insert_access_client,
};
use crate::pairing::codes::{begin_pairing_attempt, consume_pairing_code_by_id};
use crate::relay_crypto::cpace::{
    InitiatorMessage, PairingContext, PartyKeys, Responder, ResponderMessage,
};
use crate::relay_crypto::grant::{AccessGrant, issue_grant};
use crate::relay_crypto::session::{acceptable_encryption_key, acceptable_signing_key};
use crate::state::AppState;

/// How long a run may take from start to confirmation.
pub const RUN_TTL: Duration = Duration::from_secs(120);
/// Runs held at once; the oldest is dropped beyond this.
const MAX_RUNS: usize = 32;
pub const SID_LEN: usize = 16;
/// Recovery Key guesses allowed per [`RECOVERY_WINDOW`].
pub const MAX_RECOVERY_ATTEMPTS: usize = 5;
pub const RECOVERY_WINDOW: Duration = Duration::from_secs(60 * 60);
/// Settings key holding the Recovery Key. Nothing writes it yet: generating
/// the offline Recovery Key at first-Owner setup is its own roadmap item.
pub const RECOVERY_KEY_SETTING: &str = "recovery_key";

/// The secret a run is keyed by.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub enum PairingSecret {
    /// The short one-time Pairing code.
    PairingCode,
    /// The offline Recovery Key: authorizes a new Owner Access Client only.
    RecoveryKey,
}

/// What the Access Client says about itself. The Pairing code is what
/// authorizes it; these only pick the Membership, as `POST /api/pair` does.
#[derive(Debug, Clone)]
pub struct PairingClaims {
    pub client_label: String,
    pub user_id: String,
    pub email: String,
    pub display_name: Option<String>,
}

#[derive(Debug, Clone)]
pub struct StartedRun {
    pub run_id: Uuid,
    pub sid: [u8; SID_LEN],
}

#[derive(Debug, Clone)]
pub struct PairedAccessClient {
    pub controller_id: String,
    pub access_client_id: Uuid,
    pub membership_id: Uuid,
    pub grant: String,
}

struct Run {
    sid: [u8; SID_LEN],
    secret: PairingSecret,
    started_at: Instant,
    stage: Stage,
}

enum Stage {
    Started,
    Exchanged(Box<Exchanged>),
}

struct Exchanged {
    responder: Responder,
    claims: PairingClaims,
    /// The Pairing code this run guessed against.
    code_id: Option<Uuid>,
}

#[derive(Default)]
struct Inner {
    runs: HashMap<Uuid, Run>,
    recovery_attempts: VecDeque<Instant>,
}

/// Pairing runs in progress, in Controller memory.
#[derive(Default)]
pub struct PairingRuns {
    inner: Mutex<Inner>,
}

impl PairingRuns {
    fn lock(&self) -> std::sync::MutexGuard<'_, Inner> {
        self.inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    fn insert(&self, secret: PairingSecret) -> StartedRun {
        let mut sid = [0u8; SID_LEN];
        rand::rng().fill_bytes(&mut sid);
        let run_id = Uuid::new_v4();
        let now = Instant::now();
        let mut inner = self.lock();
        inner
            .runs
            .retain(|_, run| now.duration_since(run.started_at) < RUN_TTL);
        while inner.runs.len() >= MAX_RUNS {
            let Some(oldest) = inner
                .runs
                .iter()
                .min_by_key(|(_, run)| run.started_at)
                .map(|(id, _)| *id)
            else {
                break;
            };
            inner.runs.remove(&oldest);
        }
        inner.runs.insert(
            run_id,
            Run {
                sid,
                secret,
                started_at: now,
                stage: Stage::Started,
            },
        );
        StartedRun { run_id, sid }
    }

    /// Removes and returns a live run. Every step consumes the run it acts on,
    /// so a step can never be repeated.
    fn take(&self, run_id: Uuid) -> Option<Run> {
        let run = self.lock().runs.remove(&run_id)?;
        (run.started_at.elapsed() < RUN_TTL).then_some(run)
    }

    fn put_back(&self, run_id: Uuid, run: Run) {
        self.lock().runs.insert(run_id, run);
    }

    /// Takes one Recovery Key guess, or `false` when they are used up.
    fn take_recovery_attempt(&self) -> bool {
        let now = Instant::now();
        let mut inner = self.lock();
        while inner
            .recovery_attempts
            .front()
            .is_some_and(|at| now.duration_since(*at) >= RECOVERY_WINDOW)
        {
            inner.recovery_attempts.pop_front();
        }
        if inner.recovery_attempts.len() >= MAX_RECOVERY_ATTEMPTS {
            return false;
        }
        inner.recovery_attempts.push_back(now);
        true
    }

    fn clear_recovery_attempts(&self) {
        self.lock().recovery_attempts.clear();
    }
}

fn invalid_code() -> ApiError {
    ApiError::new(
        StatusCode::UNAUTHORIZED,
        "invalid_code",
        "Pairing code is invalid or expired",
    )
}

fn run_not_found() -> ApiError {
    ApiError::not_found(
        "pairing_run_not_found",
        "This pairing attempt expired. Start pairing again.",
    )
}

fn controller_keys(state: &AppState) -> PartyKeys {
    PartyKeys {
        signing_key: state
            .identity
            .keypair
            .signing_key
            .verifying_key()
            .to_bytes(),
        encryption_key: state.identity.encryption_key.public_key,
    }
}

/// Step 1: a fresh run and its `sid`.
pub fn start_run(state: &AppState, secret: PairingSecret) -> StartedRun {
    state.pairing_runs.insert(secret)
}

fn validate_claims(claims: &PairingClaims) -> ApiResult<()> {
    if claims.client_label.trim().is_empty() {
        return Err(ApiError::bad_request(
            "invalid_label",
            "clientLabel is required",
        ));
    }
    if claims.user_id.trim().is_empty() {
        return Err(ApiError::bad_request("invalid_user", "userId is required"));
    }
    if claims.email.trim().is_empty() {
        return Err(ApiError::bad_request("invalid_email", "email is required"));
    }
    Ok(())
}

/// Step 2: answer the Access Client's CPace message. Takes one guess from the
/// secret the run is keyed by.
pub async fn exchange(
    state: &AppState,
    run_id: Uuid,
    message: &InitiatorMessage,
    claims: PairingClaims,
) -> ApiResult<ResponderMessage> {
    validate_claims(&claims)?;
    let mut run = state.pairing_runs.take(run_id).ok_or_else(run_not_found)?;
    if !matches!(run.stage, Stage::Started) {
        return Err(run_not_found());
    }

    let (secret, code_id) = match run.secret {
        PairingSecret::PairingCode => {
            let attempt = begin_pairing_attempt(&state.db)
                .await
                .map_err(ApiError::internal)?
                .ok_or_else(invalid_code)?;
            (attempt.code, Some(attempt.code_id))
        }
        PairingSecret::RecoveryKey => {
            let recovery_key = crate::identity::read_setting(&state.db, RECOVERY_KEY_SETTING)
                .await
                .map_err(ApiError::internal)?
                .ok_or_else(|| {
                    ApiError::conflict("recovery_unavailable", "This Home has no Recovery Key")
                })?;
            if !state.pairing_runs.take_recovery_attempt() {
                return Err(ApiError::new(
                    StatusCode::TOO_MANY_REQUESTS,
                    "too_many_attempts",
                    "Too many Recovery Key attempts. Try again later.",
                ));
            }
            (recovery_key, None)
        }
    };

    let ctx = PairingContext {
        code: &secret,
        controller_id: &state.identity.controller_id,
        sid: &run.sid,
    };
    let (responder, reply) = Responder::respond(&ctx, &controller_keys(state), message)
        .map_err(|error| ApiError::bad_request("invalid_pairing_message", error.to_string()))?;
    run.stage = Stage::Exchanged(Box::new(Exchanged {
        responder,
        claims,
        code_id,
    }));
    state.pairing_runs.put_back(run_id, run);
    Ok(reply)
}

/// Step 3: check the Access Client's confirmation tag, then bind its keys to
/// a Membership and issue the Access grant.
pub async fn confirm(
    state: &AppState,
    run_id: Uuid,
    tag_a: &[u8],
) -> ApiResult<PairedAccessClient> {
    let run = state.pairing_runs.take(run_id).ok_or_else(run_not_found)?;
    let Stage::Exchanged(exchanged) = run.stage else {
        return Err(run_not_found());
    };
    let Exchanged {
        responder,
        claims,
        code_id,
    } = *exchanged;
    let outcome = responder.confirm(tag_a).map_err(|_| invalid_code())?;
    let keys = outcome.access_client_keys;
    if !acceptable_signing_key(&keys.signing_key)
        || !acceptable_encryption_key(&keys.encryption_key)
    {
        return Err(ApiError::bad_request(
            "invalid_access_client_keys",
            "The Access Client's public keys are not usable",
        ));
    }

    let member = match run.secret {
        PairingSecret::PairingCode => {
            let code_id = code_id.ok_or_else(invalid_code)?;
            if !consume_pairing_code_by_id(&state.db, code_id)
                .await
                .map_err(ApiError::internal)?
            {
                return Err(invalid_code());
            }
            resolve_pairing_member(
                state,
                &claims.user_id,
                &claims.email,
                claims.display_name.as_deref(),
            )
            .await?
        }
        PairingSecret::RecoveryKey => {
            state.pairing_runs.clear_recovery_attempts();
            recovering_owner(state, &claims.user_id).await?
        }
    };

    let access_client_id = Uuid::new_v4();
    let label = claims.client_label.trim().to_string();
    insert_access_client(
        &state.db,
        AccessClientInput {
            id: access_client_id,
            member_id: member.id,
            label: label.clone(),
            signing_key: keys.signing_key,
            encryption_key: keys.encryption_key,
        },
        Some(AuditWrite {
            kind: AuditKind::AccessClientPaired,
            actor_user_id: member.user_id.clone(),
            summary: format!("paired access client {label}"),
            detail: serde_json::json!({
                "action": "pair",
                "label": label,
                "accessClientId": access_client_id,
                "method": run.secret,
            }),
        }),
    )
    .await
    .map_err(|error| match error {
        AccessClientInsertError::KeysInUse => ApiError::conflict(
            "access_client_keys_in_use",
            "These keys already belong to an Access Client. Create new keys and pair again.",
        ),
        AccessClientInsertError::Internal(message) => ApiError::internal(message),
    })?;

    let grant = issue_grant(
        &AccessGrant {
            controller_id: state.identity.controller_id.clone(),
            access_client_id: access_client_id.to_string(),
            membership_id: member.id.to_string(),
            signing_key: keys.signing_key,
            encryption_key: keys.encryption_key,
            issued_at: chrono::Utc::now().timestamp().max(0) as u64,
        },
        &state.identity.keypair.signing_key,
    );

    Ok(PairedAccessClient {
        controller_id: state.identity.controller_id.clone(),
        access_client_id,
        membership_id: member.id,
        grant,
    })
}

/// Recovery authorizes a new Access Client for an Owner who lost every other
/// one, so the claimed Account must already hold an active Owner Membership.
async fn recovering_owner(state: &AppState, user_id: &str) -> ApiResult<Member> {
    let member = crate::pairing::members::find_member_by_user_id(&state.db, user_id.trim())
        .await
        .map_err(ApiError::internal)?;
    match member {
        Some(member) if member.role == "owner" && member.status == "active" => Ok(member),
        _ => Err(ApiError::forbidden(
            "owner_required",
            "The Recovery Key only authorizes an Owner of this Home",
        )),
    }
}
