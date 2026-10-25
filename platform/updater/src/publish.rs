//! Plans a platform Release publish.
//!
//! A Canary push and an explicit Stable release both produce a signed
//! manifest the Updater already verifies. The plan names image tags and the
//! `v0.MINOR.PATCH` git tag. It does not talk to a registry or a remote.
//! Homes install the manifest, not `:canary` or `:latest`.

use base64::Engine;
use base64::engine::general_purpose::STANDARD as BASE64;
use ed25519_dalek::SigningKey;
use serde::{Deserialize, Serialize};

use crate::manifest::{STACK_FILES, image_names_a_tag, is_sha256_digest};
use crate::{
    ManifestError, RELEASE_SERVICES, ReleaseChannel, ReleaseManifest, ServiceImage,
    SettingMigration, StackFile, UpdaterBinaries, parse_platform_version, sign_manifest,
    verify_manifest,
};

/// Images the publisher builds. Third-party services are digest-pinned and
/// are not tagged `:canary` or `:latest`.
const NEMU_SERVICES: [&str; 2] = ["nemu-core", "nemu-matter"];

const MIGRATION_KEYS: [&str; 4] = ["mqtt", "homeassistant", "frontend", "availability"];

/// Where the publish was requested. Stable is an explicit release of `master`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PublishSource {
    Canary,
    Stable,
}

/// A Platform version already cut for a commit, including the manifest that
/// was signed. A later publish of that commit reuses this manifest so a
/// moved tag cannot change the digests.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CutRelease {
    pub platform_version: String,
    pub commit: String,
    pub manifest: ReleaseManifest,
}

/// One service image resolved for this publish. `image` may still name the
/// tag that was inspected; the manifest stores the repository and the digest.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ResolvedService {
    pub service: String,
    pub image: String,
    pub digest: String,
}

/// Inputs to one publish. The release-signing key is not part of this value.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PublishRequest {
    pub source: PublishSource,
    pub commit: String,
    /// Allocates the next minor when this publish cuts a new Platform version.
    /// The default is the next patch. The first Platform version is `0.1.0`.
    #[serde(default)]
    pub minor_bump: bool,
    pub cut_releases: Vec<CutRelease>,
    pub resolved: Vec<ResolvedService>,
    pub stack_files: Vec<StackFile>,
    pub migrations: Vec<SettingMigration>,
    pub updater: UpdaterBinaries,
}

/// A tag the workflow applies to one digest. Third-party images never appear.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ImageTag {
    pub image: String,
    pub tag: String,
    pub digest: String,
}

/// What the workflow should publish. `signed_manifest` is the bytes
/// `verify_manifest` accepts.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PublishPlan {
    pub platform_version: String,
    pub allocated_version: bool,
    pub git_tag: Option<String>,
    pub merge_back_to_canary: bool,
    pub channel: ReleaseChannel,
    pub signed_manifest: Vec<u8>,
    pub image_tags: Vec<ImageTag>,
}

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum PublishError {
    #[error("the commit is missing")]
    CommitMissing,
    #[error("the release manifest does not pin every service")]
    Unpinned,
    #[error("a resolved image digest is not a sha256 pin")]
    Digest,
    #[error("a cut release version is not a platform version")]
    CutVersion,
    #[error("the same commit was cut as more than one platform version")]
    CommitCutTwice,
    #[error("the release manifest does not name the stack files and updater binaries")]
    Incomplete,
    #[error("a migration names a setting a release may not change")]
    Migration,
    #[error("the release-signing key is not a base64 ed25519 seed")]
    SigningKey,
}

/// Plans one Canary or Stable publish.
pub fn plan_publish(
    request: &PublishRequest,
    signing_key: &SigningKey,
) -> Result<PublishPlan, PublishError> {
    let commit = request.commit.trim();
    if commit.is_empty() {
        return Err(PublishError::CommitMissing);
    }
    let (manifest, allocated) = match cut_for_commit(&request.cut_releases, commit)? {
        Some(cut) => (reused_manifest(cut)?, false),
        None => (new_manifest(request)?, true),
    };
    let signed_manifest = sign_manifest(&manifest, signing_key);
    verify_manifest(&signed_manifest, &signing_key.verifying_key()).map_err(publish_error)?;
    let channel = match request.source {
        PublishSource::Canary => ReleaseChannel::Canary,
        PublishSource::Stable => ReleaseChannel::Stable,
    };
    let pointer = match request.source {
        PublishSource::Canary => "canary",
        PublishSource::Stable => "latest",
    };
    Ok(PublishPlan {
        platform_version: manifest.platform_version.clone(),
        allocated_version: allocated,
        git_tag: allocated.then(|| format!("v{}", manifest.platform_version)),
        merge_back_to_canary: allocated && request.source == PublishSource::Stable,
        channel,
        signed_manifest,
        image_tags: image_tags(&manifest, pointer),
    })
}

/// Loads the publisher's release-signing seed. The error does not include the
/// secret.
pub fn signing_key_from_base64(encoded: &str) -> Result<SigningKey, PublishError> {
    let decoded = BASE64
        .decode(encoded.trim())
        .map_err(|_| PublishError::SigningKey)?;
    let bytes: [u8; 32] = decoded.try_into().map_err(|_| PublishError::SigningKey)?;
    Ok(SigningKey::from_bytes(&bytes))
}

fn reused_manifest(cut: &CutRelease) -> Result<ReleaseManifest, PublishError> {
    if parse_platform_version(&cut.platform_version).is_none()
        || cut.manifest.platform_version != cut.platform_version
    {
        return Err(PublishError::CutVersion);
    }
    Ok(cut.manifest.clone())
}

fn new_manifest(request: &PublishRequest) -> Result<ReleaseManifest, PublishError> {
    let platform_version = allocate_version(&request.cut_releases, request.minor_bump)?;
    let services = pin_services(&request.resolved)?;
    let stack_files = pin_stack_files(&request.stack_files, &services)?;
    if request.updater.amd64.is_empty() || request.updater.arm64.is_empty() {
        return Err(PublishError::Incomplete);
    }
    for migration in &request.migrations {
        if !MIGRATION_KEYS.contains(&migration.key.as_str()) || migration.value.is_empty() {
            return Err(PublishError::Migration);
        }
    }
    Ok(ReleaseManifest {
        platform_version,
        services,
        stack_files,
        migrations: request.migrations.clone(),
        updater: request.updater.clone(),
    })
}

fn cut_for_commit<'a>(
    cut: &'a [CutRelease],
    commit: &str,
) -> Result<Option<&'a CutRelease>, PublishError> {
    let mut found = None;
    for release in cut {
        if release.commit != commit {
            continue;
        }
        if found.is_some_and(|existing: &CutRelease| {
            existing.platform_version != release.platform_version
        }) {
            return Err(PublishError::CommitCutTwice);
        }
        found = Some(release);
    }
    Ok(found)
}

fn allocate_version(cut: &[CutRelease], minor_bump: bool) -> Result<String, PublishError> {
    let mut newest: Option<(u64, u64, u64)> = None;
    for release in cut {
        let parsed =
            parse_platform_version(&release.platform_version).ok_or(PublishError::CutVersion)?;
        newest = Some(match newest {
            Some(current) if current >= parsed => current,
            _ => parsed,
        });
    }
    Ok(match newest {
        None => "0.1.0".to_string(),
        Some((_, minor, _)) if minor_bump => format!("0.{}.0", minor + 1),
        Some((_, minor, patch)) => format!("0.{minor}.{}", patch + 1),
    })
}

fn pin_services(resolved: &[ResolvedService]) -> Result<Vec<ServiceImage>, PublishError> {
    let mut services = Vec::with_capacity(RELEASE_SERVICES.len());
    for required in RELEASE_SERVICES {
        let mut found = None;
        for service in resolved
            .iter()
            .filter(|service| service.service == *required)
        {
            if found.is_some() {
                return Err(PublishError::Unpinned);
            }
            found = Some(service);
        }
        let Some(service) = found else {
            return Err(PublishError::Unpinned);
        };
        if !is_sha256_digest(&service.digest) {
            return Err(PublishError::Digest);
        }
        let image = repository_name(&service.image);
        if image.is_empty() || image_names_a_tag(&image) || image.contains('@') {
            return Err(PublishError::Unpinned);
        }
        services.push(ServiceImage {
            service: (*required).to_string(),
            image,
            digest: service.digest.clone(),
        });
    }
    Ok(services)
}

fn repository_name(image: &str) -> String {
    let without_digest = image.split_once('@').map(|(name, _)| name).unwrap_or(image);
    if image_names_a_tag(without_digest) {
        let split_at = without_digest.rfind(':').unwrap_or(without_digest.len());
        return without_digest[..split_at].to_string();
    }
    without_digest.to_string()
}

fn pin_stack_files(
    stack_files: &[StackFile],
    services: &[ServiceImage],
) -> Result<Vec<StackFile>, PublishError> {
    let mut pinned = Vec::with_capacity(STACK_FILES.len());
    for path in STACK_FILES {
        let Some(file) = stack_files.iter().find(|file| file.path == *path) else {
            return Err(PublishError::Incomplete);
        };
        if file.contents.trim().is_empty() {
            return Err(PublishError::Incomplete);
        }
        let contents = if path == "docker-compose.yml" {
            pin_compose_images(&file.contents, services)?
        } else {
            file.contents.clone()
        };
        pinned.push(StackFile {
            path: (*path).to_string(),
            contents,
        });
    }
    Ok(pinned)
}

fn pin_compose_images(contents: &str, services: &[ServiceImage]) -> Result<String, PublishError> {
    let mut current: Option<String> = None;
    let mut in_services = false;
    let mut seen = [false; RELEASE_SERVICES.len()];
    let mut out = String::new();
    for line in contents.lines() {
        let line = line.trim_end_matches('\r');
        if line == "services:" || line.starts_with("services:") {
            in_services = true;
            current = None;
        } else if in_services && !line.is_empty() && !line.starts_with(' ') {
            in_services = false;
            current = None;
        }
        if in_services && let Some(name) = service_header(line) {
            current = Some(name.to_string());
        }
        if let Some(service_name) = current.as_deref()
            && let Some(indent) = image_indent(line)
            && let Some(pinned) = services
                .iter()
                .find(|service| service.service == service_name)
        {
            if let Some(index) = RELEASE_SERVICES
                .iter()
                .position(|service| *service == service_name)
            {
                seen[index] = true;
            }
            out.push_str(indent);
            out.push_str("image: ");
            out.push_str(&pinned.image);
            out.push('@');
            out.push_str(&pinned.digest);
            out.push('\n');
            continue;
        }
        out.push_str(line);
        out.push('\n');
    }
    if seen.iter().any(|found| !found) {
        return Err(PublishError::Unpinned);
    }
    Ok(out)
}

fn service_header(line: &str) -> Option<&str> {
    let name = line.strip_prefix("  ")?.strip_suffix(':')?;
    if name.is_empty() || name.starts_with(' ') || name.contains([' ', ':', '/']) {
        return None;
    }
    Some(name)
}

fn image_indent(line: &str) -> Option<&str> {
    let trimmed = line.trim_start();
    if !trimmed.starts_with("image:") {
        return None;
    }
    Some(&line[..line.len() - trimmed.len()])
}

fn image_tags(manifest: &ReleaseManifest, pointer: &str) -> Vec<ImageTag> {
    let mut tags = Vec::new();
    for service in &manifest.services {
        if !NEMU_SERVICES.contains(&service.service.as_str()) {
            continue;
        }
        for tag in [manifest.platform_version.as_str(), pointer] {
            tags.push(ImageTag {
                image: service.image.clone(),
                tag: tag.to_string(),
                digest: service.digest.clone(),
            });
        }
    }
    tags
}

fn publish_error(error: ManifestError) -> PublishError {
    match error {
        ManifestError::Unpinned => PublishError::Unpinned,
        ManifestError::Signature => PublishError::SigningKey,
        ManifestError::Unreadable | ManifestError::Incomplete => PublishError::Incomplete,
    }
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::Path;

    use base64::Engine;
    use base64::engine::general_purpose::STANDARD as BASE64;
    use ed25519_dalek::SigningKey;

    use super::{
        CutRelease, PublishRequest, PublishSource, ResolvedService, plan_publish,
        signing_key_from_base64,
    };
    use crate::{
        RELEASE_SERVICES, ReleaseChannel, ReleaseManifest, ServiceImage, SettingMigration,
        StackFile, UpdaterBinaries, verify_manifest,
    };

    fn key() -> SigningKey {
        SigningKey::from_bytes(&[0x41; 32])
    }

    fn digest(n: u8) -> String {
        format!("sha256:{n:064x}")
    }

    fn resolved(marker: u8) -> Vec<ResolvedService> {
        let images = [
            ("mosquitto", "eclipse-mosquitto:2"),
            ("zigbee2mqtt", "koenkk/zigbee2mqtt"),
            (
                "nemu-matter",
                "ghcr.io/zed-softworks-official/nemu-matter:latest",
            ),
            ("postgres", "postgres:16-alpine"),
            (
                "nemu-core",
                "ghcr.io/zed-softworks-official/nemu-core:canary",
            ),
        ];
        images
            .into_iter()
            .enumerate()
            .map(|(index, (service, image))| ResolvedService {
                service: service.to_string(),
                image: image.to_string(),
                digest: digest(marker.wrapping_add(index as u8)),
            })
            .collect()
    }

    fn compose() -> String {
        [
            "services:",
            "  mosquitto:",
            "    image: eclipse-mosquitto:2",
            "  zigbee2mqtt:",
            "    image: koenkk/zigbee2mqtt",
            "  nemu-matter:",
            "    image: ghcr.io/zed-softworks-official/nemu-matter:latest",
            "  postgres:",
            "    image: postgres:16-alpine",
            "  nemu-core:",
            "    image: ghcr.io/zed-softworks-official/nemu-core:latest",
            "  watchtower:",
            "    image: nickfedor/watchtower:latest",
            "",
        ]
        .join("\n")
    }

    fn request(
        source: PublishSource,
        commit: &str,
        minor_bump: bool,
        cut_releases: Vec<CutRelease>,
        resolved: Vec<ResolvedService>,
    ) -> PublishRequest {
        PublishRequest {
            source,
            commit: commit.to_string(),
            minor_bump,
            cut_releases,
            resolved,
            stack_files: vec![
                StackFile {
                    path: "docker-compose.yml".to_string(),
                    contents: compose(),
                },
                StackFile {
                    path: "mosquitto/mosquitto.conf".to_string(),
                    contents: "listener 1883\nallow_anonymous false\n".to_string(),
                },
            ],
            migrations: Vec::new(),
            updater: UpdaterBinaries {
                amd64: BASE64.encode(b"updater-amd64"),
                arm64: BASE64.encode(b"updater-arm64"),
            },
        }
    }

    fn tags_for<'a>(tags: &'a [super::ImageTag], image_suffix: &str) -> Vec<&'a str> {
        tags.iter()
            .filter(|tag| tag.image.ends_with(image_suffix))
            .map(|tag| tag.tag.as_str())
            .collect()
    }

    #[test]
    fn a_canary_push_signs_a_manifest_the_updater_accepts_with_every_service_pinned() {
        let signing_key = key();
        let plan = plan_publish(
            &request(
                PublishSource::Canary,
                "commit-1",
                false,
                Vec::new(),
                resolved(1),
            ),
            &signing_key,
        )
        .expect("canary plan");

        let manifest =
            verify_manifest(&plan.signed_manifest, &signing_key.verifying_key()).expect("verify");
        assert_eq!(manifest.platform_version, "0.1.0");
        assert_eq!(plan.channel, ReleaseChannel::Canary);
        for service in RELEASE_SERVICES {
            let pinned = manifest
                .services
                .iter()
                .find(|image| image.service == service)
                .unwrap_or_else(|| panic!("missing {service}"));
            assert!(pinned.digest.starts_with("sha256:"), "{service}");
            assert!(
                !pinned.image.contains(':'),
                "{service} image {}",
                pinned.image
            );
            assert!(!pinned.image.contains('@'), "{service}");
        }
        let compose = manifest
            .stack_files
            .iter()
            .find(|file| file.path == "docker-compose.yml")
            .expect("compose");
        assert!(compose.contents.contains("eclipse-mosquitto@sha256:"));
        assert!(compose.contents.contains("postgres@sha256:"));
        assert!(!compose.contents.contains("eclipse-mosquitto:2"));
        assert!(!compose.contents.contains("postgres:16-alpine"));
    }

    #[test]
    fn the_first_platform_version_is_0_1_0_and_later_pushes_increment_the_patch() {
        let signing_key = key();
        let first = plan_publish(
            &request(
                PublishSource::Canary,
                "commit-1",
                true,
                Vec::new(),
                resolved(1),
            ),
            &signing_key,
        )
        .expect("first");
        assert_eq!(first.platform_version, "0.1.0");
        assert!(first.allocated_version);
        assert_eq!(first.git_tag.as_deref(), Some("v0.1.0"));

        let manifest =
            verify_manifest(&first.signed_manifest, &signing_key.verifying_key()).expect("verify");
        let second = plan_publish(
            &request(
                PublishSource::Canary,
                "commit-2",
                false,
                vec![CutRelease {
                    platform_version: first.platform_version.clone(),
                    commit: "commit-1".to_string(),
                    manifest,
                }],
                resolved(2),
            ),
            &signing_key,
        )
        .expect("second");
        assert_eq!(second.platform_version, "0.1.1");
        assert_eq!(second.git_tag.as_deref(), Some("v0.1.1"));
        assert!(!second.merge_back_to_canary);
    }

    #[test]
    fn a_minor_bump_happens_only_when_requested() {
        let signing_key = key();
        let existing = cut_release("0.1.4", "commit-old", 2);
        let patch = plan_publish(
            &request(
                PublishSource::Canary,
                "commit-patch",
                false,
                vec![existing.clone()],
                resolved(3),
            ),
            &signing_key,
        )
        .expect("patch");
        assert_eq!(patch.platform_version, "0.1.5");

        let minor = plan_publish(
            &request(
                PublishSource::Canary,
                "commit-minor",
                true,
                vec![existing],
                resolved(4),
            ),
            &signing_key,
        )
        .expect("minor");
        assert_eq!(minor.platform_version, "0.2.0");
        assert_eq!(minor.git_tag.as_deref(), Some("v0.2.0"));
    }

    #[test]
    fn canary_tags_nemu_images_with_the_platform_version_and_canary_and_tags_the_commit() {
        let signing_key = key();
        let plan = plan_publish(
            &request(
                PublishSource::Canary,
                "commit-1",
                false,
                Vec::new(),
                resolved(1),
            ),
            &signing_key,
        )
        .expect("canary plan");

        assert_eq!(plan.git_tag.as_deref(), Some("v0.1.0"));
        assert_eq!(
            tags_for(&plan.image_tags, "nemu-core"),
            vec!["0.1.0", "canary"]
        );
        assert_eq!(
            tags_for(&plan.image_tags, "nemu-matter"),
            vec!["0.1.0", "canary"]
        );
        assert!(plan.image_tags.iter().all(|tag| tag.tag != "latest"));
        let core_digest = plan
            .image_tags
            .iter()
            .find(|tag| tag.image.ends_with("nemu-core"))
            .expect("core")
            .digest
            .clone();
        assert!(
            plan.image_tags
                .iter()
                .filter(|tag| tag.image.ends_with("nemu-core"))
                .all(|tag| tag.digest == core_digest)
        );
    }

    #[test]
    fn third_party_images_are_digest_pinned_and_receive_no_channel_tag() {
        let signing_key = key();
        let plan = plan_publish(
            &request(
                PublishSource::Canary,
                "commit-1",
                false,
                Vec::new(),
                resolved(1),
            ),
            &signing_key,
        )
        .expect("canary plan");
        let manifest =
            verify_manifest(&plan.signed_manifest, &signing_key.verifying_key()).expect("verify");

        for service in ["mosquitto", "zigbee2mqtt", "postgres"] {
            let pinned = manifest
                .services
                .iter()
                .find(|image| image.service == service)
                .unwrap_or_else(|| panic!("missing {service}"));
            assert!(pinned.digest.starts_with("sha256:"));
            assert!(
                plan.image_tags.iter().all(|tag| tag.image != pinned.image),
                "{service} was tagged"
            );
        }
        assert!(
            plan.image_tags
                .iter()
                .all(|tag| !tag.image.contains("eclipse-mosquitto")
                    && !tag.image.contains("zigbee2mqtt")
                    && tag.image != "postgres"
                    && !tag.image.contains("watchtower"))
        );
        let compose = &manifest
            .stack_files
            .iter()
            .find(|file| file.path == "docker-compose.yml")
            .expect("compose")
            .contents;
        assert!(compose.contains("image: nickfedor/watchtower:latest"));
        assert!(!compose.contains(":canary"));
        assert!(!compose.contains("nemu-core:latest"));
        assert!(!compose.contains("nemu-matter:latest"));
    }

    #[test]
    fn two_publishes_of_the_same_commit_resolve_the_same_digests() {
        let signing_key = key();
        let first = plan_publish(
            &request(
                PublishSource::Canary,
                "commit-1",
                false,
                Vec::new(),
                resolved(1),
            ),
            &signing_key,
        )
        .expect("first");
        let first_manifest =
            verify_manifest(&first.signed_manifest, &signing_key.verifying_key()).expect("verify");
        let mut drifted = request(
            PublishSource::Canary,
            "commit-1",
            true,
            vec![CutRelease {
                platform_version: first.platform_version.clone(),
                commit: "commit-1".to_string(),
                manifest: first_manifest.clone(),
            }],
            resolved(9),
        );
        drifted.stack_files[0].contents =
            "services:\n  nemu-core:\n    image: example:latest\n".to_string();
        drifted.updater.amd64 = BASE64.encode(b"different-updater");

        let second = plan_publish(&drifted, &signing_key).expect("second");

        assert_eq!(second.platform_version, first.platform_version);
        assert!(!second.allocated_version);
        assert_eq!(second.git_tag, None);
        assert_eq!(second.signed_manifest, first.signed_manifest);
        let second_manifest =
            verify_manifest(&second.signed_manifest, &signing_key.verifying_key()).expect("verify");
        assert_eq!(second_manifest.services, first_manifest.services);
    }

    #[test]
    fn stable_promotion_points_at_the_cut_version_and_moves_latest_without_a_second_version() {
        let signing_key = key();
        let cut = cut_release("0.4.2", "commit-cut", 4);
        let mut drifted = request(
            PublishSource::Stable,
            "commit-cut",
            true,
            vec![cut],
            resolved(8),
        );
        drifted.updater.arm64 = BASE64.encode(b"rebuilt-arm64");

        let plan = plan_publish(&drifted, &signing_key).expect("stable");

        assert_eq!(plan.platform_version, "0.4.2");
        assert!(!plan.allocated_version);
        assert_eq!(plan.git_tag, None);
        assert!(!plan.merge_back_to_canary);
        assert_eq!(plan.channel, ReleaseChannel::Stable);
        assert_eq!(
            tags_for(&plan.image_tags, "nemu-core"),
            vec!["0.4.2", "latest"]
        );
        assert_eq!(
            tags_for(&plan.image_tags, "nemu-matter"),
            vec!["0.4.2", "latest"]
        );
        assert!(plan.image_tags.iter().all(|tag| tag.tag != "canary"));
        let manifest =
            verify_manifest(&plan.signed_manifest, &signing_key.verifying_key()).expect("verify");
        assert_eq!(manifest.platform_version, "0.4.2");
        assert_eq!(manifest.services, cut_services(4));
    }

    #[test]
    fn an_unpublished_master_commit_takes_the_next_version_and_merges_back_to_canary() {
        let signing_key = key();
        let cut = cut_release("0.4.2", "commit-cut", 4);
        let plan = plan_publish(
            &request(
                PublishSource::Stable,
                "commit-hotfix",
                false,
                vec![cut],
                resolved(6),
            ),
            &signing_key,
        )
        .expect("hotfix");

        assert_eq!(plan.platform_version, "0.4.3");
        assert!(plan.allocated_version);
        assert_eq!(plan.git_tag.as_deref(), Some("v0.4.3"));
        assert!(plan.merge_back_to_canary);
        assert_eq!(plan.channel, ReleaseChannel::Stable);
        assert_eq!(
            tags_for(&plan.image_tags, "nemu-core"),
            vec!["0.4.3", "latest"]
        );
        assert!(plan.image_tags.iter().all(|tag| tag.tag != "canary"));
        let manifest =
            verify_manifest(&plan.signed_manifest, &signing_key.verifying_key()).expect("verify");
        assert_eq!(manifest.platform_version, "0.4.3");
        assert!(
            manifest.services.iter().any(|service| {
                service.service == "postgres" && service.digest == digest(6 + 3)
            })
        );
    }

    #[test]
    fn the_shipped_compose_file_pins_every_service_digest() {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../infra/prod");
        let compose = fs::read_to_string(root.join("docker-compose.yml")).expect("compose");
        let mosquitto =
            fs::read_to_string(root.join("mosquitto/mosquitto.conf")).expect("mosquitto");
        let mut request = request(
            PublishSource::Canary,
            "commit-shipped",
            false,
            Vec::new(),
            resolved(1),
        );
        request.stack_files = vec![
            StackFile {
                path: "docker-compose.yml".to_string(),
                contents: compose,
            },
            StackFile {
                path: "mosquitto/mosquitto.conf".to_string(),
                contents: mosquitto,
            },
        ];
        let signing_key = key();
        let plan = plan_publish(&request, &signing_key).expect("plan");
        let manifest =
            verify_manifest(&plan.signed_manifest, &signing_key.verifying_key()).expect("verify");
        let compose = &manifest
            .stack_files
            .iter()
            .find(|file| file.path == "docker-compose.yml")
            .expect("compose")
            .contents;
        for line in compose.lines() {
            let trimmed = line.trim_start();
            if !trimmed.starts_with("image:") || trimmed.contains("watchtower") {
                continue;
            }
            assert!(trimmed.contains("@sha256:"), "{line}");
            assert!(!trimmed.contains(":latest"), "{line}");
            assert!(!trimmed.contains(":canary"), "{line}");
        }
        assert!(compose.contains("image: nickfedor/watchtower:latest"));
        assert!(
            plan.image_tags
                .iter()
                .all(|tag| !tag.image.contains("watchtower"))
        );
    }

    #[test]
    fn the_signing_key_error_does_not_include_the_secret() {
        let secret = "this-is-not-a-real-release-key-and-must-not-leak";
        let error = signing_key_from_base64(secret).expect_err("reject");
        assert!(!error.to_string().contains(secret));
        let encoded = BASE64.encode(key().to_bytes());
        let loaded = signing_key_from_base64(&encoded).expect("load");
        assert_eq!(loaded.to_bytes(), key().to_bytes());
    }

    fn cut_services(marker: u8) -> Vec<ServiceImage> {
        let images = [
            ("mosquitto", "eclipse-mosquitto"),
            ("zigbee2mqtt", "koenkk/zigbee2mqtt"),
            ("nemu-matter", "ghcr.io/zed-softworks-official/nemu-matter"),
            ("postgres", "postgres"),
            ("nemu-core", "ghcr.io/zed-softworks-official/nemu-core"),
        ];
        images
            .into_iter()
            .enumerate()
            .map(|(index, (service, image))| ServiceImage {
                service: service.to_string(),
                image: image.to_string(),
                digest: digest(marker.wrapping_add(index as u8)),
            })
            .collect()
    }

    fn cut_release(version: &str, commit: &str, marker: u8) -> CutRelease {
        CutRelease {
            platform_version: version.to_string(),
            commit: commit.to_string(),
            manifest: ReleaseManifest {
                platform_version: version.to_string(),
                services: cut_services(marker),
                stack_files: vec![
                    StackFile {
                        path: "docker-compose.yml".to_string(),
                        contents: "services:\n  nemu-core:\n    image: ghcr.io/zed-softworks-official/nemu-core@sha256:pinned\n".to_string(),
                    },
                    StackFile {
                        path: "mosquitto/mosquitto.conf".to_string(),
                        contents: "listener 1883\n".to_string(),
                    },
                ],
                migrations: vec![SettingMigration {
                    key: "availability".to_string(),
                    value: "enabled: true\n".to_string(),
                }],
                updater: UpdaterBinaries {
                    amd64: BASE64.encode(b"cut-amd64"),
                    arm64: BASE64.encode(b"cut-arm64"),
                },
            },
        }
    }
}
