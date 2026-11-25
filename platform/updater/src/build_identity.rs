//! Which build a Release carries, and the builds a Home has declined.
//!
//! A Release candidate and its promotion are two Releases with one build, so
//! a declined Platform version alone would let the same build return.

use std::path::Path;

use ed25519_dalek::VerifyingKey;
use sha2::{Digest, Sha256};

use crate::install::{UpdaterArch, decode_binary};
use crate::manifest::{ManifestHost, ReleaseManifest, verify_manifest};
use crate::{ReleaseChannel, StoredRelease};

/// One build identity per line. It is neither in the Rollback snapshot nor in
/// the stored Release, so a restored snapshot keeps it, and so does an Updater
/// older than 0.1.3, which drops stored fields it does not know.
const DECLINED_BUILDS_FILE: &str = "updater/declined-builds";

/// A hash of the build a Home of this architecture would run: service digests,
/// stack files, migrations, and its Updater binary. The Platform version,
/// release notes, hotfix mark, next pin, and list order are not part of it.
/// `None` when the manifest has no readable binary for the architecture.
pub(crate) fn build_identity(manifest: &ReleaseManifest, arch: UpdaterArch) -> Option<String> {
    let binary = decode_binary(manifest, arch).ok()?;
    let mut services: Vec<_> = manifest
        .services
        .iter()
        .map(|service| (&service.service, &service.digest))
        .collect();
    services.sort();
    // Stable sorts: the last entry for a path or key is the one that applies.
    let mut stack_files: Vec<_> = manifest
        .stack_files
        .iter()
        .map(|file| (&file.path, &file.contents))
        .collect();
    stack_files.sort_by_key(|(path, _)| *path);
    let mut migrations: Vec<_> = manifest
        .migrations
        .iter()
        .map(|migration| (&migration.key, &migration.value))
        .collect();
    migrations.sort_by_key(|(key, _)| *key);
    let build = serde_json::to_vec(&(services, stack_files, migrations, sha256(&binary))).ok()?;
    Some(sha256(&build))
}

fn sha256(bytes: &[u8]) -> String {
    let hex: String = Sha256::digest(bytes)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect();
    format!("sha256:{hex}")
}

/// The build of the installed Release. An Updater older than 0.1.3 does not
/// store it, so it is then taken from a channel manifest that still serves
/// that Platform version.
pub(crate) fn installed_build(
    stored: &StoredRelease,
    manifests: &dyn ManifestHost,
    release_key: Option<&VerifyingKey>,
    arch: UpdaterArch,
) -> Option<String> {
    if let Some(build) = &stored.build_identity {
        return Some(build.clone());
    }
    let installed = stored.platform_version.as_deref()?;
    let key = release_key?;
    [ReleaseChannel::Stable, ReleaseChannel::Canary]
        .into_iter()
        .filter_map(|channel| manifests.fetch(channel).ok().flatten())
        .filter_map(|bytes| verify_manifest(&bytes, key).ok())
        .find(|manifest| manifest.platform_version == installed)
        .and_then(|manifest| build_identity(&manifest, arch))
}

pub(crate) fn build_is_declined(controller_dir: &Path, build: &str) -> bool {
    std::fs::read_to_string(controller_dir.join(DECLINED_BUILDS_FILE))
        .is_ok_and(|text| text.lines().any(|line| line.trim() == build))
}

pub(crate) fn decline_build(controller_dir: &Path, build: &str) -> std::io::Result<()> {
    if build_is_declined(controller_dir, build) {
        return Ok(());
    }
    let path = controller_dir.join(DECLINED_BUILDS_FILE);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let mut text = match std::fs::read_to_string(&path) {
        Ok(text) => text,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => String::new(),
        Err(error) => return Err(error),
    };
    text.push_str(build);
    text.push('\n');
    let staged = path.with_extension("new");
    std::fs::write(&staged, text)?;
    std::fs::rename(staged, path)
}
