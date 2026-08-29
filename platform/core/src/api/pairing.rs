use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::api::auth::AuthenticatedClient;
use crate::api::error::{ApiError, ApiResult};
use crate::api::members::{pair_member_session, require_owner};
use crate::pairing::codes::{consume_pairing_code, mint_pairing_code};
use crate::pairing::members::count_members;
use crate::pairing::tokens::{count_client_tokens, list_client_tokens, revoke_client_token};
use crate::state::AppState;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PairRequest {
    pub code: String,
    pub client_label: String,
    pub user_id: String,
    pub email: String,
    pub display_name: Option<String>,
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
    pub user_id: Option<String>,
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
    if body.user_id.trim().is_empty() {
        return Err(ApiError::bad_request("invalid_user", "userId is required"));
    }
    if body.email.trim().is_empty() {
        return Err(ApiError::bad_request("invalid_email", "email is required"));
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

    let issued = pair_member_session(
        &state,
        body.user_id.trim(),
        body.email.trim(),
        body.display_name.as_deref(),
        label,
    )
    .await?;

    Ok(Json(PairResponse {
        client_token: issued.client_token,
        controller_id: issued.controller_id,
    }))
}

/// Mint a short-lived pairing code.
/// Open during first-run bootstrap; owner-only after household members exist.
pub async fn create_pairing_code(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    uri: axum::http::Uri,
) -> ApiResult<Json<PairingCodeResponse>> {
    let token_count = count_client_tokens(&state.db)
        .await
        .map_err(ApiError::internal)?;
    let member_count = count_members(&state.db).await.map_err(ApiError::internal)?;

    if token_count > 0 && member_count > 0 {
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
        let auth = AuthenticatedClient {
            token_id: row.id,
            label: row.label,
            user_id: row.user_id,
        };
        require_owner(&state, &auth).await?;
    } else if token_count > 0 {
        let token = crate::api::auth::extract_bearer(&headers)
            .or_else(|| crate::api::auth::extract_query_token(&uri))
            .ok_or_else(|| {
                ApiError::new(
                    StatusCode::UNAUTHORIZED,
                    "unauthorized",
                    "Missing client token",
                )
            })?;
        let _ = crate::pairing::tokens::verify_client_token(&state.db, &token)
            .await
            .map_err(ApiError::internal)?
            .ok_or_else(|| {
                ApiError::new(
                    StatusCode::UNAUTHORIZED,
                    "unauthorized",
                    "Invalid client token",
                )
            })?;
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
    let tokens = list_household_tokens(&state).await?;
    Ok(Json(TokensResponse { tokens }))
}

pub async fn list_household_tokens(state: &AppState) -> ApiResult<Vec<ClientTokenResource>> {
    let tokens = list_client_tokens(&state.db)
        .await
        .map_err(ApiError::internal)?;

    Ok(tokens
        .into_iter()
        .map(|t| ClientTokenResource {
            id: t.id.to_string(),
            label: t.label,
            created_at: t.created_at.to_rfc3339(),
            last_seen_at: t.last_seen_at.map(|ts| ts.to_rfc3339()),
            user_id: t.user_id,
        })
        .collect())
}

pub async fn delete_token(
    State(state): State<AppState>,
    auth: AuthenticatedClient,
    Path(id): Path<String>,
) -> ApiResult<StatusCode> {
    revoke_household_token(&state, &auth, &id).await?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn delete_current_token(
    State(state): State<AppState>,
    auth: AuthenticatedClient,
) -> ApiResult<StatusCode> {
    revoke_current_token(&state, &auth).await?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn revoke_current_token(state: &AppState, auth: &AuthenticatedClient) -> ApiResult<()> {
    let deleted = revoke_client_token(&state.db, auth.token_id)
        .await
        .map_err(ApiError::internal)?;
    if deleted {
        Ok(())
    } else {
        Err(ApiError::not_found("not_found", "Token not found"))
    }
}

pub async fn revoke_household_token(
    state: &AppState,
    auth: &AuthenticatedClient,
    token_id: &str,
) -> ApiResult<()> {
    let id = Uuid::parse_str(token_id)
        .map_err(|_| ApiError::bad_request("invalid_id", "token id must be a UUID"))?;

    let tokens = list_client_tokens(&state.db)
        .await
        .map_err(ApiError::internal)?;
    let target = tokens
        .iter()
        .find(|token| token.id == id)
        .ok_or_else(|| ApiError::not_found("not_found", "Token not found"))?;

    let is_self = auth.token_id == id || (auth.user_id.is_some() && auth.user_id == target.user_id);
    if !is_self {
        require_owner(state, auth).await?;
    }

    let deleted = revoke_client_token(&state.db, id)
        .await
        .map_err(ApiError::internal)?;

    if deleted {
        Ok(())
    } else {
        Err(ApiError::not_found("not_found", "Token not found"))
    }
}
