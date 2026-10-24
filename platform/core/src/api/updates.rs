use axum::Json;
use axum::extract::State;
use serde::Serialize;

use crate::api::auth::AuthenticatedClient;
use crate::api::error::{ApiError, ApiResult};
use crate::api::members::require_owner;
use crate::audit::{self, AuditKind, AuditWrite};
use crate::state::AppState;
use crate::updater_control::{self, ForwardError, ReleaseStatus};
use crate::watchtower::unavailable_message;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplyUpdateResponse {
    pub started: bool,
}

pub async fn read_release_status(
    state: &AppState,
    auth: &AuthenticatedClient,
) -> ApiResult<ReleaseStatus> {
    let member = require_owner(state, auth).await?;
    updater_control::forward_release_status(&member.role, &member.status, state.updater.as_ref())
        .map_err(|error| match error {
            ForwardError::Refused => {
                ApiError::forbidden("owner_required", "Only the home owner can do that")
            }
            ForwardError::Unavailable(message) => {
                ApiError::service_unavailable("updater_unavailable", message)
            }
        })
}

pub async fn status(
    State(state): State<AppState>,
    auth: AuthenticatedClient,
) -> ApiResult<Json<ReleaseStatus>> {
    Ok(Json(read_release_status(&state, &auth).await?))
}

pub async fn apply(
    State(state): State<AppState>,
    auth: AuthenticatedClient,
) -> ApiResult<Json<ApplyUpdateResponse>> {
    require_owner(&state, &auth).await?;
    let client = state.watchtower.as_ref().ok_or_else(|| {
        ApiError::service_unavailable("watchtower_unavailable", unavailable_message())
    })?;

    audit::record(
        &state.db,
        AuditWrite {
            kind: AuditKind::Update,
            actor_user_id: auth.user_id.clone(),
            summary: format!("started update from {}", env!("CARGO_PKG_VERSION")),
            detail: serde_json::json!({
                "action": "apply",
                "version": env!("CARGO_PKG_VERSION"),
            }),
        },
    )
    .await
    .map_err(ApiError::internal)?;
    client.apply().await.map_err(|error| {
        tracing::warn!(error = %error, "watchtower apply failed");
        ApiError::service_unavailable("watchtower_unavailable", unavailable_message())
    })?;

    Ok(Json(ApplyUpdateResponse { started: true }))
}
