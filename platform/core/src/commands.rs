use chrono::Utc;
use serde_json::Value as JsonValue;
use thiserror::Error;
use tracing::warn;
use uuid::Uuid;

use crate::db::models::Device;
use crate::ledger::{self, AdmitDecision, CommandRow};
use crate::mqtt::{device_protocol, device_topic_id};
use crate::state::AppState;

pub const COMMAND_ID_HEADER: &str = "x-command-id";

#[derive(Debug, Error)]
pub enum CommandError {
    #[error("device not found")]
    DeviceNotFound,
    #[error("device is unavailable")]
    Unavailable,
    #[error("command was not confirmed")]
    Unconfirmed,
    #[error("command failed: {0}")]
    Failed(String),
    #[error("mqtt publish failed: {0}")]
    Mqtt(String),
    #[error("command id is invalid")]
    InvalidId,
    #[error("command ledger failed: {0}")]
    Store(String),
}

impl CommandError {
    pub fn code(&self) -> &'static str {
        match self {
            Self::DeviceNotFound => "device_not_found",
            Self::Unavailable => "unavailable",
            Self::Unconfirmed => "unconfirmed",
            Self::Failed(code) => match code.as_str() {
                "dispatch_expired" => "dispatch_expired",
                "mqtt_error" => "mqtt_error",
                "unconfirmed" => "unconfirmed",
                _ => "failed",
            },
            Self::Mqtt(_) => "mqtt_error",
            Self::InvalidId => "invalid_command",
            Self::Store(_) => "internal_error",
        }
    }

    pub fn to_error_body(&self) -> crate::events::ErrorBody {
        crate::events::ErrorBody {
            code: self.code().to_string(),
            message: self.to_string(),
        }
    }
}

fn stored_result(row: CommandRow) -> Result<(), CommandError> {
    match row.outcome.as_str() {
        "pending_dispatch" | "accepted" | "confirmed" => Ok(()),
        "rejected" => match row.error_code.as_deref() {
            Some("device_not_found") => Err(CommandError::DeviceNotFound),
            _ => Err(CommandError::Unavailable),
        },
        "unconfirmed" => Err(CommandError::Unconfirmed),
        "failed" => Err(CommandError::Failed(
            row.error_code.unwrap_or_else(|| "failed".to_string()),
        )),
        other => Err(CommandError::Failed(other.to_string())),
    }
}

/// Single command executor used by HTTP, WebSocket, and Relay.
///
/// The Command id is admitted to the ledger before MQTT publication. A retry
/// returns the stored outcome and does not publish again.
pub async fn execute_set(
    state: &AppState,
    command_id: &str,
    device_id: Uuid,
    payload: JsonValue,
) -> Result<(), CommandError> {
    if !ledger::valid_command_id(command_id) {
        return Err(CommandError::InvalidId);
    }
    let now = Utc::now();
    let device = state.registry.get(device_id).await;
    let available = device.is_some() && state.state_cache.online_status(device_id) != Some(false);
    let decision = ledger::admit(
        &state.db,
        command_id,
        device.as_ref().map(|row| row.id),
        payload.clone(),
        available,
        now,
    )
    .await
    .map_err(CommandError::Store)?;

    if ledger::answers_retry(&decision) {
        let AdmitDecision::Stored(row) = decision else {
            unreachable!("a retry carries the stored Command");
        };
        return stored_result(row);
    }
    let AdmitDecision::Dispatch(row) = decision else {
        unreachable!("a new Command is dispatched");
    };

    let Some(device) = device else {
        return stored_result(row);
    };
    publish_and_record(state, &device, &row).await
}

async fn publish_and_record(
    state: &AppState,
    device: &Device,
    row: &CommandRow,
) -> Result<(), CommandError> {
    match state
        .mqtt
        .publish_set(
            device_protocol(device),
            device_topic_id(device),
            &row.payload,
        )
        .await
    {
        Ok(()) => {
            if let Err(error) = ledger::mark_accepted(&state.db, &row.command_id, Utc::now()).await
            {
                warn!(%error, command_id = %row.command_id, "failed to record command acceptance");
            }
            Ok(())
        }
        Err(error) => {
            if let Err(store) =
                ledger::mark_failed(&state.db, &row.command_id, "mqtt_error", Utc::now()).await
            {
                warn!(%store, command_id = %row.command_id, "failed to record command failure");
            }
            Err(CommandError::Mqtt(error))
        }
    }
}

pub async fn confirm_device(state: &AppState, device_id: Uuid) {
    if let Err(error) = ledger::confirm_accepted(&state.db, device_id, Utc::now()).await {
        warn!(%error, "failed to confirm commands");
    }
}

/// Republish unexpired Commands that were admitted before a restart.
pub async fn resume_pending(state: &AppState, device: &Device) {
    let pending = match ledger::claim_pending(&state.db, device.id, Utc::now()).await {
        Ok(rows) => rows,
        Err(error) => {
            warn!(%error, "failed to claim pending commands");
            return;
        }
    };
    for row in pending {
        if let Err(error) = publish_and_record(state, device, &row).await {
            warn!(%error, command_id = %row.command_id, "pending command was not dispatched");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn retries_keep_the_stored_outcome() {
        assert_eq!(CommandError::DeviceNotFound.code(), "device_not_found");
        assert_eq!(CommandError::Unavailable.code(), "unavailable");
        assert_eq!(CommandError::Unconfirmed.code(), "unconfirmed");
        assert_eq!(
            CommandError::Failed("dispatch_expired".into()).code(),
            "dispatch_expired"
        );
        assert!(!ledger::valid_command_id(""));
        assert!(ledger::valid_command_id("request-1"));
    }
}
