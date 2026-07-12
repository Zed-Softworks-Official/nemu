use std::env;

#[derive(Debug, Clone)]
pub struct Config {
    pub database_url: String,
    pub listen_addr: String,
    pub mqtt_host: String,
    pub mqtt_port: u16,
    pub mqtt_client_id: String,
    pub mqtt_base_topic: String,
}

impl Config {
    pub fn from_env() -> Self {
        Self {
            database_url: env::var("DATABASE_URL")
                .unwrap_or_else(|_| "postgres://nemu:nemu@localhost:5432/nemu".to_string()),
            listen_addr: env::var("NEMU_LISTEN_ADDR")
                .unwrap_or_else(|_| "0.0.0.0:6368".to_string()),
            mqtt_host: env::var("MQTT_HOST").unwrap_or_else(|_| "localhost".to_string()),
            mqtt_port: env::var("MQTT_PORT")
                .ok()
                .and_then(|p| p.parse().ok())
                .unwrap_or(1883),
            mqtt_client_id: env::var("MQTT_CLIENT_ID")
                .unwrap_or_else(|_| format!("nemu-core-{}", uuid::Uuid::new_v4())),
            mqtt_base_topic: env::var("MQTT_BASE_TOPIC")
                .unwrap_or_else(|_| "zigbee2mqtt".to_string()),
        }
    }
}
