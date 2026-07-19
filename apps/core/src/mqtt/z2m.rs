use serde::{Deserialize, Serialize};
use serde_json::{Value as JsonValue, json};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum Z2mError {
    #[error("invalid payload: {0}")]
    InvalidPayload(String),
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Z2mDeviceDescriptor {
    pub ieee_address: String,
    pub friendly_name: String,
    #[serde(rename = "type")]
    pub device_type: String,
    #[serde(default)]
    pub model_id: Option<String>,
    #[serde(default)]
    pub definition: Option<Z2mDefinition>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Z2mDefinition {
    #[serde(default)]
    pub model: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub exposes: Option<Vec<JsonValue>>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Z2mBridgeEvent {
    #[serde(rename = "type")]
    pub event_type: String,
    #[serde(default)]
    pub data: JsonValue,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Z2mBridgeResponse {
    pub status: String,
    #[serde(default)]
    pub data: JsonValue,
    #[serde(default)]
    pub error: Option<String>,
    #[serde(default)]
    pub transaction: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum IncomingTopic {
    BridgeState,
    BridgeDevices,
    BridgeEvent,
    BridgeResponse { endpoint: String },
    DeviceState { friendly_name: String },
    DeviceAvailability { friendly_name: String },
    Ignored,
}

/// Parse a topic relative to the base topic (e.g. `zigbee2mqtt`).
pub fn parse_topic(base_topic: &str, topic: &str) -> IncomingTopic {
    let prefix = format!("{base_topic}/");
    let Some(rest) = topic.strip_prefix(&prefix) else {
        if topic == base_topic {
            return IncomingTopic::Ignored;
        }
        return IncomingTopic::Ignored;
    };

    match rest {
        "bridge/state" => IncomingTopic::BridgeState,
        "bridge/devices" => IncomingTopic::BridgeDevices,
        "bridge/event" => IncomingTopic::BridgeEvent,
        _ if rest.starts_with("bridge/response/") => IncomingTopic::BridgeResponse {
            endpoint: rest.trim_start_matches("bridge/response/").to_string(),
        },
        _ if rest.starts_with("bridge/") => IncomingTopic::Ignored,
        _ => {
            if let Some(name) = rest.strip_suffix("/availability") {
                IncomingTopic::DeviceAvailability {
                    friendly_name: name.to_string(),
                }
            } else if rest.ends_with("/set") || rest.ends_with("/get") || rest.contains('/') {
                IncomingTopic::Ignored
            } else {
                IncomingTopic::DeviceState {
                    friendly_name: rest.to_string(),
                }
            }
        }
    }
}

pub fn parse_bridge_state(payload: &str) -> Result<bool, Z2mError> {
    // z2m may send plain "online"/"offline" or JSON {"state":"online"}
    let trimmed = payload.trim();
    if trimmed == "online" {
        return Ok(true);
    }
    if trimmed == "offline" {
        return Ok(false);
    }
    let value: JsonValue =
        serde_json::from_str(trimmed).map_err(|e| Z2mError::InvalidPayload(e.to_string()))?;
    match value.get("state").and_then(|v| v.as_str()) {
        Some("online") => Ok(true),
        Some("offline") => Ok(false),
        _ => Err(Z2mError::InvalidPayload(format!(
            "unexpected bridge state: {trimmed}"
        ))),
    }
}

pub fn parse_devices_payload(payload: &str) -> Result<Vec<Z2mDeviceDescriptor>, Z2mError> {
    serde_json::from_str(payload).map_err(|e| Z2mError::InvalidPayload(e.to_string()))
}

pub fn parse_bridge_event(payload: &str) -> Result<Z2mBridgeEvent, Z2mError> {
    serde_json::from_str(payload).map_err(|e| Z2mError::InvalidPayload(e.to_string()))
}

pub fn parse_bridge_response(payload: &str) -> Result<Z2mBridgeResponse, Z2mError> {
    serde_json::from_str(payload).map_err(|e| Z2mError::InvalidPayload(e.to_string()))
}

pub fn parse_availability(payload: &str) -> Result<bool, Z2mError> {
    let trimmed = payload.trim();
    if trimmed == "online" {
        return Ok(true);
    }
    if trimmed == "offline" {
        return Ok(false);
    }
    let value: JsonValue =
        serde_json::from_str(trimmed).map_err(|e| Z2mError::InvalidPayload(e.to_string()))?;
    match value.get("state").and_then(|v| v.as_str()) {
        Some("online") => Ok(true),
        Some("offline") => Ok(false),
        _ => Err(Z2mError::InvalidPayload(format!(
            "unexpected availability: {trimmed}"
        ))),
    }
}

pub fn set_topic(base_topic: &str, friendly_name: &str) -> String {
    format!("{base_topic}/{friendly_name}/set")
}

pub fn permit_join_topic(base_topic: &str) -> String {
    format!("{base_topic}/bridge/request/permit_join")
}

pub fn rename_topic(base_topic: &str) -> String {
    format!("{base_topic}/bridge/request/device/rename")
}

pub fn remove_topic(base_topic: &str) -> String {
    format!("{base_topic}/bridge/request/device/remove")
}

pub fn devices_request_topic(base_topic: &str) -> String {
    format!("{base_topic}/bridge/request/device/list")
}

pub fn permit_join_payload(seconds: u32) -> String {
    // Zigbee2MQTT 2.x dropped the legacy `value` field; `time` alone opens the network.
    json!({ "time": seconds }).to_string()
}

pub fn rename_payload(from: &str, to: &str) -> String {
    // Prefer ieee when it looks like one; z2m accepts either.
    json!({ "from": from, "to": to }).to_string()
}

pub fn remove_payload(id: &str, transaction: &str) -> String {
    json!({
        "id": id,
        "force": false,
        "block": false,
        "transaction": transaction
    })
    .to_string()
}

pub fn interview_status(
    event_type: &str,
    data: &JsonValue,
) -> Option<(String, crate::events::InterviewStatus)> {
    use crate::events::InterviewStatus;

    let ieee = data
        .get("ieee_address")
        .or_else(|| data.pointer("/device/ieee_address"))
        .and_then(|v| v.as_str())
        .map(str::to_string)?;

    let status = match event_type {
        "device_joined" => InterviewStatus::Started,
        "device_interview" => match data.get("status").and_then(|v| v.as_str()) {
            Some("successful") => InterviewStatus::Successful,
            Some("failed") => InterviewStatus::Failed,
            Some("started") => InterviewStatus::Started,
            _ => InterviewStatus::Started,
        },
        _ => return None,
    };

    Some((ieee, status))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_topics() {
        let base = "zigbee2mqtt";
        assert_eq!(
            parse_topic(base, "zigbee2mqtt/bridge/state"),
            IncomingTopic::BridgeState
        );
        assert_eq!(
            parse_topic(base, "zigbee2mqtt/bridge/devices"),
            IncomingTopic::BridgeDevices
        );
        assert_eq!(
            parse_topic(base, "zigbee2mqtt/Kitchen Light"),
            IncomingTopic::DeviceState {
                friendly_name: "Kitchen Light".into()
            }
        );
        assert_eq!(
            parse_topic(base, "zigbee2mqtt/Kitchen Light/availability"),
            IncomingTopic::DeviceAvailability {
                friendly_name: "Kitchen Light".into()
            }
        );
        assert_eq!(
            parse_topic(base, "zigbee2mqtt/Kitchen Light/set"),
            IncomingTopic::Ignored
        );
        assert_eq!(
            parse_topic(base, "zigbee2mqtt/bridge/response/device/rename"),
            IncomingTopic::BridgeResponse {
                endpoint: "device/rename".into()
            }
        );
    }

    #[test]
    fn parses_bridge_state_variants() {
        assert_eq!(parse_bridge_state("online").unwrap(), true);
        assert_eq!(parse_bridge_state(r#"{"state":"offline"}"#).unwrap(), false);
    }

    #[test]
    fn parses_devices_fixture() {
        let payload = r#"[
            {
                "ieee_address": "0x00124b0012345678",
                "type": "Router",
                "friendly_name": "Kitchen Light",
                "definition": { "model": "TRADFRI bulb E26", "exposes": [{"type":"light"}] }
            },
            {
                "ieee_address": "0x0000000000000000",
                "type": "Coordinator",
                "friendly_name": "Coordinator"
            }
        ]"#;
        let devices = parse_devices_payload(payload).unwrap();
        assert_eq!(devices.len(), 2);
        assert_eq!(devices[0].friendly_name, "Kitchen Light");
        assert_eq!(
            devices[0].definition.as_ref().unwrap().model.as_deref(),
            Some("TRADFRI bulb E26")
        );
    }

    #[test]
    fn interview_from_bridge_event() {
        let data = json!({
            "ieee_address": "0xabc",
            "status": "successful"
        });
        let (ieee, status) = interview_status("device_interview", &data).unwrap();
        assert_eq!(ieee, "0xabc");
        assert!(matches!(status, crate::events::InterviewStatus::Successful));
    }

    #[test]
    fn creates_safe_remove_request() {
        assert_eq!(
            remove_topic("zigbee2mqtt"),
            "zigbee2mqtt/bridge/request/device/remove"
        );
        let value: JsonValue = serde_json::from_str(&remove_payload("0xabc", "txn-1")).unwrap();
        assert_eq!(
            value,
            json!({
                "id": "0xabc",
                "force": false,
                "block": false,
                "transaction": "txn-1"
            })
        );
    }

    #[test]
    fn parses_remove_responses() {
        let response =
            parse_bridge_response(r#"{"status":"ok","data":{"id":"0xabc"},"transaction":"txn-1"}"#)
                .unwrap();
        assert_eq!(response.status, "ok");
        assert_eq!(response.transaction.as_deref(), Some("txn-1"));
        assert_eq!(response.data["id"], "0xabc");

        let response = parse_bridge_response(
            r#"{"status":"error","data":{"id":"0xabc"},"error":"device asleep","transaction":"txn-2"}"#,
        )
        .unwrap();
        assert_eq!(response.status, "error");
        assert_eq!(response.error.as_deref(), Some("device asleep"));
    }
}
