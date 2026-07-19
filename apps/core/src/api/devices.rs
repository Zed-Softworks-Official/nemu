use axum::Json;
use axum::extract::{Path, Query, State};
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use uuid::Uuid;

use crate::api::error::{ApiError, ApiResult};
use crate::commands::{CommandError, execute_set};
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
        // Prefer ieee as the stable z2m identity for rename.
        state
            .mqtt
            .rename_device(&existing.ieee_address, new_name)
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
    Path(id): Path<String>,
) -> ApiResult<axum::http::StatusCode> {
    let device_id = parse_device_id(&id)?;
    let existing = state
        .registry
        .get(device_id)
        .await
        .ok_or_else(|| ApiError::not_found("device_not_found", "device not found"))?;

    state
        .mqtt
        .remove_device(&existing.ieee_address)
        .await
        .map_err(|error| ApiError::service_unavailable("device_remove_failed", error))?;

    let _ = state
        .registry
        .mark_left(&state, &existing.ieee_address)
        .await;

    Ok(axum::http::StatusCode::NO_CONTENT)
}

pub async fn set_device(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(payload): Json<JsonValue>,
) -> ApiResult<Json<StatusOk>> {
    let device_id = parse_device_id(&id)?;
    execute_set(&state, device_id, payload)
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
        CommandError::Mqtt(msg) => ApiError::service_unavailable("mqtt_error", msg),
    }
}
