use dashmap::DashMap;
use serde_json::Value as JsonValue;
use uuid::Uuid;

#[derive(Debug, Default)]
pub struct StateCache {
    states: DashMap<Uuid, JsonValue>,
    online: DashMap<Uuid, bool>,
}

impl StateCache {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn set_state(&self, device_id: Uuid, state: JsonValue) {
        self.states.insert(device_id, state);
    }

    pub fn get_state(&self, device_id: Uuid) -> Option<JsonValue> {
        self.states.get(&device_id).map(|v| v.clone())
    }

    pub fn set_online(&self, device_id: Uuid, online: bool) {
        self.online.insert(device_id, online);
    }

    pub fn is_online(&self, device_id: Uuid) -> bool {
        self.online.get(&device_id).map(|v| *v).unwrap_or(false)
    }

    pub fn remove(&self, device_id: Uuid) {
        self.states.remove(&device_id);
        self.online.remove(&device_id);
    }
}
