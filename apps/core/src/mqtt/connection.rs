use std::collections::HashMap;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use rumqttc::{AsyncClient, Event, Incoming, MqttOptions, QoS, Transport};
use serde_json::{Value as JsonValue, json};
use tokio::sync::{Mutex, oneshot};
use tracing::{debug, error, info, warn};
use uuid::Uuid;

use crate::config::{BridgeConfig, Config, Protocol};
use crate::db::models::Device;
use crate::devices::registry::log_event;
use crate::events::{DeviceEvent, InterviewStatus};
use crate::mqtt::z2m::{
    self, IncomingTopic, commission_cancel_topic, commission_topic, get_state_payload, get_topic,
    health_check_topic, parse_availability, parse_bridge_event, parse_bridge_response,
    parse_bridge_state, parse_devices_payload, parse_topic, permit_join_payload, permit_join_topic,
    remove_payload, remove_topic, rename_payload, rename_topic, set_topic,
};
use crate::state::AppState;

const STATE_REFRESH_GAP: Duration = Duration::from_millis(75);
const BRIDGE_RESPONSE_TIMEOUT: Duration = Duration::from_secs(15);

type PendingResponse = oneshot::Sender<Result<JsonValue, String>>;

/// The MQTT topic segment core addresses a device by: z2m routes by friendly
/// name, the matter bridge routes by external id (`nodeId` for strips and
/// single endpoints, `nodeId:endpoint` when a node is still split) because
/// Matter has no bridge-side friendly names.
pub fn device_topic_id(device: &Device) -> &str {
    match device_protocol(device) {
        Protocol::Zigbee => &device.friendly_name,
        Protocol::Matter => &device.external_id,
    }
}

pub fn device_protocol(device: &Device) -> Protocol {
    Protocol::parse(&device.protocol).unwrap_or(Protocol::Zigbee)
}

#[derive(Clone)]
pub struct MqttHandle {
    client: AsyncClient,
    bridges: Arc<Vec<BridgeConfig>>,
    pending_responses: Arc<Mutex<HashMap<String, PendingResponse>>>,
    refreshing_state: Arc<AtomicBool>,
}

impl MqttHandle {
    pub fn base_topic(&self, protocol: Protocol) -> Result<&str, String> {
        self.bridges
            .iter()
            .find(|bridge| bridge.protocol == protocol)
            .map(|bridge| bridge.base_topic.as_str())
            .ok_or_else(|| format!("{protocol} bridge is not configured"))
    }

    /// Match an incoming topic to the bridge it belongs to.
    pub fn bridge_for_topic(&self, topic: &str) -> Option<&BridgeConfig> {
        self.bridges.iter().find(|bridge| {
            topic == bridge.base_topic
                || topic
                    .strip_prefix(bridge.base_topic.as_str())
                    .is_some_and(|rest| rest.starts_with('/'))
        })
    }

    pub async fn publish_set(
        &self,
        protocol: Protocol,
        topic_id: &str,
        payload: &JsonValue,
    ) -> Result<(), String> {
        let topic = set_topic(self.base_topic(protocol)?, topic_id);
        let body = payload.to_string();
        self.client
            .publish(topic, QoS::AtLeastOnce, false, body)
            .await
            .map_err(|e| e.to_string())
    }

    pub async fn permit_join(&self, seconds: u32) -> Result<(), String> {
        let topic = permit_join_topic(self.base_topic(Protocol::Zigbee)?);
        let body = permit_join_payload(seconds);
        self.client
            .publish(topic, QoS::AtLeastOnce, false, body)
            .await
            .map_err(|e| e.to_string())
    }

    pub async fn rename_device(
        &self,
        protocol: Protocol,
        from: &str,
        to: &str,
    ) -> Result<(), String> {
        let topic = rename_topic(self.base_topic(protocol)?);
        let body = rename_payload(from, to);
        self.client
            .publish(topic, QoS::AtLeastOnce, false, body)
            .await
            .map_err(|e| e.to_string())
    }

    pub async fn remove_device(&self, protocol: Protocol, external_id: &str) -> Result<(), String> {
        let topic = remove_topic(self.base_topic(protocol)?);
        let transaction = Uuid::new_v4().to_string();
        let body = remove_payload(external_id, &transaction);
        self.request_with_transaction(topic, body, transaction)
            .await
            .map(|_| ())
            .map_err(|error| match protocol {
                Protocol::Zigbee if error == TIMEOUT_MARKER => {
                    "device removal timed out; wake the device and try again".into()
                }
                Protocol::Matter if error == TIMEOUT_MARKER => {
                    "unpairing timed out; check that the Matter service is running".into()
                }
                _ => error,
            })
    }

    /// Ask nemu-matter to commission a device with a pairing code.
    /// Resolves on the service ack; the join itself arrives as bridge events.
    pub async fn commission(&self, payload: JsonValue) -> Result<JsonValue, String> {
        let topic = commission_topic(self.base_topic(Protocol::Matter)?);
        let transaction = Uuid::new_v4().to_string();
        let mut body = payload;
        body["transaction"] = JsonValue::String(transaction.clone());
        self.request_with_transaction(topic, body.to_string(), transaction)
            .await
            .map_err(|error| {
                if error == TIMEOUT_MARKER {
                    "the Matter service did not respond; check that it is running".into()
                } else {
                    error
                }
            })
    }

    /// Ask the matter bridge to abort an in-flight commission.
    pub async fn cancel_commission(&self) -> Result<JsonValue, String> {
        let topic = match self.base_topic(Protocol::Matter) {
            Ok(base) => commission_cancel_topic(base),
            Err(_) => return Ok(json!({ "status": "ok" })),
        };
        let transaction = Uuid::new_v4().to_string();
        let body = json!({ "transaction": transaction }).to_string();
        self.request_with_transaction(topic, body, transaction)
            .await
            .map_err(|error| {
                if error == TIMEOUT_MARKER {
                    "the Matter service did not respond; check that it is running".into()
                } else {
                    error
                }
            })
    }

    async fn request_with_transaction(
        &self,
        topic: String,
        body: String,
        transaction: String,
    ) -> Result<JsonValue, String> {
        let (sender, receiver) = oneshot::channel();
        self.pending_responses
            .lock()
            .await
            .insert(transaction.clone(), sender);

        if let Err(error) = self
            .client
            .publish(topic, QoS::AtLeastOnce, false, body)
            .await
        {
            self.pending_responses.lock().await.remove(&transaction);
            return Err(error.to_string());
        }

        match tokio::time::timeout(BRIDGE_RESPONSE_TIMEOUT, receiver).await {
            Ok(Ok(result)) => result,
            Ok(Err(_)) => Err("bridge response channel closed".into()),
            Err(_) => {
                self.pending_responses.lock().await.remove(&transaction);
                Err(TIMEOUT_MARKER.into())
            }
        }
    }

    async fn resolve_bridge_response(&self, payload: &str) -> Result<(), String> {
        let response = parse_bridge_response(payload).map_err(|error| error.to_string())?;
        let Some(transaction) = response.transaction else {
            return Ok(());
        };
        let Some(sender) = self.pending_responses.lock().await.remove(&transaction) else {
            return Ok(());
        };

        let result = if response.status == "ok" {
            Ok(response.data)
        } else {
            Err(response
                .error
                .unwrap_or_else(|| "the bridge rejected the request".into()))
        };
        let _ = sender.send(result);
        Ok(())
    }

    pub async fn request_bridge_health(&self) -> Result<(), String> {
        // z2m-only; the matter bridge publishes retained bridge/state itself.
        let topic = health_check_topic(self.base_topic(Protocol::Zigbee)?);
        self.client
            .publish(topic, QoS::AtLeastOnce, false, "{}")
            .await
            .map_err(|e| e.to_string())
    }

    pub async fn publish_get(&self, protocol: Protocol, topic_id: &str) -> Result<(), String> {
        let topic = get_topic(self.base_topic(protocol)?, topic_id);
        self.client
            .publish(topic, QoS::AtLeastOnce, false, get_state_payload())
            .await
            .map_err(|e| e.to_string())
    }

    /// Ask bridges to republish live state for devices that have no cached payload yet.
    pub fn spawn_state_refresh(&self, targets: Vec<(Protocol, String)>) {
        if targets.is_empty() {
            return;
        }
        if self.refreshing_state.swap(true, Ordering::SeqCst) {
            return;
        }

        let handle = self.clone();
        tokio::spawn(async move {
            for (protocol, topic_id) in targets {
                if let Err(error) = handle.publish_get(protocol, &topic_id).await {
                    debug!(%protocol, topic_id = %topic_id, %error, "failed to refresh device state");
                }
                tokio::time::sleep(STATE_REFRESH_GAP).await;
            }
            handle.refreshing_state.store(false, Ordering::SeqCst);
        });
    }

    async fn subscribe_all(&self) -> Result<(), String> {
        for bridge in self.bridges.iter() {
            let topic = format!("{}/#", bridge.base_topic);
            self.client
                .subscribe(topic, QoS::AtLeastOnce)
                .await
                .map_err(|e| e.to_string())?;
        }
        Ok(())
    }
}

const TIMEOUT_MARKER: &str = "__bridge_response_timeout__";

pub fn create_client(config: &Config) -> (MqttHandle, rumqttc::EventLoop) {
    let mut opts = MqttOptions::new(
        config.mqtt_client_id.clone(),
        config.mqtt_host.clone(),
        config.mqtt_port,
    );
    opts.set_keep_alive(Duration::from_secs(30));
    opts.set_clean_session(true);
    // z2m publishes large retained payloads (bridge/info, bridge/devices can be
    // hundreds of KB); rumqttc's 10 KB default drops the connection on receipt.
    opts.set_max_packet_size(10 * 1024 * 1024, 1024 * 1024);
    // Ensure TCP transport (default).
    opts.set_transport(Transport::tcp());

    let (client, eventloop) = AsyncClient::new(opts, 64);
    let handle = MqttHandle {
        client,
        bridges: Arc::new(config.bridges.clone()),
        pending_responses: Arc::new(Mutex::new(HashMap::new())),
        refreshing_state: Arc::new(AtomicBool::new(false)),
    };
    (handle, eventloop)
}

/// Last-known online flag per bridge, used to detect offline→online edges.
#[derive(Debug, Default)]
struct BridgeOnlineFlags {
    zigbee: bool,
    matter: bool,
}

impl BridgeOnlineFlags {
    fn get(&self, protocol: Protocol) -> bool {
        match protocol {
            Protocol::Zigbee => self.zigbee,
            Protocol::Matter => self.matter,
        }
    }

    fn set(&mut self, protocol: Protocol, online: bool) {
        match protocol {
            Protocol::Zigbee => self.zigbee = online,
            Protocol::Matter => self.matter = online,
        }
    }
}

fn health_event(state: &AppState) -> DeviceEvent {
    DeviceEvent::Health {
        mqtt: state.health.mqtt(),
        zigbee: state.health.zigbee(),
        matter: state.health.matter(),
        db: true,
    }
}

pub fn spawn_mqtt_loop(state: AppState, mut eventloop: rumqttc::EventLoop) {
    tokio::spawn(async move {
        let mut backoff_ms: u64 = 500;
        let mut was_online = BridgeOnlineFlags::default();

        loop {
            match eventloop.poll().await {
                Ok(Event::Incoming(Incoming::ConnAck(_))) => {
                    info!("mqtt connected");
                    state.health.set_mqtt(true);
                    backoff_ms = 500;

                    if let Err(e) = state.mqtt.subscribe_all().await {
                        error!(error = %e, "failed to subscribe to bridge topics");
                    } else if let Err(e) = state.mqtt.request_bridge_health().await {
                        warn!(error = %e, "failed to ping zigbee2mqtt health");
                    }

                    state.emit(health_event(&state));
                }
                Ok(Event::Incoming(Incoming::Publish(publish))) => {
                    let topic = publish.topic.clone();
                    let payload = String::from_utf8_lossy(&publish.payload).to_string();
                    if let Err(e) = handle_publish(&state, &topic, &payload, &mut was_online).await
                    {
                        if state
                            .mqtt
                            .bridge_for_topic(&topic)
                            .is_some_and(|bridge| bridge.protocol == Protocol::Matter)
                        {
                            warn!(topic = %topic, error = %e, "mqtt message handling error");
                        } else {
                            debug!(topic = %topic, error = %e, "mqtt message handling error");
                        }
                    }
                }
                Ok(Event::Incoming(Incoming::Disconnect)) => {
                    warn!("mqtt broker disconnected");
                    state.health.set_mqtt(false);
                    state.emit(health_event(&state));
                }
                Ok(_) => {}
                Err(e) => {
                    error!(error = %e, "mqtt event loop error; reconnecting");
                    state.health.set_mqtt(false);
                    state.health.set_bridge(Protocol::Zigbee, false);
                    state.health.set_bridge(Protocol::Matter, false);
                    state.emit(health_event(&state));
                    tokio::time::sleep(Duration::from_millis(backoff_ms)).await;
                    backoff_ms = (backoff_ms.saturating_mul(2)).min(30_000);
                }
            }
        }
    });
}

/// Look up the device an incoming per-device topic refers to. z2m topics use
/// the friendly name; Matter topics use the external id.
async fn resolve_topic_device(
    state: &AppState,
    protocol: Protocol,
    segment: &str,
) -> Option<Device> {
    match protocol {
        Protocol::Zigbee => state.registry.get_by_name(protocol, segment).await,
        Protocol::Matter => state.registry.get_by_external(protocol, segment).await,
    }
}

async fn handle_publish(
    state: &AppState,
    topic: &str,
    payload: &str,
    was_online: &mut BridgeOnlineFlags,
) -> Result<(), String> {
    let Some(bridge) = state.mqtt.bridge_for_topic(topic).cloned() else {
        return Ok(());
    };
    let protocol = bridge.protocol;

    match parse_topic(&bridge.base_topic, topic) {
        IncomingTopic::BridgeState => {
            let online = parse_bridge_state(payload).map_err(|e| e.to_string())?;
            let previously = was_online.get(protocol);
            state.health.set_bridge(protocol, online);
            was_online.set(protocol, online);

            state.emit(health_event(state));

            if online && !previously {
                info!(%protocol, "bridge came online; waiting for retained bridge/devices");
                if protocol == Protocol::Zigbee {
                    let _ = state.mqtt.request_bridge_health().await;
                }
                state.emit(DeviceEvent::Resync);
            }
            Ok(())
        }
        IncomingTopic::BridgeDevices => {
            let descriptors = parse_devices_payload(payload).map_err(|e| e.to_string())?;
            info!(
                %protocol,
                count = descriptors.len(),
                "syncing device registry from bridge/devices"
            );
            state
                .registry
                .sync_from_bridge(state, protocol, &descriptors)
                .await?;
            let stale: Vec<(Protocol, String)> = state
                .registry
                .list()
                .await
                .into_iter()
                .filter(|device| state.state_cache.get_state(device.id).is_none())
                .map(|device| {
                    (
                        device_protocol(&device),
                        device_topic_id(&device).to_string(),
                    )
                })
                .collect();
            state.mqtt.spawn_state_refresh(stale);
            state.emit(DeviceEvent::Resync);
            Ok(())
        }
        IncomingTopic::BridgeEvent => handle_bridge_event(state, protocol, payload).await,
        IncomingTopic::DeviceState { friendly_name } => {
            handle_device_state(state, protocol, &friendly_name, payload).await
        }
        IncomingTopic::DeviceAvailability { friendly_name } => {
            let online = parse_availability(payload).map_err(|e| e.to_string())?;
            if let Some(device) = resolve_topic_device(state, protocol, &friendly_name).await {
                state.state_cache.set_online(device.id, online);
                if online {
                    state.registry.touch_last_seen(&state.db, device.id).await;
                }
            }
            Ok(())
        }
        IncomingTopic::BridgeResponse { endpoint } => {
            if endpoint == "device/remove"
                || endpoint == "commission"
                || endpoint == "commission/cancel"
            {
                state.mqtt.resolve_bridge_response(payload).await
            } else {
                Ok(())
            }
        }
        IncomingTopic::Ignored => Ok(()),
    }
}

async fn handle_bridge_event(
    state: &AppState,
    protocol: Protocol,
    payload: &str,
) -> Result<(), String> {
    let event = parse_bridge_event(payload).map_err(|e| e.to_string())?;

    if let Some((external_id, status)) = z2m::interview_status(&event.event_type, &event.data) {
        let error = event
            .data
            .get("error")
            .and_then(|value| value.as_str())
            .map(str::to_string);
        let message = event
            .data
            .get("message")
            .and_then(|value| value.as_str())
            .map(str::to_string);
        state.emit(DeviceEvent::Interview {
            external_id: external_id.clone(),
            status: status.clone(),
            error,
            message,
        });

        if external_id != "commissioning"
            && matches!(
                status,
                InterviewStatus::Successful | InterviewStatus::Started
            )
        {
            let friendly = event
                .data
                .get("friendly_name")
                .or_else(|| event.data.pointer("/device/friendly_name"))
                .and_then(|v| v.as_str())
                .unwrap_or(&external_id);
            let model = event
                .data
                .pointer("/device/definition/model")
                .or_else(|| event.data.get("model"))
                .and_then(|v| v.as_str());
            let device_type = event
                .data
                .pointer("/device/type")
                .or_else(|| event.data.get("type"))
                .and_then(|v| v.as_str())
                .unwrap_or("unknown");

            match state
                .registry
                .upsert_from_join(state, protocol, &external_id, friendly, device_type, model)
                .await
            {
                Ok(device) => {
                    info!(
                        %protocol,
                        external_id = %external_id,
                        "device joined"
                    );
                    let resource = state.registry.to_resource(state, &device).await;
                    state.emit(DeviceEvent::DeviceJoined { device: resource });
                }
                Err(error) => {
                    warn!(
                        %protocol,
                        external_id = %external_id,
                        error = %error,
                        "failed to upsert joined device"
                    );
                }
            }
        }
    }

    if event.event_type == "commission_progress" {
        let stage = event
            .data
            .get("stage")
            .and_then(|value| value.as_str())
            .unwrap_or("")
            .to_string();
        let message = event
            .data
            .get("message")
            .and_then(|value| value.as_str())
            .map(str::to_string);
        state.emit(DeviceEvent::CommissionProgress { stage, message });
    }

    if event.event_type == "device_leave" {
        let external_id = event
            .data
            .get("ieee_address")
            .or_else(|| event.data.pointer("/device/ieee_address"))
            .and_then(|v| v.as_str());
        if let Some(external_id) = external_id {
            let _ = state.registry.mark_left(state, protocol, external_id).await;
        }
    }

    Ok(())
}

async fn handle_device_state(
    state: &AppState,
    protocol: Protocol,
    topic_segment: &str,
    payload: &str,
) -> Result<(), String> {
    let value: JsonValue =
        serde_json::from_str(payload).map_err(|e| format!("invalid device state json: {e}"))?;

    let Some(device) = resolve_topic_device(state, protocol, topic_segment).await else {
        debug!(
            %protocol,
            topic_segment,
            "state for unknown device; waiting for registry sync"
        );
        return Ok(());
    };

    state.state_cache.set_state(device.id, value.clone());
    state.state_cache.set_online(device.id, true);
    state.registry.touch_last_seen(&state.db, device.id).await;

    let _ = log_event(
        &state.db,
        Some(device.id),
        "state",
        json!({ "state": value }),
    )
    .await;

    state.emit(DeviceEvent::DeviceState {
        device_id: device.id.to_string(),
        state: value,
    });
    Ok(())
}
