use rumqttc::{AsyncClient, Event, Incoming, MqttOptions, QoS};
use serde_json::{Value, json};
use tokio::sync::mpsc;
use tracing::{error, info, warn};

use crate::config::Config;

#[derive(Debug, Clone)]
pub enum IncomingMessage {
    Commission { payload: Value },
    Cancel { payload: Value },
    Remove { payload: Value },
    Rename { payload: Value },
    Set { device_id: String, payload: Value },
    AttributeChange {
        node_id: u64,
        endpoint: u16,
        cluster: u32,
        attribute: u32,
        value: Value,
    },
}

#[derive(Clone)]
pub struct MqttBus {
    client: AsyncClient,
    base: String,
}

impl MqttBus {
    pub fn topic(&self, rest: &str) -> String {
        format!("{}/{}", self.base, rest)
    }

    pub async fn publish(&self, rest: &str, payload: &str, retain: bool) {
        if let Err(error) = self
            .client
            .publish(self.topic(rest), QoS::AtLeastOnce, retain, payload)
            .await
        {
            warn!(error = %error, topic = rest, "mqtt publish failed");
        }
    }

    pub async fn publish_json(&self, rest: &str, payload: &Value, retain: bool) {
        self.publish(rest, &payload.to_string(), retain).await;
    }

    pub async fn set_online(&self, online: bool) {
        self.publish_json(
            "bridge/state",
            &json!({ "state": if online { "online" } else { "offline" } }),
            true,
        )
        .await;
    }

    pub async fn respond(&self, endpoint: &str, transaction: Option<&str>, body: Value) {
        let mut payload = body;
        if let Some(object) = payload.as_object_mut()
            && let Some(transaction) = transaction
        {
            object.insert("transaction".into(), json!(transaction));
        }
        self.publish_json(&format!("bridge/response/{endpoint}"), &payload, false)
            .await;
    }

    pub async fn event(&self, event_type: &str, data: Value) {
        self.publish_json("bridge/event", &json!({ "type": event_type, "data": data }), false)
            .await;
    }
}

pub fn start(config: &Config) -> (MqttBus, mpsc::UnboundedReceiver<IncomingMessage>) {
    let mut options = MqttOptions::new(
        config.mqtt_client_id.clone(),
        config.mqtt_host.clone(),
        config.mqtt_port,
    );
    options.set_keep_alive(std::time::Duration::from_secs(30));
    options.set_max_packet_size(256 * 1024, 256 * 1024);
    options.set_clean_session(false);

    let (client, mut eventloop) = AsyncClient::new(options, 64);
    let bus = MqttBus {
        client: client.clone(),
        base: config.mqtt_base_topic.clone(),
    };
    let (tx, rx) = mpsc::unbounded_channel();
    let base = config.mqtt_base_topic.clone();

    tokio::spawn(async move {
        loop {
            match eventloop.poll().await {
                Ok(Event::Incoming(Incoming::ConnAck(_))) => {
                    info!("mqtt connected");
                    let filter = format!("{base}/#");
                    if let Err(error) = client.subscribe(filter, QoS::AtLeastOnce).await {
                        error!(error = %error, "failed to subscribe");
                    }
                }
                Ok(Event::Incoming(Incoming::Publish(publish))) => {
                    if let Some(message) = parse_incoming(&base, &publish.topic, &publish.payload) {
                        let _ = tx.send(message);
                    }
                }
                Ok(_) => {}
                Err(error) => {
                    error!(error = %error, "mqtt event loop error; reconnecting");
                    tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                }
            }
        }
    });

    (bus, rx)
}

fn parse_incoming(base: &str, topic: &str, payload: &[u8]) -> Option<IncomingMessage> {
    let prefix = format!("{base}/");
    let rest = topic.strip_prefix(&prefix)?;
    let body = String::from_utf8_lossy(payload);
    let value: Value = serde_json::from_str(&body).unwrap_or(Value::Null);

    if rest == "bridge/request/commission" {
        return Some(IncomingMessage::Commission { payload: value });
    }
    if rest == "bridge/request/commission/cancel" {
        return Some(IncomingMessage::Cancel { payload: value });
    }
    if rest == "bridge/request/device/remove" {
        return Some(IncomingMessage::Remove { payload: value });
    }
    if rest == "bridge/request/device/rename" {
        return Some(IncomingMessage::Rename { payload: value });
    }
    if let Some(device_id) = rest.strip_suffix("/set")
        && !device_id.contains('/')
    {
        return Some(IncomingMessage::Set {
            device_id: device_id.to_string(),
            payload: value,
        });
    }
    None
}

pub fn transaction_of(payload: &Value) -> Option<&str> {
    payload.get("transaction").and_then(Value::as_str)
}
