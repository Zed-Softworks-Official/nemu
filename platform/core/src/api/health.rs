use axum::Json;
use axum::extract::State;
use serde::Serialize;

use crate::api::auth::AuthenticatedClient;
use crate::api::error::{ApiError, ApiResult};
use crate::pairing::members::find_member_by_user_id;
use crate::state::AppState;

/// The public LAN probe. Discovery reads `status`, so it stays unauthenticated
/// and unchanged; the role-aware summary is [`read_health_summary`].
#[derive(Serialize)]
pub struct HealthResponse {
    pub status: String,
    pub mqtt: bool,
    pub zigbee: bool,
    pub matter: bool,
    pub db: bool,
}

pub async fn health_check(State(state): State<AppState>) -> Json<HealthResponse> {
    let db_ok = check_db(&state).await;
    let mqtt = state.health.mqtt();
    let zigbee = state.health.zigbee();
    let matter = state.health.matter();

    Json(HealthResponse {
        status: overall_status(db_ok, mqtt).to_string(),
        mqtt,
        zigbee,
        matter,
        db: db_ok,
    })
}

fn overall_status(db: bool, mqtt: bool) -> &'static str {
    if db && mqtt {
        "ok"
    } else if db {
        "degraded"
    } else {
        "error"
    }
}

async fn check_db(state: &AppState) -> bool {
    let Ok(conn) = state.db.get().await else {
        return false;
    };
    conn.interact(|conn| {
        use diesel::prelude::*;
        diesel::sql_query("SELECT 1").execute(conn)
    })
    .await
    .ok()
    .and_then(|r| r.ok())
    .is_some()
}

// ---------------------------------------------------------------------------
// Role-aware Controller health summary (NEM-88). LAN and Relay both call
// `read_health_summary`, so the two transports return the same shape.
// ---------------------------------------------------------------------------

/// Which summary a caller may see (ADR-0006).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum HealthView {
    /// Service and Device availability plus Controller details.
    Owner,
    /// Service and Device availability only.
    Member,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum HealthSummaryError {
    Unauthenticated,
    Forbidden,
    Internal(String),
}

impl From<HealthSummaryError> for ApiError {
    fn from(error: HealthSummaryError) -> Self {
        match error {
            HealthSummaryError::Unauthenticated => ApiError::new(
                axum::http::StatusCode::UNAUTHORIZED,
                "unauthorized",
                "Pair this Access Client with a Membership first",
            ),
            HealthSummaryError::Forbidden => {
                ApiError::forbidden("inactive_membership", "This Membership is not active")
            }
            HealthSummaryError::Internal(message) => ApiError::internal(message),
        }
    }
}

/// Active Owners get the Owner view and active Members the Member view.
/// Callers without a Membership are unauthenticated; inactive Memberships
/// and unknown roles are forbidden.
pub fn authorize_health_summary(
    role: &str,
    status: &str,
) -> Result<HealthView, HealthSummaryError> {
    match (role, status) {
        ("", _) => Err(HealthSummaryError::Unauthenticated),
        ("owner", "active") => Ok(HealthView::Owner),
        ("member", "active") => Ok(HealthView::Member),
        _ => Err(HealthSummaryError::Forbidden),
    }
}

/// Everything the Controller knows about its own health at one moment.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct HealthReadings {
    pub mqtt: bool,
    pub zigbee: bool,
    pub matter: bool,
    pub database: bool,
    pub relay_connected: bool,
    pub devices_online: usize,
    pub devices_total: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthSummary {
    pub view: HealthView,
    pub status: &'static str,
    pub services: ServiceAvailability,
    pub devices: DeviceAvailability,
    /// Owner view only.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub controller: Option<ControllerDetails>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct ServiceAvailability {
    pub mqtt: bool,
    pub zigbee: bool,
    pub matter: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct DeviceAvailability {
    pub online: usize,
    pub total: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ControllerDetails {
    pub database: bool,
    pub relay_connected: bool,
}

/// Shapes the readings for one view. A Member never sees database or Relay
/// details.
pub fn summarize(view: HealthView, readings: HealthReadings) -> HealthSummary {
    HealthSummary {
        view,
        status: overall_status(readings.database, readings.mqtt),
        services: ServiceAvailability {
            mqtt: readings.mqtt,
            zigbee: readings.zigbee,
            matter: readings.matter,
        },
        devices: DeviceAvailability {
            online: readings.devices_online,
            total: readings.devices_total,
        },
        controller: (view == HealthView::Owner).then_some(ControllerDetails {
            database: readings.database,
            relay_connected: readings.relay_connected,
        }),
    }
}

/// The Controller health summary for the caller's Membership.
pub async fn read_health_summary(
    state: &AppState,
    auth: &AuthenticatedClient,
) -> Result<HealthSummary, HealthSummaryError> {
    let Some(user_id) = auth.user_id.as_deref() else {
        return Err(HealthSummaryError::Unauthenticated);
    };
    let member = find_member_by_user_id(&state.db, user_id)
        .await
        .map_err(HealthSummaryError::Internal)?
        .ok_or(HealthSummaryError::Unauthenticated)?;
    let view = authorize_health_summary(&member.role, &member.status)?;
    Ok(summarize(view, collect_readings(state).await))
}

async fn collect_readings(state: &AppState) -> HealthReadings {
    let devices = state.registry.list().await;
    let mut devices_online = 0;
    for device in &devices {
        if state.registry.to_resource(state, device).await.online {
            devices_online += 1;
        }
    }
    HealthReadings {
        mqtt: state.health.mqtt(),
        zigbee: state.health.zigbee(),
        matter: state.health.matter(),
        database: check_db(state).await,
        relay_connected: state.health.relay(),
        devices_online,
        devices_total: devices.len(),
    }
}

pub async fn health_summary(
    State(state): State<AppState>,
    auth: AuthenticatedClient,
) -> ApiResult<Json<HealthSummary>> {
    Ok(Json(read_health_summary(&state, &auth).await?))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn readings() -> HealthReadings {
        HealthReadings {
            mqtt: true,
            zigbee: true,
            matter: false,
            database: true,
            relay_connected: true,
            devices_online: 3,
            devices_total: 4,
        }
    }

    #[test]
    fn active_owners_get_the_owner_view() {
        assert_eq!(
            authorize_health_summary("owner", "active"),
            Ok(HealthView::Owner)
        );
    }

    #[test]
    fn active_members_get_the_member_view() {
        assert_eq!(
            authorize_health_summary("member", "active"),
            Ok(HealthView::Member)
        );
    }

    #[test]
    fn inactive_memberships_are_forbidden() {
        for role in ["owner", "member"] {
            for status in ["revoked", "pending", "inactive"] {
                assert_eq!(
                    authorize_health_summary(role, status),
                    Err(HealthSummaryError::Forbidden),
                    "{role}/{status}"
                );
            }
        }
    }

    #[test]
    fn callers_without_a_membership_are_unauthenticated() {
        assert_eq!(
            authorize_health_summary("", ""),
            Err(HealthSummaryError::Unauthenticated)
        );
        assert_eq!(
            authorize_health_summary("", "active"),
            Err(HealthSummaryError::Unauthenticated)
        );
    }

    #[test]
    fn unknown_roles_are_forbidden() {
        assert_eq!(
            authorize_health_summary("admin", "active"),
            Err(HealthSummaryError::Forbidden)
        );
    }

    #[test]
    fn the_owner_view_includes_controller_details() {
        let body = serde_json::to_value(summarize(HealthView::Owner, readings())).unwrap();
        assert_eq!(
            body,
            serde_json::json!({
                "view": "owner",
                "status": "ok",
                "services": { "mqtt": true, "zigbee": true, "matter": false },
                "devices": { "online": 3, "total": 4 },
                "controller": { "database": true, "relayConnected": true },
            })
        );
    }

    #[test]
    fn the_member_view_has_only_service_and_device_availability() {
        let body = serde_json::to_value(summarize(HealthView::Member, readings())).unwrap();
        assert_eq!(
            body,
            serde_json::json!({
                "view": "member",
                "status": "ok",
                "services": { "mqtt": true, "zigbee": true, "matter": false },
                "devices": { "online": 3, "total": 4 },
            })
        );
    }

    #[test]
    fn status_degrades_without_mqtt_and_errors_without_the_database() {
        let mut down = readings();
        down.mqtt = false;
        assert_eq!(summarize(HealthView::Member, down).status, "degraded");
        down.database = false;
        assert_eq!(summarize(HealthView::Member, down).status, "error");
    }
}
