use axum::Json;
use axum::extract::State;
use serde::Serialize;

use crate::api::auth::AuthenticatedClient;
use crate::api::error::{ApiError, ApiResult};
use crate::api::members::require_owner;
use crate::audit::{self, AuditKind, AuditWrite};
use crate::state::AppState;
use crate::watchtower::unavailable_message;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateStatusResponse {
    pub current_version: String,
    pub update_available: bool,
    pub images: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplyUpdateResponse {
    pub started: bool,
}

pub async fn status(
    State(state): State<AppState>,
    auth: AuthenticatedClient,
) -> ApiResult<Json<UpdateStatusResponse>> {
    require_owner(&state, &auth).await?;
    let client = state.watchtower.as_ref().ok_or_else(|| {
        ApiError::service_unavailable("watchtower_unavailable", unavailable_message())
    })?;

    let update_available = client.check().await.map_err(|error| {
        tracing::warn!(error = %error, "watchtower check failed");
        let message = if error.contains("release bundle") {
            error
        } else {
            unavailable_message().to_string()
        };
        ApiError::service_unavailable("watchtower_unavailable", message)
    })?;

    Ok(Json(UpdateStatusResponse {
        current_version: env!("CARGO_PKG_VERSION").to_string(),
        update_available,
        images: client.images.clone(),
    }))
}

pub async fn apply(
    State(state): State<AppState>,
    auth: AuthenticatedClient,
) -> ApiResult<Json<ApplyUpdateResponse>> {
    require_owner(&state, &auth).await?;
    let client = state.watchtower.as_ref().ok_or_else(|| {
        ApiError::service_unavailable("watchtower_unavailable", unavailable_message())
    })?;

    client.apply().await.map_err(|error| {
        tracing::warn!(error = %error, "watchtower apply failed");
        ApiError::service_unavailable("watchtower_unavailable", unavailable_message())
    })?;
    if let Err(error) = audit::record(
        &state.db,
        AuditWrite {
            kind: AuditKind::Update,
            actor_user_id: auth.user_id,
            summary: format!("started update from {}", env!("CARGO_PKG_VERSION")),
            detail: serde_json::json!({
                "action": "apply",
                "version": env!("CARGO_PKG_VERSION"),
            }),
        },
    )
    .await
    {
        tracing::warn!(%error, "failed to record update audit");
    }

    Ok(Json(ApplyUpdateResponse { started: true }))
}
