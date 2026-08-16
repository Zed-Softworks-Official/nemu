use std::env;

fn env_truthy(name: &str, default: bool) -> bool {
    match env::var(name) {
        Ok(value) => matches!(
            value.trim(),
            "1" | "true" | "TRUE" | "yes" | "YES" | "on" | "ON"
        ),
        Err(_) => default,
    }
}

#[derive(Debug, Clone)]
pub struct Config {
    pub database_url: String,
    pub listen_addr: String,
    pub mqtt_host: String,
    pub mqtt_port: u16,
    pub mqtt_client_id: String,
    pub mqtt_base_topic: String,
    pub convex_site_url: Option<String>,
    pub controller_name: String,
    pub registration_secret: Option<String>,
    pub tls_enabled: bool,
    pub tls_cert_path: Option<String>,
    pub tls_key_path: Option<String>,
    pub tls_extra_sans: Vec<String>,
    pub watchtower_url: Option<String>,
    pub watchtower_token: Option<String>,
    pub watchtower_image: String,
}

impl Config {
    pub fn from_env() -> Self {
        let tls_cert_path = env::var("NEMU_TLS_CERT_PATH")
            .ok()
            .filter(|s| !s.is_empty());
        let tls_key_path = env::var("NEMU_TLS_KEY_PATH").ok().filter(|s| !s.is_empty());
        let tls_extra_sans = env::var("NEMU_TLS_SAN")
            .ok()
            .map(|value| {
                value
                    .split(',')
                    .map(|part| part.trim().to_string())
                    .filter(|part| !part.is_empty())
                    .collect()
            })
            .unwrap_or_default();

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
            convex_site_url: env::var("NEMU_CONVEX_SITE_URL")
                .ok()
                .filter(|s| !s.is_empty()),
            controller_name: env::var("NEMU_CONTROLLER_NAME")
                .unwrap_or_else(|_| "Home".to_string()),
            registration_secret: env::var("CONTROLLER_REGISTRATION_SECRET")
                .ok()
                .filter(|s| !s.is_empty()),
            tls_enabled: env_truthy("NEMU_TLS", true),
            tls_cert_path,
            tls_key_path,
            tls_extra_sans,
            watchtower_url: env::var("WATCHTOWER_URL").ok().filter(|s| !s.is_empty()),
            watchtower_token: env::var("WATCHTOWER_HTTP_API_TOKEN")
                .ok()
                .filter(|s| !s.is_empty()),
            watchtower_image: env::var("WATCHTOWER_IMAGE")
                .unwrap_or_else(|_| "ghcr.io/zed-softworks-official/nemu-core".to_string()),
        }
    }
}
