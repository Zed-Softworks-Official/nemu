use std::time::Duration;

use rumqttc::{AsyncClient, Event, Incoming, MqttOptions, QoS, Transport};
use serde_json::{Value as JsonValue, json};
use tracing::{debug, error, info, warn};

use crate::config::Config;
use crate::devices::registry::log_event;
use crate::events::{DeviceEvent, InterviewStatus};
use crate::mqtt::z2m::{
    self, IncomingTopic, devices_request_topic, parse_availability, parse_bridge_event,
    parse_bridge_state, parse_devices_payload, parse_topic, permit_join_payload, permit_join_topic,
    rename_payload, rename_topic, set_topic,
};
use crate::state::AppState;

#[derive(Clone)]
pub struct MqttHandle {
    client: AsyncClient,
    base_topic: String,
}

impl MqttHandle {
    pub fn base_topic(&self) -> &str {
        &self.base_topic
    }

    pub async fn publish_set(
        &self,
        friendly_name: &str,
        payload: &JsonValue,
    ) -> Result<(), String> {
        let topic = set_topic(&self.base_topic, friendly_name);
        let body = payload.to_string();
        self.client
            .publish(topic, QoS::AtLeastOnce, false, body)
            .await
            .map_err(|e| e.to_string())
    }

    pub async fn permit_join(&self, seconds: u32) -> Result<(), String> {
        let topic = permit_join_topic(&self.base_topic);
        let body = permit_join_payload(seconds);
        self.client
            .publish(topic, QoS::AtLeastOnce, false, body)
            .await
            .map_err(|e| e.to_string())
    }

    pub async fn rename_device(&self, from: &str, to: &str) -> Result<(), String> {
        let topic = rename_topic(&self.base_topic);
        let body = rename_payload(from, to);
        self.client
            .publish(topic, QoS::AtLeastOnce, false, body)
            .await
            .map_err(|e| e.to_string())
    }

    pub async fn request_device_list(&self) -> Result<(), String> {
        // Some z2m versions publish bridge/devices retained; also request explicitly.
        let topic = devices_request_topic(&self.base_topic);
        self.client
            .publish(topic, QoS::AtLeastOnce, false, "{}")
            .await
            .map_err(|e| e.to_string())
    }

    async fn subscribe_all(&self) -> Result<(), String> {
        let topic = format!("{}/#", self.base_topic);
        self.client
            .subscribe(topic, QoS::AtLeastOnce)
            .await
            .map_err(|e| e.to_string())
    }
}

pub fn create_client(config: &Config) -> (MqttHandle, rumqttc::EventLoop) {
    let mut opts = MqttOptions::new(
        config.mqtt_client_id.clone(),
        config.mqtt_host.clone(),
        config.mqtt_port,
    );
    opts.set_keep_alive(Duration::from_secs(30));
    opts.set_clean_session(true);
    // Ensure TCP transport (default).
    opts.set_transport(Transport::tcp());

    let (client, eventloop) = AsyncClient::new(opts, 64);
    let handle = MqttHandle {
        client,
        base_topic: config.mqtt_base_topic.clone(),
    };
    (handle, eventloop)
}

pub fn spawn_mqtt_loop(state: AppState, mut eventloop: rumqttc::EventLoop) {
    tokio::spawn(async move {
        let mut backoff_ms: u64 = 500;
        let mut was_zigbee_online = false;

        loop {
            match eventloop.poll().await {
                Ok(Event::Incoming(Incoming::ConnAck(_))) => {
                    info!("mqtt connected");
                    state.health.set_mqtt(true);
                    backoff_ms = 500;

                    if let Err(e) = state.mqtt.subscribe_all().await {
                        error!(error = %e, "failed to subscribe to zigbee2mqtt/#");
                    } else if let Err(e) = state.mqtt.request_device_list().await {
                        warn!(error = %e, "failed to request device list");
                    }

                    state.emit(DeviceEvent::Health {
                        mqtt: true,
                        zigbee: state.health.zigbee(),
                        db: true,
                    });
                }
                Ok(Event::Incoming(Incoming::Publish(publish))) => {
                    let topic = publish.topic.clone();
                    let payload = String::from_utf8_lossy(&publish.payload).to_string();
                    if let Err(e) = handle_publish(&state, &topic, &payload, &mut was_zigbee_online)
                        .await
                    {
                        debug!(topic = %topic, error = %e, "mqtt message handling error");
                    }
                }
                Ok(Event::Incoming(Incoming::Disconnect)) => {
                    warn!("mqtt broker disconnected");
                    state.health.set_mqtt(false);
                    state.emit(DeviceEvent::Health {
                        mqtt: false,
                        zigbee: state.health.zigbee(),
                        db: true,
                    });
                }
                Ok(_) => {}
                Err(e) => {
                    error!(error = %e, "mqtt event loop error; reconnecting");
                    state.health.set_mqtt(false);
                    state.health.set_zigbee(false);
                    state.emit(DeviceEvent::Health {
                        mqtt: false,
                        zigbee: false,
                        db: true,
                    });
                    tokio::time::sleep(Duration::from_millis(backoff_ms)).await;
                    backoff_ms = (backoff_ms.saturating_mul(2)).min(30_000);
                }
            }
        }
    });
}

async fn handle_publish(
    state: &AppState,
    topic: &str,
    payload: &str,
    was_zigbee_online: &mut bool,
) -> Result<(), String> {
    let base = state.mqtt.base_topic();
    match parse_topic(base, topic) {
        IncomingTopic::BridgeState => {
            let online = parse_bridge_state(payload).map_err(|e| e.to_string())?;
            let previously = *was_zigbee_online;
            state.health.set_zigbee(online);
            *was_zigbee_online = online;

            state.emit(DeviceEvent::Health {
                mqtt: state.health.mqtt(),
                zigbee: online,
                db: true,
            });

            if online && !previously {
                info!("zigbee2mqtt came online; requesting registry resync");
                let _ = state.mqtt.request_device_list().await;
                state.emit(DeviceEvent::Resync);
            }
            Ok(())
        }
        IncomingTopic::BridgeDevices => {
            let descriptors = parse_devices_payload(payload).map_err(|e| e.to_string())?;
            info!(count = descriptors.len(), "syncing device registry from bridge/devices");
            state
                .registry
                .sync_from_bridge(state, &descriptors)
                .await?;
            state.emit(DeviceEvent::Resync);
            Ok(())
        }
        IncomingTopic::BridgeEvent => {
            handle_bridge_event(state, payload).await
        }
        IncomingTopic::DeviceState { friendly_name } => {
            handle_device_state(state, &friendly_name, payload).await
        }
        IncomingTopic::DeviceAvailability { friendly_name } => {
            let online = parse_availability(payload).map_err(|e| e.to_string())?;
            if let Some(device) = state.registry.get_by_name(&friendly_name).await {
                state.state_cache.set_online(device.id, online);
                if online {
                    state.registry.touch_last_seen(&state.db, device.id).await;
                }
            }
            Ok(())
        }
        IncomingTopic::BridgeResponse | IncomingTopic::Ignored => Ok(()),
    }
}

async fn handle_bridge_event(state: &AppState, payload: &str) -> Result<(), String> {
    let event = parse_bridge_event(payload).map_err(|e| e.to_string())?;

    if let Some((ieee, status)) = z2m::interview_status(&event.event_type, &event.data) {
        state.emit(DeviceEvent::Interview {
            ieee_address: ieee.clone(),
            status: status.clone(),
        });

        if matches!(status, InterviewStatus::Successful | InterviewStatus::Started) {
            let friendly = event
                .data
                .get("friendly_name")
                .or_else(|| event.data.pointer("/device/friendly_name"))
                .and_then(|v| v.as_str())
                .unwrap_or(&ieee);
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

            if let Ok(device) = state
                .registry
                .upsert_from_join(state, &ieee, friendly, device_type, model)
                .await
            {
                let resource = state.registry.to_resource(state, &device).await;
                state.emit(DeviceEvent::DeviceJoined { device: resource });
            }
        }
    }

    if event.event_type == "device_leave" {
        let ieee = event
            .data
            .get("ieee_address")
            .or_else(|| event.data.pointer("/device/ieee_address"))
            .and_then(|v| v.as_str());
        if let Some(ieee) = ieee {
            let _ = state.registry.mark_left(state, ieee).await;
        }
    }

    Ok(())
}

async fn handle_device_state(
    state: &AppState,
    friendly_name: &str,
    payload: &str,
) -> Result<(), String> {
    let value: JsonValue =
        serde_json::from_str(payload).map_err(|e| format!("invalid device state json: {e}"))?;

    let Some(device) = state.registry.get_by_name(friendly_name).await else {
        debug!(friendly_name, "state for unknown device; waiting for registry sync");
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
