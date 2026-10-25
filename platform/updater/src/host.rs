//! Host adapters for an install outside the test seam.
//!
//! Tests pass fakes into [`crate::install`]. A Controller directory uses these
//! adapters: channel manifests and the release public key are files under that
//! directory, free space is the filesystem, and service recreation goes through
//! the container runtime. Nothing here is sent to Convex.

use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use base64::Engine;
use base64::engine::general_purpose::STANDARD as BASE64;
use ed25519_dalek::VerifyingKey;

use crate::ReleaseChannel;
use crate::install::{
    Clock, ContainerRuntime, CoreHealth, FreeSpace, HealthView, InstallEnv, InstallError,
    RunningService, SpaceReport, UpdaterArch, install,
};
use crate::manifest::{ManifestHost, ManifestHostError};

const RELEASE_KEY_FILE: &str = "updater/release-public-key";
const MANIFEST_DIR: &str = "updater/manifests";

/// Channel manifests read from `updater/manifests/{channel}.json`.
///
/// A missing file is not a Release. Status with no release key still reports
/// nothing newer, whether or not this host has a file.
pub struct DirectoryManifestHost {
    controller_dir: PathBuf,
}

impl DirectoryManifestHost {
    pub fn new(controller_dir: impl Into<PathBuf>) -> Self {
        Self {
            controller_dir: controller_dir.into(),
        }
    }
}

impl ManifestHost for DirectoryManifestHost {
    fn fetch(&self, channel: ReleaseChannel) -> Result<Option<Vec<u8>>, ManifestHostError> {
        let path = self
            .controller_dir
            .join(MANIFEST_DIR)
            .join(format!("{}.json", channel.as_str()));
        if !path.is_file() {
            return Ok(None);
        }
        std::fs::read(path)
            .map(Some)
            .map_err(|error| ManifestHostError::Unavailable(error.to_string()))
    }
}

/// The release-signing public key, when the Controller directory has one.
pub fn load_release_key(controller_dir: &Path) -> Option<VerifyingKey> {
    let bytes = std::fs::read(controller_dir.join(RELEASE_KEY_FILE)).ok()?;
    let key = if bytes.len() == 32 {
        bytes
    } else {
        let text = String::from_utf8(bytes).ok()?;
        BASE64.decode(text.trim()).ok()?
    };
    let key: [u8; 32] = key.try_into().ok()?;
    VerifyingKey::from_bytes(&key).ok()
}

/// Roll back using the host adapters. The library call is still in-process.
pub fn run_rollback(controller_dir: &Path) -> Result<(), crate::rollback::RollbackError> {
    let manifests = DirectoryManifestHost::new(controller_dir);
    let release_key = load_release_key(controller_dir);
    let runtime = DockerComposeRuntime::new(controller_dir);
    let health = HttpCoreHealth::from_env();
    let space = PosixFreeSpace::new(controller_dir);
    let clock = SystemClock;
    crate::rollback::rollback(
        controller_dir,
        &InstallEnv {
            manifests: &manifests,
            release_key: release_key.as_ref(),
            runtime: &runtime,
            health: &health,
            space: &space,
            clock: &clock,
            arch: UpdaterArch::from_host(),
        },
    )
}

/// Install using the host adapters. The library call is still in-process.
pub fn run_install(controller_dir: &Path) -> Result<(), InstallError> {
    let manifests = DirectoryManifestHost::new(controller_dir);
    let release_key = load_release_key(controller_dir);
    let runtime = DockerComposeRuntime::new(controller_dir);
    let health = HttpCoreHealth::from_env();
    let space = PosixFreeSpace::new(controller_dir);
    let clock = SystemClock;
    install(
        controller_dir,
        &InstallEnv {
            manifests: &manifests,
            release_key: release_key.as_ref(),
            runtime: &runtime,
            health: &health,
            space: &space,
            clock: &clock,
            arch: UpdaterArch::from_host(),
        },
    )
}

struct SystemClock;

impl Clock for SystemClock {
    fn now(&self) -> u64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_secs())
            .unwrap_or(0)
    }

    fn wait_until(&self, deadline: u64) -> bool {
        let now = self.now();
        if deadline > now {
            std::thread::sleep(Duration::from_secs(deadline - now));
        }
        true
    }
}

struct PosixFreeSpace {
    path: PathBuf,
}

impl PosixFreeSpace {
    fn new(path: impl Into<PathBuf>) -> Self {
        Self { path: path.into() }
    }
}

impl FreeSpace for PosixFreeSpace {
    fn report(&self) -> Result<SpaceReport, String> {
        let bytes = std::os::unix::ffi::OsStrExt::as_bytes(self.path.as_os_str());
        let path = std::ffi::CString::new(bytes).map_err(|error| error.to_string())?;
        let mut stat: libc::statvfs = unsafe { std::mem::zeroed() };
        let rc = unsafe { libc::statvfs(path.as_ptr(), &mut stat) };
        if rc != 0 {
            return Err(format!(
                "could not read free space: {}",
                std::io::Error::last_os_error()
            ));
        }
        let unit = stat.f_frsize as u64;
        Ok(SpaceReport {
            filesystem_total_bytes: (stat.f_blocks as u64).saturating_mul(unit),
            free_bytes: (stat.f_bavail as u64).saturating_mul(unit),
        })
    }
}

struct HttpCoreHealth {
    url: String,
}

impl HttpCoreHealth {
    fn from_env() -> Self {
        let url = std::env::var("NEMU_HEALTH_URL")
            .ok()
            .filter(|url| !url.is_empty())
            .unwrap_or_else(|| "http://127.0.0.1:6368/api/health".to_string());
        Self { url }
    }

    fn fetch(&self) -> HealthView {
        http_get(&self.url)
            .and_then(|body| parse_health(&body))
            .unwrap_or_else(unanswered)
    }
}

impl CoreHealth for HttpCoreHealth {
    fn before_install(&self) -> HealthView {
        self.fetch()
    }

    fn during_gate(&self, _at_seconds: u64) -> HealthView {
        self.fetch()
    }
}

fn unanswered() -> HealthView {
    HealthView {
        answered: false,
        postgres_ok: false,
        mosquitto_ok: false,
        zigbee_online: false,
        matter_online: false,
        internet_reachable: false,
        convex_reachable: false,
        devices_online: false,
    }
}

fn parse_health(body: &str) -> Option<HealthView> {
    let value: serde_json::Value = serde_json::from_str(body).ok()?;
    let flag = |name: &str| {
        value
            .get(name)
            .and_then(|item| item.as_bool())
            .unwrap_or(false)
    };
    Some(HealthView {
        answered: true,
        postgres_ok: flag("db"),
        mosquitto_ok: flag("mqtt"),
        zigbee_online: flag("zigbee"),
        matter_online: flag("matter"),
        internet_reachable: false,
        convex_reachable: false,
        devices_online: false,
    })
}

fn http_get(url: &str) -> Option<String> {
    let rest = url.strip_prefix("http://")?;
    let (hostport, path) = rest.split_once('/').unwrap_or((rest, ""));
    let path = format!("/{path}");
    let (host, port) = match hostport.split_once(':') {
        Some((host, port)) => (host, port.parse().ok()?),
        None => (hostport, 80),
    };
    let mut stream = TcpStream::connect_timeout(
        &format!("{host}:{port}").parse().ok()?,
        Duration::from_secs(2),
    )
    .ok()?;
    stream.set_read_timeout(Some(Duration::from_secs(2))).ok()?;
    stream
        .set_write_timeout(Some(Duration::from_secs(2)))
        .ok()?;
    let request = format!("GET {path} HTTP/1.1\r\nHost: {host}\r\nConnection: close\r\n\r\n");
    stream.write_all(request.as_bytes()).ok()?;
    let mut bytes = Vec::new();
    stream.read_to_end(&mut bytes).ok()?;
    let text = String::from_utf8(bytes).ok()?;
    let (head, body) = text.split_once("\r\n\r\n")?;
    if !head.contains(" 200 ")
        && !head.starts_with("HTTP/1.1 200")
        && !head.starts_with("HTTP/1.0 200")
    {
        return None;
    }
    Some(body.to_string())
}

struct DockerComposeRuntime {
    dir: PathBuf,
}

impl DockerComposeRuntime {
    fn new(dir: impl Into<PathBuf>) -> Self {
        Self { dir: dir.into() }
    }

    fn compose(&self, args: &[&str]) -> Result<(), String> {
        let output = Command::new("docker")
            .arg("compose")
            .args(args)
            .current_dir(&self.dir)
            .output()
            .map_err(|error| format!("container runtime is unavailable: {error}"))?;
        if output.status.success() {
            Ok(())
        } else {
            Err(format!(
                "container runtime is unavailable: {}",
                String::from_utf8_lossy(&output.stderr).trim()
            ))
        }
    }
}

impl ContainerRuntime for DockerComposeRuntime {
    fn services(&self) -> Result<Vec<RunningService>, String> {
        let compose =
            std::fs::read_to_string(self.dir.join("docker-compose.yml")).unwrap_or_default();
        let output = Command::new("docker")
            .args(["compose", "ps", "--all", "--format", "json"])
            .current_dir(&self.dir)
            .output()
            .map_err(|error| format!("container runtime is unavailable: {error}"))?;
        if !output.status.success() {
            return Err(format!(
                "container runtime is unavailable: {}",
                String::from_utf8_lossy(&output.stderr).trim()
            ));
        }
        let text = String::from_utf8_lossy(&output.stdout);
        let mut services = Vec::new();
        for row in compose_ps_rows(&text) {
            let Some(service) = row.get("Service").and_then(|value| value.as_str()) else {
                continue;
            };
            if !crate::RELEASE_SERVICES.contains(&service) {
                continue;
            }
            let image = row
                .get("Image")
                .and_then(|value| value.as_str())
                .unwrap_or("");
            let digest = digest_from_reference(image)
                .or_else(|| inspect_digest(image).ok())
                .unwrap_or_default();
            services.push(RunningService {
                service: service.to_string(),
                digest,
                mounted_stack_files: mounted_stack_files(&compose, service),
            });
        }
        Ok(services)
    }

    fn quiesce(&self) -> Result<(), String> {
        self.compose(&[
            "pause",
            "postgres",
            "mosquitto",
            "zigbee2mqtt",
            "nemu-matter",
            "nemu-core",
        ])
    }

    fn resume(&self) -> Result<(), String> {
        self.compose(&[
            "unpause",
            "postgres",
            "mosquitto",
            "zigbee2mqtt",
            "nemu-matter",
            "nemu-core",
        ])
    }

    fn recreate(&self, service: &str, _digest: &str) -> Result<(), String> {
        self.compose(&[
            "up",
            "-d",
            "--no-deps",
            "--force-recreate",
            "--pull",
            "always",
            service,
        ])
    }

    fn rerun_matter_trust_roots(&self, script: &Path) -> Result<(), String> {
        let output = Command::new("bash")
            .arg(script)
            .current_dir(&self.dir)
            .output()
            .map_err(|error| format!("could not re-run Matter trust roots: {error}"))?;
        if output.status.success() {
            Ok(())
        } else {
            Err(format!(
                "could not re-run Matter trust roots: {}",
                String::from_utf8_lossy(&output.stderr).trim()
            ))
        }
    }
}

fn compose_ps_rows(text: &str) -> Vec<serde_json::Value> {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return Vec::new();
    }
    if trimmed.starts_with('[') {
        return serde_json::from_str(trimmed).unwrap_or_default();
    }
    trimmed
        .lines()
        .filter_map(|line| serde_json::from_str(line.trim()).ok())
        .collect()
}

fn digest_from_reference(image: &str) -> Option<String> {
    image
        .split_once('@')
        .map(|(_, digest)| digest.trim().to_string())
        .filter(|digest| digest.starts_with("sha256:") && digest.len() == "sha256:".len() + 64)
}

fn inspect_digest(image: &str) -> Result<String, String> {
    if image.is_empty() {
        return Err("the service has no image".to_string());
    }
    let output = Command::new("docker")
        .args([
            "image",
            "inspect",
            "--format",
            "{{index .RepoDigests 0}}",
            image,
        ])
        .output()
        .map_err(|error| error.to_string())?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }
    let text = String::from_utf8_lossy(&output.stdout);
    digest_from_reference(text.trim()).ok_or_else(|| format!("no digest for {image}"))
}

/// Stack files mounted into one compose service. The compose file itself is
/// not a mount; a path has to appear in that service's block.
pub(crate) fn mounted_stack_files(compose: &str, service: &str) -> Vec<String> {
    let block = service_block(compose, service);
    [
        "docker-compose.yml",
        "mosquitto/mosquitto.conf",
        "fetch-matter-roots.sh",
    ]
    .into_iter()
    .filter(|path| block.contains(path))
    .map(str::to_string)
    .collect()
}

fn service_block(compose: &str, service: &str) -> String {
    let mut lines = Vec::new();
    let mut inside = false;
    for line in compose.lines() {
        let header = line.starts_with("  ")
            && !line.starts_with("   ")
            && line.trim_end().ends_with(':')
            && !line.trim_start().starts_with('#');
        if header {
            if inside {
                break;
            }
            let name = line.trim().trim_end_matches(':').trim();
            inside = name == service;
            continue;
        }
        if inside {
            lines.push(line);
        }
    }
    lines.join("\n")
}

#[cfg(test)]
mod tests {
    use super::{digest_from_reference, mounted_stack_files, parse_health};

    #[test]
    fn a_service_mounts_only_the_stack_file_named_in_its_block() {
        let compose = "\
services:
  mosquitto:
    volumes:
      - ./mosquitto/mosquitto.conf:/mosquitto/config/mosquitto.conf:ro
  postgres:
    image: example/postgres@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
  nemu-matter:
    image: example/nemu-matter@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
";
        assert_eq!(
            mounted_stack_files(compose, "mosquitto"),
            vec!["mosquitto/mosquitto.conf".to_string()]
        );
        assert!(mounted_stack_files(compose, "postgres").is_empty());
        assert!(mounted_stack_files(compose, "nemu-matter").is_empty());
    }

    #[test]
    fn a_digest_pin_is_the_part_after_the_at_sign() {
        let digest = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
        assert_eq!(
            digest_from_reference(&format!("example/nemu-matter@{digest}")).as_deref(),
            Some(digest)
        );
        assert_eq!(digest_from_reference("example/nemu-matter:latest"), None);
    }

    #[test]
    fn core_health_comes_from_postgres_and_mosquitto() {
        let view =
            parse_health(r#"{"status":"ok","mqtt":true,"zigbee":false,"matter":true,"db":true}"#)
                .expect("health");
        assert!(view.answered);
        assert!(view.postgres_ok);
        assert!(view.mosquitto_ok);
        assert!(!view.zigbee_online);
        assert!(view.matter_online);
        assert!(!view.internet_reachable);
        assert!(!view.convex_reachable);
        assert!(!view.devices_online);
    }
}
