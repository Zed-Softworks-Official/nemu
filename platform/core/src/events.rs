use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;

/// Wire events matching `@nemu/protocol` `deviceEventSchema`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum DeviceEvent {
    #[serde(rename = "deviceState")]
    DeviceState {
        #[serde(rename = "deviceId")]
        device_id: String,
        state: JsonValue,
    },
    #[serde(rename = "deviceJoined")]
    DeviceJoined {
        device: DeviceResource,
    },
    #[serde(rename = "deviceLeft")]
    DeviceLeft {
        #[serde(rename = "deviceId")]
        device_id: String,
    },
    Interview {
        #[serde(rename = "externalId")]
        external_id: String,
        status: InterviewStatus,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        error: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        message: Option<String>,
    },
    #[serde(rename = "commissionProgress")]
    CommissionProgress {
        stage: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        message: Option<String>,
    },
    Resync,
    Health {
        mqtt: bool,
        zigbee: bool,
        matter: bool,
        db: bool,
    },
    #[serde(rename = "commandResult")]
    CommandResult {
        #[serde(rename = "requestId")]
        request_id: String,
        ok: bool,
        #[serde(skip_serializing_if = "Option::is_none")]
        error: Option<ErrorBody>,
    },
    #[serde(rename = "capabilitySnapshot")]
    CapabilitySnapshot {
        epoch: crate::capabilities::StateEpoch,
        revision: u64,
        capabilities: Vec<crate::capabilities::CapabilityState>,
    },
    #[serde(rename = "capabilityChange")]
    CapabilityChange {
        epoch: crate::capabilities::StateEpoch,
        revision: u64,
        state: crate::capabilities::CapabilityState,
    },
}

impl DeviceEvent {
    pub fn from_capability_snapshot(snapshot: crate::capabilities::CapabilitySnapshot) -> Self {
        Self::CapabilitySnapshot {
            epoch: snapshot.epoch,
            revision: snapshot.revision,
            capabilities: snapshot.capabilities,
        }
    }

    pub fn from_capability_change(change: crate::capabilities::CapabilityChange) -> Self {
        Self::CapabilityChange {
            epoch: change.epoch,
            revision: change.revision,
            state: change.state,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum InterviewStatus {
    Started,
    Successful,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ErrorBody {
    pub code: String,
    pub message: String,
}

/// Device resource matching `@nemu/protocol` `deviceSchema`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceResource {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub device_type: String,
    pub protocol: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub room_id: Option<String>,
    pub online: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub state: Option<JsonValue>,
}

impl DeviceResource {
    pub fn from_device(
        device: &crate::db::models::Device,
        online: bool,
        state: Option<JsonValue>,
    ) -> Self {
        Self {
            id: device.id.to_string(),
            name: device.friendly_name.clone(),
            device_type: device.device_type.clone(),
            protocol: device.protocol.clone(),
            model: device.model.clone(),
            room_id: device.room_id.map(|id| id.to_string()),
            online,
            state,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RoomResource {
    pub id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sort_order: Option<i32>,
}

#[cfg(test)]
mod tests {
    use uuid::Uuid;

    use super::DeviceEvent;
    use crate::capabilities::{
        Availability, CapabilityChange, CapabilityId, CapabilityKind, CapabilityState,
        NumericValue, StateEpoch,
    };

    #[test]
    fn capability_change_uses_the_shared_transport_shape() {
        let event = DeviceEvent::from_capability_change(CapabilityChange {
            epoch: StateEpoch::from_uuid(Uuid::nil()),
            revision: 5,
            state: CapabilityState {
                capability_id: CapabilityId::from_uuid(Uuid::nil()),
                kind: CapabilityKind::Power,
                value: Some(NumericValue::for_test(1500, 3, "limits")),
                availability: Availability::Available,
                observed_at: None,
                received_at: None,
                revision: 5,
            },
        });
        let json = serde_json::to_value(&event).expect("capability change serializes");
        assert_eq!(json["type"], "capabilityChange");
        assert_eq!(json["revision"], 5);
        assert_eq!(
            json["state"]["capabilityId"],
            "00000000-0000-0000-0000-000000000000"
        );
        assert_eq!(json["state"]["kind"], "power");
        assert_eq!(json["state"]["availability"]["status"], "available");
        assert_eq!(json["state"]["value"]["constraintRevisionId"], "limits");
        assert!(json["state"].get("observedAt").is_none());
    }
}

impl From<&crate::db::models::Room> for RoomResource {
    fn from(room: &crate::db::models::Room) -> Self {
        Self {
            id: room.id.to_string(),
            name: room.name.clone(),
            sort_order: Some(room.sort_order),
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ClientWsMessage {
    #[serde(rename = "command")]
    Command {
        #[serde(rename = "requestId")]
        request_id: String,
        #[serde(rename = "deviceId")]
        device_id: String,
        payload: JsonValue,
    },
    #[serde(rename = "requestCapabilitySnapshot")]
    RequestCapabilitySnapshot,
}
