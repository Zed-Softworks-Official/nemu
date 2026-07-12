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
    DeviceJoined { device: DeviceResource },
    #[serde(rename = "deviceLeft")]
    DeviceLeft {
        #[serde(rename = "deviceId")]
        device_id: String,
    },
    Interview {
        #[serde(rename = "ieeeAddress")]
        ieee_address: String,
        status: InterviewStatus,
    },
    Resync,
    Health {
        mqtt: bool,
        zigbee: bool,
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
}
