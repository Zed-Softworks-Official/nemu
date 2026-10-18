use std::collections::{HashMap, HashSet, VecDeque};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use matter_controller::{
    AttestationTrust, AttributePath, CommandPath, FabricConfig, FileStore, MatterController,
    MatterTime, NetworkCredentials, ReadPath, SubscriptionEvent, Value, WiFiCredentials,
};
use serde_json::{Map, Value as JsonValue, json};
use tracing::{info, warn};

use crate::adopt::{AdoptStore, ble_recover_node_ids, node_ids_from_mdns_error, unique_front};
use crate::codec::{empty_structure, unsigned_fields, value_to_json};
use crate::config::Config;
use crate::mapping::{
    Attributes, CLUSTER_DESCRIPTOR, CLUSTER_ELECTRICAL_ENERGY, CLUSTER_ELECTRICAL_POWER,
    CommandName, EndpointDevice, apply_set_to_attributes, collapsed_legacy_ids, commands_for_set,
    device_covers_endpoint, device_descriptor, is_state_attribute_path, map_node_with_fallback,
    outlet_id_from_set, placeholder_device, state_for_device,
};
use crate::meters::{
    MeterIdentityStore, PublishedMeter, assigned_capability_ids, fresh_observed_unix,
    meter_publication, observation_stamp,
};
use crate::mqtt::{IncomingMessage, MqttBus, transaction_of};
use crate::names::NameStore;
use crate::pairing::normalize_pairing_code;

struct Indexed {
    device: EndpointDevice,
    node_id: u64,
}

struct JoinedNode {
    node_id: u64,
    attributes: Option<Attributes>,
}

struct BootScan {
    hints: Vec<u64>,
    stale: Vec<u64>,
    settled: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum ReadPurpose {
    Boot,
    Descriptor,
    Commission,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct PendingRead {
    node_id: u64,
    purpose: ReadPurpose,
}

struct NodeReadDone {
    node_id: u64,
    purpose: ReadPurpose,
    result: Result<Attributes, String>,
}

/// One node read at a time, so an unpair can be acked while that read is still
/// outstanding. The controller gives up on the ack after 15s; a wildcard read
/// is allowed to take longer than that.
#[derive(Default)]
struct ReadScheduler {
    queue: VecDeque<PendingRead>,
    in_flight: Option<PendingRead>,
    removed: HashSet<u64>,
}

impl ReadScheduler {
    fn enqueue(&mut self, node_id: u64, purpose: ReadPurpose) {
        if self.removed.contains(&node_id) {
            return;
        }
        let duplicate = self
            .in_flight
            .is_some_and(|read| read.node_id == node_id && read.purpose == purpose)
            || self
                .queue
                .iter()
                .any(|read| read.node_id == node_id && read.purpose == purpose);
        if duplicate {
            return;
        }
        self.queue.push_back(PendingRead { node_id, purpose });
    }

    fn cancel(&mut self, node_id: u64) {
        self.removed.insert(node_id);
        self.queue.retain(|read| read.node_id != node_id);
    }

    fn poll(&mut self) -> Option<PendingRead> {
        if self.in_flight.is_some() {
            return None;
        }
        while let Some(read) = self.queue.pop_front() {
            if self.removed.contains(&read.node_id) {
                continue;
            }
            self.in_flight = Some(read);
            return Some(read);
        }
        None
    }

    /// `false` when the node was unpaired while the read was outstanding.
    fn finish(&mut self, node_id: u64, purpose: ReadPurpose) -> bool {
        if self
            .in_flight
            .is_some_and(|read| read.node_id == node_id && read.purpose == purpose)
        {
            self.in_flight = None;
        }
        !self.removed.contains(&node_id)
    }

    fn ignored(&self, node_id: u64) -> bool {
        self.removed.contains(&node_id)
    }

    fn boot_pending(&self) -> bool {
        self.in_flight
            .is_some_and(|read| read.purpose == ReadPurpose::Boot)
            || self
                .queue
                .iter()
                .any(|read| read.purpose == ReadPurpose::Boot)
    }
}

pub struct MatterService {
    _config: Config,
    controller: MatterController,
    mqtt: MqttBus,
    names: NameStore,
    adopted: AdoptStore,
    index: HashMap<String, Indexed>,
    attributes: HashMap<u64, Attributes>,
    subscribed: HashSet<u64>,
    published_leaves: HashSet<String>,
    commissioning: bool,
    got_node: bool,
    cancel: Arc<AtomicBool>,
    boot_cancel: Arc<AtomicBool>,
    meter_identities: Mutex<MeterIdentityStore>,
    capability_ids: Mutex<HashMap<String, HashMap<String, String>>>,
    reads: ReadScheduler,
    inventory_ready: bool,
    pending_joins: Vec<u64>,
}

impl MatterService {
    pub async fn start(config: Config, mqtt: MqttBus) -> Result<Self, String> {
        std::fs::create_dir_all(&config.data_dir)
            .map_err(|error| format!("create data dir: {error}"))?;

        let paa_count = count_der_files(&config.paa_dir);
        let cd_count = count_der_files(&config.cd_dir);
        let trust = if paa_count > 0 && cd_count > 0 {
            info!(
                paa = paa_count,
                cd = cd_count,
                "loaded Matter attestation roots"
            );
            AttestationTrust::from_dirs(&config.paa_dir, &config.cd_dir)
                .map_err(|error| format!("load attestation roots: {error}"))?
        } else if config.allow_example_roots {
            warn!(
                "PAA/CD roots missing at {} / {}; using AttestationTrust::example_device_roots() because MATTER_ALLOW_EXAMPLE_ROOTS is set. Certified production devices will not attest.",
                config.paa_dir.display(),
                config.cd_dir.display()
            );
            AttestationTrust::example_device_roots()
        } else {
            return Err(format!(
                "PAA/CD roots missing at {} / {}; certified devices cannot attest. Run scripts/fetch-matter-roots.sh or set MATTER_ALLOW_EXAMPLE_ROOTS=1 for development.",
                config.paa_dir.display(),
                config.cd_dir.display()
            ));
        };

        let store = Arc::new(FileStore::new(config.store_path()));
        let controller = MatterController::builder(store)
            .attestation_trust(trust)
            .build()
            .await
            .map_err(|error| format!("open controller: {error}"))?;

        if controller
            .fabrics()
            .await
            .map_err(|error| format!("list fabrics: {error}"))?
            .is_empty()
        {
            let now = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(1_700_000_000);
            controller
                .create_fabric(FabricConfig::new(
                    1,
                    1,
                    1,
                    (
                        MatterTime::from_unix_secs(now.saturating_sub(3600)),
                        MatterTime::NO_EXPIRY,
                    ),
                ))
                .await
                .map_err(|error| format!("create fabric: {error}"))?;
            info!("created Matter fabric");
        }

        let names = NameStore::load(config.names_path());
        let adopted = AdoptStore::load(config.adopted_path());
        let meter_identities = MeterIdentityStore::load(config.meter_identities_path());
        let service = Self {
            _config: config,
            controller,
            mqtt,
            names,
            adopted,
            index: HashMap::new(),
            attributes: HashMap::new(),
            subscribed: HashSet::new(),
            published_leaves: HashSet::new(),
            commissioning: false,
            got_node: false,
            cancel: Arc::new(AtomicBool::new(false)),
            boot_cancel: Arc::new(AtomicBool::new(false)),
            meter_identities: Mutex::new(meter_identities),
            capability_ids: Mutex::new(HashMap::new()),
            reads: ReadScheduler::default(),
            inventory_ready: false,
            pending_joins: Vec::new(),
        };
        service.mqtt.set_online(true).await;
        Ok(service)
    }

    pub async fn run(
        mut self,
        mut incoming: tokio::sync::mpsc::UnboundedReceiver<IncomingMessage>,
    ) {
        let (attr_tx, mut attr_rx) = tokio::sync::mpsc::unbounded_channel();
        let (done_tx, mut done_rx) = tokio::sync::mpsc::unbounded_channel();
        let (resub_tx, mut resub_rx) = tokio::sync::mpsc::unbounded_channel();
        let (read_tx, mut read_rx) = tokio::sync::mpsc::unbounded_channel();
        self.enqueue_boot_reads().await;
        let mut boot = BootScan {
            hints: Vec::new(),
            stale: Vec::new(),
            settled: false,
        };
        loop {
            self.dispatch_read(&read_tx);
            self.maybe_settle_boot(&mut boot, &done_tx, &attr_tx).await;
            tokio::select! {
                biased;
                message = incoming.recv() => {
                    let Some(message) = message else {
                        break;
                    };
                    match message {
                        IncomingMessage::Commission { payload } => {
                            self.start_commission(payload, done_tx.clone()).await;
                        }
                        IncomingMessage::Cancel { payload } => self.handle_cancel(payload).await,
                        IncomingMessage::Remove { payload } => self.handle_remove(payload).await,
                        IncomingMessage::Rename { payload } => self.handle_rename(payload).await,
                        IncomingMessage::Set {
                            device_id,
                            payload,
                        } => self.handle_set(&device_id, payload).await,
                        IncomingMessage::SubscribeEnded { node_id } => {
                            self.note_subscribe_ended(node_id, &resub_tx);
                        }
                        IncomingMessage::AttributeChange { .. } => {
                            self.apply_attribute_change(message).await;
                        }
                        IncomingMessage::CapabilityIds { device_id, payload } => {
                            self.store_capability_ids(&device_id, &payload);
                            self.publish_state(&device_id, false).await;
                        }
                    }
                }
                Some(done) = read_rx.recv() => {
                    self.finish_read(done, &mut boot, &attr_tx).await;
                }
                Some(result) = done_rx.recv() => {
                    self.finish_commission(result).await;
                    self.subscribe_nodes(attr_tx.clone());
                }
                Some(update) = attr_rx.recv() => {
                    match update {
                        IncomingMessage::SubscribeEnded { node_id } => {
                            self.note_subscribe_ended(node_id, &resub_tx);
                        }
                        other => self.apply_attribute_change(other).await,
                    }
                }
                Some(()) = resub_rx.recv() => {
                    self.subscribe_nodes(attr_tx.clone());
                }
            }
        }
    }

    async fn start_commission(
        &mut self,
        payload: JsonValue,
        done: tokio::sync::mpsc::UnboundedSender<Result<JoinedNode, String>>,
    ) {
        let transaction = transaction_of(&payload).map(str::to_string);
        if self.commissioning {
            self.mqtt
                .respond(
                    "commission",
                    transaction.as_deref(),
                    json!({ "status": "error", "error": "pairing is still finishing; try again in a moment" }),
                )
                .await;
            return;
        }

        let Some(code) = payload
            .get("code")
            .and_then(JsonValue::as_str)
            .and_then(normalize_pairing_code)
        else {
            self.mqtt
                .respond(
                    "commission",
                    transaction.as_deref(),
                    json!({ "status": "error", "error": "pairing code is required" }),
                )
                .await;
            return;
        };

        let wifi_ssid = payload
            .get("wifiSsid")
            .and_then(JsonValue::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string);
        let wifi_password = payload
            .get("wifiPassword")
            .and_then(JsonValue::as_str)
            .unwrap_or("")
            .to_string();

        self.boot_cancel.store(true, Ordering::SeqCst);
        self.commissioning = true;
        self.got_node = false;
        self.cancel.store(false, Ordering::SeqCst);
        // Ack before BLE — that step takes 20–40s and must not block MQTT.
        self.mqtt
            .respond(
                "commission",
                transaction.as_deref(),
                json!({ "status": "ok" }),
            )
            .await;
        publish_progress(&self.mqtt, "looking", "Looking for your device").await;

        let controller = self.controller.clone();
        let mqtt = self.mqtt.clone();
        let cancel = self.cancel.clone();
        let known = self.known_node_ids().await;
        tokio::spawn(async move {
            let result = commission_device(
                &controller,
                &mqtt,
                &cancel,
                &code,
                wifi_ssid,
                wifi_password,
                known,
            )
            .await;
            let _ = done.send(result);
        });
    }

    fn spawn_boot_recover(
        &self,
        done: tokio::sync::mpsc::UnboundedSender<Result<JoinedNode, String>>,
        node_ids: Vec<u64>,
    ) {
        let controller = self.controller.clone();
        let mqtt = self.mqtt.clone();
        let cancel = self.boot_cancel.clone();
        info!(
            ?node_ids,
            "looking for an already-paired device on the network"
        );
        tokio::spawn(async move {
            if let Ok(joined) =
                recover_operational_session(&controller, &mqtt, &cancel, &node_ids, false).await
            {
                let _ = done.send(Ok(joined));
            }
        });
    }

    async fn known_node_ids(&self) -> HashSet<u64> {
        let mut known: HashSet<u64> = self.adopted.ids().collect();
        match self.controller.nodes().await {
            Ok(nodes) => {
                for info in nodes {
                    known.insert(info.node_id);
                }
            }
            Err(error) => warn!(error = %error, "failed to list nodes for next id"),
        }
        known
    }

    async fn finish_commission(&mut self, result: Result<JoinedNode, String>) {
        let was_commissioning = self.commissioning;
        let cancelled = self.cancel.swap(false, Ordering::SeqCst);
        match result {
            Ok(joined) => {
                let node_id = joined.node_id;
                self.got_node = true;
                self.commissioning = false;
                self.adopted.insert(node_id);
                publish_progress(&self.mqtt, "setting_up", "Setting up the device").await;
                if let Some(attributes) = joined.attributes {
                    self.attributes.insert(node_id, attributes);
                    self.rebuild_index_for_node(node_id);
                } else {
                    // The retries can take minutes. Leave the service loop free
                    // so unpair is acked while the read is still running.
                    self.reads.enqueue(node_id, ReadPurpose::Commission);
                    return;
                }
                self.publish_joined_node(node_id).await;
            }
            Err(_) if self.got_node => {
                self.commissioning = false;
                info!("ignoring later commission error; device already joined");
            }
            Err(_) if cancelled => {
                self.commissioning = false;
                info!("commission finished after cancel");
            }
            Err(_) if !was_commissioning => {
                info!("boot recover did not find an operational node");
            }
            Err(error) => {
                self.commissioning = false;
                self.mqtt
                    .event(
                        "device_interview",
                        json!({
                            "ieee_address": "commissioning",
                            "status": "failed",
                            "error": error,
                        }),
                    )
                    .await;
            }
        }
    }

    async fn handle_cancel(&mut self, payload: JsonValue) {
        self.cancel.store(true, Ordering::SeqCst);
        self.mqtt
            .respond(
                "commission/cancel",
                transaction_of(&payload),
                json!({ "status": "ok" }),
            )
            .await;
    }

    async fn handle_remove(&mut self, payload: JsonValue) {
        let transaction = transaction_of(&payload).map(str::to_string);
        let Some(id) = payload.get("id").and_then(JsonValue::as_str) else {
            self.mqtt
                .respond(
                    "device/remove",
                    transaction.as_deref(),
                    json!({ "status": "error", "error": "device id is required" }),
                )
                .await;
            return;
        };

        let node_id = self
            .index
            .get(id)
            .map(|entry| entry.node_id)
            .or_else(|| id.parse().ok());
        if let Some(node_id) = node_id {
            self.reads.cancel(node_id);
            self.pending_joins.retain(|id| *id != node_id);
            self.drop_node(node_id).await;
            self.adopted.remove(node_id);
            self.forget_later(node_id);
        }
        self.mqtt
            .respond(
                "device/remove",
                transaction.as_deref(),
                json!({ "status": "ok", "data": { "id": id } }),
            )
            .await;
    }

    async fn handle_rename(&mut self, payload: JsonValue) {
        let from = payload.get("from").and_then(JsonValue::as_str);
        let to = payload.get("to").and_then(JsonValue::as_str);
        if let (Some(from), Some(to)) = (from, to) {
            self.names.set(from, to);
            self.publish_devices().await;
        }
    }

    async fn handle_set(&mut self, device_id: &str, payload: JsonValue) {
        let Some(object) = payload.as_object() else {
            return;
        };
        let Some(entry) = self.index.get(device_id) else {
            warn!(device_id, "set for unknown device");
            return;
        };
        let node_id = entry.node_id;
        let device = entry.device.clone();
        let endpoints = target_endpoints(&device, object);
        let (actions, ignored) = commands_for_set(object);
        if !ignored.is_empty() {
            info!(?ignored, "ignored set keys");
        }
        if actions.is_empty() {
            return;
        }
        apply_set_to_attributes(
            self.attributes.entry(node_id).or_default(),
            &endpoints,
            &actions,
        );
        self.rebuild_index_for_node(node_id);
        self.publish_state(device_id, false).await;

        let controller = self.controller.clone();
        let device_id = device_id.to_string();
        tokio::spawn(async move {
            let node = controller.node(node_id);
            for endpoint in endpoints {
                for action in &actions {
                    let fields = match &action.command {
                        CommandName::On | CommandName::Off | CommandName::Toggle => {
                            empty_structure()
                        }
                        CommandName::MoveToLevelWithOnOff { level } => {
                            unsigned_fields(&[(0, u64::from(*level)), (1, 0), (2, 0), (3, 0)])
                        }
                        CommandName::MoveToColorTemperature { mireds } => {
                            unsigned_fields(&[(0, u64::from(*mireds)), (1, 0), (2, 0), (3, 0)])
                        }
                        CommandName::MoveToColor { color_x, color_y } => unsigned_fields(&[
                            (0, u64::from(*color_x)),
                            (1, u64::from(*color_y)),
                            (2, 0),
                            (3, 0),
                        ]),
                    };
                    if let Err(error) = node
                        .invoke(
                            CommandPath {
                                endpoint,
                                cluster: u32::from(action.cluster_id),
                                command: action.command.command_id(),
                            },
                            fields,
                        )
                        .await
                    {
                        warn!(error = %error, device_id, endpoint, "invoke failed");
                    }
                }
            }
        });
    }

    async fn enqueue_boot_reads(&mut self) {
        let mut ids: HashSet<u64> = self.adopted.ids().collect();
        match self.controller.nodes().await {
            Ok(nodes) => {
                for info in nodes {
                    ids.insert(info.node_id);
                }
            }
            Err(error) => {
                warn!(error = %error, "failed to list nodes");
            }
        }
        for node_id in ids {
            self.reads.enqueue(node_id, ReadPurpose::Boot);
        }
    }

    fn dispatch_read(&mut self, tx: &tokio::sync::mpsc::UnboundedSender<NodeReadDone>) {
        let Some(read) = self.reads.poll() else {
            return;
        };
        let controller = self.controller.clone();
        let tx = tx.clone();
        tokio::spawn(async move {
            let result = match read.purpose {
                ReadPurpose::Commission => read_node_with_retries(&controller, read.node_id).await,
                ReadPurpose::Descriptor => {
                    read_node_attributes(&controller, read.node_id, DESCRIPTOR_REFRESH_TIMEOUT)
                        .await
                }
                ReadPurpose::Boot => {
                    read_node_attributes(&controller, read.node_id, REFRESH_READ_TIMEOUT).await
                }
            };
            let _ = tx.send(NodeReadDone {
                node_id: read.node_id,
                purpose: read.purpose,
                result,
            });
        });
    }

    async fn maybe_settle_boot(
        &mut self,
        boot: &mut BootScan,
        done_tx: &tokio::sync::mpsc::UnboundedSender<Result<JoinedNode, String>>,
        attr_tx: &tokio::sync::mpsc::UnboundedSender<IncomingMessage>,
    ) {
        if boot.settled || self.reads.boot_pending() {
            return;
        }
        boot.settled = true;
        self.drop_unreachable_nodes(&unique_front(boot.stale.clone()))
            .await;
        if self.index.is_empty() && !boot.hints.is_empty() {
            self.spawn_boot_recover(done_tx.clone(), unique_front(boot.hints.clone()));
        }
        self.inventory_ready = true;
        self.publish_devices().await;
        self.subscribe_nodes(attr_tx.clone());
        let pending = std::mem::take(&mut self.pending_joins);
        for node_id in pending {
            self.publish_joined_node(node_id).await;
        }
    }

    async fn finish_read(
        &mut self,
        done: NodeReadDone,
        boot: &mut BootScan,
        attr_tx: &tokio::sync::mpsc::UnboundedSender<IncomingMessage>,
    ) {
        if !self.reads.finish(done.node_id, done.purpose) {
            return;
        }
        match done.purpose {
            ReadPurpose::Boot => match done.result {
                Ok(attributes) => {
                    self.attributes.insert(done.node_id, attributes);
                    self.rebuild_index_for_node(done.node_id);
                }
                Err(error) => {
                    warn!(error = %error, node_id = done.node_id, "wildcard read failed");
                    let seen = node_ids_from_mdns_error(&error);
                    if !seen.is_empty() {
                        boot.stale.push(done.node_id);
                        boot.hints.extend(seen);
                    }
                }
            },
            ReadPurpose::Descriptor => {
                if let Ok(attributes) = done.result {
                    self.attributes.insert(done.node_id, attributes);
                    self.rebuild_index_for_node(done.node_id);
                    if self.inventory_ready {
                        self.publish_devices().await;
                    }
                }
            }
            ReadPurpose::Commission => {
                if let Ok(attributes) = done.result {
                    self.attributes.insert(done.node_id, attributes);
                    self.rebuild_index_for_node(done.node_id);
                } else if let Err(error) = &done.result {
                    warn!(
                        error = %error,
                        node_id = done.node_id,
                        "wildcard read failed after commission"
                    );
                }
                self.publish_joined_node(done.node_id).await;
                self.subscribe_nodes(attr_tx.clone());
            }
        }
    }

    async fn publish_joined_node(&mut self, node_id: u64) {
        if self.reads.ignored(node_id) {
            return;
        }
        self.ensure_node_in_index(node_id);
        if !self.inventory_ready {
            if !self.pending_joins.contains(&node_id) {
                self.pending_joins.push(node_id);
            }
            return;
        }
        let published = self.node_device_count(node_id);
        info!(
            node_id,
            devices = published,
            "publishing commissioned Matter node"
        );
        self.publish_devices().await;
        self.publish_joins_for_node(node_id).await;
        if published == 0 {
            self.mqtt
                .event(
                    "device_interview",
                    json!({
                        "ieee_address": "commissioning",
                        "status": "failed",
                        "error": "The device connected but did not appear on the controller.",
                    }),
                )
                .await;
            return;
        }
        publish_progress(&self.mqtt, "connected", "Connected").await;
    }

    fn forget_later(&self, node_id: u64) {
        let controller = self.controller.clone();
        tokio::spawn(async move {
            match tokio::time::timeout(FORGET_NODE_TIMEOUT, controller.forget_node(node_id)).await {
                Ok(Ok(_)) => {}
                Ok(Err(error)) => {
                    warn!(error = %error, node_id, "forget_node failed; dropping locally")
                }
                Err(_) => warn!(node_id, "forget_node timed out; dropping locally"),
            }
        });
    }

    async fn drop_unreachable_nodes(&mut self, node_ids: &[u64]) {
        for node_id in unique_front(node_ids.iter().copied()) {
            info!(node_id, "forgetting unreachable Matter node");
            self.forget_later(node_id);
            self.adopted.remove(node_id);
        }
        if self.index.is_empty() {
            return;
        }
        let live: HashSet<u64> = self.index.values().map(|entry| entry.node_id).collect();
        let leftover: Vec<u64> = self.adopted.ids().filter(|id| !live.contains(id)).collect();
        for node_id in leftover {
            info!(node_id, "dropping adopted id with no live device");
            self.adopted.remove(node_id);
        }
    }

    fn ensure_node_in_index(&mut self, node_id: u64) {
        if self.node_device_count(node_id) > 0 {
            return;
        }
        self.attributes.entry(node_id).or_default();
        self.rebuild_index_for_node(node_id);
    }

    fn node_device_count(&self, node_id: u64) -> usize {
        self.index
            .values()
            .filter(|entry| entry.node_id == node_id)
            .count()
    }

    fn rebuild_index_for_node(&mut self, node_id: u64) {
        let key = node_id.to_string();
        let attributes = self.attributes.get(&node_id).cloned().unwrap_or_default();
        let mut devices = map_node_with_fallback(&key, &attributes);
        if devices.is_empty() {
            devices.push(placeholder_device(&key));
        }
        for device in &mut devices {
            if let Some(outlets) = &mut device.outlets {
                for outlet in outlets {
                    let outlet_key = format!("{}#{}", key, outlet.endpoint_id);
                    if let Some(name) = self.names.get(&outlet_key) {
                        outlet.name = name.to_string();
                    }
                }
            }
        }
        self.index.retain(|_, entry| entry.node_id != node_id);
        for device in devices {
            let id = device.id.clone();
            self.index.insert(id, Indexed { device, node_id });
        }
        for leftover in collapsed_legacy_ids(&key, &attributes) {
            if self.published_leaves.insert(leftover.clone()) {
                let mqtt = self.mqtt.clone();
                tokio::spawn(async move {
                    mqtt.event("device_leave", json!({ "ieee_address": leftover }))
                        .await;
                });
            }
        }
    }

    fn subscribe_nodes(&mut self, tx: tokio::sync::mpsc::UnboundedSender<IncomingMessage>) {
        let node_ids: HashSet<u64> = self.index.values().map(|entry| entry.node_id).collect();
        for node_id in node_ids {
            if !self.subscribed.insert(node_id) {
                continue;
            }
            let node = self.controller.node(node_id);
            let tx = tx.clone();
            tokio::spawn(async move {
                let mut sub = match node.subscribe(&[ReadPath::all()], &[], 1, 30).await {
                    Ok(sub) => sub,
                    Err(error) => {
                        warn!(error = %error, node_id, "subscribe failed");
                        let _ = tx.send(IncomingMessage::SubscribeEnded { node_id });
                        return;
                    }
                };
                while let Some(event) = sub.next().await {
                    if let SubscriptionEvent::Report(change) = event {
                        let _ = tx.send(IncomingMessage::AttributeChange {
                            node_id,
                            endpoint: change.path.endpoint,
                            cluster: change.path.cluster,
                            attribute: change.path.attribute,
                            value: value_to_json(&change.value),
                        });
                    }
                }
                let _ = tx.send(IncomingMessage::SubscribeEnded { node_id });
            });
        }
    }

    async fn apply_attribute_change(&mut self, message: IncomingMessage) {
        let IncomingMessage::AttributeChange {
            node_id,
            endpoint,
            cluster,
            attribute,
            value,
        } = message
        else {
            return;
        };
        let key = format!("{endpoint}/{cluster}/{attribute}");
        if cluster == u32::from(CLUSTER_DESCRIPTOR) {
            self.reads.enqueue(node_id, ReadPurpose::Descriptor);
            return;
        }
        if !is_state_attribute_path(&key) {
            return;
        }
        self.attributes
            .entry(node_id)
            .or_default()
            .insert(key, value);
        self.rebuild_index_for_node(node_id);
        let fresh_meter = cluster == u32::from(CLUSTER_ELECTRICAL_POWER)
            || cluster == u32::from(CLUSTER_ELECTRICAL_ENERGY);
        let ids: Vec<String> = self
            .index
            .iter()
            .filter(|(_, entry)| entry.node_id == node_id)
            .map(|(id, _)| id.clone())
            .collect();
        for id in ids {
            self.publish_state(&id, fresh_meter).await;
        }
    }

    async fn publish_devices(&self) {
        let mut descriptors = Vec::new();
        for (id, entry) in &self.index {
            let name = self
                .names
                .get(id)
                .unwrap_or(entry.device.default_name.as_str());
            descriptors.push(device_descriptor(&entry.device, name));
        }
        self.mqtt
            .publish_json("bridge/devices", &JsonValue::Array(descriptors), true)
            .await;
        for id in self.index.keys() {
            self.publish_state(id, false).await;
            self.mqtt
                .publish_json(
                    &format!("{id}/availability"),
                    &json!({ "state": "online" }),
                    true,
                )
                .await;
        }
    }

    async fn publish_state(&self, id: &str, fresh_meter: bool) {
        let Some(entry) = self.index.get(id) else {
            return;
        };
        let device = entry.device.clone();
        let attributes = self
            .attributes
            .get(&entry.node_id)
            .cloned()
            .unwrap_or_default();
        let state = state_for_device(&device, &attributes);
        self.mqtt.publish_json(id, &state, true).await;
        self.publish_meter(id, &device, &attributes, fresh_meter)
            .await;
    }

    async fn publish_meter(
        &self,
        id: &str,
        device: &EndpointDevice,
        attributes: &Attributes,
        fresh_meter: bool,
    ) {
        let capability_ids = self
            .capability_ids
            .lock()
            .expect("capability id map poisoned")
            .get(id)
            .cloned()
            .unwrap_or_default();
        let previous = self
            .meter_identities
            .lock()
            .expect("meter identity store poisoned")
            .get(id)
            .cloned();
        let Some(probe) = meter_publication(
            device,
            attributes,
            "1970-01-01T00:00:00Z",
            "probe",
            &capability_ids,
        ) else {
            if previous.is_some() {
                self.meter_identities
                    .lock()
                    .expect("meter identity store poisoned")
                    .remove(id);
                self.mqtt
                    .publish(&format!("{id}/capabilities"), "", true)
                    .await;
                self.mqtt
                    .publish(&format!("{id}/observations"), "", true)
                    .await;
            }
            return;
        };
        let reuses_envelope = previous
            .as_ref()
            .is_some_and(|published| published.fingerprint == probe.fingerprint && !fresh_meter);
        let stamp = if reuses_envelope {
            observation_stamp(id, 0, None, previous.as_ref(), &probe.fingerprint, false)
        } else {
            let Some(now) = SystemTime::now().duration_since(UNIX_EPOCH).ok() else {
                warn!(
                    device_id = id,
                    "skipped meter observation because the clock is unavailable"
                );
                self.mqtt
                    .publish_json(&format!("{id}/capabilities"), &probe.manifest, true)
                    .await;
                return;
            };
            let sequence = self
                .meter_identities
                .lock()
                .expect("meter identity store poisoned")
                .next_sequence();
            let observed_unix = fresh_observed_unix(device, attributes, now.as_secs());
            observation_stamp(
                id,
                sequence,
                Some((observed_unix, now.as_millis())),
                None,
                &probe.fingerprint,
                true,
            )
        };
        let Some(stamp) = stamp else {
            return;
        };
        let Some(publication) = meter_publication(
            device,
            attributes,
            &stamp.observed_at,
            &stamp.observation_id,
            &capability_ids,
        ) else {
            return;
        };
        let published = PublishedMeter {
            fingerprint: publication.fingerprint.clone(),
            observed_at: stamp.observed_at,
            observation_id: stamp.observation_id,
        };
        if previous.as_ref() != Some(&published) {
            self.meter_identities
                .lock()
                .expect("meter identity store poisoned")
                .insert(id, published);
        }
        self.mqtt
            .publish_json(&format!("{id}/capabilities"), &publication.manifest, true)
            .await;
        self.mqtt
            .publish_json(&format!("{id}/observations"), &publication.report, true)
            .await;
    }

    fn store_capability_ids(&self, device_id: &str, payload: &JsonValue) {
        let assigned = assigned_capability_ids(payload);
        if assigned.is_empty() {
            return;
        }
        self.capability_ids
            .lock()
            .expect("capability id map poisoned")
            .insert(device_id.to_string(), assigned);
    }

    async fn publish_joins_for_node(&self, node_id: u64) {
        for (id, entry) in &self.index {
            if entry.node_id != node_id {
                continue;
            }
            let name = self
                .names
                .get(id)
                .unwrap_or(entry.device.default_name.as_str());
            self.mqtt
                .event(
                    "device_joined",
                    json!({ "friendly_name": name, "ieee_address": id }),
                )
                .await;
            self.mqtt
                .event(
                    "device_interview",
                    json!({
                        "friendly_name": name,
                        "ieee_address": id,
                        "status": "successful",
                        "supported": true,
                        "type": crate::mapping::descriptor_type(entry.device.kind),
                        "definition": { "model": entry.device.model, "description": entry.device.description }
                    }),
                )
                .await;
            self.publish_state(id, false).await;
        }
        let count = self
            .index
            .values()
            .filter(|entry| entry.node_id == node_id)
            .count();
        info!(node_id, devices = count, "published Matter device joins");
    }

    async fn drop_node(&mut self, node_id: u64) {
        let ids: Vec<String> = self
            .index
            .iter()
            .filter(|(_, entry)| entry.node_id == node_id)
            .map(|(id, _)| id.clone())
            .collect();
        self.index.retain(|_, entry| entry.node_id != node_id);
        self.attributes.remove(&node_id);
        self.subscribed.remove(&node_id);
        for id in &ids {
            self.mqtt
                .event("device_leave", json!({ "ieee_address": id }))
                .await;
            self.mqtt.publish(id, "", true).await;
            self.mqtt
                .publish(&format!("{id}/availability"), "", true)
                .await;
            self.mqtt
                .publish(&format!("{id}/capabilities"), "", true)
                .await;
            self.mqtt
                .publish(&format!("{id}/observations"), "", true)
                .await;
            self.meter_identities
                .lock()
                .expect("meter identity store poisoned")
                .remove(id);
            self.capability_ids
                .lock()
                .expect("capability id map poisoned")
                .remove(id);
        }
        let keep: HashSet<String> = self.index.keys().cloned().collect();
        self.names.retain_only(&keep);
        if self.inventory_ready {
            self.publish_devices().await;
        }
    }

    fn note_subscribe_ended(
        &mut self,
        node_id: u64,
        resub: &tokio::sync::mpsc::UnboundedSender<()>,
    ) {
        self.subscribed.remove(&node_id);
        schedule_subscribe_retry(resub.clone());
    }
}

async fn publish_progress(mqtt: &MqttBus, stage: &str, message: &str) {
    mqtt.event(
        "commission_progress",
        json!({ "stage": stage, "message": message }),
    )
    .await;
    mqtt.event(
        "device_interview",
        json!({
            "ieee_address": "commissioning",
            "status": "started",
            "message": message,
        }),
    )
    .await;
}

async fn commission_device(
    controller: &MatterController,
    mqtt: &MqttBus,
    cancel: &AtomicBool,
    code: &str,
    wifi_ssid: Option<String>,
    wifi_password: String,
    known: HashSet<u64>,
) -> Result<JoinedNode, String> {
    if cancel.load(Ordering::SeqCst) {
        return Err("pairing was cancelled".into());
    }

    publish_progress(mqtt, "connecting", "Connecting securely").await;

    // New devices are not on the LAN yet. If the user gave home Wi-Fi,
    // commission over BLE first so we do not wait out mDNS.
    if let Some(ssid) = wifi_ssid.as_deref() {
        info!(network = ssid, "commissioning over BLE with home Wi-Fi");
        publish_progress(mqtt, "wifi", "Sending your Wi-Fi details").await;
        let wifi = WiFiCredentials {
            ssid: ssid.as_bytes().to_vec(),
            credentials: wifi_password.as_bytes().to_vec(),
        };
        match controller
            .commission_ble(code, NetworkCredentials::WiFi(wifi), None)
            .await
        {
            Ok(info) => {
                publish_progress(mqtt, "joining", "Joining your home").await;
                return Ok(JoinedNode {
                    node_id: info.node_id,
                    attributes: None,
                });
            }
            Err(error) => {
                let raw = error.to_string();
                if is_attestation_error(&raw) {
                    return Err(human_commission_error(&raw));
                }
                if is_session_error(&raw) {
                    let hints = node_ids_from_mdns_error(&raw);
                    let candidates = ble_recover_node_ids(&known, &hints);
                    info!(
                        ?candidates,
                        error = %raw,
                        "BLE CASE timed out; recovering over the operational network"
                    );
                    tokio::time::sleep(Duration::from_secs(2)).await;
                    return recover_operational_session(
                        controller,
                        mqtt,
                        cancel,
                        &candidates,
                        true,
                    )
                    .await;
                }
                info!(error = %raw, "BLE commission failed; trying on-network");
            }
        }
    }

    if cancel.load(Ordering::SeqCst) {
        return Err("pairing was cancelled".into());
    }

    match controller.commission(code, None).await {
        Ok(info) => {
            publish_progress(mqtt, "joining", "Joining your home").await;
            return Ok(JoinedNode {
                node_id: info.node_id,
                attributes: None,
            });
        }
        Err(error) => {
            info!(error = %error, "on-network commission failed");
        }
    }

    if wifi_ssid.is_some() {
        return Err("Put the device back in pairing mode and keep it near the controller.".into());
    }
    Err(
        "Put the device back in pairing mode and try again. If it is new, enter your 2.4 GHz home Wi-Fi."
            .into(),
    )
}

const GENERAL_COMMISSIONING_CLUSTER: u32 = 0x0030;
const COMMISSIONING_COMPLETE_COMMAND: u32 = 0x04;
const CASE_RECOVER_ATTEMPTS: u32 = 8;
const CASE_RECOVER_GAP: Duration = Duration::from_secs(5);
const CASE_READ_TIMEOUT: Duration = Duration::from_secs(35);
const CASE_COMPLETE_TIMEOUT: Duration = Duration::from_secs(8);
const REFRESH_AFTER_COMMISSION_ATTEMPTS: u32 = 5;
const REFRESH_AFTER_COMMISSION_GAP: Duration = Duration::from_secs(2);
const REFRESH_READ_TIMEOUT: Duration = Duration::from_secs(35);
const DESCRIPTOR_REFRESH_TIMEOUT: Duration = Duration::from_secs(5);
const SUBSCRIBE_RETRY_GAP: Duration = Duration::from_secs(5);
const FORGET_NODE_TIMEOUT: Duration = Duration::from_secs(8);

fn schedule_subscribe_retry(tx: tokio::sync::mpsc::UnboundedSender<()>) {
    tokio::spawn(async move {
        tokio::time::sleep(SUBSCRIBE_RETRY_GAP).await;
        let _ = tx.send(());
    });
}

async fn recover_operational_session(
    controller: &MatterController,
    mqtt: &MqttBus,
    cancel: &AtomicBool,
    node_ids: &[u64],
    announce: bool,
) -> Result<JoinedNode, String> {
    if announce {
        publish_progress(mqtt, "joining", "Waiting for the device on your network").await;
    }
    let mut candidates = unique_front(node_ids.iter().copied());
    if candidates.is_empty() {
        return Err(human_commission_error("CASE session establishment failed"));
    }
    for attempt in 1..=CASE_RECOVER_ATTEMPTS {
        if cancel.load(Ordering::SeqCst) {
            return Err("pairing was cancelled".into());
        }
        let mut index = 0;
        while index < candidates.len() {
            if cancel.load(Ordering::SeqCst) {
                return Err("pairing was cancelled".into());
            }
            let node_id = candidates[index];
            info!(node_id, attempt, "recovering operational CASE");
            let node = controller.node(node_id);
            match tokio::time::timeout(CASE_READ_TIMEOUT, node.read(&[ReadPath::all()])).await {
                Ok(Ok(report)) => {
                    match tokio::time::timeout(
                        CASE_COMPLETE_TIMEOUT,
                        node.invoke(
                            CommandPath {
                                endpoint: 0,
                                cluster: GENERAL_COMMISSIONING_CLUSTER,
                                command: COMMISSIONING_COMPLETE_COMMAND,
                            },
                            empty_structure(),
                        ),
                    )
                    .await
                    {
                        Ok(Ok(_)) => info!(node_id, "sent CommissioningComplete"),
                        Ok(Err(error)) => {
                            warn!(error = %error, node_id, "CommissioningComplete failed")
                        }
                        Err(_) => warn!(node_id, "CommissioningComplete timed out"),
                    }
                    return Ok(JoinedNode {
                        node_id,
                        attributes: Some(attributes_from_report(report)),
                    });
                }
                Ok(Err(error)) => {
                    let raw = error.to_string();
                    warn!(
                        node_id,
                        attempt,
                        error = %raw,
                        "operational CASE not ready"
                    );
                    let hints = node_ids_from_mdns_error(&raw);
                    if let Some(hint) = hints.first().copied()
                        && hint != node_id
                    {
                        info!(hint, "mDNS advertised a different node; trying it next");
                        promote_node(&mut candidates, index, hint);
                        continue;
                    }
                    if is_case_rejected(&raw) {
                        // Device is on the LAN but CASE was refused (often
                        // NoSharedTrustRoots while Wi-Fi/IPK is still settling).
                        // Stay on this id — walking stale nodes loses the window.
                        candidates = vec![node_id];
                        break;
                    }
                    index += 1;
                }
                Err(_) => {
                    warn!(node_id, attempt, "operational CASE read timed out");
                    index += 1;
                }
            }
        }
        tokio::time::sleep(CASE_RECOVER_GAP).await;
    }
    Err(human_commission_error("CASE session establishment failed"))
}

fn promote_node(candidates: &mut Vec<u64>, index: usize, node_id: u64) {
    if let Some(pos) = candidates.iter().position(|&id| id == node_id) {
        if pos == index {
            return;
        }
        candidates.remove(pos);
        let insert_at = if pos < index { index - 1 } else { index };
        candidates.insert(insert_at, node_id);
    } else {
        candidates.insert(index, node_id);
    }
}

async fn read_node_attributes(
    controller: &MatterController,
    node_id: u64,
    timeout: Duration,
) -> Result<Attributes, String> {
    let node = controller.node(node_id);
    match tokio::time::timeout(timeout, node.read(&[ReadPath::all()])).await {
        Ok(Ok(report)) => Ok(attributes_from_report(report)),
        Ok(Err(error)) => Err(error.to_string()),
        Err(_) => Err("wildcard read timed out".into()),
    }
}

async fn read_node_with_retries(
    controller: &MatterController,
    node_id: u64,
) -> Result<Attributes, String> {
    let mut last = "wildcard read failed".to_string();
    for attempt in 1..=REFRESH_AFTER_COMMISSION_ATTEMPTS {
        match read_node_attributes(controller, node_id, REFRESH_READ_TIMEOUT).await {
            Ok(attributes) => return Ok(attributes),
            Err(error) => {
                last = error;
                if attempt < REFRESH_AFTER_COMMISSION_ATTEMPTS {
                    warn!(node_id, attempt, "retrying wildcard read after commission");
                    tokio::time::sleep(REFRESH_AFTER_COMMISSION_GAP).await;
                }
            }
        }
    }
    Err(last)
}

fn attributes_from_report(report: Vec<(AttributePath, Value)>) -> Attributes {
    let mut attributes = Attributes::new();
    for (path, value) in report {
        let key = format!("{}/{}/{}", path.endpoint, path.cluster, path.attribute);
        attributes.insert(key, value_to_json(&value));
    }
    attributes
}

fn target_endpoints(device: &EndpointDevice, payload: &Map<String, JsonValue>) -> Vec<u16> {
    if let Some(outlet) = outlet_id_from_set(payload)
        && device_covers_endpoint(device, outlet)
    {
        return vec![outlet];
    }
    if let Some(outlets) = &device.outlets {
        return outlets.iter().map(|outlet| outlet.endpoint_id).collect();
    }
    vec![device.endpoint_id]
}

fn count_der_files(dir: &std::path::Path) -> usize {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return 0;
    };
    entries
        .flatten()
        .filter(|entry| entry.path().extension().and_then(|ext| ext.to_str()) == Some("der"))
        .count()
}

fn is_attestation_error(raw: &str) -> bool {
    let lower = raw.to_ascii_lowercase();
    lower.contains("attest") || lower.contains("paa") || lower.contains("dac")
}

fn is_session_error(raw: &str) -> bool {
    let lower = raw.to_ascii_lowercase();
    lower.contains("case session")
        || lower.contains("btp handshake")
        || lower.contains("session establishment")
}

fn is_case_rejected(raw: &str) -> bool {
    raw.to_ascii_lowercase()
        .contains("session establishment rejected")
}

fn human_commission_error(raw: &str) -> String {
    let lower = raw.to_ascii_lowercase();
    if lower.contains("wifi") || lower.contains("ssid") || lower.contains("associat") {
        return "Use the 2.4 GHz network, not 5 GHz, and try again.".into();
    }
    if lower.contains("case session")
        || lower.contains("btp handshake")
        || lower.contains("session establishment")
    {
        return "The device was found but did not finish joining. Put it back in pairing mode and keep it near the controller.".into();
    }
    if lower.contains("timeout") || lower.contains("timed out") {
        return "Pairing timed out. Put the device back in pairing mode and keep it near the controller.".into();
    }
    if lower.contains("attest") || lower.contains("paa") || lower.contains("dac") {
        return "This device could not be verified. Check that Nemu has Matter trust roots installed.".into();
    }
    "Put the device back in pairing mode and try again.".into()
}

impl Drop for MatterService {
    fn drop(&mut self) {
        let mqtt = self.mqtt.clone();
        tokio::spawn(async move {
            mqtt.set_online(false).await;
        });
    }
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use super::{ReadPurpose, ReadScheduler};

    #[tokio::test(start_paused = true)]
    async fn unpair_is_accepted_while_a_node_read_is_outstanding() {
        let mut reads = ReadScheduler::default();
        reads.enqueue(1, ReadPurpose::Boot);
        reads.enqueue(2, ReadPurpose::Boot);
        let started = tokio::time::Instant::now();
        assert!(reads.poll().is_some());

        let (tx, mut rx) = tokio::sync::oneshot::channel();
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_secs(35)).await;
            let _ = tx.send(());
        });

        reads.cancel(1);
        assert!(reads.ignored(1));
        assert!(
            started.elapsed() < Duration::from_secs(15),
            "unpair waited for the wildcard read"
        );
        assert!(rx.try_recv().is_err());
        assert!(
            reads.poll().is_none(),
            "the in-flight read is still outstanding"
        );
        assert!(!reads.finish(1, ReadPurpose::Boot));
        assert!(reads.poll().is_some());
        assert!(reads.finish(2, ReadPurpose::Boot));
    }
}
