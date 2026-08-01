use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::api::auth::AuthenticatedClient;
use crate::api::error::{ApiError, ApiResult};
use crate::pairing::codes::{consume_pairing_code, mint_pairing_code};
use crate::pairing::tokens::{
    count_client_tokens, list_client_tokens, mint_client_token, revoke_client_token,
};
use crate::state::AppState;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PairRequest {
    pub code: String,
    pub client_label: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PairResponse {
    pub client_token: String,
    pub controller_id: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PairingCodeResponse {
    pub code: String,
    pub expires_at: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientTokenResource {
    pub id: String,
    pub label: String,
    pub created_at: String,
    pub last_seen_at: Option<String>,
}

#[derive(Serialize)]
pub struct TokensResponse {
    pub tokens: Vec<ClientTokenResource>,
}

/// Exchange a pairing code for a long-lived client token (unauthenticated).
pub async fn pair(
    State(state): State<AppState>,
    Json(body): Json<PairRequest>,
) -> ApiResult<Json<PairResponse>> {
    let label = body.client_label.trim();
    if label.is_empty() {
        return Err(ApiError::bad_request(
            "invalid_label",
            "clientLabel is required",
        ));
    }
    if body.code.trim().len() != 6 {
        return Err(ApiError::bad_request(
            "invalid_code",
            "Pairing code must be 6 digits",
        ));
    }

    let ok = consume_pairing_code(&state.db, body.code.trim())
        .await
        .map_err(ApiError::internal)?;
    if !ok {
        return Err(ApiError::new(
            StatusCode::UNAUTHORIZED,
            "invalid_code",
            "Pairing code is invalid or expired",
        ));
    }

    let issued = mint_client_token(&state.db, label)
        .await
        .map_err(ApiError::internal)?;

    Ok(Json(PairResponse {
        client_token: issued.token,
        controller_id: state.identity.controller_id.clone(),
    }))
}

/// Mint a short-lived pairing code.
/// Authenticated when clients already exist; open during first-run bootstrap.
pub async fn create_pairing_code(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    uri: axum::http::Uri,
) -> ApiResult<Json<PairingCodeResponse>> {
    let token_count = count_client_tokens(&state.db)
        .await
        .map_err(ApiError::internal)?;

    if token_count > 0 {
        let token = crate::api::auth::extract_bearer(&headers)
            .or_else(|| crate::api::auth::extract_query_token(&uri))
            .ok_or_else(|| {
                ApiError::new(
                    StatusCode::UNAUTHORIZED,
                    "unauthorized",
                    "Missing client token",
                )
            })?;
        let row = crate::pairing::tokens::verify_client_token(&state.db, &token)
            .await
            .map_err(ApiError::internal)?
            .ok_or_else(|| {
                ApiError::new(
                    StatusCode::UNAUTHORIZED,
                    "unauthorized",
                    "Invalid client token",
                )
            })?;
        let _ = row;
    }

    let issued = mint_pairing_code(&state.db)
        .await
        .map_err(ApiError::internal)?;

    Ok(Json(PairingCodeResponse {
        code: issued.code,
        expires_at: issued.expires_at.to_rfc3339(),
    }))
}

pub async fn list_tokens(
    State(state): State<AppState>,
    _auth: AuthenticatedClient,
) -> ApiResult<Json<TokensResponse>> {
    let tokens = list_client_tokens(&state.db)
        .await
        .map_err(ApiError::internal)?;

    Ok(Json(TokensResponse {
        tokens: tokens
            .into_iter()
            .map(|t| ClientTokenResource {
                id: t.id.to_string(),
                label: t.label,
                created_at: t.created_at.to_rfc3339(),
                last_seen_at: t.last_seen_at.map(|ts| ts.to_rfc3339()),
            })
            .collect(),
    }))
}

pub async fn delete_token(
    State(state): State<AppState>,
    _auth: AuthenticatedClient,
    Path(id): Path<String>,
) -> ApiResult<StatusCode> {
    let id = Uuid::parse_str(&id)
        .map_err(|_| ApiError::bad_request("invalid_id", "token id must be a UUID"))?;

    let deleted = revoke_client_token(&state.db, id)
        .await
        .map_err(ApiError::internal)?;

    if deleted {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(ApiError::not_found("not_found", "Token not found"))
    }
}
