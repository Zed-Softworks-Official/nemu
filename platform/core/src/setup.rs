//! Device and Room setup operations.
//!
//! Each operation is one function that the LAN HTTP handler and the Relay
//! handler both call, so authorization cannot differ between the two paths
//! (ADR-0023). Owners and Members may perform every operation here (ADR-0006).

use axum::http::StatusCode;

use uuid::Uuid;

use crate::api::error::ApiError;

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
            Self::Forbidden => "membership_inactive",
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
        assert_eq!(forbidden.code, "membership_inactive");
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
