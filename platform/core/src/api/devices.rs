use axum::Json;
use axum::extract::{Path, Query, State};
use axum::http::HeaderMap;
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use uuid::Uuid;

use crate::api::auth::AuthenticatedClient;
use crate::api::error::{ApiError, ApiResult};
use crate::commands::{COMMAND_ID_HEADER, CommandError, execute_set, require_command_id};
use crate::events::DeviceResource;
use crate::setup::{self, RoomAssignment};
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
    /// Absent leaves the Room alone; `null` clears it.
    #[serde(default, deserialize_with = "present")]
    pub room_id: Option<Option<String>>,
}

fn present<'de, D>(deserializer: D) -> Result<Option<Option<String>>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    Option::<String>::deserialize(deserializer).map(Some)
}

/// A field that must be present but may be `null`.
///
/// Serde treats a missing `Option` field as `None`; with `deserialize_with`
/// and no `default`, a missing field is an error instead.
pub(crate) fn required_nullable<'de, D>(deserializer: D) -> Result<Option<String>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    Option::<String>::deserialize(deserializer)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ComponentRoomBody {
    /// Required; `null` clears the Component's Room.
    #[serde(deserialize_with = "required_nullable")]
    pub room_id: Option<String>,
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
    auth: AuthenticatedClient,
    Path(id): Path<String>,
    Json(body): Json<PatchDeviceBody>,
) -> ApiResult<Json<DeviceResource>> {
    let mut resource = None;
    if let Some(name) = body.name {
        resource = Some(setup::rename_device(&state, &auth, &id, &name).await?);
    }
    if let Some(room_id) = body.room_id {
        let assignment = RoomAssignment {
            device_id: id.clone(),
            component_id: None,
            room_id,
        };
        resource = Some(setup::assign_room(&state, &auth, assignment).await?);
    }
    match resource {
        Some(resource) => Ok(Json(resource)),
        None => get_device(State(state), Path(id)).await,
    }
}

/// Assign one Component to a Room, or clear it with `roomId: null`.
pub async fn put_component_room(
    State(state): State<AppState>,
    auth: AuthenticatedClient,
    Path((id, component_id)): Path<(String, String)>,
    Json(body): Json<ComponentRoomBody>,
) -> ApiResult<Json<DeviceResource>> {
    let assignment = RoomAssignment {
        device_id: id,
        component_id: Some(component_id),
        room_id: body.room_id,
    };
    Ok(Json(setup::assign_room(&state, &auth, assignment).await?))
}

pub async fn delete_device(
    State(state): State<AppState>,
    auth: AuthenticatedClient,
    Path(id): Path<String>,
) -> ApiResult<axum::http::StatusCode> {
    setup::remove_device(&state, &auth, &id).await?;
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
    let command_id = require_command_id(
        headers
            .get(COMMAND_ID_HEADER)
            .and_then(|value| value.to_str().ok()),
    )
    .map_err(command_to_api)?;
    let outcome = execute_set(&state, &command_id, device_id, payload)
        .await
        .map_err(command_to_api)?;
    Ok(Json(StatusOk {
        ok: true,
        outcome: outcome.as_str().to_string(),
    }))
}

#[derive(Serialize)]
pub struct StatusOk {
    pub ok: bool,
    pub outcome: String,
}

fn parse_device_id(id: &str) -> ApiResult<Uuid> {
    Uuid::parse_str(id).map_err(|_| ApiError::bad_request("invalid_id", "device id must be a UUID"))
}

fn command_to_api(err: CommandError) -> ApiError {
    match err {
        CommandError::DeviceNotFound => ApiError::not_found(err.code(), err.to_string()),
        CommandError::Unavailable
        | CommandError::Unconfirmed
        | CommandError::Failed(_)
        | CommandError::Maintenance => ApiError::conflict(err.code(), err.to_string()),
        CommandError::Mqtt(msg) => ApiError::service_unavailable("mqtt_error", msg),
        CommandError::InvalidId => ApiError::bad_request(err.code(), err.to_string()),
        CommandError::Store(msg) => ApiError::internal(msg),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn null_room_clears_the_assignment_and_absence_leaves_it() {
        let cleared: PatchDeviceBody = serde_json::from_str(r#"{"roomId":null}"#).unwrap();
        assert_eq!(cleared.room_id, Some(None));
        let untouched: PatchDeviceBody = serde_json::from_str(r#"{"name":"Lamp"}"#).unwrap();
        assert_eq!(untouched.room_id, None);
        let assigned: PatchDeviceBody = serde_json::from_str(r#"{"roomId":"r"}"#).unwrap();
        assert_eq!(assigned.room_id, Some(Some("r".into())));
    }

    #[test]
    fn component_room_must_be_present_but_may_be_null() {
        let cleared: ComponentRoomBody = serde_json::from_str(r#"{"roomId":null}"#).unwrap();
        assert_eq!(cleared.room_id, None);
        let assigned: ComponentRoomBody = serde_json::from_str(r#"{"roomId":"r"}"#).unwrap();
        assert_eq!(assigned.room_id.as_deref(), Some("r"));
        assert!(serde_json::from_str::<ComponentRoomBody>("{}").is_err());
    }
}
