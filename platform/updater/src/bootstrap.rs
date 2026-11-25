//! First install of a Release on a Home that has no Updater yet.
//!
//! The installer runs this before the stack starts, so a Home is on a signed
//! Release from its first boot (ADR-0033). There is nothing running to
//! snapshot or health-gate: the stack files, digests, and Updater binary of
//! the channel's verified manifest are laid down, and the installer then
//! starts the stack. A Home that already stores a Platform version is left
//! alone; it updates through the daemon, not through the installer.

use std::path::Path;

use ed25519_dalek::VerifyingKey;

use crate::install::{
    InstallError, UpdaterArch, commit_binary, decode_binary, migrate_zigbee, write_stack_files,
};
use crate::manifest::ManifestHost;
use crate::version::PlatformVersion;
use crate::{ReleaseChannel, read_stored_release, verify_manifest, write_stored_release};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum BootstrapOutcome {
    /// The channel's Release was laid down.
    Installed { platform_version: String },
    /// The Home already had a Release. Nothing was changed.
    AlreadyInstalled {
        platform_version: String,
        channel: ReleaseChannel,
    },
}

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum BootstrapError {
    #[error("no release-signing key is pinned on this Home")]
    NoReleaseKey,
    #[error("the {0} channel has no published Release")]
    NoManifest(&'static str),
    #[error("the {0} release manifest did not verify against the pinned key")]
    Rejected(&'static str),
    #[error("{0}")]
    Unavailable(String),
}

impl From<InstallError> for BootstrapError {
    fn from(error: InstallError) -> Self {
        match error {
            InstallError::Rejected => Self::Rejected("release"),
            other => Self::Unavailable(other.to_string()),
        }
    }
}

/// Lays down the verified Release of `channel` on a Home with no Release.
///
/// The key is the Home's pin when one exists, otherwise `release_key`.
pub fn bootstrap(
    controller_dir: &Path,
    channel: ReleaseChannel,
    manifests: &dyn ManifestHost,
    release_key: Option<&VerifyingKey>,
    arch: UpdaterArch,
    now: u64,
) -> Result<BootstrapOutcome, BootstrapError> {
    let mut stored = read_stored_release(controller_dir)
        .map_err(|error| BootstrapError::Unavailable(error.to_string()))?
        .unwrap_or_default();
    if let Some(platform_version) = stored
        .platform_version
        .clone()
        .filter(|version| !version.trim().is_empty())
    {
        return Ok(BootstrapOutcome::AlreadyInstalled {
            platform_version,
            channel: stored.channel.unwrap_or(ReleaseChannel::Stable),
        });
    }
    let key = crate::wrapper::load_pin(controller_dir)
        .or(release_key.copied())
        .ok_or(BootstrapError::NoReleaseKey)?;
    let bytes = manifests
        .fetch(channel)
        .map_err(|error| BootstrapError::Unavailable(error.to_string()))?
        .ok_or(BootstrapError::NoManifest(channel.as_str()))?;
    let manifest =
        verify_manifest(&bytes, &key).map_err(|_| BootstrapError::Rejected(channel.as_str()))?;
    if PlatformVersion::parse(&manifest.platform_version).is_none() {
        return Err(BootstrapError::Rejected(channel.as_str()));
    }
    let binary = decode_binary(&manifest, arch)?;

    write_stack_files(controller_dir, &manifest)?;
    migrate_zigbee(controller_dir, &manifest)?;
    commit_binary(controller_dir, &binary)?;

    stored.channel = Some(channel);
    stored.platform_version = Some(manifest.platform_version.clone());
    stored.services = manifest.services.clone();
    stored.build_identity = crate::build_identity::build_identity(&manifest, arch);
    stored.last_hourly_check = Some(now);
    write_stored_release(controller_dir, &stored)
        .map_err(|error| BootstrapError::Unavailable(error.to_string()))?;
    Ok(BootstrapOutcome::Installed {
        platform_version: manifest.platform_version,
    })
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

    use super::{BootstrapError, BootstrapOutcome, bootstrap};
    use crate::install::{BINARY_DIR, GENERATION_FILE, UpdaterArch};
    use crate::manifest::{
        ManifestHost, ManifestHostError, ReleaseManifest, ServiceImage, StackFile, UpdaterBinaries,
        sign_manifest,
    };
    use crate::{RELEASE_SERVICES, ReleaseChannel, installed_release_path, read_stored_release};

    struct TempHome(PathBuf);

    impl TempHome {
        fn new() -> Self {
            static NEXT: AtomicU64 = AtomicU64::new(0);
            let n = NEXT.fetch_add(1, Ordering::Relaxed);
            let nanos = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("clock")
                .as_nanos();
            let path = std::env::temp_dir().join(format!("nemu-bootstrap-{nanos}-{n}"));
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

    struct Host(Vec<(ReleaseChannel, Vec<u8>)>);

    impl ManifestHost for Host {
        fn fetch(&self, channel: ReleaseChannel) -> Result<Option<Vec<u8>>, ManifestHostError> {
            Ok(self
                .0
                .iter()
                .find(|(stored, _)| *stored == channel)
                .map(|(_, bytes)| bytes.clone()))
        }
    }

    fn key() -> SigningKey {
        SigningKey::from_bytes(&[0x11; 32])
    }

    fn manifest(version: &str) -> ReleaseManifest {
        ReleaseManifest {
            platform_version: version.to_string(),
            services: RELEASE_SERVICES
                .iter()
                .enumerate()
                .map(|(index, service)| ServiceImage {
                    service: (*service).to_string(),
                    image: format!("example/{service}"),
                    digest: format!("sha256:{:064x}", index + 1),
                })
                .collect(),
            stack_files: vec![
                StackFile {
                    path: "docker-compose.yml".to_string(),
                    contents: format!("# {version}\nservices: {{}}\n"),
                },
                StackFile {
                    path: "mosquitto/mosquitto.conf".to_string(),
                    contents: "listener 1883\n".to_string(),
                },
            ],
            migrations: Vec::new(),
            updater: UpdaterBinaries {
                amd64: BASE64.encode(b"amd64-updater"),
                arm64: BASE64.encode(b"arm64-updater"),
            },
            next_pin: None,
            release_notes: None,
            hotfix: false,
        }
    }

    #[test]
    fn a_new_home_gets_the_channels_release_before_the_stack_starts() {
        let home = TempHome::new();
        let host = Host(vec![
            (
                ReleaseChannel::Stable,
                sign_manifest(&manifest("0.1.1"), &key()),
            ),
            (
                ReleaseChannel::Canary,
                sign_manifest(&manifest("0.1.2"), &key()),
            ),
        ]);
        let public = key().verifying_key();

        let outcome = bootstrap(
            home.path(),
            ReleaseChannel::Canary,
            &host,
            Some(&public),
            UpdaterArch::Arm64,
            1_000,
        )
        .expect("bootstrap");

        assert_eq!(
            outcome,
            BootstrapOutcome::Installed {
                platform_version: "0.1.2".to_string()
            }
        );
        assert_eq!(
            fs::read_to_string(home.path().join("docker-compose.yml")).unwrap(),
            "# 0.1.2\nservices: {}\n"
        );
        assert_eq!(
            fs::read(home.path().join(BINARY_DIR).join("1")).unwrap(),
            b"arm64-updater"
        );
        assert_eq!(
            fs::read_to_string(home.path().join(GENERATION_FILE)).unwrap(),
            "1\n"
        );
        let stored = read_stored_release(home.path()).unwrap().unwrap();
        assert_eq!(stored.channel, Some(ReleaseChannel::Canary));
        assert_eq!(stored.platform_version.as_deref(), Some("0.1.2"));
        assert_eq!(stored.services.len(), RELEASE_SERVICES.len());
        assert_eq!(stored.last_hourly_check, Some(1_000));
    }

    #[test]
    fn a_channel_with_no_manifest_is_refused_and_nothing_is_written() {
        let home = TempHome::new();
        let host = Host(vec![(
            ReleaseChannel::Stable,
            sign_manifest(&manifest("0.1.1"), &key()),
        )]);
        let public = key().verifying_key();

        let error = bootstrap(
            home.path(),
            ReleaseChannel::Canary,
            &host,
            Some(&public),
            UpdaterArch::Amd64,
            0,
        )
        .expect_err("no canary");

        assert_eq!(error, BootstrapError::NoManifest("canary"));
        assert!(!home.path().join("docker-compose.yml").exists());
        assert!(!installed_release_path(home.path()).exists());
    }

    #[test]
    fn a_manifest_signed_by_another_key_is_refused() {
        let home = TempHome::new();
        let other = SigningKey::from_bytes(&[0x22; 32]);
        let host = Host(vec![(
            ReleaseChannel::Stable,
            sign_manifest(&manifest("0.1.1"), &other),
        )]);
        let public = key().verifying_key();

        let error = bootstrap(
            home.path(),
            ReleaseChannel::Stable,
            &host,
            Some(&public),
            UpdaterArch::Amd64,
            0,
        )
        .expect_err("bad signature");

        assert_eq!(error, BootstrapError::Rejected("stable"));
        assert!(!home.path().join("docker-compose.yml").exists());
    }

    #[test]
    fn a_home_that_already_has_a_release_is_left_alone() {
        let home = TempHome::new();
        let path = installed_release_path(home.path());
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(&path, r#"{"channel":"stable","platformVersion":"0.1.5"}"#).unwrap();
        fs::write(home.path().join("docker-compose.yml"), "kept\n").unwrap();
        let host = Host(vec![(
            ReleaseChannel::Canary,
            sign_manifest(&manifest("0.1.9"), &key()),
        )]);
        let public = key().verifying_key();

        let outcome = bootstrap(
            home.path(),
            ReleaseChannel::Canary,
            &host,
            Some(&public),
            UpdaterArch::Amd64,
            0,
        )
        .expect("already installed");

        assert_eq!(
            outcome,
            BootstrapOutcome::AlreadyInstalled {
                platform_version: "0.1.5".to_string(),
                channel: ReleaseChannel::Stable,
            }
        );
        assert_eq!(
            fs::read_to_string(home.path().join("docker-compose.yml")).unwrap(),
            "kept\n"
        );
    }

    #[test]
    fn without_a_pin_or_supplied_key_nothing_is_installed() {
        let home = TempHome::new();
        let host = Host(vec![(
            ReleaseChannel::Stable,
            sign_manifest(&manifest("0.1.1"), &key()),
        )]);

        let error = bootstrap(
            home.path(),
            ReleaseChannel::Stable,
            &host,
            None,
            UpdaterArch::Amd64,
            0,
        )
        .expect_err("no key");

        assert_eq!(error, BootstrapError::NoReleaseKey);
    }

    #[test]
    fn a_release_candidate_installs_and_a_malformed_version_is_refused() {
        let public = key().verifying_key();
        let run = |version: &str, home: &TempHome| {
            let host = Host(vec![(
                ReleaseChannel::Canary,
                sign_manifest(&manifest(version), &key()),
            )]);
            bootstrap(
                home.path(),
                ReleaseChannel::Canary,
                &host,
                Some(&public),
                UpdaterArch::Amd64,
                0,
            )
        };

        let home = TempHome::new();
        run("0.1.4-canary.1", &home).expect("candidate");

        let home = TempHome::new();
        assert_eq!(
            run("0.1.4-canary.0", &home).expect_err("malformed"),
            BootstrapError::Rejected("canary")
        );
        assert!(!installed_release_path(home.path()).exists());
    }
}
