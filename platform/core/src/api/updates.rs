use axum::Json;
use axum::extract::State;
use serde::{Deserialize, Serialize};

use crate::api::auth::AuthenticatedClient;
use crate::api::error::{ApiError, ApiResult};
use crate::api::members::require_owner;
use crate::audit;
use crate::state::AppState;
use crate::updater_control::{self, ForwardError, ReleaseStatus};

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
    Ok(Json(install_release(&state, &auth).await?))
}

/// Forwards an Owner install to the Updater and records it in the Audit log.
/// Home network and Relay both use this. A Member is refused.
pub async fn install_release(
    state: &AppState,
    auth: &AuthenticatedClient,
) -> ApiResult<ApplyUpdateResponse> {
    let member = require_owner(state, auth).await?;
    audit::record(
        &state.db,
        updater_control::install_audit(auth.user_id.clone()),
    )
    .await
    .map_err(ApiError::internal)?;
    updater_control::forward_install(&member.role, &member.status, state.updater.as_ref())
        .map_err(forward_error)?;
    Ok(ApplyUpdateResponse { started: true })
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SwitchChannelRequest {
    channel: String,
}

pub async fn switch_channel(
    State(state): State<AppState>,
    auth: AuthenticatedClient,
    Json(body): Json<SwitchChannelRequest>,
) -> ApiResult<Json<updater_control::SwitchChannelOutcome>> {
    Ok(Json(
        switch_release_channel(&state, &auth, &body.channel).await?,
    ))
}

/// Forwards an Owner channel change to the Updater and records it in the Audit log.
/// Home network and Relay both use this. A Member is refused.
pub async fn switch_release_channel(
    state: &AppState,
    auth: &AuthenticatedClient,
    channel: &str,
) -> ApiResult<updater_control::SwitchChannelOutcome> {
    let member = require_owner(state, auth).await?;
    if channel != "stable" && channel != "canary" {
        return Err(ApiError::bad_request(
            "unknown_channel",
            "Release channel must be stable or canary",
        ));
    }
    audit::record(
        &state.db,
        updater_control::switch_channel_audit(auth.user_id.clone(), channel),
    )
    .await
    .map_err(ApiError::internal)?;
    updater_control::forward_switch_channel(
        &member.role,
        &member.status,
        channel,
        state.updater.as_ref(),
    )
    .map_err(forward_error)
}

fn forward_error(error: ForwardError) -> ApiError {
    match error {
        ForwardError::Refused => {
            ApiError::forbidden("owner_required", "Only the home owner can do that")
        }
        ForwardError::Unavailable(message) => {
            ApiError::service_unavailable("updater_unavailable", message)
        }
    }
}
