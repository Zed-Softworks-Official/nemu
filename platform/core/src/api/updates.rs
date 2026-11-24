use axum::Json;
use axum::body::Bytes;
use axum::extract::State;
use serde::{Deserialize, Serialize};

use crate::api::auth::AuthenticatedClient;
use crate::api::error::{ApiError, ApiResult};
use crate::api::members::{require_active_member, require_owner};
use crate::audit;
use crate::pairing::members::MembershipRefusal;
use crate::state::AppState;
use crate::updater_control::{self, ForwardError, ReleaseStatus};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplyUpdateResponse {
    pub started: bool,
}

/// Reads Release status for any active Owner or Member.
/// Home network and Relay both use this.
pub async fn read_release_status(
    state: &AppState,
    auth: &AuthenticatedClient,
) -> ApiResult<ReleaseStatus> {
    let member = require_active_member(state, auth).await?;
    updater_control::forward_release_status(&member.role, &member.status, state.updater.as_ref())
        .map_err(|error| match error {
            ForwardError::Refused => MembershipRefusal::Inactive.into(),
            other => forward_error(other),
        })
}

pub async fn status(
    State(state): State<AppState>,
    auth: AuthenticatedClient,
) -> ApiResult<Json<ReleaseStatus>> {
    Ok(Json(read_release_status(&state, &auth).await?))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ApplyUpdateRequest {
    /// The Release the Owner confirmed.
    #[serde(default)]
    platform_version: Option<String>,
}

fn parse_confirmed_release(body: &[u8]) -> ApiResult<Option<String>> {
    if body.is_empty() {
        return Ok(None);
    }
    serde_json::from_slice::<ApplyUpdateRequest>(body)
        .map(|request| request.platform_version)
        .map_err(|_| ApiError::bad_request("invalid_request", "The install request is not valid"))
}

pub async fn apply(
    State(state): State<AppState>,
    auth: AuthenticatedClient,
    // Clients that predate confirming a Release send no body.
    body: Bytes,
) -> ApiResult<Json<ApplyUpdateResponse>> {
    let confirmed = parse_confirmed_release(&body)?;
    Ok(Json(
        install_release(&state, &auth, confirmed.as_deref()).await?,
    ))
}

/// Forwards an Owner install to the Updater and records it in the Audit log.
/// Home network and Relay both use this. A Member is refused. With
/// `confirmed`, nothing starts unless the channel still serves that Release.
pub async fn install_release(
    state: &AppState,
    auth: &AuthenticatedClient,
    confirmed: Option<&str>,
) -> ApiResult<ApplyUpdateResponse> {
    let member = require_owner(state, auth).await?;
    updater_control::check_confirmed_release(
        &member.role,
        &member.status,
        confirmed,
        state.updater.as_ref(),
    )
    .map_err(forward_error)?;
    audit::record(
        &state.db,
        updater_control::install_audit(auth.user_id.clone(), confirmed),
    )
    .await
    .map_err(ApiError::internal)?;
    updater_control::forward_install(
        &member.role,
        &member.status,
        confirmed,
        state.updater.as_ref(),
    )
    .map_err(forward_error)?;
    Ok(ApplyUpdateResponse { started: true })
}

/// Forwards an Owner rollback to the Updater and records it in the Audit log.
/// Home network and Relay both use this. A Member is refused. There is no
/// second confirmation step.
pub async fn rollback_release(
    state: &AppState,
    auth: &AuthenticatedClient,
) -> ApiResult<ApplyUpdateResponse> {
    let member = require_owner(state, auth).await?;
    audit::record(
        &state.db,
        updater_control::rollback_audit(auth.user_id.clone()),
    )
    .await
    .map_err(ApiError::internal)?;
    updater_control::forward_rollback(&member.role, &member.status, state.updater.as_ref())
        .map_err(forward_error)?;
    Ok(ApplyUpdateResponse { started: true })
}

pub async fn rollback(
    State(state): State<AppState>,
    auth: AuthenticatedClient,
) -> ApiResult<Json<ApplyUpdateResponse>> {
    Ok(Json(rollback_release(&state, &auth).await?))
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
        ForwardError::ReleaseChanged => ApiError::conflict(
            "release_changed",
            "A different Release is available now. Check it before installing.",
        ),
        ForwardError::Unavailable(message) => {
            ApiError::service_unavailable("updater_unavailable", message)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_install_request_may_name_the_confirmed_release() {
        assert_eq!(parse_confirmed_release(b"").unwrap(), None);
        assert_eq!(parse_confirmed_release(b"{}").unwrap(), None);
        assert_eq!(
            parse_confirmed_release(br#"{"platformVersion":"0.4.10"}"#).unwrap(),
            Some("0.4.10".to_string())
        );
        // An unreadable confirmation must not install whatever is newest.
        assert!(parse_confirmed_release(br#"{"platformVersion":4}"#).is_err());
    }

    #[test]
    fn a_changed_release_is_a_conflict() {
        let error = forward_error(ForwardError::ReleaseChanged);
        assert_eq!(error.status, axum::http::StatusCode::CONFLICT);
        assert_eq!(error.code, "release_changed");
    }
}
