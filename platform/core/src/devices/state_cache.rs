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

    pub fn set_online_if_unknown(&self, device_id: Uuid, online: bool) {
        self.online.entry(device_id).or_insert(online);
    }

    pub fn online_status(&self, device_id: Uuid) -> Option<bool> {
        self.online.get(&device_id).map(|v| *v)
    }

    pub fn remove(&self, device_id: Uuid) {
        self.states.remove(&device_id);
        self.online.remove(&device_id);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn set_online_if_unknown_does_not_override() {
        let cache = StateCache::new();
        let id = Uuid::nil();
        cache.set_online(id, false);
        cache.set_online_if_unknown(id, true);
        assert_eq!(cache.online_status(id), Some(false));
        assert!(!cache.online_status(id).unwrap_or(false));

        let other = Uuid::new_v4();
        cache.set_online_if_unknown(other, true);
        assert_eq!(cache.online_status(other), Some(true));
        assert!(cache.online_status(other).unwrap_or(false));
    }
}
