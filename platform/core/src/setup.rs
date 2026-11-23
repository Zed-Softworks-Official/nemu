//! Device and Room setup operations.
//!
//! Each operation is one function that the LAN HTTP handler and the Relay
//! handler both call, so authorization cannot differ between the two paths
//! (ADR-0023). Owners and Members may perform every operation here (ADR-0006).

use axum::http::StatusCode;
use diesel::pg::PgConnection;
use diesel::prelude::*;
use uuid::Uuid;

use crate::api::auth::AuthenticatedClient;
use crate::api::error::ApiError;
use crate::audit::{self, AuditKind, AuditWrite};
use crate::db::models::{NewRoom, Room, UpdateDevice, UpdateRoom};
use crate::db::schema::rooms;
use crate::devices::setup_store::{self, RoomDeletion};
use crate::events::{DeviceResource, RoomResource};
use crate::pairing::members::find_member_by_user_id;
use crate::state::AppState;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SetupError {
    Unauthenticated,
    Forbidden,
    InvalidName,
    InvalidId,
    InvalidRoom,
    InvalidComponent,
    EmptyPatch,
    DeviceNotFound,
    RoomNotFound,
    RoomNotEmpty,
    AdapterUnavailable(String),
    RemoveFailed(String),
    Internal(String),
}

impl SetupError {
    pub fn code(&self) -> &'static str {
        match self {
            Self::Unauthenticated => "unauthorized",
            Self::Forbidden => "inactive_membership",
            Self::InvalidName => "invalid_name",
            Self::InvalidId => "invalid_id",
            Self::InvalidRoom => "invalid_room",
            Self::InvalidComponent => "invalid_component",
            Self::EmptyPatch => "empty_patch",
            Self::DeviceNotFound => "device_not_found",
            Self::RoomNotFound => "room_not_found",
            Self::RoomNotEmpty => "room_not_empty",
            Self::AdapterUnavailable(_) => "mqtt_error",
            Self::RemoveFailed(_) => "device_remove_failed",
            Self::Internal(_) => "internal_error",
        }
    }

    pub fn message(&self) -> String {
        match self {
            Self::Unauthenticated => "Pair this Access Client with a Membership first".into(),
            Self::Forbidden => "This Membership is not active".into(),
            Self::InvalidName => format!("Names must be 1 to {MAX_NAME_CHARS} characters"),
            Self::InvalidId => "Device and Room IDs must be UUIDs".into(),
            Self::InvalidRoom => "roomId must be a Room UUID or null".into(),
            Self::InvalidComponent => {
                format!("componentId must be 1 to {MAX_NAME_CHARS} characters")
            }
            Self::EmptyPatch => "Provide name and/or sortOrder".into(),
            Self::DeviceNotFound => "Device not found".into(),
            Self::RoomNotFound => "Room not found".into(),
            Self::RoomNotEmpty => {
                "Move this Room's Devices and Components to another Room first".into()
            }
            Self::AdapterUnavailable(message)
            | Self::RemoveFailed(message)
            | Self::Internal(message) => message.clone(),
        }
    }

    fn status(&self) -> StatusCode {
        match self {
            Self::Unauthenticated => StatusCode::UNAUTHORIZED,
            Self::Forbidden => StatusCode::FORBIDDEN,
            Self::InvalidName
            | Self::InvalidId
            | Self::InvalidRoom
            | Self::InvalidComponent
            | Self::EmptyPatch => StatusCode::BAD_REQUEST,
            Self::DeviceNotFound | Self::RoomNotFound => StatusCode::NOT_FOUND,
            Self::RoomNotEmpty => StatusCode::CONFLICT,
            Self::AdapterUnavailable(_) | Self::RemoveFailed(_) => StatusCode::SERVICE_UNAVAILABLE,
            Self::Internal(_) => StatusCode::INTERNAL_SERVER_ERROR,
        }
    }
}

impl From<SetupError> for ApiError {
    fn from(error: SetupError) -> Self {
        ApiError::new(error.status(), error.code(), error.message())
    }
}

/// Device, Room, and Component names share the 255-character column limit.
const MAX_NAME_CHARS: usize = 255;

pub fn parse_name(raw: &str) -> Result<String, SetupError> {
    let name = raw.trim();
    if name.is_empty() || name.chars().count() > MAX_NAME_CHARS {
        return Err(SetupError::InvalidName);
    }
    Ok(name.to_string())
}

pub fn parse_id(raw: &str) -> Result<Uuid, SetupError> {
    Uuid::parse_str(raw.trim()).map_err(|_| SetupError::InvalidId)
}

/// `None` or an empty string means "no Room".
pub fn parse_room_target(raw: Option<&str>) -> Result<Option<Uuid>, SetupError> {
    match raw.map(str::trim) {
        None | Some("") => Ok(None),
        Some(id) => Uuid::parse_str(id)
            .map(Some)
            .map_err(|_| SetupError::InvalidRoom),
    }
}

pub fn parse_component_id(raw: &str) -> Result<String, SetupError> {
    let id = raw.trim();
    if id.is_empty() || id.chars().count() > MAX_NAME_CHARS {
        return Err(SetupError::InvalidComponent);
    }
    Ok(id.to_string())
}

/// Active Owners and Members may set up Devices and Rooms.
pub fn authorize_setup(role: &str, status: &str) -> Result<(), SetupError> {
    match role {
        "" => Err(SetupError::Unauthenticated),
        "owner" | "member" if status == "active" => Ok(()),
        _ => Err(SetupError::Forbidden),
    }
}

/// One Device or Component Room assignment. `component_id` targets a
/// Component; `room_id: None` clears the assignment.
#[derive(Debug, Clone)]
pub struct RoomAssignment {
    pub device_id: String,
    pub component_id: Option<String>,
    pub room_id: Option<String>,
}

/// Rename a Device. The adapter learns the new name before Core stores it.
pub async fn rename_device(
    state: &AppState,
    auth: &AuthenticatedClient,
    device_id: &str,
    name: &str,
) -> Result<DeviceResource, SetupError> {
    authorize_caller(state, auth).await?;
    let device_id = parse_id(device_id)?;
    let name = parse_name(name)?;
    let existing = state
        .registry
        .get(device_id)
        .await
        .ok_or(SetupError::DeviceNotFound)?;
    if name == existing.friendly_name {
        return Ok(state.registry.to_resource(state, &existing).await);
    }
    state
        .mqtt
        .rename_device(
            crate::mqtt::device_protocol(&existing),
            &existing.external_id,
            &name,
        )
        .await
        .map_err(SetupError::AdapterUnavailable)?;
    let device = state
        .registry
        .update_device(
            &state.db,
            device_id,
            UpdateDevice {
                friendly_name: Some(name),
                ..UpdateDevice::default()
            },
        )
        .await
        .map_err(SetupError::Internal)?;
    Ok(state.registry.to_resource(state, &device).await)
}

/// Assign a Device, or one of its Components, to a Room.
pub async fn assign_room(
    state: &AppState,
    auth: &AuthenticatedClient,
    assignment: RoomAssignment,
) -> Result<DeviceResource, SetupError> {
    authorize_caller(state, auth).await?;
    let device_id = parse_id(&assignment.device_id)?;
    let component_id = assignment
        .component_id
        .as_deref()
        .map(parse_component_id)
        .transpose()?;
    let room_id = parse_room_target(assignment.room_id.as_deref())?;
    if state.registry.get(device_id).await.is_none() {
        return Err(SetupError::DeviceNotFound);
    }
    ensure_room_exists(state, room_id).await?;
    match component_id {
        Some(component_id) => {
            state
                .registry
                .set_component_room(&state.db, device_id, component_id, room_id)
                .await
                .map_err(SetupError::Internal)?;
        }
        None => {
            state
                .registry
                .update_device(
                    &state.db,
                    device_id,
                    UpdateDevice {
                        room_id: Some(room_id),
                        ..UpdateDevice::default()
                    },
                )
                .await
                .map_err(SetupError::Internal)?;
        }
    }
    let device = state
        .registry
        .get(device_id)
        .await
        .ok_or(SetupError::DeviceNotFound)?;
    Ok(state.registry.to_resource(state, &device).await)
}

/// Check a Room target without changing anything: the caller may set up
/// Devices, and the Room is `None` or exists. A rename that is paired with a
/// Room assignment calls this first, so a bad `roomId` changes nothing.
pub async fn check_room_target(
    state: &AppState,
    auth: &AuthenticatedClient,
    room_id: Option<&str>,
) -> Result<(), SetupError> {
    authorize_caller(state, auth).await?;
    ensure_room_exists(state, parse_room_target(room_id)?).await
}

async fn ensure_room_exists(state: &AppState, room_id: Option<Uuid>) -> Result<(), SetupError> {
    if let Some(room_id) = room_id
        && !with_conn(state, move |conn| setup_store::room_exists(conn, room_id)).await?
    {
        return Err(SetupError::RoomNotFound);
    }
    Ok(())
}

/// Remove a Device from its adapter and keep a Device tombstone (ADR-0017).
pub async fn remove_device(
    state: &AppState,
    auth: &AuthenticatedClient,
    device_id: &str,
) -> Result<(), SetupError> {
    authorize_caller(state, auth).await?;
    let device_id = parse_id(device_id)?;
    let existing = state
        .registry
        .get(device_id)
        .await
        .ok_or(SetupError::DeviceNotFound)?;
    let protocol = crate::mqtt::device_protocol(&existing);
    audit::record(
        &state.db,
        AuditWrite {
            kind: AuditKind::DeviceRemoval,
            actor_user_id: auth.user_id.clone(),
            summary: format!("removed device {device_id}"),
            detail: serde_json::json!({
                "deviceId": device_id,
                "protocol": protocol.as_str(),
            }),
        },
    )
    .await
    .map_err(SetupError::Internal)?;
    if let Err(error) = state
        .mqtt
        .remove_device(protocol, &existing.external_id)
        .await
        && !remove_already_gone(&error)
    {
        return Err(SetupError::RemoveFailed(error));
    }
    state
        .registry
        .mark_left(state, protocol, &existing.external_id)
        .await;
    Ok(())
}

pub async fn create_room(
    state: &AppState,
    auth: &AuthenticatedClient,
    name: &str,
    sort_order: Option<i32>,
) -> Result<RoomResource, SetupError> {
    authorize_caller(state, auth).await?;
    let name = parse_name(name)?;
    let sort_order = sort_order.unwrap_or(0);
    let room = with_conn(state, move |conn| {
        diesel::insert_into(rooms::table)
            .values(NewRoom {
                name: &name,
                sort_order,
            })
            .returning(Room::as_returning())
            .get_result::<Room>(conn)
    })
    .await?;
    Ok(RoomResource::from(&room))
}

/// Rename a Room or change its display order.
pub async fn update_room(
    state: &AppState,
    auth: &AuthenticatedClient,
    room_id: &str,
    name: Option<&str>,
    sort_order: Option<i32>,
) -> Result<RoomResource, SetupError> {
    authorize_caller(state, auth).await?;
    let room_id = parse_id(room_id)?;
    let update = UpdateRoom {
        name: name.map(parse_name).transpose()?,
        sort_order,
    };
    if update.name.is_none() && update.sort_order.is_none() {
        return Err(SetupError::EmptyPatch);
    }
    let room = with_conn(state, move |conn| {
        diesel::update(rooms::table.filter(rooms::id.eq(room_id)))
            .set(update)
            .returning(Room::as_returning())
            .get_result::<Room>(conn)
            .optional()
    })
    .await?
    .ok_or(SetupError::RoomNotFound)?;
    Ok(RoomResource::from(&room))
}

/// Delete a Room after its Devices and Components have moved elsewhere.
pub async fn delete_room(
    state: &AppState,
    auth: &AuthenticatedClient,
    room_id: &str,
) -> Result<(), SetupError> {
    authorize_caller(state, auth).await?;
    let room_id = parse_id(room_id)?;
    match with_conn(state, move |conn| {
        setup_store::delete_room_if_empty(conn, room_id)
    })
    .await?
    {
        RoomDeletion::Deleted => Ok(()),
        RoomDeletion::NotFound => Err(SetupError::RoomNotFound),
        RoomDeletion::NotEmpty => Err(SetupError::RoomNotEmpty),
    }
}

async fn authorize_caller(state: &AppState, auth: &AuthenticatedClient) -> Result<(), SetupError> {
    let Some(user_id) = auth.user_id.as_deref() else {
        return Err(SetupError::Unauthenticated);
    };
    let member = find_member_by_user_id(&state.db, user_id)
        .await
        .map_err(SetupError::Internal)?
        .ok_or(SetupError::Unauthenticated)?;
    authorize_setup(&member.role, &member.status)
}

async fn with_conn<T, F>(state: &AppState, work: F) -> Result<T, SetupError>
where
    T: Send + 'static,
    F: FnOnce(&mut PgConnection) -> QueryResult<T> + Send + 'static,
{
    let conn = state
        .db
        .get()
        .await
        .map_err(|error| SetupError::Internal(error.to_string()))?;
    conn.interact(work)
        .await
        .map_err(|error| SetupError::Internal(error.to_string()))?
        .map_err(|error| SetupError::Internal(error.to_string()))
}

/// The adapter already finished removing this Device.
pub fn remove_already_gone(error: &str) -> bool {
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
    fn active_owners_and_members_may_set_up_devices_and_rooms() {
        assert_eq!(authorize_setup("owner", "active"), Ok(()));
        assert_eq!(authorize_setup("member", "active"), Ok(()));
    }

    #[test]
    fn inactive_memberships_are_forbidden() {
        for status in ["pending", "removed", "left", ""] {
            assert_eq!(
                authorize_setup("member", status),
                Err(SetupError::Forbidden),
                "member with status {status:?}"
            );
            assert_eq!(
                authorize_setup("owner", status),
                Err(SetupError::Forbidden),
                "owner with status {status:?}"
            );
        }
    }

    #[test]
    fn callers_without_a_membership_are_unauthenticated() {
        assert_eq!(
            authorize_setup("", "active"),
            Err(SetupError::Unauthenticated)
        );
        assert_eq!(authorize_setup("", ""), Err(SetupError::Unauthenticated));
    }

    #[test]
    fn unknown_roles_are_forbidden() {
        assert_eq!(
            authorize_setup("guest", "active"),
            Err(SetupError::Forbidden)
        );
    }

    #[test]
    fn rejections_map_to_stable_codes_and_statuses() {
        let unauthenticated = ApiError::from(SetupError::Unauthenticated);
        assert_eq!(unauthenticated.status, StatusCode::UNAUTHORIZED);
        assert_eq!(unauthenticated.code, "unauthorized");
        let forbidden = ApiError::from(SetupError::Forbidden);
        assert_eq!(forbidden.status, StatusCode::FORBIDDEN);
        assert_eq!(forbidden.code, "inactive_membership");
    }

    #[test]
    fn already_gone_matches_completed_removal_only() {
        assert!(remove_already_gone("Device not found"));
        assert!(remove_already_gone("already removed"));
        assert!(!remove_already_gone("removal already in progress"));
        assert!(!remove_already_gone("the device is already joining"));
    }

    #[test]
    fn names_are_trimmed_and_must_fit_the_column() {
        assert_eq!(parse_name("  Kitchen  "), Ok("Kitchen".to_string()));
        assert_eq!(parse_name("   "), Err(SetupError::InvalidName));
        assert_eq!(parse_name(&"x".repeat(256)), Err(SetupError::InvalidName));
        assert_eq!(parse_name(&"é".repeat(255)), Ok("é".repeat(255)));
    }

    #[test]
    fn room_targets_accept_a_room_id_or_no_room() {
        let id = uuid::Uuid::new_v4();
        assert_eq!(parse_room_target(None), Ok(None));
        assert_eq!(parse_room_target(Some("")), Ok(None));
        assert_eq!(parse_room_target(Some(&id.to_string())), Ok(Some(id)));
        assert_eq!(
            parse_room_target(Some("kitchen")),
            Err(SetupError::InvalidRoom)
        );
    }

    #[test]
    fn component_ids_are_trimmed_and_bounded() {
        assert_eq!(parse_component_id(" outlet-1 "), Ok("outlet-1".to_string()));
        assert_eq!(parse_component_id(" "), Err(SetupError::InvalidComponent));
        assert_eq!(
            parse_component_id(&"c".repeat(256)),
            Err(SetupError::InvalidComponent)
        );
    }

    #[test]
    fn setup_failures_keep_their_wire_codes() {
        for (error, status, code) in [
            (
                SetupError::InvalidName,
                StatusCode::BAD_REQUEST,
                "invalid_name",
            ),
            (SetupError::InvalidId, StatusCode::BAD_REQUEST, "invalid_id"),
            (
                SetupError::InvalidRoom,
                StatusCode::BAD_REQUEST,
                "invalid_room",
            ),
            (
                SetupError::InvalidComponent,
                StatusCode::BAD_REQUEST,
                "invalid_component",
            ),
            (
                SetupError::EmptyPatch,
                StatusCode::BAD_REQUEST,
                "empty_patch",
            ),
            (
                SetupError::DeviceNotFound,
                StatusCode::NOT_FOUND,
                "device_not_found",
            ),
            (
                SetupError::RoomNotFound,
                StatusCode::NOT_FOUND,
                "room_not_found",
            ),
            (
                SetupError::RoomNotEmpty,
                StatusCode::CONFLICT,
                "room_not_empty",
            ),
            (
                SetupError::AdapterUnavailable("down".into()),
                StatusCode::SERVICE_UNAVAILABLE,
                "mqtt_error",
            ),
            (
                SetupError::RemoveFailed("busy".into()),
                StatusCode::SERVICE_UNAVAILABLE,
                "device_remove_failed",
            ),
            (
                SetupError::Internal("boom".into()),
                StatusCode::INTERNAL_SERVER_ERROR,
                "internal_error",
            ),
        ] {
            let api = ApiError::from(error);
            assert_eq!((api.status, api.code.as_str()), (status, code));
        }
    }
}
