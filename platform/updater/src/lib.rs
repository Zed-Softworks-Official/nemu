use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

/// Home data file under the Controller directory. A Release may replace stack
/// files; it does not replace this file.
pub const INSTALLED_RELEASE_FILE: &str = "updater/installed-release.json";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ReleaseChannel {
    Stable,
}

impl ReleaseChannel {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Stable => "stable",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseStatus {
    pub platform_version: String,
    pub channel: ReleaseChannel,
    pub newer_release_available: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct StoredRelease {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub channel: Option<ReleaseChannel>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub platform_version: Option<String>,
}

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum StatusError {
    #[error("the installed Platform version is not stored")]
    PlatformVersionMissing,
    #[error("could not read installed Release home data: {0}")]
    Read(String),
    #[error("could not store installed Release home data: {0}")]
    Write(String),
}

pub fn installed_release_path(controller_dir: &Path) -> PathBuf {
    controller_dir.join(INSTALLED_RELEASE_FILE)
}

fn read_stored_release(controller_dir: &Path) -> Result<Option<StoredRelease>, StatusError> {
    let path = installed_release_path(controller_dir);
    if !path.exists() {
        return Ok(None);
    }
    let bytes = std::fs::read(&path).map_err(|error| StatusError::Read(error.to_string()))?;
    serde_json::from_slice(&bytes).map_err(|error| StatusError::Read(error.to_string()))
}

fn write_stored_release(controller_dir: &Path, stored: &StoredRelease) -> Result<(), StatusError> {
    let path = installed_release_path(controller_dir);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| StatusError::Write(error.to_string()))?;
    }
    let bytes =
        serde_json::to_vec_pretty(stored).map_err(|error| StatusError::Write(error.to_string()))?;
    std::fs::write(path, bytes).map_err(|error| StatusError::Write(error.to_string()))
}

/// Reports the installed Release stored as Home data.
///
/// A Home with no stored channel is recorded as Stable. The Platform version
/// is whatever Home data already holds; this does not invent one and does not
/// look for a newer Release.
pub fn status(controller_dir: &Path) -> Result<ReleaseStatus, StatusError> {
    let mut stored = read_stored_release(controller_dir)?.unwrap_or_default();
    if stored.channel.is_none() {
        stored.channel = Some(ReleaseChannel::Stable);
        write_stored_release(controller_dir, &stored)?;
    }
    let channel = stored.channel.unwrap_or(ReleaseChannel::Stable);
    let Some(platform_version) = stored
        .platform_version
        .filter(|version| !version.trim().is_empty())
    else {
        return Err(StatusError::PlatformVersionMissing);
    };
    Ok(ReleaseStatus {
        platform_version,
        channel,
        newer_release_available: false,
    })
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    use super::{ReleaseChannel, StatusError, installed_release_path, status};

    struct TempHome(PathBuf);

    impl TempHome {
        fn new() -> Self {
            let nanos = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("clock")
                .as_nanos();
            let path = std::env::temp_dir().join(format!("nemu-updater-{nanos}"));
            fs::create_dir_all(&path).expect("temp home");
            Self(path)
        }

        fn path(&self) -> &std::path::Path {
            &self.0
        }
    }

    impl Drop for TempHome {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn write_platform_version(home: &std::path::Path, platform_version: &str) {
        let path = installed_release_path(home);
        fs::create_dir_all(path.parent().expect("parent")).expect("updater dir");
        fs::write(
            &path,
            format!(r#"{{"platformVersion":"{platform_version}"}}"#),
        )
        .expect("write platform version");
    }

    fn write_stack_files(home: &std::path::Path) {
        fs::write(home.join("docker-compose.yml"), "services: {}\n").unwrap();
        fs::create_dir_all(home.join("mosquitto")).unwrap();
        fs::write(home.join("mosquitto/mosquitto.conf"), "listener 1883\n").unwrap();
        fs::create_dir_all(home.join("zigbee2mqtt")).unwrap();
        fs::write(
            home.join("zigbee2mqtt/configuration.yaml"),
            "serial:\n  port: /dev/ttyACM0\n",
        )
        .unwrap();
    }

    #[test]
    fn a_new_home_reports_stable_and_the_supplied_platform_version() {
        let home = TempHome::new();
        write_stack_files(home.path());
        write_platform_version(home.path(), "0.4.2");

        let report = status(home.path()).expect("status");

        assert_eq!(report.channel, ReleaseChannel::Stable);
        assert_eq!(report.platform_version, "0.4.2");
        assert!(!report.newer_release_available);

        let stored = fs::read_to_string(installed_release_path(home.path())).unwrap();
        assert!(stored.contains("stable"), "{stored}");
        assert!(stored.contains("0.4.2"), "{stored}");
        assert_eq!(
            fs::read_to_string(home.path().join("docker-compose.yml")).unwrap(),
            "services: {}\n"
        );
        assert_eq!(
            fs::read_to_string(home.path().join("mosquitto/mosquitto.conf")).unwrap(),
            "listener 1883\n"
        );
        assert_eq!(
            fs::read_to_string(home.path().join("zigbee2mqtt/configuration.yaml")).unwrap(),
            "serial:\n  port: /dev/ttyACM0\n"
        );
        assert!(!stored.contains("docker-compose"));
        assert!(!stored.contains("mosquitto"));
        assert!(!stored.contains("zigbee"));
    }

    #[test]
    fn status_does_not_invent_a_platform_version() {
        let home = TempHome::new();
        write_stack_files(home.path());

        let error = status(home.path()).expect_err("missing platform version");
        assert_eq!(error, StatusError::PlatformVersionMissing);

        let stored = fs::read_to_string(installed_release_path(home.path())).unwrap();
        assert!(stored.contains("stable"), "{stored}");
        assert!(!stored.contains("0.1.0"), "{stored}");
        assert!(!stored.contains("0.2.2"), "{stored}");
        assert!(!stored.contains("platformVersion"), "{stored}");
        assert_eq!(
            fs::read_to_string(home.path().join("docker-compose.yml")).unwrap(),
            "services: {}\n"
        );
    }
}
