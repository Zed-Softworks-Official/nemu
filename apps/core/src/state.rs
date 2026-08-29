use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

use deadpool_diesel::postgres::Pool;
use tokio::sync::broadcast;

use crate::devices::{DeviceRegistry, StateCache};
use crate::events::DeviceEvent;
use crate::identity::ControllerIdentity;
use crate::mqtt::MqttHandle;
use crate::watchtower::WatchtowerClient;

pub type DbPool = Pool;

#[derive(Clone)]
pub struct AppState {
    pub db: DbPool,
    pub registry: Arc<DeviceRegistry>,
    pub state_cache: Arc<StateCache>,
    pub mqtt: MqttHandle,
    pub events: broadcast::Sender<DeviceEvent>,
    pub health: Arc<HealthFlags>,
    pub identity: Arc<ControllerIdentity>,
    pub convex_site_url: Option<String>,
    pub registration_secret: Option<String>,
    pub lan_ip: Option<String>,
    pub watchtower: Option<WatchtowerClient>,
}

#[derive(Debug, Default)]
pub struct HealthFlags {
    pub mqtt_connected: AtomicBool,
    pub zigbee_online: AtomicBool,
    pub matter_online: AtomicBool,
}

impl HealthFlags {
    pub fn set_mqtt(&self, connected: bool) {
        self.mqtt_connected.store(connected, Ordering::Relaxed);
    }

    pub fn set_bridge(&self, protocol: crate::config::Protocol, online: bool) {
        match protocol {
            crate::config::Protocol::Zigbee => self.zigbee_online.store(online, Ordering::Relaxed),
            crate::config::Protocol::Matter => self.matter_online.store(online, Ordering::Relaxed),
        }
    }

    pub fn mqtt(&self) -> bool {
        self.mqtt_connected.load(Ordering::Relaxed)
    }

    pub fn zigbee(&self) -> bool {
        self.zigbee_online.load(Ordering::Relaxed)
    }

    pub fn matter(&self) -> bool {
        self.matter_online.load(Ordering::Relaxed)
    }
}

impl AppState {
    pub fn emit(&self, event: DeviceEvent) {
        let _ = self.events.send(event);
    }
}
