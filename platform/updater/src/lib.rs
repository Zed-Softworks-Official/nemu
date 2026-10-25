use std::path::{Path, PathBuf};

use ed25519_dalek::VerifyingKey;
use serde::{Deserialize, Serialize};

mod channel;
mod host;
mod install;
mod manifest;
mod publish;

pub use channel::{ChannelError, ChannelSwitch, switch_channel};
pub use host::{DirectoryManifestHost, load_release_key, run_install, run_switch_channel};
pub use install::{hourly_check, maintenance_mode};

pub use manifest::{
    ManifestError, ManifestHost, ManifestHostError, MissingManifestHost, RELEASE_SERVICES,
    ReleaseManifest, ServiceImage, SettingMigration, SignedReleaseManifest, StackFile,
    UpdaterBinaries, manifest_signing_bytes, sign_manifest, verify_manifest,
};

pub use publish::{
    CutRelease, ImageTag, PublishError, PublishPlan, PublishRequest, PublishSource,
    ResolvedService, plan_publish, signing_key_from_base64,
};

/// Home data file under the Controller directory. A Release may replace stack
/// files; it does not replace this file.
pub const INSTALLED_RELEASE_FILE: &str = "updater/installed-release.json";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ReleaseChannel {
    Stable,
    Canary,
}

impl ReleaseChannel {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Stable => "stable",
            Self::Canary => "canary",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseStatus {
    pub platform_version: String,
    pub channel: ReleaseChannel,
    pub newer_release_available: bool,
    /// True while an install holds maintenance, including a health-gate failure
    /// that has not been rolled back.
    pub maintenance_mode: bool,
    /// True when a Rollback snapshot is on disk. Rollback itself is a later step.
    pub rollback_snapshot_available: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct StoredRelease {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub channel: Option<ReleaseChannel>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub platform_version: Option<String>,
    /// Home data. A Release does not overwrite this. Missing means one hour.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub hourly_check_seconds: Option<u64>,
    /// Unix seconds of the last hourly check. Missing means the check is due.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_hourly_check: Option<u64>,
    /// Digests of the Release that was committed. A failed gate does not write these.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub services: Vec<crate::manifest::ServiceImage>,
}

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum StatusError {
    #[error("the installed Platform version is not stored")]
    PlatformVersionMissing,
    #[error("could not read installed Release home data: {0}")]
    Read(String),
    #[error("could not store installed Release home data: {0}")]
    Write(String),
    #[error("could not fetch the release manifest: {0}")]
    Manifest(String),
}

pub fn installed_release_path(controller_dir: &Path) -> PathBuf {
    controller_dir.join(INSTALLED_RELEASE_FILE)
}

pub(crate) fn read_stored_release(
    controller_dir: &Path,
) -> Result<Option<StoredRelease>, StatusError> {
    let path = installed_release_path(controller_dir);
    if !path.exists() {
        return Ok(None);
    }
    let bytes = std::fs::read(&path).map_err(|error| StatusError::Read(error.to_string()))?;
    serde_json::from_slice(&bytes).map_err(|error| StatusError::Read(error.to_string()))
}

pub(crate) fn write_stored_release(
    controller_dir: &Path,
    stored: &StoredRelease,
) -> Result<(), StatusError> {
    let path = installed_release_path(controller_dir);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| StatusError::Write(error.to_string()))?;
    }
    let bytes =
        serde_json::to_vec_pretty(stored).map_err(|error| StatusError::Write(error.to_string()))?;
    std::fs::write(path, bytes).map_err(|error| StatusError::Write(error.to_string()))
}

/// Reports the installed Release and whether the stored channel has a newer one.
///
/// A Home with no stored channel is recorded as Stable. The Platform version
/// is whatever Home data already holds; this does not invent one. A newer
/// Release is a verified manifest on that channel whose Platform version is
/// greater. The `release_key` is the release-signing public key, not the
/// Controller identity key. `:canary` and `:latest` are not consulted.
/// Verification failure leaves Home data and stack files unchanged.
pub fn status(
    controller_dir: &Path,
    manifests: &dyn ManifestHost,
    release_key: Option<&VerifyingKey>,
) -> Result<ReleaseStatus, StatusError> {
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
    let newer_release_available =
        newer_manifest_on_channel(manifests, channel, &platform_version, release_key)?;
    Ok(ReleaseStatus {
        platform_version,
        channel,
        newer_release_available,
        maintenance_mode: install::maintenance_mode(controller_dir),
        rollback_snapshot_available: install::snapshot_kept(controller_dir),
    })
}

fn newer_manifest_on_channel(
    manifests: &dyn ManifestHost,
    channel: ReleaseChannel,
    installed: &str,
    release_key: Option<&VerifyingKey>,
) -> Result<bool, StatusError> {
    let Some(release_key) = release_key else {
        return Ok(false);
    };
    let Some(bytes) = manifests
        .fetch(channel)
        .map_err(|error| StatusError::Manifest(error.to_string()))?
    else {
        return Ok(false);
    };
    Ok(match verify_manifest(&bytes, release_key) {
        Ok(manifest) => platform_version_is_newer(&manifest.platform_version, installed),
        Err(_) => false,
    })
}

/// Platform versions are `0.MINOR.PATCH`. The channel is not part of the version.
pub(crate) fn platform_version_is_newer(candidate: &str, installed: &str) -> bool {
    match (
        parse_platform_version(candidate),
        parse_platform_version(installed),
    ) {
        (Some(next), Some(current)) => next > current,
        _ => false,
    }
}

pub(crate) fn parse_platform_version(version: &str) -> Option<(u64, u64, u64)> {
    let mut parts = version.split('.');
    let major = parts.next()?.parse().ok()?;
    let minor = parts.next()?.parse().ok()?;
    let patch = parts.next()?.parse().ok()?;
    if parts.next().is_some() || major != 0 {
        return None;
    }
    Some((major, minor, patch))
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::{SystemTime, UNIX_EPOCH};

    use base64::Engine;
    use base64::engine::general_purpose::STANDARD as BASE64;
    use ed25519_dalek::SigningKey;

    use super::{
        ManifestHost, ManifestHostError, MissingManifestHost, RELEASE_SERVICES, ReleaseChannel,
        ReleaseManifest, ServiceImage, SettingMigration, StackFile, StatusError, UpdaterBinaries,
        installed_release_path, sign_manifest, status,
    };

    struct TempHome(PathBuf);

    impl TempHome {
        fn new() -> Self {
            static NEXT: AtomicU64 = AtomicU64::new(0);
            let n = NEXT.fetch_add(1, Ordering::Relaxed);
            let nanos = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("clock")
                .as_nanos();
            let path = std::env::temp_dir().join(format!("nemu-updater-{nanos}-{n}"));
            fs::create_dir_all(&path).expect("temp home");
            Self(path)
        }

        fn path(&self) -> &Path {
            &self.0
        }
    }

    impl Drop for TempHome {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    struct FakeHost {
        manifests: Vec<(ReleaseChannel, Vec<u8>)>,
        tags: Vec<(String, String)>,
    }

    impl ManifestHost for FakeHost {
        fn fetch(&self, channel: ReleaseChannel) -> Result<Option<Vec<u8>>, ManifestHostError> {
            Ok(self
                .manifests
                .iter()
                .find(|(stored, _)| *stored == channel)
                .map(|(_, bytes)| bytes.clone()))
        }

        fn image_tag(&self, reference: &str) -> Option<String> {
            self.tags
                .iter()
                .find(|(name, _)| name == reference)
                .map(|(_, digest)| digest.clone())
        }
    }

    fn release_signing_key() -> SigningKey {
        SigningKey::from_bytes(&[0x11; 32])
    }

    fn other_signing_key() -> SigningKey {
        SigningKey::from_bytes(&[0x22; 32])
    }

    fn digest(n: u8) -> String {
        format!("sha256:{n:064x}")
    }

    fn pinned_services() -> Vec<ServiceImage> {
        RELEASE_SERVICES
            .iter()
            .enumerate()
            .map(|(index, service)| ServiceImage {
                service: (*service).to_string(),
                image: format!("example/{service}"),
                digest: digest((index + 1) as u8),
            })
            .collect()
    }

    fn release_manifest(version: &str, services: Vec<ServiceImage>) -> ReleaseManifest {
        ReleaseManifest {
            platform_version: version.to_string(),
            services,
            stack_files: vec![
                StackFile {
                    path: "docker-compose.yml".to_string(),
                    contents: "name: nemu\nservices:\n  nemu-core:\n    image: example/nemu-core@sha256:pinned\n".to_string(),
                },
                StackFile {
                    path: "mosquitto/mosquitto.conf".to_string(),
                    contents: "listener 1883\nallow_anonymous false\n".to_string(),
                },
            ],
            migrations: vec![SettingMigration {
                key: "availability".to_string(),
                value: "enabled: true\n".to_string(),
            }],
            updater: UpdaterBinaries {
                amd64: BASE64.encode(b"amd64"),
                arm64: BASE64.encode(b"arm64"),
            },
        }
    }

    fn signed(version: &str, services: Vec<ServiceImage>) -> Vec<u8> {
        sign_manifest(&release_manifest(version, services), &release_signing_key())
    }

    fn write_platform_version(home: &Path, platform_version: &str) {
        let path = installed_release_path(home);
        fs::create_dir_all(path.parent().expect("parent")).expect("updater dir");
        fs::write(
            &path,
            format!(r#"{{"platformVersion":"{platform_version}"}}"#),
        )
        .expect("write platform version");
    }

    fn write_installed(home: &Path, channel: &str, platform_version: &str) {
        let path = installed_release_path(home);
        fs::create_dir_all(path.parent().expect("parent")).expect("updater dir");
        fs::write(
            &path,
            format!(r#"{{"channel":"{channel}","platformVersion":"{platform_version}"}}"#),
        )
        .expect("write installed release");
    }

    fn write_stack_files(home: &Path) {
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

    fn snapshot_home(home: &Path) -> Vec<(String, Vec<u8>)> {
        let mut files = Vec::new();
        collect_files(home, home, &mut files);
        files.sort();
        files
    }

    fn collect_files(root: &Path, dir: &Path, files: &mut Vec<(String, Vec<u8>)>) {
        let mut entries: Vec<_> = fs::read_dir(dir)
            .unwrap()
            .map(|entry| entry.unwrap())
            .collect();
        entries.sort_by_key(|entry| entry.file_name());
        for entry in entries {
            let path = entry.path();
            if path.is_dir() {
                collect_files(root, &path, files);
            } else {
                let relative = path
                    .strip_prefix(root)
                    .unwrap()
                    .to_string_lossy()
                    .replace('\\', "/");
                files.push((relative, fs::read(&path).unwrap()));
            }
        }
    }

    fn moved_tags() -> Vec<(String, String)> {
        vec![
            (
                "ghcr.io/zed-softworks-official/nemu-core:canary".to_string(),
                digest(0xab),
            ),
            (
                "ghcr.io/zed-softworks-official/nemu-core:latest".to_string(),
                digest(0xcd),
            ),
            (
                "ghcr.io/zed-softworks-official/nemu-matter:canary".to_string(),
                digest(0xab),
            ),
            (
                "ghcr.io/zed-softworks-official/nemu-matter:latest".to_string(),
                digest(0xcd),
            ),
        ]
    }

    fn read_status(
        home: &Path,
        host: &FakeHost,
        key: &SigningKey,
    ) -> Result<super::ReleaseStatus, StatusError> {
        let public = key.verifying_key();
        status(home, host, Some(&public))
    }

    #[test]
    fn a_new_home_reports_stable_and_the_supplied_platform_version() {
        let home = TempHome::new();
        write_stack_files(home.path());
        write_platform_version(home.path(), "0.4.2");
        let host = FakeHost {
            manifests: Vec::new(),
            tags: Vec::new(),
        };

        let report = status(home.path(), &host, None).expect("status");

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
        let key = release_signing_key();
        let host = FakeHost {
            manifests: vec![(ReleaseChannel::Stable, signed("0.1.0", pinned_services()))],
            tags: Vec::new(),
        };

        let error = status(home.path(), &host, Some(&key.verifying_key()))
            .expect_err("missing platform version");
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

    #[test]
    fn a_verified_newer_manifest_on_the_homes_channel_is_available() {
        let home = TempHome::new();
        write_stack_files(home.path());
        write_installed(home.path(), "stable", "0.4.9");
        let before = snapshot_home(home.path());
        let host = FakeHost {
            manifests: vec![(ReleaseChannel::Stable, signed("0.4.10", pinned_services()))],
            tags: Vec::new(),
        };

        let report = read_status(home.path(), &host, &release_signing_key()).expect("status");

        assert_eq!(report.channel, ReleaseChannel::Stable);
        assert_eq!(report.platform_version, "0.4.9");
        assert!(report.newer_release_available);
        assert_eq!(snapshot_home(home.path()), before);
    }

    #[test]
    fn stable_and_canary_manifests_are_not_interchangeable() {
        let stable_home = TempHome::new();
        write_stack_files(stable_home.path());
        write_installed(stable_home.path(), "stable", "0.4.9");
        let stable_before = snapshot_home(stable_home.path());
        let key = release_signing_key();
        let host = FakeHost {
            manifests: vec![
                (ReleaseChannel::Stable, signed("0.4.9", pinned_services())),
                (ReleaseChannel::Canary, signed("0.4.10", pinned_services())),
            ],
            tags: Vec::new(),
        };

        let stable = read_status(stable_home.path(), &host, &key).expect("stable status");
        assert_eq!(stable.channel, ReleaseChannel::Stable);
        assert_eq!(stable.platform_version, "0.4.9");
        assert!(!stable.newer_release_available);
        assert_eq!(snapshot_home(stable_home.path()), stable_before);

        let canary_home = TempHome::new();
        write_stack_files(canary_home.path());
        write_installed(canary_home.path(), "canary", "0.4.9");
        let canary_before = snapshot_home(canary_home.path());
        let canary_host = FakeHost {
            manifests: vec![
                (ReleaseChannel::Stable, signed("0.4.9", pinned_services())),
                (ReleaseChannel::Canary, signed("0.4.10", pinned_services())),
            ],
            tags: Vec::new(),
        };

        let canary = read_status(canary_home.path(), &canary_host, &key).expect("canary status");
        assert_eq!(canary.channel, ReleaseChannel::Canary);
        assert_eq!(canary.platform_version, "0.4.9");
        assert!(canary.newer_release_available);
        assert_eq!(snapshot_home(canary_home.path()), canary_before);
        let stored = fs::read_to_string(installed_release_path(canary_home.path())).unwrap();
        assert!(stored.contains("canary"), "{stored}");
        assert!(!stored.contains("stable"), "{stored}");
    }

    #[test]
    fn a_bad_signature_is_rejected_before_any_home_change() {
        let home = TempHome::new();
        write_stack_files(home.path());
        write_installed(home.path(), "stable", "0.4.9");
        let before = snapshot_home(home.path());
        let signed_bytes = sign_manifest(
            &release_manifest("0.4.10", pinned_services()),
            &other_signing_key(),
        );
        let host = FakeHost {
            manifests: vec![(ReleaseChannel::Stable, signed_bytes)],
            tags: Vec::new(),
        };

        let report = read_status(home.path(), &host, &release_signing_key()).expect("status");

        assert_eq!(report.channel, ReleaseChannel::Stable);
        assert_eq!(report.platform_version, "0.4.9");
        assert!(!report.newer_release_available);
        assert_eq!(snapshot_home(home.path()), before);
        assert!(snapshot_home(home.path()).iter().all(|(path, _)| {
            path != "docker-compose.yml"
                || fs::read(home.path().join(path)).unwrap() == b"services: {}\n"
        }));
    }

    #[test]
    fn a_manifest_that_does_not_pin_every_service_is_rejected() {
        let home = TempHome::new();
        write_stack_files(home.path());
        write_installed(home.path(), "stable", "0.4.9");
        let before = snapshot_home(home.path());
        let key = release_signing_key();

        let missing_postgres: Vec<ServiceImage> = pinned_services()
            .into_iter()
            .filter(|service| service.service != "postgres")
            .collect();
        let mut tagged_latest = pinned_services();
        tagged_latest
            .iter_mut()
            .find(|service| service.service == "nemu-core")
            .unwrap()
            .image = "ghcr.io/zed-softworks-official/nemu-core:latest".to_string();
        let mut tagged_canary = pinned_services();
        tagged_canary
            .iter_mut()
            .find(|service| service.service == "nemu-matter")
            .unwrap()
            .digest = "canary".to_string();

        for (label, services) in [
            ("missing postgres", missing_postgres),
            ("core image tag :latest", tagged_latest),
            ("matter digest is not a pin", tagged_canary),
        ] {
            let host = FakeHost {
                manifests: vec![(ReleaseChannel::Stable, signed("0.4.10", services))],
                tags: Vec::new(),
            };
            let report = read_status(home.path(), &host, &key).expect(label);
            assert_eq!(report.platform_version, "0.4.9", "{label}");
            assert!(!report.newer_release_available, "{label}");
            assert_eq!(snapshot_home(home.path()), before, "{label}");
        }
    }

    #[test]
    fn a_moved_canary_or_latest_tag_is_not_a_release() {
        let key = release_signing_key();

        let with_old_manifest = TempHome::new();
        write_stack_files(with_old_manifest.path());
        write_installed(with_old_manifest.path(), "stable", "0.4.10");
        let before_old = snapshot_home(with_old_manifest.path());
        let old_manifest = FakeHost {
            manifests: vec![(ReleaseChannel::Stable, signed("0.4.10", pinned_services()))],
            tags: moved_tags(),
        };
        let report = read_status(with_old_manifest.path(), &old_manifest, &key).expect("status");
        assert!(!report.newer_release_available);
        assert_eq!(report.platform_version, "0.4.10");
        assert_eq!(snapshot_home(with_old_manifest.path()), before_old);

        let without_manifest = TempHome::new();
        write_stack_files(without_manifest.path());
        write_installed(without_manifest.path(), "canary", "0.4.10");
        let before_missing = snapshot_home(without_manifest.path());
        let tags_only = FakeHost {
            manifests: Vec::new(),
            tags: moved_tags(),
        };
        let report = read_status(without_manifest.path(), &tags_only, &key).expect("status");
        assert_eq!(report.channel, ReleaseChannel::Canary);
        assert!(!report.newer_release_available);
        assert_eq!(snapshot_home(without_manifest.path()), before_missing);
    }

    #[test]
    fn an_older_or_equal_platform_version_is_not_offered() {
        let key = release_signing_key();

        let equal = TempHome::new();
        write_stack_files(equal.path());
        write_installed(equal.path(), "stable", "0.4.10");
        let before_equal = snapshot_home(equal.path());
        let equal_host = FakeHost {
            manifests: vec![(ReleaseChannel::Stable, signed("0.4.10", pinned_services()))],
            tags: Vec::new(),
        };
        let report = read_status(equal.path(), &equal_host, &key).expect("equal");
        assert!(!report.newer_release_available);
        assert_eq!(snapshot_home(equal.path()), before_equal);

        let older = TempHome::new();
        write_stack_files(older.path());
        write_installed(older.path(), "stable", "0.4.10");
        let before_older = snapshot_home(older.path());
        let older_host = FakeHost {
            manifests: vec![(ReleaseChannel::Stable, signed("0.4.9", pinned_services()))],
            tags: Vec::new(),
        };
        let report = read_status(older.path(), &older_host, &key).expect("older");
        assert_eq!(report.platform_version, "0.4.10");
        assert!(!report.newer_release_available);
        assert_eq!(snapshot_home(older.path()), before_older);
    }

    #[test]
    fn a_missing_manifest_is_not_a_release() {
        let home = TempHome::new();
        write_stack_files(home.path());
        write_installed(home.path(), "stable", "0.4.9");
        let before = snapshot_home(home.path());
        let key = release_signing_key().verifying_key();

        let report = status(home.path(), &MissingManifestHost, Some(&key)).expect("status");

        assert_eq!(report.channel, ReleaseChannel::Stable);
        assert_eq!(report.platform_version, "0.4.9");
        assert!(!report.newer_release_available);
        assert_eq!(snapshot_home(home.path()), before);
    }

    #[test]
    fn a_manifest_without_the_release_key_is_not_available() {
        let home = TempHome::new();
        write_stack_files(home.path());
        write_installed(home.path(), "stable", "0.4.9");
        let before = snapshot_home(home.path());
        let host = FakeHost {
            manifests: vec![(ReleaseChannel::Stable, signed("0.4.10", pinned_services()))],
            tags: Vec::new(),
        };

        let report = status(home.path(), &host, None).expect("status");

        assert!(!report.newer_release_available);
        assert_eq!(report.platform_version, "0.4.9");
        assert_eq!(snapshot_home(home.path()), before);
    }
}
