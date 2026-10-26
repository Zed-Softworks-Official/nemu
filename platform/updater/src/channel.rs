use std::path::Path;

use crate::install::InstallEnv;
use crate::{
    ReleaseChannel, maintenance_mode, platform_version_is_eligible, read_stored_release,
    verify_manifest, write_stored_release,
};

/// The channel an Owner asked for, and whether that switch installed a Release.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ChannelSwitch {
    pub channel: ReleaseChannel,
    pub installed: bool,
}

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum ChannelError {
    #[error("the installed Platform version is not stored")]
    PlatformVersionMissing,
    #[error("the home is already in maintenance")]
    InMaintenance,
    #[error("the release manifest was rejected")]
    Rejected,
    #[error("{0}")]
    Unavailable(String),
    #[error("{0}")]
    Install(#[from] crate::install::InstallError),
}

/// Saves the Home's Release channel. Installs only when that channel's
/// verified Release has a newer Platform version, by calling `install`.
///
/// An older or equal Release is saved and not installed. The hourly check
/// already installs a newer manifest on the stored channel, so a Home that
/// is waiting does not need a second installer. A Release does not overwrite
/// the stored channel. A manifest that does not verify is rejected and leaves
/// Home data unchanged.
pub fn switch_channel(
    controller_dir: &Path,
    channel: ReleaseChannel,
    env: &InstallEnv<'_>,
) -> Result<ChannelSwitch, ChannelError> {
    if maintenance_mode(controller_dir) {
        return Err(ChannelError::InMaintenance);
    }
    let mut stored = read_stored_release(controller_dir)
        .map_err(|error| ChannelError::Unavailable(error.to_string()))?
        .unwrap_or_default();
    let installed = stored
        .platform_version
        .clone()
        .filter(|version| !version.trim().is_empty())
        .ok_or(ChannelError::PlatformVersionMissing)?;
    let declined = stored.declined_platform_version.clone();
    let newer = chosen_release_is_newer(env, channel, &installed, declined.as_deref())?;
    stored.channel = Some(channel);
    write_stored_release(controller_dir, &stored)
        .map_err(|error| ChannelError::Unavailable(error.to_string()))?;
    if newer {
        crate::install::install(controller_dir, env)?;
    }
    Ok(ChannelSwitch {
        channel,
        installed: newer,
    })
}

/// `Ok(true)` when the chosen channel has a verified newer Release.
/// A missing manifest or a missing release key is not newer. A manifest
/// that does not verify is rejected before the channel is saved.
fn chosen_release_is_newer(
    env: &InstallEnv<'_>,
    channel: ReleaseChannel,
    installed: &str,
    declined: Option<&str>,
) -> Result<bool, ChannelError> {
    let Some(release_key) = env.release_key else {
        return Ok(false);
    };
    let Some(bytes) = env
        .manifests
        .fetch(channel)
        .map_err(|error| ChannelError::Unavailable(error.to_string()))?
    else {
        return Ok(false);
    };
    let manifest = verify_manifest(&bytes, release_key).map_err(|_| ChannelError::Rejected)?;
    Ok(platform_version_is_eligible(
        &manifest.platform_version,
        installed,
        declined,
    ))
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::sync::Mutex;
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::{SystemTime, UNIX_EPOCH};

    use base64::Engine;
    use base64::engine::general_purpose::STANDARD as BASE64;
    use ed25519_dalek::{SigningKey, VerifyingKey};

    use super::{ChannelError, switch_channel};
    use crate::install::{
        Clock, ContainerRuntime, CoreHealth, FreeSpace, HealthView, InstallEnv, SpaceReport,
        UpdaterArch, install,
    };
    use crate::manifest::{
        ManifestHost, ManifestHostError, ReleaseManifest, ServiceImage, StackFile, UpdaterBinaries,
        sign_manifest,
    };
    use crate::{
        MissingManifestHost, RELEASE_SERVICES, ReleaseChannel, StoredRelease, hourly_check,
        installed_release_path, status,
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
            let path = std::env::temp_dir().join(format!("nemu-updater-channel-{nanos}-{n}"));
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
        manifests: Mutex<Vec<(ReleaseChannel, Vec<u8>)>>,
    }

    impl FakeHost {
        fn new(manifests: Vec<(ReleaseChannel, Vec<u8>)>) -> Self {
            Self {
                manifests: Mutex::new(manifests),
            }
        }

        fn publish(&self, channel: ReleaseChannel, bytes: Vec<u8>) {
            let mut manifests = self.manifests.lock().expect("manifests");
            if let Some((_, stored)) = manifests.iter_mut().find(|(name, _)| *name == channel) {
                *stored = bytes;
            } else {
                manifests.push((channel, bytes));
            }
        }
    }

    impl ManifestHost for FakeHost {
        fn fetch(&self, channel: ReleaseChannel) -> Result<Option<Vec<u8>>, ManifestHostError> {
            Ok(self
                .manifests
                .lock()
                .expect("manifests")
                .iter()
                .find(|(stored, _)| *stored == channel)
                .map(|(_, bytes)| bytes.clone()))
        }
    }

    struct World {
        now: AtomicU64,
    }

    impl World {
        fn new() -> Self {
            Self {
                now: AtomicU64::new(0),
            }
        }
    }

    impl ContainerRuntime for World {
        fn services(&self) -> Result<Vec<crate::install::RunningService>, String> {
            Ok(Vec::new())
        }

        fn quiesce(&self) -> Result<(), String> {
            Ok(())
        }

        fn resume(&self) -> Result<(), String> {
            Ok(())
        }

        fn recreate(&self, _service: &str, _digest: &str) -> Result<(), String> {
            Ok(())
        }

        fn rerun_matter_trust_roots(&self, _script: &Path) -> Result<(), String> {
            Ok(())
        }
    }

    impl CoreHealth for World {
        fn before_install(&self) -> HealthView {
            core_only()
        }

        fn during_gate(&self, _at_seconds: u64) -> HealthView {
            core_only()
        }
    }

    impl FreeSpace for World {
        fn report(&self) -> Result<SpaceReport, String> {
            let gib = 1024 * 1024 * 1024;
            Ok(SpaceReport {
                filesystem_total_bytes: 100 * gib,
                free_bytes: 80 * gib,
            })
        }
    }

    impl Clock for World {
        fn now(&self) -> u64 {
            self.now.load(Ordering::SeqCst)
        }

        fn wait_until(&self, deadline: u64) -> bool {
            self.now.store(deadline, Ordering::SeqCst);
            true
        }
    }

    fn core_only() -> HealthView {
        HealthView {
            answered: true,
            postgres_ok: true,
            mosquitto_ok: true,
            zigbee_online: false,
            matter_online: false,
            internet_reachable: false,
            convex_reachable: false,
            devices_online: false,
        }
    }

    fn release_signing_key() -> SigningKey {
        SigningKey::from_bytes(&[0x11; 32])
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

    fn release_manifest(version: &str) -> ReleaseManifest {
        ReleaseManifest {
            platform_version: version.to_string(),
            services: pinned_services(),
            stack_files: vec![
                StackFile {
                    path: "docker-compose.yml".to_string(),
                    contents: format!("name: nemu\n# {version}\n"),
                },
                StackFile {
                    path: "mosquitto/mosquitto.conf".to_string(),
                    contents: "listener 1883\nallow_anonymous false\n".to_string(),
                },
            ],
            migrations: Vec::new(),
            updater: UpdaterBinaries {
                amd64: BASE64.encode(b"amd64-next"),
                arm64: BASE64.encode(b"arm64-next"),
            },
            next_pin: None,
        }
    }

    fn signed(version: &str) -> Vec<u8> {
        sign_manifest(&release_manifest(version), &release_signing_key())
    }

    fn write_stored(home: &Path, stored: &StoredRelease) {
        let path = installed_release_path(home);
        fs::create_dir_all(path.parent().expect("parent")).expect("updater dir");
        fs::write(path, serde_json::to_vec_pretty(stored).expect("json")).expect("write");
    }

    fn read_stored(home: &Path) -> StoredRelease {
        serde_json::from_slice(&fs::read(installed_release_path(home)).unwrap()).unwrap()
    }

    fn seed_running(home: &Path) {
        fs::write(home.join("docker-compose.yml"), "services: {}\n").unwrap();
        fs::create_dir_all(home.join("mosquitto")).unwrap();
        fs::write(home.join("mosquitto/mosquitto.conf"), "listener 1883\n").unwrap();
        fs::create_dir_all(home.join("updater/bin")).unwrap();
        fs::write(home.join("updater/wrapper-generation"), "1\n").unwrap();
        fs::write(home.join("updater/bin/1"), b"previous-updater").unwrap();
    }

    fn generation(home: &Path) -> String {
        fs::read_to_string(home.join("updater/wrapper-generation"))
            .unwrap_or_default()
            .trim()
            .to_string()
    }

    fn switched(
        home: &Path,
        world: &World,
        host: &FakeHost,
        channel: ReleaseChannel,
    ) -> Result<super::ChannelSwitch, ChannelError> {
        let key = release_signing_key();
        let public: VerifyingKey = key.verifying_key();
        switch_channel(
            home,
            channel,
            &InstallEnv {
                manifests: host,
                release_key: Some(&public),
                runtime: world,
                health: world,
                space: world,
                clock: world,
                arch: UpdaterArch::Amd64,
            },
        )
    }

    fn stored_version(channel: ReleaseChannel, version: &str) -> StoredRelease {
        StoredRelease {
            channel: Some(channel),
            platform_version: Some(version.to_string()),
            hourly_check_seconds: Some(3600),
            ..StoredRelease::default()
        }
    }

    #[test]
    fn switching_to_a_newer_canary_release_installs_that_release() {
        let home = TempHome::new();
        seed_running(home.path());
        write_stored(
            home.path(),
            &stored_version(ReleaseChannel::Stable, "0.4.9"),
        );
        let world = World::new();
        let host = FakeHost::new(vec![
            (ReleaseChannel::Stable, signed("0.4.12")),
            (ReleaseChannel::Canary, signed("0.4.10")),
        ]);

        let outcome = switched(home.path(), &world, &host, ReleaseChannel::Canary).expect("switch");

        assert_eq!(outcome.channel, ReleaseChannel::Canary);
        assert!(outcome.installed);
        let stored = read_stored(home.path());
        assert_eq!(stored.channel, Some(ReleaseChannel::Canary));
        assert_eq!(stored.platform_version.as_deref(), Some("0.4.10"));
        assert_eq!(stored.hourly_check_seconds, Some(3600));
        assert_eq!(generation(home.path()), "2");
        assert_eq!(
            fs::read(home.path().join("updater/bin/2")).unwrap(),
            b"amd64-next"
        );
        assert!(home.path().join("updater/rollback-snapshot").is_dir());
        assert!(!home.path().join("updater/maintenance").is_file());
        assert_eq!(
            fs::read_to_string(home.path().join("docker-compose.yml")).unwrap(),
            "name: nemu\n# 0.4.10\n"
        );
    }

    #[test]
    fn switching_back_to_a_newer_stable_release_installs_that_release() {
        let home = TempHome::new();
        seed_running(home.path());
        write_stored(
            home.path(),
            &stored_version(ReleaseChannel::Canary, "0.4.9"),
        );
        let world = World::new();
        let host = FakeHost::new(vec![
            (ReleaseChannel::Stable, signed("0.4.10")),
            (ReleaseChannel::Canary, signed("0.4.12")),
        ]);

        let outcome = switched(home.path(), &world, &host, ReleaseChannel::Stable).expect("switch");

        assert!(outcome.installed);
        let stored = read_stored(home.path());
        assert_eq!(stored.channel, Some(ReleaseChannel::Stable));
        assert_eq!(stored.platform_version.as_deref(), Some("0.4.10"));
        assert_eq!(generation(home.path()), "2");
        assert_eq!(
            fs::read_to_string(home.path().join("docker-compose.yml")).unwrap(),
            "name: nemu\n# 0.4.10\n"
        );
    }

    #[test]
    fn switching_to_an_older_or_equal_channel_saves_it_and_does_not_install() {
        for (label, published) in [("older", "0.4.2"), ("equal", "0.4.10")] {
            let home = TempHome::new();
            seed_running(home.path());
            write_stored(
                home.path(),
                &stored_version(ReleaseChannel::Stable, "0.4.10"),
            );
            let world = World::new();
            let host = FakeHost::new(vec![
                (ReleaseChannel::Stable, signed("0.4.11")),
                (ReleaseChannel::Canary, signed(published)),
            ]);

            let outcome =
                switched(home.path(), &world, &host, ReleaseChannel::Canary).expect(label);

            assert!(!outcome.installed, "{label}");
            let stored = read_stored(home.path());
            assert_eq!(stored.channel, Some(ReleaseChannel::Canary), "{label}");
            assert_eq!(
                stored.platform_version.as_deref(),
                Some("0.4.10"),
                "{label}"
            );
            assert_eq!(stored.hourly_check_seconds, Some(3600), "{label}");
            assert_eq!(generation(home.path()), "1", "{label}");
            assert!(!home.path().join("updater/bin/2").exists(), "{label}");
            assert!(
                !home.path().join("updater/rollback-snapshot").is_dir(),
                "{label}"
            );
            assert!(
                !home.path().join("updater/maintenance").is_file(),
                "{label}"
            );
            assert_eq!(
                fs::read_to_string(home.path().join("docker-compose.yml")).unwrap(),
                "services: {}\n",
                "{label}"
            );
        }
    }

    #[test]
    fn a_home_waiting_on_an_older_channel_installs_when_that_channel_publishes_newer() {
        let home = TempHome::new();
        seed_running(home.path());
        let mut waiting = stored_version(ReleaseChannel::Stable, "0.4.10");
        waiting.last_hourly_check = Some(0);
        write_stored(home.path(), &waiting);
        let world = World::new();
        world.now.store(10, Ordering::SeqCst);
        let host = FakeHost::new(vec![
            (ReleaseChannel::Stable, signed("0.4.11")),
            (ReleaseChannel::Canary, signed("0.4.2")),
        ]);

        let outcome = switched(home.path(), &world, &host, ReleaseChannel::Canary).expect("switch");
        assert!(!outcome.installed);
        assert_eq!(
            read_stored(home.path()).platform_version.as_deref(),
            Some("0.4.10")
        );
        assert_eq!(
            read_stored(home.path()).channel,
            Some(ReleaseChannel::Canary)
        );

        let key = release_signing_key();
        let public = key.verifying_key();
        let check = |world: &World, host: &FakeHost| {
            hourly_check(
                home.path(),
                &InstallEnv {
                    manifests: host,
                    release_key: Some(&public),
                    runtime: world,
                    health: world,
                    space: world,
                    clock: world,
                    arch: UpdaterArch::Amd64,
                },
            )
        };

        assert!(!check(&world, &host).unwrap());
        assert_eq!(
            read_stored(home.path()).platform_version.as_deref(),
            Some("0.4.10")
        );
        assert_eq!(generation(home.path()), "1");

        host.publish(ReleaseChannel::Canary, signed("0.4.11"));
        assert!(!check(&world, &host).unwrap());
        assert_eq!(
            read_stored(home.path()).platform_version.as_deref(),
            Some("0.4.10")
        );

        world.now.store(3600, Ordering::SeqCst);
        assert!(check(&world, &host).unwrap());
        let stored = read_stored(home.path());
        assert_eq!(stored.channel, Some(ReleaseChannel::Canary));
        assert_eq!(stored.platform_version.as_deref(), Some("0.4.11"));
        assert_eq!(stored.hourly_check_seconds, Some(3600));
        assert_eq!(generation(home.path()), "2");
        assert_eq!(
            fs::read_to_string(home.path().join("docker-compose.yml")).unwrap(),
            "name: nemu\n# 0.4.11\n"
        );
    }

    #[test]
    fn a_later_release_keeps_the_stored_channel() {
        let home = TempHome::new();
        seed_running(home.path());
        let mut stored = stored_version(ReleaseChannel::Canary, "0.4.9");
        stored.hourly_check_seconds = Some(7200);
        write_stored(home.path(), &stored);
        let world = World::new();
        let host = FakeHost::new(vec![
            (ReleaseChannel::Stable, signed("0.4.12")),
            (ReleaseChannel::Canary, signed("0.4.10")),
        ]);
        let key = release_signing_key();
        let public = key.verifying_key();

        install(
            home.path(),
            &InstallEnv {
                manifests: &host,
                release_key: Some(&public),
                runtime: &world,
                health: &world,
                space: &world,
                clock: &world,
                arch: UpdaterArch::Amd64,
            },
        )
        .expect("later release");

        let stored = read_stored(home.path());
        assert_eq!(stored.channel, Some(ReleaseChannel::Canary));
        assert_eq!(stored.platform_version.as_deref(), Some("0.4.10"));
        assert_eq!(stored.hourly_check_seconds, Some(7200));
        assert_eq!(generation(home.path()), "2");
    }

    #[test]
    fn a_new_home_stays_on_stable_until_an_owner_switches() {
        let home = TempHome::new();
        seed_running(home.path());
        write_stored(
            home.path(),
            &StoredRelease {
                platform_version: Some("0.4.10".to_string()),
                ..StoredRelease::default()
            },
        );

        let report = status(home.path(), &MissingManifestHost, None).expect("status");
        assert_eq!(report.channel, ReleaseChannel::Stable);
        assert_eq!(report.platform_version, "0.4.10");
        assert_eq!(
            read_stored(home.path()).channel,
            Some(ReleaseChannel::Stable)
        );
        assert_eq!(generation(home.path()), "1");

        let world = World::new();
        let host = FakeHost::new(vec![(ReleaseChannel::Canary, signed("0.4.2"))]);
        let outcome = switched(home.path(), &world, &host, ReleaseChannel::Canary).expect("switch");

        assert!(!outcome.installed);
        assert_eq!(outcome.channel, ReleaseChannel::Canary);
        let stored = read_stored(home.path());
        assert_eq!(stored.channel, Some(ReleaseChannel::Canary));
        assert_eq!(stored.platform_version.as_deref(), Some("0.4.10"));
        assert_eq!(generation(home.path()), "1");
    }

    #[test]
    fn a_channel_switch_during_maintenance_does_not_change_the_channel() {
        let home = TempHome::new();
        seed_running(home.path());
        write_stored(
            home.path(),
            &stored_version(ReleaseChannel::Stable, "0.4.10"),
        );
        fs::write(home.path().join("updater/maintenance"), b"1\n").unwrap();
        let world = World::new();
        let host = FakeHost::new(vec![(ReleaseChannel::Canary, signed("0.4.11"))]);

        let error =
            switched(home.path(), &world, &host, ReleaseChannel::Canary).expect_err("maintenance");

        assert_eq!(error, ChannelError::InMaintenance);
        assert_eq!(
            read_stored(home.path()).channel,
            Some(ReleaseChannel::Stable)
        );
        assert_eq!(
            read_stored(home.path()).platform_version.as_deref(),
            Some("0.4.10")
        );
        assert_eq!(generation(home.path()), "1");
    }

    #[test]
    fn a_bad_signature_does_not_change_the_channel() {
        let home = TempHome::new();
        seed_running(home.path());
        write_stored(
            home.path(),
            &stored_version(ReleaseChannel::Stable, "0.4.10"),
        );
        let world = World::new();
        let signed_bytes = sign_manifest(
            &release_manifest("0.4.11"),
            &SigningKey::from_bytes(&[0x22; 32]),
        );
        let host = FakeHost::new(vec![(ReleaseChannel::Canary, signed_bytes)]);

        let error = switched(home.path(), &world, &host, ReleaseChannel::Canary)
            .expect_err("bad signature");

        assert_eq!(error, ChannelError::Rejected);
        assert_eq!(
            read_stored(home.path()).channel,
            Some(ReleaseChannel::Stable)
        );
        assert_eq!(
            read_stored(home.path()).platform_version.as_deref(),
            Some("0.4.10")
        );
        assert_eq!(generation(home.path()), "1");
        assert_eq!(
            fs::read_to_string(home.path().join("docker-compose.yml")).unwrap(),
            "services: {}\n"
        );
    }
}
