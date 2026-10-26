//! Restore the previous Release from the Rollback snapshot.
//!
//! A failed health gate and an Owner rollback both come through here. The
//! snapshot stays on disk until the next Release replaces it. A second
//! rollback is refused. A restore that cannot finish, or whose previous
//! Release will not stay healthy, holds maintenance and retries only this path.

use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::install::{
    self, BINARY_DIR, GENERATION_FILE, InstallEnv, InstallError, MATTER_TRUST_ROOT_SCRIPT,
    RunningService, SNAPSHOT_DIR, SNAPSHOT_TREES, STACK_FILES,
};
use crate::{installed_release_path, read_stored_release, write_stored_release};

const STUCK_FILE: &str = "updater/rollback-stuck";
/// Outside the rollback snapshot. Restoring the snapshot copy of the installed
/// Release does not delete this, and the restored file is updated from it.
const DECLINED_FILE: &str = "updater/declined-platform-version";
const CONSUMED_FILE: &str = "consumed";
const RUNTIME_FILE: &str = "runtime.json";
const RELEASE_COPY: &str = "installed-release.json";
const PREVIOUS_UPDATER: &str = "previous-updater";
const STACK_COPY: &str = "stack";

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum RollbackError {
    #[error("the last Release was already rolled back")]
    AlreadyRolledBack,
    #[error("the home is already in maintenance")]
    InMaintenance,
    #[error("the snapshot could not be restored")]
    RestoreFailed,
    #[error("the previous Release did not stay healthy")]
    Unhealthy,
    #[error("{0}")]
    Unavailable(String),
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SnapshotRuntime {
    generation: u64,
    zigbee_required: bool,
    matter_required: bool,
    services: Vec<SnapshotService>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SnapshotService {
    service: String,
    digest: String,
}

pub fn rollback_stuck(controller_dir: &Path) -> bool {
    controller_dir.join(STUCK_FILE).is_file()
}

/// Rolls the Home back to the snapshotted Release.
///
/// One snapshot is one step. Calling this again, after that step has
/// finished, is refused. A stuck rollback retries the restore and does not
/// install the Release that failed.
pub fn rollback(controller_dir: &Path, env: &InstallEnv<'_>) -> Result<(), RollbackError> {
    if install::maintenance_mode(controller_dir)
        && snapshot_consumed(controller_dir)
        && !rollback_stuck(controller_dir)
    {
        install::set_maintenance(controller_dir, false).map_err(unavailable)?;
        return Ok(());
    }
    if rollback_stuck(controller_dir) {
        return finish_restore(controller_dir, env);
    }
    if install::maintenance_mode(controller_dir) {
        return Err(RollbackError::InMaintenance);
    }
    if !install::snapshot_kept(controller_dir) {
        return Err(RollbackError::RestoreFailed);
    }
    if snapshot_consumed(controller_dir) {
        return Err(RollbackError::AlreadyRolledBack);
    }
    install::set_maintenance(controller_dir, true).map_err(unavailable)?;
    finish_restore(controller_dir, env)
}

/// Restores the snapshot after the health gate or the binary commit failed.
/// Maintenance is already held by the install.
pub(crate) fn restore_after_failed_gate(
    controller_dir: &Path,
    env: &InstallEnv<'_>,
) -> Result<(), RollbackError> {
    if snapshot_consumed(controller_dir) {
        return enter_stuck(controller_dir, RollbackError::AlreadyRolledBack);
    }
    finish_restore(controller_dir, env)
}

/// Records the running digests and the installed Release file inside the snapshot.
pub(crate) fn capture(
    controller_dir: &Path,
    snapshot_root: &Path,
    running: &[RunningService],
    zigbee_required: bool,
    matter_required: bool,
    generation: u64,
) -> Result<(), InstallError> {
    let release = installed_release_path(controller_dir);
    if !release.is_file() {
        return Err(InstallError::SnapshotFailed);
    }
    std::fs::copy(release, snapshot_root.join(RELEASE_COPY))
        .map_err(|_| InstallError::SnapshotFailed)?;
    let runtime = SnapshotRuntime {
        generation,
        zigbee_required,
        matter_required,
        services: running
            .iter()
            .map(|service| SnapshotService {
                service: service.service.clone(),
                digest: service.digest.clone(),
            })
            .collect(),
    };
    let bytes = serde_json::to_vec_pretty(&runtime).map_err(|_| InstallError::SnapshotFailed)?;
    std::fs::write(snapshot_root.join(RUNTIME_FILE), bytes)
        .map_err(|_| InstallError::SnapshotFailed)?;
    Ok(())
}

fn finish_restore(controller_dir: &Path, env: &InstallEnv<'_>) -> Result<(), RollbackError> {
    let root = controller_dir.join(SNAPSHOT_DIR);
    if !root.is_dir() {
        return enter_stuck(controller_dir, RollbackError::RestoreFailed);
    }
    let runtime = match read_runtime(&root) {
        Ok(runtime) => runtime,
        Err(error) => return enter_stuck(controller_dir, error),
    };
    if let Err(error) = env.runtime.quiesce() {
        return enter_stuck(controller_dir, RollbackError::Unavailable(error));
    }
    if let Err(error) = restore_files(controller_dir, &root, &runtime) {
        let _ = env.runtime.resume();
        return enter_stuck(controller_dir, error);
    }
    if let Err(error) = env.runtime.resume() {
        return enter_stuck(controller_dir, RollbackError::Unavailable(error));
    }
    if let Err(error) = recreate_previous(env, &runtime) {
        return enter_stuck(controller_dir, error);
    }
    if install::wait_for_health(env, runtime.zigbee_required, runtime.matter_required).is_err() {
        return enter_stuck(controller_dir, RollbackError::Unhealthy);
    }
    if let Err(error) = mark_consumed(&root) {
        return enter_stuck(controller_dir, error);
    }
    clear_stuck(controller_dir)?;
    install::set_maintenance(controller_dir, false).map_err(unavailable)?;
    Ok(())
}

fn restore_files(
    controller_dir: &Path,
    snapshot_root: &Path,
    runtime: &SnapshotRuntime,
) -> Result<(), RollbackError> {
    for (live_rel, snap_rel) in SNAPSHOT_TREES {
        let from = snapshot_root.join(snap_rel);
        let to = controller_dir.join(live_rel);
        if to.exists() {
            remove_path(&to)?;
        }
        if from.exists() {
            install::copy_tree(&from, &to).map_err(|_| RollbackError::RestoreFailed)?;
        }
    }
    restore_stack(controller_dir, snapshot_root)?;
    restore_release_file(controller_dir, snapshot_root)?;
    restore_binary(controller_dir, snapshot_root, runtime.generation)?;
    Ok(())
}

fn restore_stack(controller_dir: &Path, snapshot_root: &Path) -> Result<(), RollbackError> {
    let mut paths = STACK_FILES.to_vec();
    paths.push(MATTER_TRUST_ROOT_SCRIPT);
    for path in paths {
        let from = snapshot_root.join(STACK_COPY).join(path);
        let to = controller_dir.join(path);
        if from.is_file() {
            replace_file(&from, &to)?;
        } else if to.exists() {
            std::fs::remove_file(&to).map_err(|_| RollbackError::RestoreFailed)?;
        }
    }
    Ok(())
}

fn restore_release_file(controller_dir: &Path, snapshot_root: &Path) -> Result<(), RollbackError> {
    let rolled_back = read_stored_release(controller_dir)
        .map_err(|_| RollbackError::RestoreFailed)?
        .and_then(|stored| stored.platform_version)
        .filter(|version| !version.trim().is_empty());
    let from = snapshot_root.join(RELEASE_COPY);
    if !from.is_file() {
        return Err(RollbackError::RestoreFailed);
    }
    let bytes = std::fs::read(&from).map_err(|_| RollbackError::RestoreFailed)?;
    let to = installed_release_path(controller_dir);
    if let Some(parent) = to.parent() {
        std::fs::create_dir_all(parent).map_err(|_| RollbackError::RestoreFailed)?;
    }
    std::fs::write(&to, bytes).map_err(|_| RollbackError::RestoreFailed)?;
    let mut stored = read_stored_release(controller_dir)
        .map_err(|_| RollbackError::RestoreFailed)?
        .unwrap_or_default();
    if let Some(version) =
        rolled_back.filter(|version| stored.platform_version.as_ref() != Some(version))
    {
        write_declined_version(controller_dir, &version)?;
        stored.declined_platform_version = Some(version);
        write_stored_release(controller_dir, &stored).map_err(unavailable)?;
    } else if let Some(version) = read_declined_version(controller_dir) {
        stored.declined_platform_version = Some(version);
        write_stored_release(controller_dir, &stored).map_err(unavailable)?;
    }
    Ok(())
}

fn write_declined_version(controller_dir: &Path, version: &str) -> Result<(), RollbackError> {
    let path = controller_dir.join(DECLINED_FILE);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|_| RollbackError::RestoreFailed)?;
    }
    std::fs::write(path, format!("{version}\n")).map_err(|_| RollbackError::RestoreFailed)
}

fn read_declined_version(controller_dir: &Path) -> Option<String> {
    let version = std::fs::read_to_string(controller_dir.join(DECLINED_FILE)).ok()?;
    let version = version.trim();
    if version.is_empty() {
        None
    } else {
        Some(version.to_string())
    }
}

fn restore_binary(
    controller_dir: &Path,
    snapshot_root: &Path,
    generation: u64,
) -> Result<(), RollbackError> {
    if generation == 0 {
        return std::fs::write(controller_dir.join(GENERATION_FILE), "0\n")
            .map_err(|_| RollbackError::RestoreFailed);
    }
    let previous = snapshot_root.join(PREVIOUS_UPDATER);
    if !previous.is_file() {
        return Err(RollbackError::RestoreFailed);
    }
    let bytes = std::fs::read(&previous).map_err(|_| RollbackError::RestoreFailed)?;
    let path = controller_dir.join(BINARY_DIR).join(generation.to_string());
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|_| RollbackError::RestoreFailed)?;
    }
    std::fs::write(&path, bytes).map_err(|_| RollbackError::RestoreFailed)?;
    std::fs::write(
        controller_dir.join(GENERATION_FILE),
        format!("{generation}\n"),
    )
    .map_err(|_| RollbackError::RestoreFailed)
}

fn recreate_previous(env: &InstallEnv<'_>, runtime: &SnapshotRuntime) -> Result<(), RollbackError> {
    for service in &runtime.services {
        env.runtime
            .recreate(&service.service, &service.digest)
            .map_err(RollbackError::Unavailable)?;
    }
    Ok(())
}

fn read_runtime(snapshot_root: &Path) -> Result<SnapshotRuntime, RollbackError> {
    let bytes = std::fs::read(snapshot_root.join(RUNTIME_FILE))
        .map_err(|_| RollbackError::RestoreFailed)?;
    serde_json::from_slice(&bytes).map_err(|_| RollbackError::RestoreFailed)
}

fn mark_consumed(snapshot_root: &Path) -> Result<(), RollbackError> {
    std::fs::write(snapshot_root.join(CONSUMED_FILE), b"1\n")
        .map_err(|_| RollbackError::RestoreFailed)
}

pub(crate) fn snapshot_consumed(controller_dir: &Path) -> bool {
    controller_dir
        .join(SNAPSHOT_DIR)
        .join(CONSUMED_FILE)
        .is_file()
}

fn enter_stuck(controller_dir: &Path, error: RollbackError) -> Result<(), RollbackError> {
    let _ = install::set_maintenance(controller_dir, true);
    let _ = mark_stuck(controller_dir);
    Err(error)
}

fn mark_stuck(controller_dir: &Path) -> Result<(), RollbackError> {
    let path = controller_dir.join(STUCK_FILE);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(unavailable)?;
    }
    std::fs::write(path, b"1\n").map_err(unavailable)
}

fn clear_stuck(controller_dir: &Path) -> Result<(), RollbackError> {
    let path = controller_dir.join(STUCK_FILE);
    if path.exists() {
        std::fs::remove_file(path).map_err(unavailable)?;
    }
    Ok(())
}

fn replace_file(from: &Path, to: &Path) -> Result<(), RollbackError> {
    if let Some(parent) = to.parent() {
        std::fs::create_dir_all(parent).map_err(|_| RollbackError::RestoreFailed)?;
    }
    if to.exists() {
        std::fs::remove_file(to).map_err(|_| RollbackError::RestoreFailed)?;
    }
    std::fs::copy(from, to).map_err(|_| RollbackError::RestoreFailed)?;
    Ok(())
}

fn remove_path(path: &Path) -> Result<(), RollbackError> {
    if path.is_dir() {
        std::fs::remove_dir_all(path).map_err(|_| RollbackError::RestoreFailed)
    } else {
        std::fs::remove_file(path).map_err(|_| RollbackError::RestoreFailed)
    }
}

fn unavailable(error: impl ToString) -> RollbackError {
    RollbackError::Unavailable(error.to_string())
}
