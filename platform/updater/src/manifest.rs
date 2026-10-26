use base64::Engine;
use base64::engine::general_purpose::STANDARD as BASE64;
use ed25519_dalek::{Signature, Signer, SigningKey, Verifier, VerifyingKey};
use serde::{Deserialize, Serialize};

use crate::ReleaseChannel;

/// Compose services a Release pins by digest.
///
/// The interim tag follower is not one of them. A Release does not become
/// available because `:canary` or `:latest` moved.
pub const RELEASE_SERVICES: [&str; 5] = [
    "mosquitto",
    "zigbee2mqtt",
    "nemu-matter",
    "postgres",
    "nemu-core",
];

pub(crate) const STACK_FILES: [&str; 2] = ["docker-compose.yml", "mosquitto/mosquitto.conf"];

/// One service image, pinned by digest. `image` is the repository without a tag.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ServiceImage {
    pub service: String,
    pub image: String,
    pub digest: String,
}

/// Stack file bytes the Release may replace wholesale.
///
/// Paths are relative to the Controller directory: `docker-compose.yml` and
/// `mosquitto/mosquitto.conf`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct StackFile {
    pub path: String,
    pub contents: String,
}

/// Explicit migration of a Nemu-owned Zigbee setting.
///
/// The keys a Release may migrate are `mqtt`, `homeassistant`, `frontend`,
/// and `availability`. Serial settings and network state are not migrations.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SettingMigration {
    pub key: String,
    pub value: String,
}

/// Updater binaries for the two supported architectures, base64-encoded.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct UpdaterBinaries {
    pub amd64: String,
    pub arm64: String,
}

/// The published description of one Release.
///
/// The Platform version is not a crate version and not an image tag. The
/// channel is not part of the manifest; Stable and Canary are different
/// documents the host serves.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReleaseManifest {
    pub platform_version: String,
    pub services: Vec<ServiceImage>,
    pub stack_files: Vec<StackFile>,
    pub migrations: Vec<SettingMigration>,
    pub updater: UpdaterBinaries,
    /// Next wrapper pin: base64 of the 32-byte ed25519 release-signing public
    /// key. Omitted when this Release does not rotate that key. The signature
    /// covers the field when it is present.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub next_pin: Option<String>,
}

/// A Release manifest and the ed25519 signature over its canonical JSON.
///
/// The signature uses the release key. It is not the Controller identity key.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SignedReleaseManifest {
    pub manifest: ReleaseManifest,
    pub signature: String,
}

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum ManifestError {
    #[error("the release manifest could not be read")]
    Unreadable,
    #[error("the release signature does not verify")]
    Signature,
    #[error("the release manifest does not pin every service")]
    Unpinned,
    #[error("the release manifest does not name the stack files and updater binaries")]
    Incomplete,
    #[error("the next wrapper pin is not a release-signing public key")]
    Pin,
}

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum ManifestHostError {
    #[error("{0}")]
    Unavailable(String),
}

/// Where channel manifests and floating image tags are published.
///
/// `image_tag` is the fake registry lookup. A moved tag is not a Release.
pub trait ManifestHost: Send + Sync {
    fn fetch(&self, channel: ReleaseChannel) -> Result<Option<Vec<u8>>, ManifestHostError>;

    fn image_tag(&self, reference: &str) -> Option<String> {
        let _ = reference;
        None
    }
}

/// A host that has not published a manifest.
pub struct MissingManifestHost;

impl ManifestHost for MissingManifestHost {
    fn fetch(&self, _channel: ReleaseChannel) -> Result<Option<Vec<u8>>, ManifestHostError> {
        Ok(None)
    }
}

/// Canonical bytes the release key signs. Publishers and the Updater both use this.
pub fn manifest_signing_bytes(manifest: &ReleaseManifest) -> Vec<u8> {
    serde_json::to_vec(manifest).expect("release manifest serializes")
}

pub fn sign_manifest(manifest: &ReleaseManifest, key: &SigningKey) -> Vec<u8> {
    let signature = key.sign(&manifest_signing_bytes(manifest));
    let signed = SignedReleaseManifest {
        manifest: manifest.clone(),
        signature: BASE64.encode(signature.to_bytes()),
    };
    serde_json::to_vec(&signed).expect("signed release manifest serializes")
}

pub fn verify_manifest(
    bytes: &[u8],
    release_key: &VerifyingKey,
) -> Result<ReleaseManifest, ManifestError> {
    let signed: SignedReleaseManifest =
        serde_json::from_slice(bytes).map_err(|_| ManifestError::Unreadable)?;
    let signature_bytes = BASE64
        .decode(signed.signature.trim())
        .map_err(|_| ManifestError::Signature)?;
    let signature =
        Signature::from_slice(&signature_bytes).map_err(|_| ManifestError::Signature)?;
    let message = manifest_signing_bytes(&signed.manifest);
    release_key
        .verify(&message, &signature)
        .map_err(|_| ManifestError::Signature)?;
    if let Some(pin) = &signed.manifest.next_pin {
        parse_next_pin(pin)?;
    }
    if !pins_every_service(&signed.manifest) {
        return Err(ManifestError::Unpinned);
    }
    if !names_release_files(&signed.manifest) {
        return Err(ManifestError::Incomplete);
    }
    Ok(signed.manifest)
}

pub(crate) fn parse_next_pin(encoded: &str) -> Result<VerifyingKey, ManifestError> {
    let decoded = BASE64
        .decode(encoded.trim())
        .map_err(|_| ManifestError::Pin)?;
    let bytes: [u8; 32] = decoded.try_into().map_err(|_| ManifestError::Pin)?;
    VerifyingKey::from_bytes(&bytes).map_err(|_| ManifestError::Pin)
}

fn pins_every_service(manifest: &ReleaseManifest) -> bool {
    let listed_are_pinned = manifest.services.iter().all(|service| {
        !service.service.is_empty()
            && is_sha256_digest(&service.digest)
            && image_is_repository(&service.image)
    });
    let required_once = RELEASE_SERVICES.iter().all(|required| {
        manifest
            .services
            .iter()
            .filter(|service| service.service == *required)
            .count()
            == 1
    });
    listed_are_pinned && required_once
}

fn names_release_files(manifest: &ReleaseManifest) -> bool {
    let stacks = STACK_FILES.iter().all(|path| {
        manifest
            .stack_files
            .iter()
            .any(|file| file.path == *path && !file.contents.is_empty())
    });
    stacks && !manifest.updater.amd64.is_empty() && !manifest.updater.arm64.is_empty()
}

pub(crate) fn is_sha256_digest(digest: &str) -> bool {
    let Some(hex) = digest.strip_prefix("sha256:") else {
        return false;
    };
    hex.len() == 64
        && hex
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
}

fn image_is_repository(image: &str) -> bool {
    !image.is_empty() && !image.contains('@') && !image_names_a_tag(image)
}

pub(crate) fn image_names_a_tag(image: &str) -> bool {
    image.rsplit('/').next().unwrap_or(image).contains(':')
}
