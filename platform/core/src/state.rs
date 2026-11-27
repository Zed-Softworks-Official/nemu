use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use deadpool_diesel::postgres::Pool;
use tokio::sync::{Semaphore, broadcast};

use crate::capabilities::CapabilityService;
use crate::devices::{DeviceRegistry, StateCache};
use crate::events::DeviceEvent;
use crate::identity::ControllerIdentity;
use crate::mqtt::MqttHandle;
use crate::updater_control::UpdaterControl;

pub type DbPool = Pool;

#[derive(Clone)]
pub struct AppState {
    pub db: DbPool,
    /// History reads. Separate from `db` (control and identity) and from the
    /// admission pool inside `CapabilityService`.
    pub history_query_pool: DbPool,
    pub history_query_slots: Arc<Semaphore>,
    /// Short-lived History cursors. Core memory only; never written to Convex.
    pub history_cursors: Arc<Mutex<crate::capabilities::history_query::HistoryCursorStore>>,
    pub registry: Arc<DeviceRegistry>,
    pub state_cache: Arc<StateCache>,
    pub capabilities: Arc<CapabilityService>,
    pub mqtt: MqttHandle,
    pub events: broadcast::Sender<DeviceEvent>,
    pub health: Arc<HealthFlags>,
    pub identity: Arc<ControllerIdentity>,
    pub convex_site_url: Option<String>,
    pub registration_secret: Option<String>,
    pub lan_ip: Option<String>,
    pub updater: Arc<dyn UpdaterControl>,
    /// Live capability watches over Relay (NEM-132). Memory only.
    pub capability_watches: Arc<crate::relay::watches::CapabilityWatches>,
    /// CPace pairing runs in progress (ADR-0037). Memory only.
    pub pairing_runs: Arc<crate::pairing::exchange::PairingRuns>,
    /// Local sessions and their challenges. Memory only.
    pub local_sessions: Arc<crate::pairing::local_sessions::LocalSessions>,
}

#[derive(Debug, Default)]
pub struct HealthFlags {
    pub mqtt_connected: AtomicBool,
    pub zigbee_online: AtomicBool,
    pub matter_online: AtomicBool,
    /// The Relay subscription is live.
    pub relay_connected: AtomicBool,
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

    pub fn set_relay(&self, connected: bool) {
        self.relay_connected.store(connected, Ordering::Relaxed);
    }

    pub fn relay(&self) -> bool {
        self.relay_connected.load(Ordering::Relaxed)
    }
}

impl AppState {
    pub fn emit(&self, event: DeviceEvent) {
        let _ = self.events.send(event);
    }
}
