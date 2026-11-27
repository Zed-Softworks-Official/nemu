//! Core's handler for sealed Relay requests (ADR-0001, NEM-129).
//!
//! A request arrives from the Relay mailbox as a [`SealedRequest`]. Before
//! anything is decrypted, [`open_request`] rejects, in order: a wrong Home, a
//! retired identity epoch, an expired envelope (60 seconds of clock skew), an
//! unknown or tombstoned Access Client, a bad signature, and a counter that
//! is outside the window or already seen. The handler then persists the
//! Access Client's replay window, runs the action as that Access Client, and
//! seals and signs the reply with the key exported from the request.
//!
//! Every write's reply is stored under `(accessClientId, requestId)` for 24
//! hours, so a retry returns it without running again; a different body
//! under the same requestId is refused. Reads store nothing.
//!
//! A request refused before decryption is still answered, sealed to the
//! request's own HPKE encapsulation and signed, so the Access Client learns
//! why (pair again, re-address to the current epoch, or move its counter
//! past the window) and nobody else can read the answer. Every reply binds
//! the request exactly as received, so a reply to a request Convex rewrote
//! never answers the one its Access Client sent. A malformed envelope, one
//! for another Controller, or one with a bad signature is dropped.

use chrono::Utc;
use serde_json::{Value as JsonValue, json};
use tracing::warn;
use uuid::Uuid;

use crate::api::auth::AuthenticatedClient;
use crate::pairing::access_clients::find_access_client;
use crate::pairing::tombstones::access_client_status;
use crate::relay::dispatch::{self, RelayAction};
use crate::relay::store::{self, Claim};
use crate::relay_crypto::envelope::{
    AccessClientStatus, RelayRejection, RequestHeader, RequestKeys, RequestPolicy, SealedRequest,
    SealedResponse, open_request, reply_keys, seal_response,
};
use crate::state::AppState;

/// The identity epoch of a Home that has never been restored onto a new
/// Controller instance.
pub const INITIAL_IDENTITY_EPOCH: u64 = 1;

/// The settings key a Home restore will bump (not built yet). Changing it
/// republishes every Membership routing projection (`pairing::routing`).
pub(crate) const IDENTITY_EPOCH_SETTING: &str = "identity_epoch";

/// The Controller's current identity epoch. Access Clients learn it from
/// the signed Membership routing projection, with the signed
/// `retired_epoch` reply as a backstop.
pub async fn current_identity_epoch(state: &AppState) -> Result<u64, String> {
    let conn = state
        .db
        .get()
        .await
        .map_err(|e| format!("db pool error: {e}"))?;
    let stored = conn
        .interact(|conn| crate::identity::get_string(conn, IDENTITY_EPOCH_SETTING))
        .await
        .map_err(|e| format!("db interact error: {e}"))??;
    Ok(stored
        .and_then(|value| value.parse().ok())
        .unwrap_or(INITIAL_IDENTITY_EPOCH))
}

/// Handles one sealed request. Returns the sealed reply to post to the
/// mailbox, or `None` when the request is dropped.
pub async fn handle_sealed_request(
    state: &AppState,
    sealed: &SealedRequest,
) -> Option<SealedResponse> {
    match handle(state, sealed).await {
        Ok(reply) => reply,
        Err(error) => {
            // The error never carries envelope contents.
            warn!(%error, "relay request failed");
            reply_without_opening(state, sealed, &internal_error())
        }
    }
}

struct Caller {
    auth: AuthenticatedClient,
    id: Uuid,
}

async fn handle(
    state: &AppState,
    sealed: &SealedRequest,
) -> Result<Option<SealedResponse>, String> {
    let identity_epoch = current_identity_epoch(state).await?;
    let now_ms = u64::try_from(Utc::now().timestamp_millis()).unwrap_or(0);

    // Looked up first because `open_request` takes the answer; it is used
    // only after the Home, epoch, and expiry checks pass.
    let (status, caller) = lookup(state, &sealed.header.access_client_id).await?;
    let window = match &caller {
        Some(caller) => store::load_window(&state.db, caller.id).await?,
        None => Default::default(),
    };

    let policy = RequestPolicy {
        controller_id: &state.identity.controller_id,
        identity_epoch,
        now_ms,
    };
    let opened = match open_request(
        sealed,
        &state.identity.encryption_key.secret_key,
        &policy,
        |_| status,
        &window,
    ) {
        Ok(opened) => opened,
        Err(rejection) => {
            let Some(reply) = rejection_reply(rejection, identity_epoch, window.highest) else {
                return Ok(None);
            };
            return Ok(reply_without_opening(state, sealed, &reply));
        }
    };
    let Some(caller) = caller else {
        return Ok(None);
    };
    if !store::advance_window(&state.db, caller.id, window, opened.window).await? {
        // Another delivery of a request moved the window first.
        return Ok(None);
    }

    let reply = match dispatch::parse_action(&opened.plaintext) {
        Ok(action) => {
            run(
                state,
                &caller,
                (&opened.header, &opened.keys),
                &opened.plaintext,
                action,
            )
            .await?
        }
        Err(rejection) => dispatch::rejection_reply(&rejection),
    };
    Ok(seal(state, sealed, &opened.keys, &reply))
}

/// The Access Client's status for `open_request`, and the caller to run its
/// action as. Tombstones (NEM-127) win over a live row.
async fn lookup(
    state: &AppState,
    access_client_id: &str,
) -> Result<(AccessClientStatus, Option<Caller>), String> {
    let status = access_client_status(&state.db, access_client_id).await?;
    let AccessClientStatus::Active { .. } = status else {
        return Ok((status, None));
    };
    let Ok(id) = Uuid::parse_str(access_client_id) else {
        return Ok((AccessClientStatus::Unknown, None));
    };
    let Some((access_client, member)) = find_access_client(&state.db, id).await? else {
        return Ok((AccessClientStatus::Unknown, None));
    };
    // Same caller as over LAN, so every handler authorizes it the same way.
    // The role is read from the Membership on every request.
    let auth = AuthenticatedClient {
        access_client_id: access_client.id,
        label: access_client.label,
        user_id: member.user_id,
    };
    Ok((status, Some(Caller { auth, id })))
}

/// Runs the action, answering a write's retry from its stored outcome.
async fn run(
    state: &AppState,
    caller: &Caller,
    request: (&RequestHeader, &RequestKeys),
    plaintext: &[u8],
    action: RelayAction,
) -> Result<JsonValue, String> {
    let request_id = request.0.request_id.as_str();
    let ledger_id = store::command_ledger_id(caller.id, request_id);
    if action.is_read() {
        return Ok(dispatch::dispatch(state, &caller.auth, request, &ledger_id, action).await);
    }

    let claim = store::claim(
        &state.db,
        caller.id,
        request_id,
        store::body_hash(plaintext),
        Utc::now(),
    )
    .await?;
    match claim {
        Claim::Mismatch => Ok(dispatch::error_message(
            "request_id_reused",
            "This request ID was already used for a different request.",
        )),
        Claim::Retry(Some(stored)) => {
            serde_json::from_str(&stored).map_err(|e| format!("stored outcome unreadable: {e}"))
        }
        // A Command's outcome lives in the Command ledger, which answers its
        // retry without dispatching again.
        Claim::Retry(None) if action.is_command() => {
            Ok(dispatch::dispatch(state, &caller.auth, request, &ledger_id, action).await)
        }
        Claim::Retry(None) => Ok(dispatch::error_message(
            "outcome_unknown",
            "This request did not finish, and it is not run twice. Check the Home, then try again.",
        )),
        Claim::New => {
            let command = action.is_command();
            let reply = dispatch::dispatch(state, &caller.auth, request, &ledger_id, action).await;
            if !command {
                store::save_outcome(&state.db, caller.id, request_id, reply.to_string()).await?;
            }
            Ok(reply)
        }
    }
}

/// The reply to a request refused before decryption, or `None` to drop it.
fn rejection_reply(
    rejection: RelayRejection,
    identity_epoch: u64,
    highest_counter: u64,
) -> Option<JsonValue> {
    let pair_again = "This device is no longer paired with this Home. Pair it again at home.";
    let (code, message, details) = match rejection {
        // Not ours, or not a request: nothing to answer. A bad signature is
        // not answered either: anyone can flip a byte in the mailbox, so the
        // Access Client could not tell whose mistake it was, and a signed
        // refusal must never be something Convex can earn for it.
        RelayRejection::Malformed
        | RelayRejection::WrongController
        | RelayRejection::MismatchedHeader
        | RelayRejection::BadSignature
        | RelayRejection::DecryptFailed => return None,
        RelayRejection::RetiredEpoch => (
            "retired_epoch",
            "This Home's Controller changed. Try again.",
            Some(json!({ "identityEpoch": identity_epoch })),
        ),
        RelayRejection::Expired => (
            "request_expired",
            "This request arrived too late, so nothing changed. Check that this device's clock is right, then try again.",
            None,
        ),
        RelayRejection::UnknownAccessClient => ("unknown_access_client", pair_again, None),
        RelayRejection::TombstonedAccessClient => ("tombstoned_access_client", pair_again, None),
        RelayRejection::Replayed | RelayRejection::OutsideWindow => (
            if rejection == RelayRejection::Replayed {
                "replayed"
            } else {
                "outside_window"
            },
            "This request was already used. Try again.",
            Some(json!({ "highestCounter": highest_counter })),
        ),
    };
    let mut reply = dispatch::error_message(code, message);
    if let Some(details) = details {
        reply["error"]["details"] = details;
    }
    Some(reply)
}

fn internal_error() -> JsonValue {
    dispatch::error_message(
        "internal_error",
        "The Controller could not handle this request.",
    )
}

/// Seals `reply` to `request`, bound to it exactly as received.
fn seal(
    state: &AppState,
    request: &SealedRequest,
    keys: &RequestKeys,
    reply: &JsonValue,
) -> Option<SealedResponse> {
    seal_response(
        request,
        keys,
        reply.to_string().as_bytes(),
        &state.identity.keypair.signing_key,
    )
    .ok()
}

/// Seals `reply` to a request that was not opened.
fn reply_without_opening(
    state: &AppState,
    sealed: &SealedRequest,
    reply: &JsonValue,
) -> Option<SealedResponse> {
    let keys = reply_keys(sealed, &state.identity.encryption_key.secret_key).ok()?;
    seal(state, sealed, &keys, reply)
}

#[cfg(test)]
#[path = "handler_tests.rs"]
mod tests;
