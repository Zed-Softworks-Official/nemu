use axum::Json;
use axum::extract::{Path, Query, State};
use axum::http::HeaderMap;
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use uuid::Uuid;

use crate::api::auth::AuthenticatedClient;
use crate::api::error::{ApiError, ApiResult};
use crate::audit::{self, AuditKind, AuditWrite};
use crate::commands::{COMMAND_ID_HEADER, CommandError, execute_set};
use crate::db::models::UpdateDevice;
use crate::events::DeviceResource;
use crate::state::AppState;

#[derive(Serialize)]
pub struct DevicesResponse {
    pub devices: Vec<DeviceResource>,
}

#[derive(Deserialize)]
pub struct ListDevicesQuery {
    pub room: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PatchDeviceBody {
    pub name: Option<String>,
    pub room_id: Option<Option<String>>,
}

#[derive(Deserialize)]
pub struct PatchOutletBody {
    pub name: String,
}

pub async fn list_devices(
    State(state): State<AppState>,
    Query(query): Query<ListDevicesQuery>,
) -> ApiResult<Json<DevicesResponse>> {
    let devices = if let Some(room) = &query.room {
        let room_id = Uuid::parse_str(room)
            .map_err(|_| ApiError::bad_request("invalid_room", "room query must be a UUID"))?;
        state.registry.list_by_room(room_id).await
    } else {
        state.registry.list().await
    };

    let mut resources = Vec::with_capacity(devices.len());
    for device in devices {
        resources.push(state.registry.to_resource(&state, &device).await);
    }
    resources.sort_by(|a, b| a.name.cmp(&b.name));

    Ok(Json(DevicesResponse { devices: resources }))
}

pub async fn get_device(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<DeviceResource>> {
    let device_id = parse_device_id(&id)?;
    let device = state
        .registry
        .get(device_id)
        .await
        .ok_or_else(|| ApiError::not_found("device_not_found", "device not found"))?;
    Ok(Json(state.registry.to_resource(&state, &device).await))
}

pub async fn patch_device(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<PatchDeviceBody>,
) -> ApiResult<Json<DeviceResource>> {
    let device_id = parse_device_id(&id)?;
    let existing = state
        .registry
        .get(device_id)
        .await
        .ok_or_else(|| ApiError::not_found("device_not_found", "device not found"))?;

    let mut update = UpdateDevice::default();
    let mut rename_to: Option<String> = None;

    if let Some(name) = body.name {
        let name = name.trim().to_string();
        if name.is_empty() {
            return Err(ApiError::bad_request(
                "invalid_name",
                "name must not be empty",
            ));
        }
        if name != existing.friendly_name {
            rename_to = Some(name.clone());
            update.friendly_name = Some(name);
        }
    }

    if let Some(room_opt) = body.room_id {
        let room_id = match room_opt {
            None => None,
            Some(s) if s.is_empty() => None,
            Some(s) => Some(
                Uuid::parse_str(&s)
                    .map_err(|_| ApiError::bad_request("invalid_room", "roomId must be a UUID"))?,
            ),
        };
        update.room_id = Some(room_id);
    }

    if update.friendly_name.is_none() && update.room_id.is_none() {
        return Ok(Json(state.registry.to_resource(&state, &existing).await));
    }

    if let Some(ref new_name) = rename_to {
        // Prefer the external id (ieee / matter node id) as the stable bridge identity.
        state
            .mqtt
            .rename_device(
                crate::mqtt::device_protocol(&existing),
                &existing.external_id,
                new_name,
            )
            .await
            .map_err(|e| ApiError::service_unavailable("mqtt_error", e))?;
    }

    let device = state
        .registry
        .update_device(&state.db, device_id, update)
        .await
        .map_err(|e| ApiError::internal(e))?;

    Ok(Json(state.registry.to_resource(&state, &device).await))
}

pub async fn delete_device(
    State(state): State<AppState>,
    auth: AuthenticatedClient,
    Path(id): Path<String>,
) -> ApiResult<axum::http::StatusCode> {
    let device_id = parse_device_id(&id)?;
    let existing = state
        .registry
        .get(device_id)
        .await
        .ok_or_else(|| ApiError::not_found("device_not_found", "device not found"))?;

    let protocol = crate::mqtt::device_protocol(&existing);
    if let Err(error) = state
        .mqtt
        .remove_device(protocol, &existing.external_id)
        .await
    {
        if !remove_already_gone(&error) {
            return Err(ApiError::service_unavailable("device_remove_failed", error));
        }
    }

    let _ = state
        .registry
        .mark_left(&state, protocol, &existing.external_id)
        .await;
    if let Err(error) = audit::record(
        &state.db,
        AuditWrite {
            kind: AuditKind::DeviceRemoval,
            actor_user_id: auth.user_id,
            summary: format!("removed device {device_id}"),
            detail: serde_json::json!({
                "deviceId": device_id,
                "protocol": protocol.as_str(),
            }),
        },
    )
    .await
    {
        tracing::warn!(%error, "failed to record device removal");
    }

    Ok(axum::http::StatusCode::NO_CONTENT)
}

pub async fn patch_outlet(
    State(state): State<AppState>,
    Path((id, outlet_id)): Path<(String, String)>,
    Json(body): Json<PatchOutletBody>,
) -> ApiResult<axum::http::StatusCode> {
    let device_id = parse_device_id(&id)?;
    let device = state
        .registry
        .get(device_id)
        .await
        .ok_or_else(|| ApiError::not_found("device_not_found", "device not found"))?;
    if crate::mqtt::device_protocol(&device) != crate::config::Protocol::Matter {
        return Err(ApiError::bad_request(
            "outlet_rename_unsupported",
            "only Matter power-strip outlets can be renamed",
        ));
    }
    let outlet_id = outlet_id.trim();
    if outlet_id.is_empty() {
        return Err(ApiError::bad_request(
            "invalid_outlet",
            "outlet id must not be empty",
        ));
    }
    let name = body.name.trim();
    if name.is_empty() {
        return Err(ApiError::bad_request(
            "invalid_name",
            "name must not be empty",
        ));
    }
    state
        .mqtt
        .rename_device(
            crate::config::Protocol::Matter,
            &format!("{}#{}", device.external_id, outlet_id),
            name,
        )
        .await
        .map_err(|e| ApiError::service_unavailable("mqtt_error", e))?;
    Ok(axum::http::StatusCode::NO_CONTENT)
}

pub async fn set_device(
    State(state): State<AppState>,
    Path(id): Path<String>,
    headers: HeaderMap,
    Json(payload): Json<JsonValue>,
) -> ApiResult<Json<StatusOk>> {
    let device_id = parse_device_id(&id)?;
    let command_id = headers
        .get(COMMAND_ID_HEADER)
        .and_then(|value| value.to_str().ok())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| Uuid::new_v4().to_string());
    execute_set(&state, &command_id, device_id, payload)
        .await
        .map_err(command_to_api)?;
    Ok(Json(StatusOk { ok: true }))
}

#[derive(Serialize)]
pub struct StatusOk {
    pub ok: bool,
}

fn parse_device_id(id: &str) -> ApiResult<Uuid> {
    Uuid::parse_str(id).map_err(|_| ApiError::bad_request("invalid_id", "device id must be a UUID"))
}

fn command_to_api(err: CommandError) -> ApiError {
    match err {
        CommandError::DeviceNotFound => ApiError::not_found(err.code(), err.to_string()),
        CommandError::Unavailable | CommandError::Unconfirmed | CommandError::Failed(_) => {
            ApiError::conflict(err.code(), err.to_string())
        }
        CommandError::Mqtt(msg) => ApiError::service_unavailable("mqtt_error", msg),
        CommandError::InvalidId => ApiError::bad_request(err.code(), err.to_string()),
        CommandError::Store(msg) => ApiError::internal(msg),
    }
}

fn remove_already_gone(error: &str) -> bool {
    let lower = error.to_ascii_lowercase();
    lower.contains("not found")
        || lower.contains("already removed")
        || lower.contains("already gone")
        || lower.contains("no such device")
        || lower.contains("does not exist")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn already_gone_matches_completed_removal_only() {
        assert!(remove_already_gone("Device not found"));
        assert!(remove_already_gone("already removed"));
        assert!(!remove_already_gone("removal already in progress"));
        assert!(!remove_already_gone("the device is already joining"));
    }
}
