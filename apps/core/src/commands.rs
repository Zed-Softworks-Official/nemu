use serde_json::{Value as JsonValue, json};
use thiserror::Error;
use uuid::Uuid;

use crate::devices::registry::log_event;
use crate::events::ErrorBody;
use crate::state::AppState;

#[derive(Debug, Error)]
pub enum CommandError {
    #[error("device not found")]
    DeviceNotFound,
    #[error("mqtt publish failed: {0}")]
    Mqtt(String),
}

impl CommandError {
    pub fn code(&self) -> &'static str {
        match self {
            Self::DeviceNotFound => "device_not_found",
            Self::Mqtt(_) => "mqtt_error",
        }
    }

    pub fn to_error_body(&self) -> ErrorBody {
        ErrorBody {
            code: self.code().to_string(),
            message: self.to_string(),
        }
    }
}

/// Single command executor used by HTTP and WebSocket transports.
pub async fn execute_set(
    state: &AppState,
    device_id: Uuid,
    payload: JsonValue,
) -> Result<(), CommandError> {
    let device = state
        .registry
        .get(device_id)
        .await
        .ok_or(CommandError::DeviceNotFound)?;

    state
        .mqtt
        .publish_set(&device.friendly_name, &payload)
        .await
        .map_err(CommandError::Mqtt)?;

    let _ = log_event(
        &state.db,
        Some(device_id),
        "command",
        json!({ "payload": payload }),
    )
    .await;

    Ok(())
}
