//! Verified local pairing and Local sessions over HTTP (ADR-0037, NEM-126).
//! Every route here is unauthenticated: the Pairing code, the Recovery Key or
//! the Access Client's signing key is the proof. Bytes are base64url without
//! padding, as on the Relay wire.

use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::api::error::{ApiError, ApiResult};
use crate::pairing::exchange::{self, PairingClaims, PairingSecret};
use crate::pairing::local_sessions::open_local_session;
use crate::relay_crypto::cpace::InitiatorMessage;
use crate::relay_crypto::session::NONCE_LEN;
use crate::relay_crypto::wire::{b64url_decode, b64url_decode_32, b64url_encode};
use crate::state::AppState;

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StartPairingBody {
    #[serde(default)]
    pub secret: Option<PairingSecret>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartPairingResponse {
    pub run_id: String,
    pub sid: String,
    pub controller_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ExchangeBody {
    pub ya: String,
    pub ad_a: String,
    pub client_label: String,
    pub user_id: String,
    pub email: String,
    #[serde(default)]
    pub display_name: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExchangeResponse {
    pub yb: String,
    pub ad_b: String,
    pub tag_b: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ConfirmBody {
    pub tag_a: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfirmResponse {
    pub controller_id: String,
    pub access_client_id: String,
    pub membership_id: String,
    pub grant: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChallengeResponse {
    pub nonce: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct OpenSessionBody {
    pub access_client_id: String,
    pub nonce: String,
    pub signature: String,
    /// The Access Client's fresh nonce, which a pair-again refusal is
    /// signed over.
    pub client_nonce: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenSessionResponse {
    pub session: String,
    pub expires_in_seconds: u64,
}

fn malformed(field: &str) -> ApiError {
    ApiError::bad_request(
        "invalid_pairing_message",
        format!("{field} is not valid base64url"),
    )
}

fn run_id(raw: &str) -> ApiResult<Uuid> {
    Uuid::parse_str(raw).map_err(|_| {
        ApiError::not_found(
            "pairing_run_not_found",
            "This pairing attempt expired. Start pairing again.",
        )
    })
}

/// `POST /api/pairing/runs`
pub async fn start(
    State(state): State<AppState>,
    body: Option<Json<StartPairingBody>>,
) -> (StatusCode, Json<StartPairingResponse>) {
    let secret = body
        .and_then(|Json(body)| body.secret)
        .unwrap_or(PairingSecret::PairingCode);
    let run = exchange::start_run(&state, secret);
    (
        StatusCode::CREATED,
        Json(StartPairingResponse {
            run_id: run.run_id.to_string(),
            sid: b64url_encode(&run.sid),
            controller_id: state.identity.controller_id.clone(),
        }),
    )
}

/// `POST /api/pairing/runs/{runId}/exchange`
pub async fn exchange_keys(
    State(state): State<AppState>,
    Path(raw_run_id): Path<String>,
    Json(body): Json<ExchangeBody>,
) -> ApiResult<Json<ExchangeResponse>> {
    let run_id = run_id(&raw_run_id)?;
    let message = InitiatorMessage {
        ya: b64url_decode_32(&body.ya).ok_or_else(|| malformed("ya"))?,
        ad_a: b64url_decode(&body.ad_a).ok_or_else(|| malformed("adA"))?,
    };
    let reply = exchange::exchange(
        &state,
        run_id,
        &message,
        PairingClaims {
            client_label: body.client_label,
            user_id: body.user_id,
            email: body.email,
            display_name: body.display_name,
        },
    )
    .await?;
    Ok(Json(ExchangeResponse {
        yb: b64url_encode(&reply.yb),
        ad_b: b64url_encode(&reply.ad_b),
        tag_b: b64url_encode(&reply.tag_b),
    }))
}

/// `POST /api/pairing/runs/{runId}/confirm`
pub async fn confirm(
    State(state): State<AppState>,
    Path(raw_run_id): Path<String>,
    Json(body): Json<ConfirmBody>,
) -> ApiResult<Json<ConfirmResponse>> {
    let run_id = run_id(&raw_run_id)?;
    let tag_a = b64url_decode(&body.tag_a).ok_or_else(|| malformed("tagA"))?;
    let paired = exchange::confirm(&state, run_id, &tag_a).await?;
    Ok(Json(ConfirmResponse {
        controller_id: paired.controller_id,
        access_client_id: paired.access_client_id.to_string(),
        membership_id: paired.membership_id.to_string(),
        grant: paired.grant,
    }))
}

/// `POST /api/local-sessions/challenge`
pub async fn challenge(State(state): State<AppState>) -> Json<ChallengeResponse> {
    Json(ChallengeResponse {
        nonce: b64url_encode(&state.local_sessions.issue_challenge()),
    })
}

/// `POST /api/local-sessions`
pub async fn open(
    State(state): State<AppState>,
    Json(body): Json<OpenSessionBody>,
) -> ApiResult<(StatusCode, Json<OpenSessionResponse>)> {
    let bad = || {
        ApiError::bad_request(
            "invalid_request",
            "nonce, signature and clientNonce must be base64url",
        )
    };
    let nonce = b64url_decode(&body.nonce).ok_or_else(bad)?;
    let signature = b64url_decode(&body.signature).ok_or_else(bad)?;
    let client_nonce = b64url_decode(&body.client_nonce)
        .and_then(|bytes| <[u8; NONCE_LEN]>::try_from(bytes).ok())
        .ok_or_else(bad)?;
    let opened = open_local_session(
        &state,
        &body.access_client_id,
        &nonce,
        &signature,
        &client_nonce,
    )
    .await?;
    Ok((
        StatusCode::CREATED,
        Json(OpenSessionResponse {
            session: opened.token,
            expires_in_seconds: opened.expires_in.as_secs(),
        }),
    ))
}
