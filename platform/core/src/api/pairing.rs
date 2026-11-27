use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use serde::Serialize;
use uuid::Uuid;

use crate::api::auth::{AuthenticatedClient, authenticate};
use crate::api::error::{ApiError, ApiResult};
use crate::api::members::require_owner;
use crate::audit::{AuditKind, AuditWrite};
use crate::pairing::access_clients::{
    count_access_clients, delete_access_client, list_access_clients,
};
use crate::pairing::codes::mint_pairing_code;
use crate::pairing::members::count_members;
use crate::state::AppState;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PairingCodeResponse {
    pub code: String,
    pub expires_at: String,
}

/// One Access Client of the Home, named by its Access Client ID.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccessClientResource {
    pub id: String,
    pub label: String,
    pub created_at: String,
    pub last_seen_at: Option<String>,
    pub user_id: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccessClientsResponse {
    pub access_clients: Vec<AccessClientResource>,
}

/// Mint a short-lived pairing code.
/// Open during first-run bootstrap; owner-only after household members exist.
pub async fn create_pairing_code(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    uri: axum::http::Uri,
) -> ApiResult<Json<PairingCodeResponse>> {
    let access_client_count = count_access_clients(&state.db)
        .await
        .map_err(ApiError::internal)?;
    let member_count = count_members(&state.db).await.map_err(ApiError::internal)?;

    if access_client_count > 0 {
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

pub async fn list_access_clients_handler(
    State(state): State<AppState>,
    _auth: AuthenticatedClient,
) -> ApiResult<Json<AccessClientsResponse>> {
    let access_clients = list_household_access_clients(&state).await?;
    Ok(Json(AccessClientsResponse { access_clients }))
}

/// Every Access Client of the Home, newest first.
pub async fn list_household_access_clients(
    state: &AppState,
) -> ApiResult<Vec<AccessClientResource>> {
    let access_clients = list_access_clients(&state.db)
        .await
        .map_err(ApiError::internal)?;
    let mut resources: Vec<_> = access_clients
        .into_iter()
        .map(|(client, member)| {
            (
                client.created_at,
                AccessClientResource {
                    id: client.id.to_string(),
                    label: client.label,
                    created_at: client.created_at.to_rfc3339(),
                    last_seen_at: client.last_seen_at.map(|ts| ts.to_rfc3339()),
                    user_id: member.user_id,
                },
            )
        })
        .collect();
    resources.sort_by_key(|(created_at, _)| std::cmp::Reverse(*created_at));
    Ok(resources
        .into_iter()
        .map(|(_, resource)| resource)
        .collect())
}

pub async fn revoke_access_client_handler(
    State(state): State<AppState>,
    auth: AuthenticatedClient,
    Path(id): Path<String>,
) -> ApiResult<StatusCode> {
    revoke_household_access_client(&state, &auth, &id).await?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn revoke_current_handler(
    State(state): State<AppState>,
    auth: AuthenticatedClient,
) -> ApiResult<StatusCode> {
    crate::api::access::revoke_current(&state, &auth).await?;
    Ok(StatusCode::NO_CONTENT)
}

/// Revokes one Access Client by its Access Client ID. The caller may revoke
/// its own Membership's Access Clients; an Owner may revoke any.
pub async fn revoke_household_access_client(
    state: &AppState,
    auth: &AuthenticatedClient,
    access_client_id: &str,
) -> ApiResult<()> {
    let not_found = || ApiError::not_found("not_found", "Access Client not found");
    let id = Uuid::parse_str(access_client_id)
        .map_err(|_| ApiError::bad_request("invalid_id", "The Access Client ID must be a UUID"))?;

    let target = list_household_access_clients(state)
        .await?
        .into_iter()
        .find(|client| client.id == id.to_string())
        .ok_or_else(not_found)?;

    let is_self =
        auth.access_client_id == id || (auth.user_id.is_some() && auth.user_id == target.user_id);
    if !is_self {
        require_owner(state, auth).await?;
    }

    let audit = Some(revocation_audit(auth, id, &target.label));
    let deleted = delete_access_client(&state.db, id, audit)
        .await
        .map_err(ApiError::internal)?;
    state.local_sessions.drop_access_client(id);

    if deleted { Ok(()) } else { Err(not_found()) }
}

pub(crate) fn revocation_audit(
    auth: &AuthenticatedClient,
    access_client_id: Uuid,
    label: &str,
) -> AuditWrite {
    AuditWrite {
        kind: AuditKind::AccessClientRevoked,
        actor_user_id: auth.user_id.clone(),
        summary: format!("revoked access client {label}"),
        detail: serde_json::json!({
            "action": "revoke",
            "accessClientId": access_client_id,
            "label": label,
        }),
    }
}
