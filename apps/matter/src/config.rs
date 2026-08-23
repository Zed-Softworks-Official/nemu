use std::path::PathBuf;

#[derive(Debug, Clone)]
pub struct Config {
    pub mqtt_host: String,
    pub mqtt_port: u16,
    pub mqtt_base_topic: String,
    pub mqtt_client_id: String,
    pub data_dir: PathBuf,
    pub paa_dir: PathBuf,
    pub cd_dir: PathBuf,
}

impl Config {
    pub fn from_env() -> Self {
        let data_dir = PathBuf::from(
            std::env::var("MATTER_DATA_DIR").unwrap_or_else(|_| "/data".to_string()),
        );
        Self {
            mqtt_host: std::env::var("MQTT_HOST").unwrap_or_else(|_| "127.0.0.1".to_string()),
            mqtt_port: std::env::var("MQTT_PORT")
                .ok()
                .and_then(|value| value.parse().ok())
                .unwrap_or(1883),
            mqtt_base_topic: std::env::var("MQTT_BASE_TOPIC")
                .unwrap_or_else(|_| "matter".to_string()),
            mqtt_client_id: std::env::var("MQTT_CLIENT_ID")
                .unwrap_or_else(|_| "nemu-matter".to_string()),
            paa_dir: std::env::var("MATTER_PAA_DIR")
                .map(PathBuf::from)
                .unwrap_or_else(|_| data_dir.join("paa-roots")),
            cd_dir: std::env::var("MATTER_CD_DIR")
                .map(PathBuf::from)
                .unwrap_or_else(|_| data_dir.join("cd-roots")),
            data_dir,
        }
    }

    pub fn store_path(&self) -> PathBuf {
        self.data_dir.join("controller-state.bin")
    }

    pub fn names_path(&self) -> PathBuf {
        self.data_dir.join("names.json")
    }
}
