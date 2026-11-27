use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::api::auth::{AuthenticatedClient, authenticate, count_access_credentials};
use crate::api::error::{ApiError, ApiResult};
use crate::api::members::{pair_member_session, require_owner};
use crate::audit::{AuditKind, AuditWrite};
use crate::pairing::access_clients::{delete_access_client, list_access_clients};
use crate::pairing::codes::{consume_pairing_code, mint_pairing_code};
use crate::pairing::members::count_members;
use crate::pairing::tokens::{list_client_tokens, revoke_client_token};
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
    let credential_count = count_access_credentials(&state.db)
        .await
        .map_err(ApiError::internal)?;
    let member_count = count_members(&state.db).await.map_err(ApiError::internal)?;

    if credential_count > 0 {
        let auth = authenticate(&state, &headers, &uri).await?;
        if member_count > 0 {
            require_owner(&state, &auth).await?;
        }
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

/// Every Access Client of the Home: CPace-paired ones and, until NEM-131,
/// bearer tokens. Both revoke through [`revoke_household_token`].
pub async fn list_household_tokens(state: &AppState) -> ApiResult<Vec<ClientTokenResource>> {
    let tokens = list_client_tokens(&state.db)
        .await
        .map_err(ApiError::internal)?;
    let access_clients = list_access_clients(&state.db)
        .await
        .map_err(ApiError::internal)?;

    let mut resources: Vec<(chrono::DateTime<chrono::Utc>, ClientTokenResource)> = tokens
        .into_iter()
        .map(|t| {
            (
                t.created_at,
                ClientTokenResource {
                    id: t.id.to_string(),
                    label: t.label,
                    created_at: t.created_at.to_rfc3339(),
                    last_seen_at: t.last_seen_at.map(|ts| ts.to_rfc3339()),
                    user_id: t.user_id,
                },
            )
        })
        .chain(access_clients.into_iter().map(|(client, member)| {
            (
                client.created_at,
                ClientTokenResource {
                    id: client.id.to_string(),
                    label: client.label,
                    created_at: client.created_at.to_rfc3339(),
                    last_seen_at: client.last_seen_at.map(|ts| ts.to_rfc3339()),
                    user_id: member.user_id,
                },
            )
        }))
        .collect();
    resources.sort_by_key(|(created_at, _)| std::cmp::Reverse(*created_at));
    Ok(resources
        .into_iter()
        .map(|(_, resource)| resource)
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
    crate::api::access::revoke_current(&state, &auth).await?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn revoke_household_token(
    state: &AppState,
    auth: &AuthenticatedClient,
    token_id: &str,
) -> ApiResult<()> {
    let id = Uuid::parse_str(token_id)
        .map_err(|_| ApiError::bad_request("invalid_id", "token id must be a UUID"))?;

    let target = list_household_tokens(state)
        .await?
        .into_iter()
        .find(|token| token.id == id.to_string())
        .ok_or_else(|| ApiError::not_found("not_found", "Token not found"))?;

    let is_self = auth.token_id == id || (auth.user_id.is_some() && auth.user_id == target.user_id);
    if !is_self {
        require_owner(state, auth).await?;
    }

    let audit = Some(revocation_audit(auth, id, &target.label));
    // The ID names a bearer token or a CPace Access Client; never both.
    let deleted = revoke_client_token(&state.db, id, audit.clone())
        .await
        .map_err(ApiError::internal)?
        || delete_access_client(&state.db, id, audit)
            .await
            .map_err(ApiError::internal)?;
    state.local_sessions.drop_access_client(id);

    if deleted {
        Ok(())
    } else {
        Err(ApiError::not_found("not_found", "Token not found"))
    }
}

fn revocation_audit(auth: &AuthenticatedClient, token_id: Uuid, label: &str) -> AuditWrite {
    AuditWrite {
        kind: AuditKind::AccessClientRevoked,
        actor_user_id: auth.user_id.clone(),
        summary: format!("revoked access client {label}"),
        detail: serde_json::json!({ "action": "revoke", "tokenId": token_id, "label": label }),
    }
}
