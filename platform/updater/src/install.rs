use std::path::Path;

use base64::Engine;
use base64::engine::general_purpose::STANDARD as BASE64;
use ed25519_dalek::VerifyingKey;

use crate::manifest::{ManifestHost, ReleaseManifest, SettingMigration};
use crate::{
    ReleaseChannel, StatusError, platform_version_is_newer, read_stored_release,
    write_stored_release,
};

const MAINTENANCE_FILE: &str = "updater/maintenance";
pub(crate) const SNAPSHOT_DIR: &str = "updater/rollback-snapshot";
pub(crate) const GENERATION_FILE: &str = "updater/wrapper-generation";
pub(crate) const BINARY_DIR: &str = "updater/bin";
pub(crate) const HOURLY_CHECK_DEFAULT_SECS: u64 = 60 * 60;
const HEALTH_GATE_SECS: u64 = 60;
const HEALTH_GATE_LIMIT_SECS: u64 = 600;
const GIB: u64 = 1024 * 1024 * 1024;

pub(crate) const STACK_FILES: [&str; 2] = ["docker-compose.yml", "mosquitto/mosquitto.conf"];
pub(crate) const MATTER_TRUST_ROOT_SCRIPT: &str = "fetch-matter-roots.sh";
const MIGRATION_KEYS: [&str; 4] = ["mqtt", "homeassistant", "frontend", "availability"];
const ZIGBEE_CONFIGURATION: &str = "zigbee2mqtt/configuration.yaml";

/// Home-data trees copied into the Rollback snapshot, and the directory each
/// lands in under that snapshot. Stack files and the previous binary are
/// copied beside them. The next Release replaces this directory outright.
pub(crate) const SNAPSHOT_TREES: &[(&str, &str)] = &[
    ("volumes/postgres", "postgres"),
    ("identity", "identity"),
    ("tls", "tls"),
    ("zigbee2mqtt", "adapters/zigbee2mqtt"),
    ("volumes/matter", "adapters/matter"),
    ("mosquitto/data", "adapters/mosquitto"),
];

pub fn maintenance_mode(controller_dir: &Path) -> bool {
    controller_dir.join(MAINTENANCE_FILE).is_file()
}

pub(crate) fn snapshot_kept(controller_dir: &Path) -> bool {
    controller_dir.join(SNAPSHOT_DIR).is_dir()
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum UpdaterArch {
    Amd64,
    Arm64,
}

impl UpdaterArch {
    pub fn from_host() -> Self {
        if std::env::consts::ARCH == "aarch64" {
            Self::Arm64
        } else {
            Self::Amd64
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RunningService {
    pub service: String,
    pub digest: String,
    pub mounted_stack_files: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HealthView {
    pub answered: bool,
    pub postgres_ok: bool,
    pub mosquitto_ok: bool,
    pub zigbee_online: bool,
    pub matter_online: bool,
    pub internet_reachable: bool,
    pub convex_reachable: bool,
    pub devices_online: bool,
}

impl HealthView {
    fn core_healthy(&self) -> bool {
        self.answered && self.postgres_ok && self.mosquitto_ok
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SpaceReport {
    pub filesystem_total_bytes: u64,
    pub free_bytes: u64,
}

pub trait ContainerRuntime {
    fn services(&self) -> Result<Vec<RunningService>, String>;
    fn quiesce(&self) -> Result<(), String>;
    fn resume(&self) -> Result<(), String>;
    fn recreate(&self, service: &str, digest: &str) -> Result<(), String>;
    fn rerun_matter_trust_roots(&self, script: &Path) -> Result<(), String>;
}

pub trait CoreHealth {
    fn before_install(&self) -> HealthView;
    fn during_gate(&self, at_seconds: u64) -> HealthView;
}

pub trait FreeSpace {
    fn report(&self) -> Result<SpaceReport, String>;
}

pub trait Clock {
    fn now(&self) -> u64;
    fn wait_until(&self, deadline: u64) -> bool;
}

pub struct InstallEnv<'a> {
    pub manifests: &'a dyn ManifestHost,
    pub release_key: Option<&'a VerifyingKey>,
    pub runtime: &'a dyn ContainerRuntime,
    pub health: &'a dyn CoreHealth,
    pub space: &'a dyn FreeSpace,
    pub clock: &'a dyn Clock,
    pub arch: UpdaterArch,
}

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum InstallError {
    #[error("the installed Platform version is not stored")]
    PlatformVersionMissing,
    #[error("no newer Release is available")]
    NotEligible,
    #[error("the release manifest was rejected")]
    Rejected,
    #[error("a migration names a setting the Release cannot change")]
    MigrationRefused,
    #[error("free space after the History floor is below the snapshot size")]
    InsufficientSpace,
    #[error("the home is already in maintenance")]
    InMaintenance,
    #[error("the snapshot could not be taken")]
    SnapshotFailed,
    #[error("the health gate did not pass")]
    HealthGate,
    #[error("{0}")]
    Unavailable(String),
}

/// Installs the newer Release on the stored channel.
///
/// The process that enters this function is the previous Updater: the binary
/// the wrapper would start, and a new wrapper pin, are replaced only after
/// the health gate. A failed gate restores the snapshot, previous stack files,
/// previous digests, and the previous binary. Maintenance stays only when that
/// restore cannot finish or the previous Release will not stay healthy.
pub fn install(controller_dir: &Path, env: &InstallEnv<'_>) -> Result<(), InstallError> {
    if maintenance_mode(controller_dir) {
        return Err(InstallError::InMaintenance);
    }
    let manifest = verified_newer_manifest(controller_dir, env)?;
    if manifest
        .migrations
        .iter()
        .any(|migration| !MIGRATION_KEYS.contains(&migration.key.as_str()))
    {
        return Err(InstallError::MigrationRefused);
    }
    let binary = decode_binary(&manifest, env.arch)?;
    let next_pin = decode_next_pin(&manifest)?;
    let space = env.space.report().map_err(InstallError::Unavailable)?;
    let snapshot_bytes = snapshot_size(controller_dir);
    let room = space
        .free_bytes
        .saturating_sub(history_floor(space.filesystem_total_bytes));
    if room < snapshot_bytes {
        return Err(InstallError::InsufficientSpace);
    }

    let before = env.health.before_install();
    let core_was_up = before.answered;
    let zigbee_required = core_was_up && before.zigbee_online;
    let matter_required = core_was_up && before.matter_online;
    let running = env.runtime.services().map_err(InstallError::Unavailable)?;
    let changed_stacks = changed_stack_files(controller_dir, &manifest);

    set_maintenance(controller_dir, true)?;
    if let Err(error) = env.runtime.quiesce() {
        set_maintenance(controller_dir, false)?;
        return Err(InstallError::Unavailable(error));
    }
    if let Err(error) = write_snapshot(controller_dir, &running, zigbee_required, matter_required) {
        let _ = env.runtime.resume();
        clear_snapshot(controller_dir);
        set_maintenance(controller_dir, false)?;
        return Err(error);
    }
    if let Err(error) = env.runtime.resume() {
        return Err(InstallError::Unavailable(error));
    }
    if let Err(error) = apply_release(controller_dir, &manifest, &running, &changed_stacks, env) {
        return Err(error);
    }
    if let Err(error) = wait_for_health(env, zigbee_required, matter_required) {
        let _ = crate::rollback::restore_after_failed_gate(controller_dir, env);
        return Err(error);
    }

    if let Err(error) = commit_binary(controller_dir, &binary) {
        let _ = crate::rollback::restore_after_failed_gate(controller_dir, env);
        return Err(error);
    }
    if let Some(next_pin) = next_pin
        && let Err(error) = crate::wrapper::commit_pin(controller_dir, &next_pin)
    {
        let _ = crate::rollback::restore_after_failed_gate(controller_dir, env);
        return Err(InstallError::Unavailable(error.to_string()));
    }
    if let Err(error) = record_installed(controller_dir, &manifest) {
        let _ = crate::rollback::restore_after_failed_gate(controller_dir, env);
        return Err(error);
    }
    set_maintenance(controller_dir, false)?;
    Ok(())
}

/// Installs a newer Release when the stored interval has elapsed.
///
/// The interval is Home data and defaults to one hour. A Release does not
/// overwrite it. No Owner is required. A stuck rollback is retried and the
/// failed Release is not installed again.
pub fn hourly_check(controller_dir: &Path, env: &InstallEnv<'_>) -> Result<bool, InstallError> {
    if crate::rollback::rollback_stuck(controller_dir) {
        let _ = crate::rollback::rollback(controller_dir, env);
        return Ok(false);
    }
    if maintenance_mode(controller_dir) && crate::rollback::snapshot_consumed(controller_dir) {
        let _ = crate::rollback::rollback(controller_dir, env);
    }
    if maintenance_mode(controller_dir) {
        return Ok(false);
    }
    let stored = read_stored_release(controller_dir)
        .map_err(|error| InstallError::Unavailable(error.to_string()))?
        .unwrap_or_default();
    let interval = stored
        .hourly_check_seconds
        .unwrap_or(HOURLY_CHECK_DEFAULT_SECS);
    let now = env.clock.now();
    let due = match stored.last_hourly_check {
        Some(last) => now.saturating_sub(last) >= interval,
        None => true,
    };
    if !due {
        return Ok(false);
    }
    match install(controller_dir, env) {
        Ok(()) => {
            mark_hourly_check(controller_dir, now)?;
            Ok(true)
        }
        Err(InstallError::NotEligible) => {
            mark_hourly_check(controller_dir, now)?;
            Ok(false)
        }
        Err(InstallError::HealthGate) => {
            if !maintenance_mode(controller_dir) {
                mark_hourly_check(controller_dir, now)?;
            }
            Ok(false)
        }
        Err(error) => Err(error),
    }
}

fn verified_newer_manifest(
    controller_dir: &Path,
    env: &InstallEnv<'_>,
) -> Result<ReleaseManifest, InstallError> {
    let stored = read_stored_release(controller_dir).map_err(|error| match error {
        StatusError::PlatformVersionMissing => InstallError::PlatformVersionMissing,
        other => InstallError::Unavailable(other.to_string()),
    })?;
    let stored = stored.unwrap_or_default();
    let channel = stored.channel.unwrap_or(ReleaseChannel::Stable);
    let installed = stored
        .platform_version
        .filter(|version| !version.trim().is_empty())
        .ok_or(InstallError::PlatformVersionMissing)?;
    let release_key = crate::wrapper::load_pin(controller_dir).or(env.release_key.copied());
    let Some(release_key) = release_key else {
        return Err(InstallError::NotEligible);
    };
    let Some(bytes) = env
        .manifests
        .fetch(channel)
        .map_err(|error| InstallError::Unavailable(error.to_string()))?
    else {
        return Err(InstallError::NotEligible);
    };
    let manifest = crate::manifest::verify_manifest(&bytes, &release_key)
        .map_err(|_| InstallError::Rejected)?;
    if !platform_version_is_newer(&manifest.platform_version, &installed) {
        return Err(InstallError::NotEligible);
    }
    Ok(manifest)
}

fn decode_next_pin(manifest: &ReleaseManifest) -> Result<Option<VerifyingKey>, InstallError> {
    match &manifest.next_pin {
        None => Ok(None),
        Some(pin) => crate::manifest::parse_next_pin(pin)
            .map(Some)
            .map_err(|_| InstallError::Rejected),
    }
}

fn decode_binary(manifest: &ReleaseManifest, arch: UpdaterArch) -> Result<Vec<u8>, InstallError> {
    let encoded = match arch {
        UpdaterArch::Amd64 => &manifest.updater.amd64,
        UpdaterArch::Arm64 => &manifest.updater.arm64,
    };
    BASE64
        .decode(encoded.trim())
        .map_err(|_| InstallError::Rejected)
}

fn apply_release(
    controller_dir: &Path,
    manifest: &ReleaseManifest,
    running: &[RunningService],
    changed_stacks: &[String],
    env: &InstallEnv<'_>,
) -> Result<(), InstallError> {
    write_stack_files(controller_dir, manifest)?;
    migrate_zigbee(controller_dir, manifest)?;
    for service in &manifest.services {
        let current = running.iter().find(|item| item.service == service.service);
        let digest_changed = current
            .map(|item| item.digest != service.digest)
            .unwrap_or(true);
        let mount_changed = current
            .map(|item| {
                item.mounted_stack_files
                    .iter()
                    .any(|path| changed_stacks.iter().any(|changed| changed == path))
            })
            .unwrap_or(false);
        if digest_changed || mount_changed {
            env.runtime
                .recreate(&service.service, &service.digest)
                .map_err(InstallError::Unavailable)?;
        }
    }
    if changed_stacks
        .iter()
        .any(|path| path == MATTER_TRUST_ROOT_SCRIPT)
    {
        env.runtime
            .rerun_matter_trust_roots(&controller_dir.join(MATTER_TRUST_ROOT_SCRIPT))
            .map_err(InstallError::Unavailable)?;
    }
    Ok(())
}

pub(crate) fn wait_for_health(
    env: &InstallEnv<'_>,
    zigbee_required: bool,
    matter_required: bool,
) -> Result<(), InstallError> {
    let started = env.clock.now();
    let mut healthy_since = None;
    loop {
        let now = env.clock.now();
        if now.saturating_sub(started) > HEALTH_GATE_LIMIT_SECS {
            return Err(InstallError::HealthGate);
        }
        let sample = env.health.during_gate(now);
        if sample.core_healthy() {
            let since = *healthy_since.get_or_insert(now);
            let adapters_ok = (!zigbee_required || sample.zigbee_online)
                && (!matter_required || sample.matter_online);
            if adapters_ok && now.saturating_sub(since) >= HEALTH_GATE_SECS {
                return Ok(());
            }
        } else {
            healthy_since = None;
        }
        let next = now.saturating_add(1);
        if !env.clock.wait_until(next) || env.clock.now() <= now {
            return Err(InstallError::HealthGate);
        }
    }
}

fn changed_stack_files(controller_dir: &Path, manifest: &ReleaseManifest) -> Vec<String> {
    manifest
        .stack_files
        .iter()
        .filter(|file| {
            allowed_stack_path(&file.path)
                && std::fs::read(controller_dir.join(&file.path))
                    .ok()
                    .as_deref()
                    != Some(file.contents.as_bytes())
        })
        .map(|file| file.path.clone())
        .collect()
}

fn allowed_stack_path(path: &str) -> bool {
    !path.contains("..") && (STACK_FILES.contains(&path) || path == MATTER_TRUST_ROOT_SCRIPT)
}

fn write_stack_files(
    controller_dir: &Path,
    manifest: &ReleaseManifest,
) -> Result<(), InstallError> {
    for file in &manifest.stack_files {
        if !allowed_stack_path(&file.path) {
            continue;
        }
        let path = controller_dir.join(&file.path);
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|error| InstallError::Unavailable(error.to_string()))?;
        }
        std::fs::write(path, &file.contents)
            .map_err(|error| InstallError::Unavailable(error.to_string()))?;
    }
    Ok(())
}

fn migrate_zigbee(controller_dir: &Path, manifest: &ReleaseManifest) -> Result<(), InstallError> {
    if manifest.migrations.is_empty() {
        return Ok(());
    }
    let path = controller_dir.join(ZIGBEE_CONFIGURATION);
    let existing = if path.is_file() {
        std::fs::read_to_string(&path)
            .map_err(|error| InstallError::Unavailable(error.to_string()))?
    } else {
        String::new()
    };
    let updated = apply_migrations(&existing, &manifest.migrations)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|error| InstallError::Unavailable(error.to_string()))?;
    }
    std::fs::write(path, updated).map_err(|error| InstallError::Unavailable(error.to_string()))
}

fn apply_migrations(
    existing: &str,
    migrations: &[SettingMigration],
) -> Result<String, InstallError> {
    for migration in migrations {
        if !MIGRATION_KEYS.contains(&migration.key.as_str()) {
            return Err(InstallError::MigrationRefused);
        }
    }
    let mut blocks = split_top_level(existing);
    for migration in migrations {
        let rendered = render_block(&migration.key, &migration.value);
        if let Some((_, body)) = blocks.iter_mut().find(|(key, _)| key == &migration.key) {
            *body = rendered;
        } else {
            blocks.push((migration.key.clone(), rendered));
        }
    }
    let mut text = blocks.into_iter().map(|(_, body)| body).collect::<String>();
    if !text.is_empty() && !text.ends_with('\n') {
        text.push('\n');
    }
    Ok(text)
}

fn split_top_level(yaml: &str) -> Vec<(String, String)> {
    let mut blocks: Vec<(String, String)> = Vec::new();
    for line in yaml.split_inclusive('\n') {
        if is_top_level_key(line) {
            let key = line
                .trim_end_matches(['\n', '\r'])
                .split_once(':')
                .map(|(key, _)| key.trim().to_string())
                .unwrap_or_default();
            blocks.push((key, String::new()));
        } else if blocks.is_empty() {
            blocks.push((String::new(), String::new()));
        }
        if let Some((_, body)) = blocks.last_mut() {
            body.push_str(line);
        }
    }
    blocks
}

fn is_top_level_key(line: &str) -> bool {
    let trimmed = line.trim_end_matches(['\n', '\r']);
    if trimmed.is_empty()
        || trimmed.starts_with('#')
        || trimmed.starts_with(' ')
        || trimmed.starts_with('\t')
    {
        return false;
    }
    let Some((key, _)) = trimmed.split_once(':') else {
        return false;
    };
    !key.is_empty() && !key.contains(' ') && !key.starts_with('-')
}

fn render_block(key: &str, value: &str) -> String {
    let mut rendered = format!("{key}:\n");
    for line in value.split_inclusive('\n') {
        if line.trim().is_empty() {
            if line.contains('\n') {
                rendered.push('\n');
            }
            continue;
        }
        if line.starts_with(' ') || line.starts_with('\t') {
            rendered.push_str(line);
        } else {
            rendered.push_str("  ");
            rendered.push_str(line);
        }
    }
    if !rendered.ends_with('\n') {
        rendered.push('\n');
    }
    rendered
}

fn snapshot_size(controller_dir: &Path) -> u64 {
    let mut total = 0u64;
    for (source, _) in SNAPSHOT_TREES {
        total = total.saturating_add(tree_size(&controller_dir.join(source)));
    }
    for path in STACK_FILES {
        total = total.saturating_add(file_size(&controller_dir.join(path)));
    }
    total = total.saturating_add(file_size(&controller_dir.join(MATTER_TRUST_ROOT_SCRIPT)));
    let generation = current_generation(controller_dir);
    if generation > 0 {
        total = total.saturating_add(file_size(
            &controller_dir.join(BINARY_DIR).join(generation.to_string()),
        ));
    }
    total
}

fn write_snapshot(
    controller_dir: &Path,
    running: &[RunningService],
    zigbee_required: bool,
    matter_required: bool,
) -> Result<(), InstallError> {
    let root = controller_dir.join(SNAPSHOT_DIR);
    if root.exists() {
        std::fs::remove_dir_all(&root).map_err(|_| InstallError::SnapshotFailed)?;
    }
    std::fs::create_dir_all(&root).map_err(|_| InstallError::SnapshotFailed)?;
    for (source, dest) in SNAPSHOT_TREES {
        copy_tree(&controller_dir.join(source), &root.join(dest))?;
    }
    for path in STACK_FILES {
        copy_tree(&controller_dir.join(path), &root.join("stack").join(path))?;
    }
    copy_tree(
        &controller_dir.join(MATTER_TRUST_ROOT_SCRIPT),
        &root.join("stack").join(MATTER_TRUST_ROOT_SCRIPT),
    )?;
    let generation = current_generation(controller_dir);
    if generation > 0 {
        copy_tree(
            &controller_dir.join(BINARY_DIR).join(generation.to_string()),
            &root.join("previous-updater"),
        )?;
    }
    crate::rollback::capture(
        controller_dir,
        &root,
        running,
        zigbee_required,
        matter_required,
        generation,
    )?;
    Ok(())
}

fn clear_snapshot(controller_dir: &Path) {
    let _ = std::fs::remove_dir_all(controller_dir.join(SNAPSHOT_DIR));
}

pub(crate) fn copy_tree(source: &Path, dest: &Path) -> Result<(), InstallError> {
    if !source.exists() {
        return Ok(());
    }
    if source.is_file() {
        if let Some(parent) = dest.parent() {
            std::fs::create_dir_all(parent).map_err(|_| InstallError::SnapshotFailed)?;
        }
        std::fs::copy(source, dest).map_err(|_| InstallError::SnapshotFailed)?;
        return Ok(());
    }
    std::fs::create_dir_all(dest).map_err(|_| InstallError::SnapshotFailed)?;
    let entries = std::fs::read_dir(source).map_err(|_| InstallError::SnapshotFailed)?;
    for entry in entries {
        let entry = entry.map_err(|_| InstallError::SnapshotFailed)?;
        copy_tree(&entry.path(), &dest.join(entry.file_name()))?;
    }
    Ok(())
}

fn tree_size(path: &Path) -> u64 {
    if !path.exists() {
        return 0;
    }
    if path.is_file() {
        return file_size(path);
    }
    let Ok(entries) = std::fs::read_dir(path) else {
        return 0;
    };
    entries.flatten().fold(0, |total, entry| {
        total.saturating_add(tree_size(&entry.path()))
    })
}

fn file_size(path: &Path) -> u64 {
    std::fs::metadata(path).map(|meta| meta.len()).unwrap_or(0)
}

pub(crate) fn current_generation(controller_dir: &Path) -> u64 {
    std::fs::read_to_string(controller_dir.join(GENERATION_FILE))
        .ok()
        .and_then(|text| text.trim().parse().ok())
        .unwrap_or(0)
}

fn commit_binary(controller_dir: &Path, bytes: &[u8]) -> Result<(), InstallError> {
    let next = current_generation(controller_dir).saturating_add(1);
    let path = controller_dir.join(BINARY_DIR).join(next.to_string());
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|error| InstallError::Unavailable(error.to_string()))?;
    }
    std::fs::write(&path, bytes).map_err(|error| InstallError::Unavailable(error.to_string()))?;
    std::fs::write(controller_dir.join(GENERATION_FILE), format!("{next}\n"))
        .map_err(|error| InstallError::Unavailable(error.to_string()))
}

fn record_installed(controller_dir: &Path, manifest: &ReleaseManifest) -> Result<(), InstallError> {
    let mut stored = read_stored_release(controller_dir)
        .map_err(|error| InstallError::Unavailable(error.to_string()))?
        .unwrap_or_default();
    if stored.channel.is_none() {
        stored.channel = Some(ReleaseChannel::Stable);
    }
    stored.platform_version = Some(manifest.platform_version.clone());
    stored.services = manifest.services.clone();
    write_stored_release(controller_dir, &stored)
        .map_err(|error| InstallError::Unavailable(error.to_string()))
}

fn mark_hourly_check(controller_dir: &Path, now: u64) -> Result<(), InstallError> {
    let mut stored = read_stored_release(controller_dir)
        .map_err(|error| InstallError::Unavailable(error.to_string()))?
        .unwrap_or_default();
    stored.last_hourly_check = Some(now);
    write_stored_release(controller_dir, &stored)
        .map_err(|error| InstallError::Unavailable(error.to_string()))
}

pub(crate) fn set_maintenance(controller_dir: &Path, held: bool) -> Result<(), InstallError> {
    let path = controller_dir.join(MAINTENANCE_FILE);
    if held {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|error| InstallError::Unavailable(error.to_string()))?;
        }
        std::fs::write(&path, b"1\n").map_err(|error| InstallError::Unavailable(error.to_string()))
    } else if path.exists() {
        std::fs::remove_file(path).map_err(|error| InstallError::Unavailable(error.to_string()))
    } else {
        Ok(())
    }
}

/// History floor from `free_space_floor` with no updater requirement yet.
/// The snapshot has to fit in the free space that remains after this floor.
fn history_floor(filesystem_total_bytes: u64) -> u64 {
    let fifteen_percent = filesystem_total_bytes.saturating_mul(15) / 100;
    fifteen_percent.max(8 * GIB)
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
    use std::sync::{Arc, Mutex};
    use std::time::{SystemTime, UNIX_EPOCH};

    use base64::Engine;
    use base64::engine::general_purpose::STANDARD as BASE64;
    use ed25519_dalek::SigningKey;

    use super::{
        BINARY_DIR, GENERATION_FILE, HEALTH_GATE_LIMIT_SECS, HealthView, InstallEnv, InstallError,
        MAINTENANCE_FILE, RunningService, SNAPSHOT_DIR, SpaceReport, UpdaterArch, hourly_check,
        install,
    };
    use crate::manifest::{
        ManifestHost, ManifestHostError, ReleaseManifest, ServiceImage, SettingMigration,
        StackFile, UpdaterBinaries, sign_manifest,
    };
    use crate::{
        RELEASE_SERVICES, ReleaseChannel, installed_release_path, load_release_key, status,
    };

    const PREVIOUS_UPDATER: &[u8] = b"previous-updater";
    const CURRENT_PIN: &str = "updater/release-public-key";
    const PREVIOUS_WRAPPER: &str = "updater/previous-wrapper";
    const AMD64_UPDATER: &[u8] = b"amd64-generation-2";
    const ARM64_UPDATER: &[u8] = b"arm64-generation-2";
    const GIB: u64 = 1024 * 1024 * 1024;

    struct TempHome(PathBuf);

    impl TempHome {
        fn new() -> Self {
            static NEXT: AtomicU64 = AtomicU64::new(0);
            let n = NEXT.fetch_add(1, Ordering::Relaxed);
            let nanos = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("clock")
                .as_nanos();
            let path = std::env::temp_dir().join(format!("nemu-updater-install-{nanos}-{n}"));
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
    }

    impl ManifestHost for FakeHost {
        fn fetch(&self, channel: ReleaseChannel) -> Result<Option<Vec<u8>>, ManifestHostError> {
            Ok(self
                .manifests
                .iter()
                .find(|(stored, _)| *stored == channel)
                .map(|(_, bytes)| bytes.clone()))
        }
    }

    type DuringGateHook = Box<dyn Fn(u64) + Send>;

    struct World {
        home: PathBuf,
        now: AtomicU64,
        horizon: AtomicU64,
        total: AtomicU64,
        free: AtomicU64,
        services: Mutex<Vec<RunningService>>,
        recreated: Mutex<Vec<(String, String)>>,
        reran_trust_roots: AtomicBool,
        log: Mutex<Vec<String>>,
        before: Mutex<HealthView>,
        during: Mutex<Vec<(u64, HealthView)>>,
        during_hook: Mutex<Option<DuringGateHook>>,
    }

    impl World {
        fn new(home: &Path) -> Self {
            Self {
                home: home.to_path_buf(),
                now: AtomicU64::new(0),
                horizon: AtomicU64::new(20_000),
                total: AtomicU64::new(100 * GIB),
                free: AtomicU64::new(80 * GIB),
                services: Mutex::new(Vec::new()),
                recreated: Mutex::new(Vec::new()),
                reran_trust_roots: AtomicBool::new(false),
                log: Mutex::new(Vec::new()),
                before: Mutex::new(healthy()),
                during: Mutex::new(vec![(0, healthy())]),
                during_hook: Mutex::new(None),
            }
        }

        fn note(&self, phase: &str) {
            let maintenance = self.home.join(MAINTENANCE_FILE).is_file();
            let snapshot = self.home.join(SNAPSHOT_DIR).is_dir();
            let generation = fs::read_to_string(self.home.join(GENERATION_FILE))
                .unwrap_or_default()
                .trim()
                .to_string();
            self.log.lock().expect("log").push(format!(
                "{phase} maintenance={maintenance} snapshot={snapshot} generation={generation}"
            ));
        }

        fn recreated_services(&self) -> Vec<String> {
            self.recreated
                .lock()
                .expect("recreated")
                .iter()
                .map(|(service, _)| service.clone())
                .collect()
        }
    }

    impl super::ContainerRuntime for World {
        fn services(&self) -> Result<Vec<RunningService>, String> {
            Ok(self.services.lock().expect("services").clone())
        }

        fn quiesce(&self) -> Result<(), String> {
            self.note("quiesce");
            Ok(())
        }

        fn resume(&self) -> Result<(), String> {
            self.note("resume");
            Ok(())
        }

        fn recreate(&self, service: &str, digest: &str) -> Result<(), String> {
            self.note(&format!("recreate {service}"));
            self.recreated
                .lock()
                .expect("recreated")
                .push((service.to_string(), digest.to_string()));
            Ok(())
        }

        fn rerun_matter_trust_roots(&self, script: &Path) -> Result<(), String> {
            let _ = script;
            self.reran_trust_roots.store(true, Ordering::SeqCst);
            Ok(())
        }
    }

    impl super::CoreHealth for World {
        fn before_install(&self) -> HealthView {
            self.before.lock().expect("before").clone()
        }

        fn during_gate(&self, at_seconds: u64) -> HealthView {
            self.note("health");
            if let Some(hook) = self.during_hook.lock().expect("hook").as_ref() {
                hook(at_seconds);
            }
            let during = self.during.lock().expect("during");
            during
                .iter()
                .rev()
                .find(|(at, _)| *at <= at_seconds)
                .map(|(_, view)| view.clone())
                .unwrap_or_else(healthy)
        }
    }

    impl super::FreeSpace for World {
        fn report(&self) -> Result<SpaceReport, String> {
            self.note("space");
            Ok(SpaceReport {
                filesystem_total_bytes: self.total.load(Ordering::SeqCst),
                free_bytes: self.free.load(Ordering::SeqCst),
            })
        }
    }

    impl super::Clock for World {
        fn now(&self) -> u64 {
            self.now.load(Ordering::SeqCst)
        }

        fn wait_until(&self, deadline: u64) -> bool {
            if deadline > self.horizon.load(Ordering::SeqCst) {
                return false;
            }
            self.now.store(deadline, Ordering::SeqCst);
            true
        }
    }

    fn healthy() -> HealthView {
        HealthView {
            answered: true,
            postgres_ok: true,
            mosquitto_ok: true,
            zigbee_online: true,
            matter_online: true,
            internet_reachable: true,
            convex_reachable: true,
            devices_online: true,
        }
    }

    fn digest(n: u8) -> String {
        format!("sha256:{n:064x}")
    }

    fn release_signing_key() -> SigningKey {
        SigningKey::from_bytes(&[0x11; 32])
    }

    fn other_signing_key() -> SigningKey {
        SigningKey::from_bytes(&[0x22; 32])
    }

    fn next_signing_key() -> SigningKey {
        SigningKey::from_bytes(&[0x33; 32])
    }

    fn place_first_wrapper(home: &Path, key: &SigningKey) {
        let path = home.join(CURRENT_PIN);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(&path, key.verifying_key().to_bytes()).unwrap();
    }

    fn encoded_pin(key: &SigningKey) -> String {
        BASE64.encode(key.verifying_key().to_bytes())
    }

    fn pinned_services(matter: u8) -> Vec<ServiceImage> {
        RELEASE_SERVICES
            .iter()
            .enumerate()
            .map(|(index, service)| {
                let n = if *service == "nemu-matter" {
                    matter
                } else {
                    (index + 1) as u8
                };
                ServiceImage {
                    service: (*service).to_string(),
                    image: format!("example/{service}"),
                    digest: digest(n),
                }
            })
            .collect()
    }

    fn running_like_release(matter: u8) -> Vec<RunningService> {
        pinned_services(matter)
            .into_iter()
            .map(|service| {
                let mounted = if service.service == "mosquitto" {
                    vec!["mosquitto/mosquitto.conf".to_string()]
                } else {
                    Vec::new()
                };
                RunningService {
                    service: service.service,
                    digest: service.digest,
                    mounted_stack_files: mounted,
                }
            })
            .collect()
    }

    fn zigbee_configuration() -> String {
        "\
homeassistant:
  enabled: false
mqtt:
  server: mqtt://old:1883
serial:
  port: /dev/ttyUSB0
  adapter: zstack
frontend:
  enabled: false
availability:
  enabled: false
devices:
  lamp:
    friendly_name: Lamp
"
        .to_string()
    }

    fn release_manifest(services: Vec<ServiceImage>, migrate_serial: bool) -> ReleaseManifest {
        let mut migrations = vec![
            SettingMigration {
                key: "mqtt".to_string(),
                value: "server: mqtt://mosquitto:1883\n".to_string(),
            },
            SettingMigration {
                key: "availability".to_string(),
                value: "enabled: true\n".to_string(),
            },
        ];
        if migrate_serial {
            migrations.push(SettingMigration {
                key: "serial".to_string(),
                value: "port: /dev/ttyACM0\n".to_string(),
            });
        }
        let matter = services
            .iter()
            .find(|service| service.service == "nemu-matter")
            .expect("matter")
            .digest
            .clone();
        ReleaseManifest {
            platform_version: "0.4.10".to_string(),
            services,
            stack_files: vec![
                StackFile {
                    path: "docker-compose.yml".to_string(),
                    contents: format!(
                        "name: nemu\nservices:\n  nemu-matter:\n    image: example/nemu-matter@{matter}\n  postgres:\n    image: example/postgres@{postgres}\n",
                        postgres = digest(4),
                    ),
                },
                StackFile {
                    path: "mosquitto/mosquitto.conf".to_string(),
                    contents: "listener 1883\nallow_anonymous false\n".to_string(),
                },
                StackFile {
                    path: "fetch-matter-roots.sh".to_string(),
                    contents: "#!/bin/sh\necho new-roots\n".to_string(),
                },
            ],
            migrations,
            updater: UpdaterBinaries {
                amd64: BASE64.encode(AMD64_UPDATER),
                arm64: BASE64.encode(ARM64_UPDATER),
            },
            next_pin: None,
        }
    }

    fn signed_with(manifest: &ReleaseManifest, key: &SigningKey) -> Vec<u8> {
        sign_manifest(manifest, key)
    }

    fn seed_home(home: &Path) {
        fs::write(home.join("docker-compose.yml"), "services: {}\n").unwrap();
        fs::create_dir_all(home.join("mosquitto/data")).unwrap();
        fs::write(home.join("mosquitto/mosquitto.conf"), "listener 1883\n").unwrap();
        fs::write(home.join("mosquitto/data/mosquitto.db"), b"broker").unwrap();
        fs::write(
            home.join(".env"),
            "POSTGRES_PASSWORD=secret-value\nNEMU_ZIGBEE_DEVICE=/dev/ttyUSB0\n",
        )
        .unwrap();
        fs::write(
            home.join("docker-compose.override.yml"),
            "services:\n  zigbee2mqtt:\n    devices:\n      - \"/dev/ttyUSB0:/dev/ttyACM0\"\n",
        )
        .unwrap();
        fs::create_dir_all(home.join("zigbee2mqtt")).unwrap();
        fs::write(
            home.join("zigbee2mqtt/configuration.yaml"),
            zigbee_configuration(),
        )
        .unwrap();
        fs::write(
            home.join("zigbee2mqtt/coordinator_backup.json"),
            b"{\"network\":1}",
        )
        .unwrap();
        fs::write(home.join("zigbee2mqtt/database.db"), b"zigbee-db").unwrap();
        fs::create_dir_all(home.join("identity")).unwrap();
        fs::write(home.join("identity/controller-id"), b"controller-1").unwrap();
        fs::write(home.join("identity/keypair"), b"private-key").unwrap();
        fs::create_dir_all(home.join("tls")).unwrap();
        fs::write(home.join("tls/cert.pem"), b"cert").unwrap();
        fs::write(home.join("tls/key.pem"), b"key").unwrap();
        fs::create_dir_all(home.join("volumes/postgres")).unwrap();
        fs::write(home.join("volumes/postgres/PG_VERSION"), b"16\n").unwrap();
        fs::create_dir_all(home.join("volumes/matter")).unwrap();
        fs::write(home.join("volumes/matter/fabric"), b"matter-fabric").unwrap();
        fs::create_dir_all(home.join("history")).unwrap();
        fs::write(home.join("history/energy.json"), b"history-kept").unwrap();
        fs::write(home.join("fetch-matter-roots.sh"), "#!/bin/sh\necho old\n").unwrap();
        fs::create_dir_all(home.join(BINARY_DIR)).unwrap();
        fs::write(home.join(GENERATION_FILE), "1\n").unwrap();
        fs::write(home.join(BINARY_DIR).join("1"), PREVIOUS_UPDATER).unwrap();
        fs::create_dir_all(installed_release_path(home).parent().unwrap()).unwrap();
        fs::write(
            installed_release_path(home),
            r#"{"channel":"stable","platformVersion":"0.4.9","hourlyCheckSeconds":7200}"#,
        )
        .unwrap();
    }

    fn host_for(bytes: Vec<u8>) -> FakeHost {
        FakeHost {
            manifests: vec![(ReleaseChannel::Stable, bytes)],
        }
    }

    fn run_install(home: &Path, world: &World, host: &FakeHost) -> Result<(), InstallError> {
        run_install_with(home, world, host, &release_signing_key())
    }

    fn run_install_with(
        home: &Path,
        world: &World,
        host: &FakeHost,
        key: &SigningKey,
    ) -> Result<(), InstallError> {
        let public = key.verifying_key();
        install(
            home,
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

    fn run_hourly(home: &Path, world: &World, host: &FakeHost) -> Result<bool, InstallError> {
        let key = release_signing_key();
        let public = key.verifying_key();
        hourly_check(
            home,
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

    fn read_stored(home: &Path) -> crate::StoredRelease {
        serde_json::from_slice(&fs::read(installed_release_path(home)).unwrap()).unwrap()
    }

    fn generation(home: &Path) -> String {
        fs::read_to_string(home.join(GENERATION_FILE))
            .unwrap()
            .trim()
            .to_string()
    }

    #[test]
    fn an_install_keeps_home_data_and_commits_the_binary_only_after_the_gate() {
        let home = TempHome::new();
        seed_home(home.path());
        let world = World::new(home.path());
        *world.services.lock().unwrap() = running_like_release(3);
        let manifest = release_manifest(pinned_services(9), false);
        let host = host_for(signed_with(&manifest, &release_signing_key()));

        run_install(home.path(), &world, &host).expect("install");

        let log = world.log.lock().unwrap().clone();
        let space = log
            .iter()
            .position(|line| line.starts_with("space"))
            .unwrap();
        let quiesce = log
            .iter()
            .position(|line| line.starts_with("quiesce"))
            .unwrap();
        let recreate = log
            .iter()
            .position(|line| line.starts_with("recreate"))
            .unwrap();
        let health = log
            .iter()
            .position(|line| line.starts_with("health"))
            .unwrap();
        assert!(space < quiesce && quiesce < recreate && recreate < health);
        assert!(log[space].contains("maintenance=false"));
        assert!(
            log[quiesce].contains("maintenance=true") && log[quiesce].contains("snapshot=false")
        );
        assert!(
            log[recreate].contains("snapshot=true") && log[recreate].contains("maintenance=true")
        );
        assert!(
            log.iter()
                .filter(|line| line.starts_with("health"))
                .all(|line| { line.contains("maintenance=true") && line.contains("generation=1") })
        );

        assert!(!home.path().join(MAINTENANCE_FILE).is_file());
        assert!(home.path().join(SNAPSHOT_DIR).is_dir());
        assert_eq!(generation(home.path()), "2");
        assert_eq!(
            fs::read(home.path().join(BINARY_DIR).join("2")).unwrap(),
            AMD64_UPDATER
        );
        assert_eq!(
            fs::read(home.path().join(BINARY_DIR).join("1")).unwrap(),
            PREVIOUS_UPDATER
        );
        assert_ne!(
            fs::read(home.path().join(BINARY_DIR).join("2")).unwrap(),
            ARM64_UPDATER
        );

        let stored = read_stored(home.path());
        assert_eq!(stored.channel, Some(ReleaseChannel::Stable));
        assert_eq!(stored.platform_version.as_deref(), Some("0.4.10"));
        assert_eq!(stored.hourly_check_seconds, Some(7200));
        assert!(
            stored
                .services
                .iter()
                .any(|service| service.service == "nemu-matter" && service.digest == digest(9))
        );

        let report = status(
            home.path(),
            &host,
            Some(&release_signing_key().verifying_key()),
        )
        .unwrap();
        assert_eq!(report.platform_version, "0.4.10");
        assert_eq!(report.channel, ReleaseChannel::Stable);
        assert!(!report.newer_release_available);
        assert!(!report.maintenance_mode);
        assert!(report.rollback_snapshot_available);

        assert_eq!(
            fs::read_to_string(home.path().join("docker-compose.yml")).unwrap(),
            manifest.stack_files[0].contents
        );
        assert!(
            fs::read_to_string(home.path().join("docker-compose.yml"))
                .unwrap()
                .contains("@sha256:")
        );
        assert_eq!(
            fs::read_to_string(home.path().join("mosquitto/mosquitto.conf")).unwrap(),
            "listener 1883\nallow_anonymous false\n"
        );
        assert_eq!(
            fs::read_to_string(home.path().join(".env")).unwrap(),
            "POSTGRES_PASSWORD=secret-value\nNEMU_ZIGBEE_DEVICE=/dev/ttyUSB0\n"
        );
        assert_eq!(
            fs::read_to_string(home.path().join("docker-compose.override.yml")).unwrap(),
            "services:\n  zigbee2mqtt:\n    devices:\n      - \"/dev/ttyUSB0:/dev/ttyACM0\"\n"
        );
        let zigbee =
            fs::read_to_string(home.path().join("zigbee2mqtt/configuration.yaml")).unwrap();
        assert!(zigbee.contains("server: mqtt://mosquitto:1883"), "{zigbee}");
        assert!(!zigbee.contains("mqtt://old:1883"), "{zigbee}");
        assert!(zigbee.contains("port: /dev/ttyUSB0"), "{zigbee}");
        assert!(zigbee.contains("friendly_name: Lamp"), "{zigbee}");
        assert!(zigbee.contains("enabled: true"), "{zigbee}");
        assert_eq!(
            fs::read(home.path().join("zigbee2mqtt/coordinator_backup.json")).unwrap(),
            b"{\"network\":1}"
        );
        assert_eq!(
            fs::read(home.path().join("fetch-matter-roots.sh")).unwrap(),
            b"#!/bin/sh\necho new-roots\n"
        );
        assert!(world.reran_trust_roots.load(Ordering::SeqCst));
        assert_eq!(
            fs::read(home.path().join("volumes/matter/fabric")).unwrap(),
            b"matter-fabric"
        );
        assert_eq!(
            fs::read(home.path().join("history/energy.json")).unwrap(),
            b"history-kept"
        );
        assert_eq!(
            fs::read(home.path().join("volumes/postgres/PG_VERSION")).unwrap(),
            b"16\n"
        );

        let snapshot = home.path().join(SNAPSHOT_DIR);
        assert_eq!(
            fs::read(snapshot.join("postgres/PG_VERSION")).unwrap(),
            b"16\n"
        );
        assert_eq!(
            fs::read(snapshot.join("identity/controller-id")).unwrap(),
            b"controller-1"
        );
        assert_eq!(
            fs::read(snapshot.join("identity/keypair")).unwrap(),
            b"private-key"
        );
        assert_eq!(fs::read(snapshot.join("tls/cert.pem")).unwrap(), b"cert");
        assert_eq!(fs::read(snapshot.join("tls/key.pem")).unwrap(), b"key");
        assert_eq!(
            fs::read(snapshot.join("adapters/zigbee2mqtt/database.db")).unwrap(),
            b"zigbee-db"
        );
        assert_eq!(
            fs::read(snapshot.join("adapters/zigbee2mqtt/coordinator_backup.json")).unwrap(),
            b"{\"network\":1}"
        );
        assert_eq!(
            fs::read(snapshot.join("adapters/zigbee2mqtt/configuration.yaml")).unwrap(),
            zigbee_configuration().into_bytes()
        );
        assert_eq!(
            fs::read(snapshot.join("adapters/matter/fabric")).unwrap(),
            b"matter-fabric"
        );
        assert_eq!(
            fs::read(snapshot.join("adapters/mosquitto/mosquitto.db")).unwrap(),
            b"broker"
        );

        let recreated = world.recreated_services();
        assert!(
            recreated.contains(&"nemu-matter".to_string()),
            "{recreated:?}"
        );
        assert!(
            recreated.contains(&"mosquitto".to_string()),
            "{recreated:?}"
        );
        assert!(
            !recreated.contains(&"postgres".to_string()),
            "{recreated:?}"
        );
        assert!(
            !recreated.contains(&"nemu-core".to_string()),
            "{recreated:?}"
        );
        assert!(
            !recreated.contains(&"zigbee2mqtt".to_string()),
            "{recreated:?}"
        );
    }

    #[test]
    fn a_release_is_refused_when_free_space_after_the_history_floor_is_too_small() {
        let home = TempHome::new();
        seed_home(home.path());
        let world = World::new(home.path());
        world.free.store(15 * GIB, Ordering::SeqCst);
        *world.services.lock().unwrap() = running_like_release(3);
        let host = host_for(signed_with(
            &release_manifest(pinned_services(9), false),
            &release_signing_key(),
        ));

        let error = run_install(home.path(), &world, &host).expect_err("needs room");
        assert_eq!(error, InstallError::InsufficientSpace);
        assert!(!home.path().join(MAINTENANCE_FILE).is_file());
        assert!(!home.path().join(SNAPSHOT_DIR).exists());
        assert_eq!(generation(home.path()), "1");
        assert_eq!(
            read_stored(home.path()).platform_version.as_deref(),
            Some("0.4.9")
        );
        assert_eq!(
            fs::read(home.path().join("history/energy.json")).unwrap(),
            b"history-kept"
        );
        assert_eq!(
            fs::read_to_string(home.path().join("docker-compose.yml")).unwrap(),
            "services: {}\n"
        );
        assert!(world.recreated_services().is_empty());
    }

    #[test]
    fn a_disallowed_zigbee_migration_is_refused_before_anything_changes() {
        let home = TempHome::new();
        seed_home(home.path());
        let world = World::new(home.path());
        *world.services.lock().unwrap() = running_like_release(3);
        let host = host_for(signed_with(
            &release_manifest(pinned_services(9), true),
            &release_signing_key(),
        ));

        let error = run_install(home.path(), &world, &host).expect_err("serial stays");
        assert_eq!(error, InstallError::MigrationRefused);
        assert_eq!(
            fs::read_to_string(home.path().join("zigbee2mqtt/configuration.yaml")).unwrap(),
            zigbee_configuration()
        );
        assert!(!home.path().join(SNAPSHOT_DIR).exists());
        assert!(!home.path().join(MAINTENANCE_FILE).is_file());
        assert_eq!(
            read_stored(home.path()).platform_version.as_deref(),
            Some("0.4.9")
        );
    }

    #[test]
    fn a_bad_signature_does_not_change_the_home() {
        let home = TempHome::new();
        seed_home(home.path());
        let before = fs::read(installed_release_path(home.path())).unwrap();
        let world = World::new(home.path());
        let host = host_for(signed_with(
            &release_manifest(pinned_services(9), false),
            &other_signing_key(),
        ));

        let error = run_install(home.path(), &world, &host).expect_err("signature");
        assert_eq!(error, InstallError::Rejected);
        assert_eq!(
            fs::read(installed_release_path(home.path())).unwrap(),
            before
        );
        assert_eq!(
            fs::read_to_string(home.path().join("docker-compose.yml")).unwrap(),
            "services: {}\n"
        );
        assert!(!home.path().join(SNAPSHOT_DIR).exists());
    }

    #[test]
    fn a_failed_health_gate_keeps_the_snapshot_and_does_not_commit_the_release() {
        let home = TempHome::new();
        seed_home(home.path());
        let world = World::new(home.path());
        world
            .horizon
            .store(HEALTH_GATE_LIMIT_SECS + 50, Ordering::SeqCst);
        *world.services.lock().unwrap() = running_like_release(3);
        let mut down = healthy();
        down.postgres_ok = false;
        down.mosquitto_ok = false;
        *world.during.lock().unwrap() = vec![(0, down)];
        let host = host_for(signed_with(
            &release_manifest(pinned_services(9), false),
            &release_signing_key(),
        ));

        let error = run_install(home.path(), &world, &host).expect_err("gate");
        assert_eq!(error, InstallError::HealthGate);
        assert!(home.path().join(MAINTENANCE_FILE).is_file());
        assert!(home.path().join(SNAPSHOT_DIR).is_dir());
        assert_eq!(generation(home.path()), "1");
        assert!(!home.path().join(BINARY_DIR).join("2").exists());
        let stored = read_stored(home.path());
        assert_eq!(stored.platform_version.as_deref(), Some("0.4.9"));
        assert!(stored.services.is_empty());
        assert_eq!(
            fs::read(home.path().join("history/energy.json")).unwrap(),
            b"history-kept"
        );
        let report = status(
            home.path(),
            &host,
            Some(&release_signing_key().verifying_key()),
        )
        .unwrap();
        assert!(report.maintenance_mode);
        assert!(report.rollback_snapshot_available);
        assert!(report.rollback_stuck);
        assert_eq!(report.platform_version, "0.4.9");
    }

    #[test]
    fn an_adapter_that_was_already_down_does_not_fail_the_gate() {
        let home = TempHome::new();
        seed_home(home.path());
        let world = World::new(home.path());
        *world.services.lock().unwrap() = running_like_release(3);
        let mut before = healthy();
        before.matter_online = false;
        *world.before.lock().unwrap() = before.clone();
        let mut early = before.clone();
        early.zigbee_online = false;
        let mut later = before;
        later.zigbee_online = true;
        later.internet_reachable = false;
        later.convex_reachable = false;
        later.devices_online = false;
        *world.during.lock().unwrap() = vec![(0, early), (10, later)];
        let host = host_for(signed_with(
            &release_manifest(pinned_services(9), false),
            &release_signing_key(),
        ));

        run_install(home.path(), &world, &host).expect("matter was already down");
        assert_eq!(
            read_stored(home.path()).platform_version.as_deref(),
            Some("0.4.10")
        );
        assert!(!home.path().join(MAINTENANCE_FILE).is_file());
    }

    #[test]
    fn an_adapter_that_stays_down_fails_the_gate() {
        let home = TempHome::new();
        seed_home(home.path());
        let world = World::new(home.path());
        world
            .horizon
            .store(HEALTH_GATE_LIMIT_SECS + 50, Ordering::SeqCst);
        *world.services.lock().unwrap() = running_like_release(3);
        let mut during = healthy();
        during.zigbee_online = false;
        *world.during.lock().unwrap() = vec![(0, during)];
        let host = host_for(signed_with(
            &release_manifest(pinned_services(9), false),
            &release_signing_key(),
        ));

        let error = run_install(home.path(), &world, &host).expect_err("zigbee stayed down");
        assert_eq!(error, InstallError::HealthGate);
        assert_eq!(generation(home.path()), "1");
        assert_eq!(
            read_stored(home.path()).platform_version.as_deref(),
            Some("0.4.9")
        );
        assert!(home.path().join(MAINTENANCE_FILE).is_file());
    }

    #[test]
    fn when_core_did_not_answer_only_core_health_is_required() {
        let home = TempHome::new();
        seed_home(home.path());
        let world = World::new(home.path());
        *world.services.lock().unwrap() = running_like_release(3);
        let mut before = healthy();
        before.answered = false;
        before.postgres_ok = false;
        before.mosquitto_ok = false;
        before.zigbee_online = true;
        *world.before.lock().unwrap() = before;
        let mut during = healthy();
        during.zigbee_online = false;
        during.matter_online = false;
        during.internet_reachable = false;
        during.convex_reachable = false;
        during.devices_online = false;
        *world.during.lock().unwrap() = vec![(0, during)];
        let host = host_for(signed_with(
            &release_manifest(pinned_services(9), false),
            &release_signing_key(),
        ));

        run_install(home.path(), &world, &host).expect("core recovery");
        assert_eq!(generation(home.path()), "2");
        assert!(!home.path().join(MAINTENANCE_FILE).is_file());
    }

    #[test]
    fn fifty_nine_seconds_of_health_does_not_commit_the_binary() {
        let home = TempHome::new();
        seed_home(home.path());
        let world = World::new(home.path());
        world
            .horizon
            .store(HEALTH_GATE_LIMIT_SECS + 50, Ordering::SeqCst);
        *world.services.lock().unwrap() = running_like_release(3);
        let mut crashed = healthy();
        crashed.answered = false;
        *world.during.lock().unwrap() = vec![(0, healthy()), (59, crashed)];
        let host = host_for(signed_with(
            &release_manifest(pinned_services(9), false),
            &release_signing_key(),
        ));

        let error = run_install(home.path(), &world, &host).expect_err("short health");
        assert_eq!(error, InstallError::HealthGate);
        assert_eq!(generation(home.path()), "1");
        assert!(!home.path().join(BINARY_DIR).join("2").exists());
    }

    #[test]
    fn the_hourly_check_installs_a_newer_release_without_an_owner() {
        let home = TempHome::new();
        seed_home(home.path());
        let stored = read_stored(home.path());
        let mut due_later = stored.clone();
        due_later.hourly_check_seconds = Some(3600);
        due_later.last_hourly_check = Some(0);
        fs::write(
            installed_release_path(home.path()),
            serde_json::to_vec_pretty(&due_later).unwrap(),
        )
        .unwrap();
        let world = World::new(home.path());
        world.now.store(10, Ordering::SeqCst);
        *world.services.lock().unwrap() = running_like_release(3);
        let host = host_for(signed_with(
            &release_manifest(pinned_services(9), false),
            &release_signing_key(),
        ));

        assert_eq!(run_hourly(home.path(), &world, &host).unwrap(), false);
        assert_eq!(
            read_stored(home.path()).platform_version.as_deref(),
            Some("0.4.9")
        );
        assert_eq!(read_stored(home.path()).hourly_check_seconds, Some(3600));

        world.now.store(3600, Ordering::SeqCst);
        assert_eq!(run_hourly(home.path(), &world, &host).unwrap(), true);
        let stored = read_stored(home.path());
        assert_eq!(stored.platform_version.as_deref(), Some("0.4.10"));
        assert_eq!(stored.channel, Some(ReleaseChannel::Stable));
        assert_eq!(stored.hourly_check_seconds, Some(3600));
        assert_eq!(stored.last_hourly_check, Some(3600));
        assert_eq!(generation(home.path()), "2");
    }

    #[test]
    fn only_a_changed_matter_digest_recreates_matter() {
        let home = TempHome::new();
        seed_home(home.path());
        let world = World::new(home.path());
        *world.services.lock().unwrap() = running_like_release(3);
        let mut manifest = release_manifest(pinned_services(9), false);
        manifest.stack_files[1].contents = "listener 1883\n".to_string();
        let host = host_for(signed_with(&manifest, &release_signing_key()));

        run_install(home.path(), &world, &host).expect("matter only");
        assert_eq!(world.recreated_services(), vec!["nemu-matter".to_string()]);
    }

    fn matter_digests(world: &World) -> Vec<String> {
        world
            .recreated
            .lock()
            .expect("recreated")
            .iter()
            .filter(|(service, _)| service == "nemu-matter")
            .map(|(_, digest)| digest.clone())
            .collect()
    }

    #[test]
    fn a_failed_health_gate_restores_the_previous_release_when_it_becomes_healthy() {
        let home = TempHome::new();
        seed_home(home.path());
        let world = World::new(home.path());
        world
            .horizon
            .store(HEALTH_GATE_LIMIT_SECS + 200, Ordering::SeqCst);
        *world.services.lock().unwrap() = running_like_release(3);
        let mut down = healthy();
        down.postgres_ok = false;
        down.mosquitto_ok = false;
        *world.during.lock().unwrap() = vec![(0, down), (HEALTH_GATE_LIMIT_SECS + 1, healthy())];
        let wrote = Arc::new(AtomicBool::new(false));
        let command = home.path().join("volumes/postgres/command-during-gate");
        let wrote_hook = Arc::clone(&wrote);
        let command_hook = command.clone();
        *world.during_hook.lock().unwrap() = Some(Box::new(move |at| {
            if at <= HEALTH_GATE_LIMIT_SECS {
                wrote_hook.store(true, Ordering::SeqCst);
                let _ = fs::write(&command_hook, b"command-from-the-gate");
            }
        }));
        let host = host_for(signed_with(
            &release_manifest(pinned_services(9), false),
            &release_signing_key(),
        ));

        let error = run_install(home.path(), &world, &host).expect_err("gate");
        assert_eq!(error, InstallError::HealthGate);
        assert!(wrote.load(Ordering::SeqCst));
        assert!(
            world
                .log
                .lock()
                .unwrap()
                .iter()
                .filter(|line| line.starts_with("health"))
                .all(|line| line.contains("maintenance=true")),
            "commands are refused while the gate holds maintenance"
        );
        assert!(!command.exists(), "a command from the gate is not restored");
        assert_eq!(
            fs::read_to_string(home.path().join("docker-compose.yml")).unwrap(),
            "services: {}\n"
        );
        assert_eq!(
            fs::read_to_string(home.path().join("mosquitto/mosquitto.conf")).unwrap(),
            "listener 1883\n"
        );
        assert_eq!(
            fs::read(home.path().join("fetch-matter-roots.sh")).unwrap(),
            b"#!/bin/sh\necho old\n"
        );
        assert!(
            fs::read_to_string(home.path().join("zigbee2mqtt/configuration.yaml"))
                .unwrap()
                .contains("mqtt://old:1883")
        );
        assert_eq!(generation(home.path()), "1");
        assert_eq!(
            fs::read(home.path().join(BINARY_DIR).join("1")).unwrap(),
            PREVIOUS_UPDATER
        );
        assert!(!home.path().join(BINARY_DIR).join("2").exists());
        assert_eq!(
            read_stored(home.path()).platform_version.as_deref(),
            Some("0.4.9")
        );
        assert!(read_stored(home.path()).services.is_empty());
        assert!(!home.path().join(MAINTENANCE_FILE).is_file());
        assert!(home.path().join(SNAPSHOT_DIR).is_dir());
        assert_eq!(
            fs::read(home.path().join("history/energy.json")).unwrap(),
            b"history-kept"
        );
        assert_eq!(
            fs::read(home.path().join("volumes/postgres/PG_VERSION")).unwrap(),
            b"16\n"
        );
        let matter = matter_digests(&world);
        assert!(
            matter.iter().any(|applied| applied == &digest(9)),
            "{matter:?}"
        );
        assert_eq!(matter.last().map(String::as_str), Some(digest(3).as_str()));
        let report = status(
            home.path(),
            &host,
            Some(&release_signing_key().verifying_key()),
        )
        .unwrap();
        assert!(!report.maintenance_mode);
        assert!(report.rollback_snapshot_available);
        assert!(!report.rollback_stuck);
    }

    #[test]
    fn an_adapter_that_was_online_and_is_not_online_again_rolls_back() {
        let home = TempHome::new();
        seed_home(home.path());
        let world = World::new(home.path());
        world
            .horizon
            .store(HEALTH_GATE_LIMIT_SECS + 200, Ordering::SeqCst);
        *world.services.lock().unwrap() = running_like_release(3);
        let mut down = healthy();
        down.zigbee_online = false;
        *world.during.lock().unwrap() = vec![(0, down), (HEALTH_GATE_LIMIT_SECS + 1, healthy())];
        let host = host_for(signed_with(
            &release_manifest(pinned_services(9), false),
            &release_signing_key(),
        ));

        let error = run_install(home.path(), &world, &host).expect_err("zigbee");
        assert_eq!(error, InstallError::HealthGate);
        assert_eq!(
            fs::read_to_string(home.path().join("docker-compose.yml")).unwrap(),
            "services: {}\n"
        );
        assert_eq!(generation(home.path()), "1");
        assert!(!home.path().join(MAINTENANCE_FILE).is_file());
        assert_eq!(
            read_stored(home.path()).platform_version.as_deref(),
            Some("0.4.9")
        );
        assert_eq!(
            matter_digests(&world).last().map(String::as_str),
            Some(digest(3).as_str())
        );
    }

    #[test]
    fn the_next_release_replaces_the_snapshot_instead_of_merging() {
        let home = TempHome::new();
        seed_home(home.path());
        let world = World::new(home.path());
        *world.services.lock().unwrap() = running_like_release(3);
        let host = host_for(signed_with(
            &release_manifest(pinned_services(9), false),
            &release_signing_key(),
        ));
        run_install(home.path(), &world, &host).expect("first release");

        let snapshot = home.path().join(SNAPSHOT_DIR);
        fs::write(snapshot.join("postgres/stale-marker"), b"old-snapshot").unwrap();
        fs::remove_file(home.path().join("identity/keypair")).unwrap();
        fs::write(home.path().join("volumes/postgres/PG_VERSION"), b"17\n").unwrap();
        fs::write(home.path().join("volumes/postgres/after-release"), b"new").unwrap();

        let mut next = release_manifest(pinned_services(8), false);
        next.platform_version = "0.4.11".to_string();
        let host = host_for(signed_with(&next, &release_signing_key()));
        run_install(home.path(), &world, &host).expect("second release");

        let snapshot = home.path().join(SNAPSHOT_DIR);
        assert!(
            !snapshot.join("postgres/stale-marker").exists(),
            "the previous snapshot is replaced"
        );
        assert!(
            !snapshot.join("identity/keypair").exists(),
            "a file removed from the Home is not kept in the new snapshot"
        );
        assert_eq!(
            fs::read(snapshot.join("postgres/PG_VERSION")).unwrap(),
            b"17\n"
        );
        assert_eq!(
            fs::read(snapshot.join("postgres/after-release")).unwrap(),
            b"new"
        );
    }

    fn run_rollback(
        home: &Path,
        world: &World,
        host: &FakeHost,
    ) -> Result<(), crate::rollback::RollbackError> {
        let key = release_signing_key();
        let public = key.verifying_key();
        crate::rollback::rollback(
            home,
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

    fn digest_count(world: &World, service: &str, digest: &str) -> usize {
        world
            .recreated
            .lock()
            .expect("recreated")
            .iter()
            .filter(|(name, applied)| name == service && applied == digest)
            .count()
    }

    #[test]
    fn an_owner_rolls_back_one_release_and_a_second_rollback_is_unavailable() {
        let home = TempHome::new();
        seed_home(home.path());
        let world = World::new(home.path());
        *world.services.lock().unwrap() = running_like_release(3);
        let host = host_for(signed_with(
            &release_manifest(pinned_services(9), false),
            &release_signing_key(),
        ));
        run_install(home.path(), &world, &host).expect("install");
        assert_eq!(generation(home.path()), "2");

        run_rollback(home.path(), &world, &host).expect("rollback");

        assert_eq!(generation(home.path()), "1");
        assert_eq!(
            fs::read(home.path().join(BINARY_DIR).join("1")).unwrap(),
            PREVIOUS_UPDATER
        );
        assert_eq!(
            fs::read_to_string(home.path().join("docker-compose.yml")).unwrap(),
            "services: {}\n"
        );
        assert_eq!(
            fs::read_to_string(home.path().join("mosquitto/mosquitto.conf")).unwrap(),
            "listener 1883\n"
        );
        assert_eq!(
            fs::read(home.path().join("fetch-matter-roots.sh")).unwrap(),
            b"#!/bin/sh\necho old\n"
        );
        assert!(
            fs::read_to_string(home.path().join("zigbee2mqtt/configuration.yaml"))
                .unwrap()
                .contains("mqtt://old:1883")
        );
        let stored = read_stored(home.path());
        assert_eq!(stored.platform_version.as_deref(), Some("0.4.9"));
        assert_eq!(stored.channel, Some(ReleaseChannel::Stable));
        assert_eq!(stored.hourly_check_seconds, Some(7200));
        assert!(stored.services.is_empty());
        assert!(!home.path().join(MAINTENANCE_FILE).is_file());
        assert!(home.path().join(SNAPSHOT_DIR).is_dir());
        assert_eq!(
            matter_digests(&world).last().map(String::as_str),
            Some(digest(3).as_str())
        );
        let report = status(
            home.path(),
            &host,
            Some(&release_signing_key().verifying_key()),
        )
        .unwrap();
        assert!(!report.maintenance_mode);
        assert!(report.rollback_snapshot_available);
        assert!(!report.rollback_stuck);

        let again = run_rollback(home.path(), &world, &host).expect_err("one step");
        assert_eq!(again, crate::rollback::RollbackError::AlreadyRolledBack);
        assert_eq!(generation(home.path()), "1");
        assert_eq!(
            read_stored(home.path()).platform_version.as_deref(),
            Some("0.4.9")
        );
        assert!(home.path().join(SNAPSHOT_DIR).is_dir());
        assert!(!home.path().join(MAINTENANCE_FILE).is_file());
    }

    #[test]
    fn a_rollback_that_will_not_stay_healthy_retries_without_reapplying() {
        let home = TempHome::new();
        seed_home(home.path());
        let world = World::new(home.path());
        *world.services.lock().unwrap() = running_like_release(3);
        let host = host_for(signed_with(
            &release_manifest(pinned_services(9), false),
            &release_signing_key(),
        ));
        run_install(home.path(), &world, &host).expect("install");
        let mut down = healthy();
        down.answered = false;
        *world.during.lock().unwrap() = vec![(0, down)];
        let applied = digest_count(&world, "nemu-matter", &digest(9));

        let error = run_rollback(home.path(), &world, &host).expect_err("unhealthy");
        assert_eq!(error, crate::rollback::RollbackError::Unhealthy);
        assert_eq!(generation(home.path()), "1");
        assert_eq!(
            fs::read(home.path().join(BINARY_DIR).join("1")).unwrap(),
            PREVIOUS_UPDATER
        );
        assert!(home.path().join(MAINTENANCE_FILE).is_file());
        assert_eq!(
            read_stored(home.path()).platform_version.as_deref(),
            Some("0.4.9")
        );
        let report = status(
            home.path(),
            &host,
            Some(&release_signing_key().verifying_key()),
        )
        .unwrap();
        assert!(report.rollback_stuck);
        assert!(report.maintenance_mode);

        assert!(!run_hourly(home.path(), &world, &host).unwrap());
        assert_eq!(digest_count(&world, "nemu-matter", &digest(9)), applied);
        assert_eq!(generation(home.path()), "1");
        assert!(home.path().join(MAINTENANCE_FILE).is_file());
        assert_eq!(
            run_install(home.path(), &world, &host).expect_err("held"),
            InstallError::InMaintenance
        );
        assert!(!home.path().join(BINARY_DIR).join("3").exists());
    }

    #[test]
    fn a_rollback_that_cannot_restore_stays_stuck_and_does_not_reapply() {
        let home = TempHome::new();
        seed_home(home.path());
        let world = World::new(home.path());
        *world.services.lock().unwrap() = running_like_release(3);
        let host = host_for(signed_with(
            &release_manifest(pinned_services(9), false),
            &release_signing_key(),
        ));
        run_install(home.path(), &world, &host).expect("install");
        let applied = world.recreated.lock().unwrap().len();
        fs::remove_dir_all(home.path().join(SNAPSHOT_DIR)).unwrap();

        let error = run_rollback(home.path(), &world, &host).expect_err("missing snapshot");
        assert_eq!(error, crate::rollback::RollbackError::RestoreFailed);
        assert_eq!(generation(home.path()), "2");
        assert_eq!(
            fs::read(home.path().join(BINARY_DIR).join("2")).unwrap(),
            AMD64_UPDATER
        );
        assert!(home.path().join(MAINTENANCE_FILE).is_file());
        assert_eq!(
            read_stored(home.path()).platform_version.as_deref(),
            Some("0.4.10")
        );
        assert!(
            status(
                home.path(),
                &host,
                Some(&release_signing_key().verifying_key()),
            )
            .unwrap()
            .rollback_stuck
        );

        assert!(!run_hourly(home.path(), &world, &host).unwrap());
        assert_eq!(world.recreated.lock().unwrap().len(), applied);
        assert_eq!(generation(home.path()), "2");
        assert_eq!(
            fs::read_to_string(home.path().join("docker-compose.yml")).unwrap(),
            release_manifest(pinned_services(9), false).stack_files[0].contents
        );
        assert_eq!(
            run_install(home.path(), &world, &host).expect_err("held"),
            InstallError::InMaintenance
        );
    }

    #[test]
    fn a_failed_health_gate_does_not_replace_the_wrapper() {
        let home = TempHome::new();
        seed_home(home.path());
        let current = release_signing_key();
        place_first_wrapper(home.path(), &current);
        let placed = fs::read(home.path().join(CURRENT_PIN)).unwrap();
        let world = World::new(home.path());
        world
            .horizon
            .store(HEALTH_GATE_LIMIT_SECS + 50, Ordering::SeqCst);
        *world.services.lock().unwrap() = running_like_release(3);
        let mut down = healthy();
        down.postgres_ok = false;
        down.mosquitto_ok = false;
        *world.during.lock().unwrap() = vec![(0, down)];
        let mut manifest = release_manifest(pinned_services(9), false);
        manifest.next_pin = Some(encoded_pin(&next_signing_key()));
        let host = host_for(signed_with(&manifest, &current));

        let error = run_install_with(home.path(), &world, &host, &current).expect_err("gate");

        assert_eq!(error, InstallError::HealthGate);
        assert_eq!(fs::read(home.path().join(CURRENT_PIN)).unwrap(), placed);
        assert!(!home.path().join(PREVIOUS_WRAPPER).exists());
        assert_eq!(generation(home.path()), "1");
        assert!(!home.path().join(BINARY_DIR).join("2").exists());
    }

    #[test]
    fn the_home_installs_the_next_wrapper_pin_after_the_gate_and_keeps_the_previous() {
        let home = TempHome::new();
        seed_home(home.path());
        let current = release_signing_key();
        let next = next_signing_key();
        place_first_wrapper(home.path(), &current);
        let placed = fs::read(home.path().join(CURRENT_PIN)).unwrap();
        let world = World::new(home.path());
        *world.services.lock().unwrap() = running_like_release(3);
        let mut manifest = release_manifest(pinned_services(9), false);
        manifest.next_pin = Some(encoded_pin(&next));
        let host = host_for(signed_with(&manifest, &current));

        run_install_with(home.path(), &world, &host, &current).expect("rotate");

        assert_eq!(load_release_key(home.path()), Some(next.verifying_key()));
        assert_eq!(
            fs::read(home.path().join(PREVIOUS_WRAPPER)).unwrap(),
            placed
        );
        assert_eq!(generation(home.path()), "2");
        assert!(!home.path().join(MAINTENANCE_FILE).is_file());

        let mut later = release_manifest(pinned_services(8), false);
        later.platform_version = "0.4.11".to_string();
        let later_host = host_for(signed_with(&later, &next));
        run_install_with(home.path(), &world, &later_host, &current).expect("new key");
        assert_eq!(
            read_stored(home.path()).platform_version.as_deref(),
            Some("0.4.11")
        );
        let compose = fs::read(home.path().join("docker-compose.yml")).unwrap();
        let snapshot = fs::read(
            home.path()
                .join(SNAPSHOT_DIR)
                .join("identity/controller-id"),
        )
        .unwrap();

        let mut rejected = release_manifest(pinned_services(7), false);
        rejected.platform_version = "0.4.12".to_string();
        rejected.stack_files[0].contents = "name: replaced\n".to_string();
        let rejected_host = host_for(signed_with(&rejected, &current));
        let error =
            run_install_with(home.path(), &world, &rejected_host, &current).expect_err("old key");
        assert_eq!(error, InstallError::Rejected);
        assert_eq!(
            fs::read(home.path().join("docker-compose.yml")).unwrap(),
            compose
        );
        assert_eq!(
            fs::read(
                home.path()
                    .join(SNAPSHOT_DIR)
                    .join("identity/controller-id")
            )
            .unwrap(),
            snapshot
        );
        assert_eq!(
            read_stored(home.path()).platform_version.as_deref(),
            Some("0.4.11")
        );
        assert_eq!(load_release_key(home.path()), Some(next.verifying_key()));
    }

    #[test]
    fn a_manifest_signed_only_by_a_key_the_wrapper_does_not_pin_is_rejected_before_any_change() {
        let home = TempHome::new();
        seed_home(home.path());
        place_first_wrapper(home.path(), &release_signing_key());
        let pin_before = fs::read(home.path().join(CURRENT_PIN)).unwrap();
        let compose_before = fs::read(home.path().join("docker-compose.yml")).unwrap();
        let world = World::new(home.path());
        *world.services.lock().unwrap() = running_like_release(3);
        let host = host_for(signed_with(
            &release_manifest(pinned_services(9), false),
            &other_signing_key(),
        ));

        let error = run_install_with(home.path(), &world, &host, &other_signing_key())
            .expect_err("unpinned key");

        assert_eq!(error, InstallError::Rejected);
        assert!(!home.path().join(SNAPSHOT_DIR).exists());
        assert!(!home.path().join(MAINTENANCE_FILE).is_file());
        assert_eq!(
            fs::read(home.path().join("docker-compose.yml")).unwrap(),
            compose_before
        );
        assert_eq!(fs::read(home.path().join(CURRENT_PIN)).unwrap(), pin_before);
        assert!(!home.path().join(PREVIOUS_WRAPPER).exists());
        assert_eq!(generation(home.path()), "1");
        assert_eq!(
            read_stored(home.path()).platform_version.as_deref(),
            Some("0.4.9")
        );
        assert!(world.recreated_services().is_empty());
    }

    #[test]
    fn the_first_wrapper_is_trusted_because_the_home_already_has_its_pin() {
        let home = TempHome::new();
        seed_home(home.path());
        let first = release_signing_key();
        place_first_wrapper(home.path(), &first);
        let placed = fs::read(home.path().join(CURRENT_PIN)).unwrap();
        assert!(!home.path().join(PREVIOUS_WRAPPER).exists());
        let world = World::new(home.path());
        *world.services.lock().unwrap() = running_like_release(3);
        let host = host_for(signed_with(
            &release_manifest(pinned_services(9), false),
            &first,
        ));

        run_install_with(home.path(), &world, &host, &other_signing_key()).expect("placed pin");

        assert_eq!(fs::read(home.path().join(CURRENT_PIN)).unwrap(), placed);
        assert!(!home.path().join(PREVIOUS_WRAPPER).exists());
        assert_eq!(
            read_stored(home.path()).platform_version.as_deref(),
            Some("0.4.10")
        );
        assert_eq!(load_release_key(home.path()), Some(first.verifying_key()));
    }

    #[test]
    fn a_release_does_not_mint_the_first_wrapper() {
        let home = TempHome::new();
        seed_home(home.path());
        assert!(!home.path().join(CURRENT_PIN).exists());
        let mut manifest = release_manifest(pinned_services(9), false);
        manifest.next_pin = Some(encoded_pin(&next_signing_key()));
        let world = World::new(home.path());
        *world.services.lock().unwrap() = running_like_release(3);
        let host = host_for(signed_with(&manifest, &release_signing_key()));

        run_install(home.path(), &world, &host).expect("install without a wrapper");

        assert!(!home.path().join(CURRENT_PIN).exists());
        assert!(!home.path().join(PREVIOUS_WRAPPER).exists());
        assert_eq!(
            read_stored(home.path()).platform_version.as_deref(),
            Some("0.4.10")
        );
    }
}
