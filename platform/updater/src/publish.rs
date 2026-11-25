//! Plans a platform Release publish.
//!
//! [`decide`] takes the publish request and the Git, tag, and channel facts,
//! and settles what would be published. It needs no build and no key, so the
//! workflow runs it first and a bad request fails before anything is built.
//! [`plan_publish`] decides again and signs the manifest. Neither talks to a
//! registry or a remote. Homes install the manifest, not `:canary` or `:latest`.

use base64::Engine;
use base64::engine::general_purpose::STANDARD as BASE64;
use ed25519_dalek::SigningKey;
use serde::{Deserialize, Serialize};

use crate::manifest::{STACK_FILES, image_names_a_tag, is_sha256_digest};
use crate::version::PlatformVersion;
use crate::{
    ManifestError, RELEASE_SERVICES, ReleaseChannel, ReleaseManifest, ServiceImage,
    SettingMigration, StackFile, UpdaterBinaries, sign_manifest, verify_manifest,
};

/// Images the publisher builds. Third-party services are digest-pinned and
/// are not tagged `:canary` or `:latest`.
const NEMU_SERVICES: [&str; 2] = ["nemu-core", "nemu-matter"];

const MIGRATION_KEYS: [&str; 4] = ["mqtt", "homeassistant", "frontend", "availability"];

/// The channel the publish was requested for.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PublishSource {
    Canary,
    Stable,
}

/// A Release whose `v0.*` tag exists.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CutRelease {
    pub platform_version: String,
    pub commit: String,
    /// Identity of `platform/` and `infra/prod/` at `commit`.
    pub platform_tree: String,
    /// The signed manifest's `hotfix` mark.
    pub hotfix: bool,
    /// Whether `commit` is, or descends from, the requested commit.
    pub contains_request: bool,
}

/// The Platform version each channel manifest serves now, if any.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ChannelVersions {
    pub canary: Option<String>,
    pub stable: Option<String>,
}

/// What was asked for, and the facts that decide it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReleaseRequest {
    pub source: PublishSource,
    pub branch: String,
    pub commit: String,
    /// Identity of `platform/` and `infra/prod/` at `commit`.
    pub platform_tree: String,
    /// A push skips when the platform trees did not change; an explicit run
    /// does not.
    pub push: bool,
    /// A re-run, or a run that `prepare` already accepted. It may find its own
    /// cut finished, so that is not a duplicate.
    pub resuming: bool,
    /// Canary: start the next minor target unless the current target is one.
    pub minor_bump: bool,
    /// Canary: start the target after the one candidates use.
    pub advance_version: bool,
    /// Stable: the exact Release candidate to promote. Empty when none.
    pub candidate: String,
    /// Stable: build `master` as a Hotfix Release.
    pub hotfix: bool,
    pub cut_releases: Vec<CutRelease>,
    pub channels: ChannelVersions,
}

/// How the Release's manifest is made.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PublishAction {
    /// The trees a Home installs did not change.
    Skip,
    /// Build the requested commit.
    Build,
    /// Sign a new manifest from the candidate's build.
    Promote,
    /// The version is already cut. Finish publishing it.
    Finish,
}

/// What a request publishes.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PublishDecision {
    pub action: PublishAction,
    /// Empty when skipped.
    pub platform_version: String,
    /// The commit that was, or will be, built.
    pub commit: String,
    /// The tag to publish. `None` when it exists.
    pub git_tag: Option<String>,
    /// The cut whose signed manifest the plan needs.
    pub source_tag: Option<String>,
    /// Release notes cover the changes since this tag.
    pub notes_since: Option<String>,
    /// A GitHub pre-release, which is never the latest release.
    pub prerelease: bool,
    /// Every channel this publish moves. Empty when they are all newer.
    pub channels: Vec<ReleaseChannel>,
    pub merge_back_to_canary: bool,
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

/// What the workflow built from the requested commit.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BuildInputs {
    pub resolved: Vec<ResolvedService>,
    pub stack_files: Vec<StackFile>,
    pub migrations: Vec<SettingMigration>,
    pub updater: UpdaterBinaries,
    /// Next wrapper pin. A promotion keeps the candidate's.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub next_pin: Option<String>,
}

/// Inputs to one publish. The release-signing key is not part of this value.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PublishRequest {
    pub release: ReleaseRequest,
    /// The version and commit decided before the build.
    pub expected_version: String,
    pub expected_commit: String,
    pub build: Option<BuildInputs>,
    /// The manifest of the decision's `source_tag`.
    pub source_manifest: Option<ReleaseManifest>,
    /// Notes for a new manifest. Blank notes are omitted, and finishing a cut
    /// keeps the notes it was signed with.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub release_notes: Option<String>,
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
/// `verify_manifest` accepts. Every channel in the decision gets them.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PublishPlan {
    pub decision: PublishDecision,
    pub signed_manifest: Vec<u8>,
    /// The Platform version's own image tags.
    pub version_tags: Vec<ImageTag>,
    /// `:canary` and `:latest`, for the channels that move.
    pub pointer_tags: Vec<ImageTag>,
}

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum PublishError {
    #[error("the commit or its platform trees are missing")]
    CommitMissing,
    #[error("a Canary publish runs on canary, and a Stable publish on master")]
    Branch,
    #[error(
        "minor bump and advance version are Canary options; candidate and hotfix are Stable options"
    )]
    Options,
    #[error("a Stable publish names either the Release candidate to promote or a hotfix")]
    StableMode,
    #[error("the candidate to promote is not an exact 0.MINOR.PATCH-canary.N version")]
    CandidateName,
    #[error("that Release candidate does not exist")]
    CandidateUnknown,
    #[error("the Release candidate's platform trees do not match master")]
    CandidateTrees,
    #[error("a later Release candidate targets the same version")]
    CandidateSuperseded,
    #[error("the Release candidate's plain version is already taken")]
    CandidateTaken,
    #[error("the next version is not newer than its channel")]
    NotNewer,
    #[error("a later Release already contains this commit")]
    StaleCommit,
    #[error("this commit is already cut as {0}; a new version needs a new commit")]
    AlreadyCut(String),
    #[error(
        "this commit is already cut as {0}, which did not advance and is not finished; run again without advance version to finish it, then advance from a new commit"
    )]
    NotAdvanced(String),
    #[error("the publish facts changed since the build was decided")]
    Drifted,
    #[error("there is nothing to publish")]
    Skipped,
    #[error("the release manifest does not pin every service")]
    Unpinned,
    #[error("a resolved image digest is not a sha256 pin")]
    Digest,
    #[error(
        "a cut release or channel version is not a platform version, or does not match its manifest"
    )]
    CutVersion,
    #[error("the same commit or version was cut twice")]
    CutTwice,
    #[error("the release manifest does not name the stack files and updater binaries")]
    Incomplete,
    #[error("a migration names a setting a release may not change")]
    Migration,
    #[error("the release-signing key is not a base64 ed25519 seed")]
    SigningKey,
    #[error("the next wrapper pin is not a release-signing public key")]
    Pin,
}

impl PublishDecision {
    fn new(action: PublishAction, commit: &str) -> Self {
        Self {
            action,
            platform_version: String::new(),
            commit: commit.to_string(),
            git_tag: None,
            source_tag: None,
            notes_since: None,
            prerelease: false,
            channels: Vec::new(),
            merge_back_to_canary: false,
        }
    }
}

#[derive(Clone, Copy)]
struct Cut<'a> {
    version: PlatformVersion,
    release: &'a CutRelease,
}

/// The cuts in Platform version order, and what the channels serve.
struct Facts<'a> {
    cuts: Vec<Cut<'a>>,
    canary: Option<PlatformVersion>,
    stable: Option<PlatformVersion>,
}

impl<'a> Facts<'a> {
    fn read(request: &'a ReleaseRequest) -> Result<Self, PublishError> {
        let parse = |version: &str| PlatformVersion::parse(version).ok_or(PublishError::CutVersion);
        let mut cuts = request
            .cut_releases
            .iter()
            .map(|release| {
                Ok(Cut {
                    version: parse(&release.platform_version)?,
                    release,
                })
            })
            .collect::<Result<Vec<_>, PublishError>>()?;
        cuts.sort_by_key(|cut| cut.version);
        if cuts
            .windows(2)
            .any(|pair| pair[0].version == pair[1].version)
        {
            return Err(PublishError::CutTwice);
        }
        let channel = |version: &Option<String>| version.as_deref().map(parse).transpose();
        Ok(Self {
            cuts,
            canary: channel(&request.channels.canary)?,
            stable: channel(&request.channels.stable)?,
        })
    }

    fn find(&self, version: PlatformVersion) -> Option<&Cut<'a>> {
        self.cuts.iter().find(|cut| cut.version == version)
    }

    fn candidates(&self) -> impl DoubleEndedIterator<Item = &Cut<'a>> {
        self.cuts.iter().filter(|cut| cut.version.is_candidate())
    }

    fn plain(&self) -> impl DoubleEndedIterator<Item = &Cut<'a>> {
        self.cuts.iter().filter(|cut| !cut.version.is_candidate())
    }

    /// Candidates and promoted Releases. Canary never carries a Hotfix
    /// Release, so one is neither its baseline nor its previous cut.
    fn canary_line(&self) -> impl DoubleEndedIterator<Item = &Cut<'a>> {
        self.cuts.iter().filter(|cut| !cut.release.hotfix)
    }

    /// The candidate and the plain Release cut on a commit. A commit may have
    /// one of each.
    fn at(&self, commit: &str) -> Result<(Option<&Cut<'a>>, Option<&Cut<'a>>), PublishError> {
        let mut candidate = None;
        let mut plain = None;
        for cut in self.cuts.iter().filter(|cut| cut.release.commit == commit) {
            let slot = if cut.version.is_candidate() {
                &mut candidate
            } else {
                &mut plain
            };
            if slot.replace(cut).is_some() {
                return Err(PublishError::CutTwice);
            }
        }
        Ok((candidate, plain))
    }

    /// Channels never move backwards. A newer cut counts even when its channel
    /// manifest was not written yet, or was read from a stale cache.
    fn moves_canary(&self, version: PlatformVersion) -> bool {
        self.canary.is_none_or(|current| current <= version)
            && self.canary_line().all(|cut| cut.version <= version)
    }

    fn moves_stable(&self, version: PlatformVersion) -> bool {
        self.stable.is_none_or(|current| current <= version)
            && self.plain().all(|cut| cut.version <= version)
    }

    fn newer_than_stable(&self, version: PlatformVersion) -> bool {
        self.stable != Some(version) && self.moves_stable(version)
    }

    fn newest_plain(&self) -> Option<PlatformVersion> {
        self.plain().last().map(|cut| cut.version)
    }

    fn next_plain_patch(&self) -> PlatformVersion {
        self.newest_plain()
            .map_or(PlatformVersion::plain(1, 0), |newest| newest.next_patch())
    }

    /// The highest target in use, or the next patch after the newest plain
    /// version. Advancing leaves a target a candidate uses; a minor bump
    /// leaves a target that is not already a minor one.
    fn next_candidate(&self, minor_bump: bool, advance: bool) -> PlatformVersion {
        let newest = self.candidates().last().map(|cut| cut.version.target());
        let mut target = self.next_plain_patch();
        if let Some(used) = newest.filter(|used| *used >= target) {
            target = if advance { used.next_patch() } else { used };
        }
        if minor_bump && target.patch != 0 {
            target = target.next_minor();
        }
        let last = self
            .candidates()
            .filter(|cut| cut.version.target() == target)
            .filter_map(|cut| cut.version.candidate_number())
            .max();
        target.candidate(last.unwrap_or(0) + 1)
    }

    /// Whether a candidate left an earlier target that could still be
    /// promoted, as this request would have. Cuts below it decide: without the
    /// advance or bump they would have given another version.
    fn left_target(&self, version: PlatformVersion, minor_bump: bool) -> bool {
        let before = Facts {
            cuts: self
                .cuts
                .iter()
                .copied()
                .filter(|cut| cut.version < version)
                .collect(),
            canary: self.canary,
            stable: self.stable,
        };
        before.next_candidate(minor_bump, true) == version
            && before.next_candidate(false, false) != version
    }

    fn decision(
        &self,
        action: PublishAction,
        version: PlatformVersion,
        commit: &str,
        source: Option<PlatformVersion>,
    ) -> PublishDecision {
        let candidate = version.is_candidate();
        let previous = if candidate {
            self.canary_line().rfind(|cut| cut.version < version)
        } else {
            self.plain().rfind(|cut| cut.version < version)
        };
        PublishDecision {
            platform_version: version.to_string(),
            git_tag: (action != PublishAction::Finish).then(|| tag(version)),
            source_tag: source.map(tag),
            notes_since: previous.map(|cut| tag(cut.version)),
            prerelease: candidate,
            ..PublishDecision::new(action, commit)
        }
    }
}

fn tag(version: PlatformVersion) -> String {
    format!("v{version}")
}

/// Decides what a request publishes, or refuses it.
pub fn decide(request: &ReleaseRequest) -> Result<PublishDecision, PublishError> {
    if request.commit.trim().is_empty() || request.platform_tree.trim().is_empty() {
        return Err(PublishError::CommitMissing);
    }
    let candidate = request.candidate.trim();
    let facts = Facts::read(request)?;
    match request.source {
        PublishSource::Canary => {
            if request.branch != "canary" {
                return Err(PublishError::Branch);
            }
            if request.hotfix || !candidate.is_empty() {
                return Err(PublishError::Options);
            }
            decide_canary(request, &facts)
        }
        PublishSource::Stable => {
            if request.branch != "master" {
                return Err(PublishError::Branch);
            }
            if request.minor_bump || request.advance_version {
                return Err(PublishError::Options);
            }
            match (request.hotfix, candidate.is_empty()) {
                (true, true) => decide_hotfix(request, &facts),
                (false, false) => decide_promotion(request, candidate, &facts),
                _ => Err(PublishError::StableMode),
            }
        }
    }
}

fn decide_canary(
    request: &ReleaseRequest,
    facts: &Facts<'_>,
) -> Result<PublishDecision, PublishError> {
    let commit = request.commit.trim();
    let mut decision = if let (Some(cut), _) = facts.at(commit)? {
        // A retry finishes this cut. Writing the channel manifest is the last
        // step, so an explicit run that finds it written asks for a second
        // candidate on the commit, as does an option it cannot have been cut
        // with.
        let finished = facts.canary.is_some_and(|current| current >= cut.version);
        let duplicate = finished && !request.push && !request.resuming;
        let other_target = request.minor_bump && cut.version.patch != 0;
        if duplicate || other_target {
            return Err(PublishError::AlreadyCut(cut.version.to_string()));
        }
        if request.advance_version && !facts.left_target(cut.version, request.minor_bump) {
            return Err(if finished {
                PublishError::AlreadyCut(cut.version.to_string())
            } else {
                PublishError::NotAdvanced(cut.version.to_string())
            });
        }
        let source = Some(cut.version);
        facts.decision(PublishAction::Finish, cut.version, commit, source)
    } else {
        // Only a re-run of an older workflow run gets here behind a later cut.
        if facts
            .canary_line()
            .any(|cut| cut.release.contains_request && cut.release.commit != commit)
        {
            return Err(PublishError::StaleCommit);
        }
        let baseline = facts.canary_line().last();
        if request.push
            && baseline.is_some_and(|cut| cut.release.platform_tree == request.platform_tree)
        {
            return Ok(PublishDecision::new(PublishAction::Skip, commit));
        }
        let version = facts.next_candidate(request.minor_bump, request.advance_version);
        if facts.canary.is_some_and(|current| current >= version) {
            return Err(PublishError::NotNewer);
        }
        facts.decision(PublishAction::Build, version, commit, None)
    };
    if facts.moves_canary(parsed(&decision)?) {
        decision.channels.push(ReleaseChannel::Canary);
    }
    Ok(decision)
}

fn decide_promotion(
    request: &ReleaseRequest,
    candidate: &str,
    facts: &Facts<'_>,
) -> Result<PublishDecision, PublishError> {
    let version = PlatformVersion::parse(candidate)
        .filter(PlatformVersion::is_candidate)
        .ok_or(PublishError::CandidateName)?;
    let cut = facts.find(version).ok_or(PublishError::CandidateUnknown)?;
    let commit = cut.release.commit.as_str();
    let plain = version.target();
    let (_, on_commit) = facts.at(commit)?;
    let mut decision = match facts.find(plain) {
        // Already promoted. A retry finishes it, even if master has moved on.
        Some(taken) if taken.release.commit == commit && !taken.release.hotfix => {
            facts.decision(PublishAction::Finish, plain, commit, Some(plain))
        }
        Some(_) => return Err(PublishError::CandidateTaken),
        None => {
            if cut.release.platform_tree != request.platform_tree {
                return Err(PublishError::CandidateTrees);
            }
            let newest = facts
                .candidates()
                .rfind(|other| other.version.target() == plain);
            if newest.is_some_and(|newest| newest.version > version) {
                return Err(PublishError::CandidateSuperseded);
            }
            if !facts.newer_than_stable(plain) {
                return Err(PublishError::NotNewer);
            }
            if let Some(other) = on_commit {
                return Err(PublishError::AlreadyCut(other.version.to_string()));
            }
            facts.decision(PublishAction::Promote, plain, commit, Some(version))
        }
    };
    if facts.moves_stable(plain) {
        decision.channels.push(ReleaseChannel::Stable);
    }
    if facts.moves_canary(plain) {
        decision.channels.push(ReleaseChannel::Canary);
    }
    Ok(decision)
}

fn decide_hotfix(
    request: &ReleaseRequest,
    facts: &Facts<'_>,
) -> Result<PublishDecision, PublishError> {
    let commit = request.commit.trim();
    let mut decision = match facts.at(commit)?.1 {
        Some(cut) if cut.release.hotfix => {
            let source = Some(cut.version);
            facts.decision(PublishAction::Finish, cut.version, commit, source)
        }
        Some(cut) => return Err(PublishError::AlreadyCut(cut.version.to_string())),
        None => {
            if facts.plain().any(|cut| cut.release.contains_request) {
                return Err(PublishError::StaleCommit);
            }
            let version = facts.next_plain_patch();
            if !facts.newer_than_stable(version) {
                return Err(PublishError::NotNewer);
            }
            facts.decision(PublishAction::Build, version, commit, None)
        }
    };
    if facts.moves_stable(parsed(&decision)?) {
        decision.channels.push(ReleaseChannel::Stable);
    }
    decision.merge_back_to_canary = true;
    Ok(decision)
}

fn parsed(decision: &PublishDecision) -> Result<PlatformVersion, PublishError> {
    PlatformVersion::parse(&decision.platform_version).ok_or(PublishError::CutVersion)
}

/// Plans one publish. The version and commit must be the ones decided before
/// the build; a retry may find the version already cut since then.
pub fn plan_publish(
    request: &PublishRequest,
    signing_key: &SigningKey,
) -> Result<PublishPlan, PublishError> {
    let decision = decide(&request.release)?;
    if decision.platform_version != request.expected_version
        || decision.commit != request.expected_commit
    {
        return Err(PublishError::Drifted);
    }
    let manifest = match decision.action {
        PublishAction::Skip => return Err(PublishError::Skipped),
        PublishAction::Build => new_manifest(request, &decision)?,
        PublishAction::Promote => ReleaseManifest {
            platform_version: decision.platform_version.clone(),
            release_notes: notes(request),
            ..source_manifest(request, &decision)?
        },
        PublishAction::Finish => source_manifest(request, &decision)?,
    };
    let signed_manifest = sign_manifest(&manifest, signing_key);
    verify_manifest(&signed_manifest, &signing_key.verifying_key()).map_err(publish_error)?;
    let version_tags = image_tags(&manifest, &decision.platform_version);
    let pointer_tags = decision
        .channels
        .iter()
        .flat_map(|channel| {
            let pointer = match channel {
                ReleaseChannel::Canary => "canary",
                ReleaseChannel::Stable => "latest",
            };
            image_tags(&manifest, pointer)
        })
        .collect();
    Ok(PublishPlan {
        decision,
        signed_manifest,
        version_tags,
        pointer_tags,
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

fn source_manifest(
    request: &PublishRequest,
    decision: &PublishDecision,
) -> Result<ReleaseManifest, PublishError> {
    let manifest = request
        .source_manifest
        .as_ref()
        .ok_or(PublishError::Incomplete)?;
    let promised = decision
        .source_tag
        .as_deref()
        .and_then(|tag| tag.strip_prefix('v'));
    if promised != Some(manifest.platform_version.as_str()) {
        return Err(PublishError::CutVersion);
    }
    Ok(manifest.clone())
}

fn notes(request: &PublishRequest) -> Option<String> {
    request
        .release_notes
        .as_deref()
        .map(str::trim)
        .filter(|notes| !notes.is_empty())
        .map(str::to_string)
}

fn new_manifest(
    request: &PublishRequest,
    decision: &PublishDecision,
) -> Result<ReleaseManifest, PublishError> {
    let build = request.build.as_ref().ok_or(PublishError::Incomplete)?;
    let services = pin_services(&build.resolved)?;
    let stack_files = pin_stack_files(&build.stack_files, &services)?;
    if build.updater.amd64.is_empty() || build.updater.arm64.is_empty() {
        return Err(PublishError::Incomplete);
    }
    for migration in &build.migrations {
        if !MIGRATION_KEYS.contains(&migration.key.as_str()) || migration.value.is_empty() {
            return Err(PublishError::Migration);
        }
    }
    Ok(ReleaseManifest {
        platform_version: decision.platform_version.clone(),
        services,
        stack_files,
        migrations: build.migrations.clone(),
        updater: build.updater.clone(),
        next_pin: build.next_pin.clone(),
        release_notes: notes(request),
        hotfix: request.release.hotfix,
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

fn image_tags(manifest: &ReleaseManifest, tag: &str) -> Vec<ImageTag> {
    manifest
        .services
        .iter()
        .filter(|service| NEMU_SERVICES.contains(&service.service.as_str()))
        .map(|service| ImageTag {
            image: service.image.clone(),
            tag: tag.to_string(),
            digest: service.digest.clone(),
        })
        .collect()
}

fn publish_error(error: ManifestError) -> PublishError {
    match error {
        ManifestError::Unpinned => PublishError::Unpinned,
        ManifestError::Signature => PublishError::SigningKey,
        ManifestError::Unreadable | ManifestError::Incomplete => PublishError::Incomplete,
        ManifestError::Pin => PublishError::Pin,
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
        BuildInputs, ChannelVersions, CutRelease, PublishAction, PublishDecision, PublishError,
        PublishPlan, PublishRequest, PublishSource, ReleaseRequest, ResolvedService, decide,
        plan_publish, signing_key_from_base64,
    };
    use crate::ReleaseChannel::{Canary, Stable};
    use crate::{ReleaseManifest, StackFile, UpdaterBinaries, verify_manifest};

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

    /// `(version, commit, tree)`; a version marked `!` is a Hotfix Release.
    fn cuts(cuts: &[(&str, &str, &str)]) -> Vec<CutRelease> {
        cuts.iter()
            .map(|(version, commit, tree)| CutRelease {
                platform_version: version.trim_end_matches('!').to_string(),
                commit: commit.to_string(),
                platform_tree: tree.to_string(),
                hotfix: version.ends_with('!'),
                contains_request: false,
            })
            .collect()
    }

    fn canary(commit: &str, prior: &[(&str, &str, &str)]) -> ReleaseRequest {
        ReleaseRequest {
            source: PublishSource::Canary,
            branch: "canary".to_string(),
            commit: commit.to_string(),
            platform_tree: "tree-new".to_string(),
            push: true,
            resuming: false,
            minor_bump: false,
            advance_version: false,
            candidate: String::new(),
            hotfix: false,
            cut_releases: cuts(prior),
            channels: ChannelVersions::default(),
        }
    }

    /// Promotes from a master commit whose trees are `tree-c`.
    fn promote(candidate: &str, prior: &[(&str, &str, &str)]) -> ReleaseRequest {
        ReleaseRequest {
            source: PublishSource::Stable,
            branch: "master".to_string(),
            platform_tree: "tree-c".to_string(),
            push: false,
            candidate: candidate.to_string(),
            ..canary("master-head", prior)
        }
    }

    fn hotfix(commit: &str, prior: &[(&str, &str, &str)]) -> ReleaseRequest {
        ReleaseRequest {
            hotfix: true,
            candidate: String::new(),
            commit: commit.to_string(),
            ..promote("", prior)
        }
    }

    fn serving(mut request: ReleaseRequest, canary: &str, stable: &str) -> ReleaseRequest {
        request.channels = ChannelVersions {
            canary: Some(canary.to_string()),
            stable: Some(stable.to_string()),
        };
        request
    }

    fn build() -> BuildInputs {
        BuildInputs {
            resolved: resolved(1),
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
            next_pin: None,
        }
    }

    fn publish(release: ReleaseRequest) -> PublishRequest {
        let decided = decide(&release).expect("decision");
        PublishRequest {
            release,
            expected_version: decided.platform_version,
            expected_commit: decided.commit,
            build: Some(build()),
            source_manifest: None,
            release_notes: None,
        }
    }

    fn planned(request: &PublishRequest) -> (PublishPlan, ReleaseManifest) {
        let plan = plan_publish(request, &key()).expect("plan");
        let manifest =
            verify_manifest(&plan.signed_manifest, &key().verifying_key()).expect("verify");
        (plan, manifest)
    }

    fn version(request: &ReleaseRequest) -> String {
        decide(request).expect("decision").platform_version
    }

    fn refused(request: &ReleaseRequest) -> PublishError {
        decide(request).expect_err("refusal")
    }

    fn tags_for<'a>(tags: &'a [super::ImageTag], image_suffix: &str) -> Vec<&'a str> {
        tags.iter()
            .filter(|tag| tag.image.ends_with(image_suffix))
            .map(|tag| tag.tag.as_str())
            .collect()
    }

    const OLD_SCHEME: [(&str, &str, &str); 4] = [
        ("0.1.0", "old-0", "tree-0"),
        ("0.1.1", "old-1", "tree-1"),
        ("0.1.2", "old-2", "tree-2"),
        ("0.1.3", "old-3", "tree-3"),
    ];

    fn with(
        more: &[(&'static str, &'static str, &'static str)],
    ) -> Vec<(&'static str, &'static str, &'static str)> {
        OLD_SCHEME.iter().chain(more).copied().collect()
    }

    #[test]
    fn a_canary_cut_signs_a_candidate_with_every_service_pinned() {
        let (plan, manifest) = planned(&publish(canary("c1", &OLD_SCHEME)));
        assert_eq!(manifest.platform_version, "0.1.4-canary.1");
        let decision = plan.decision;
        assert_eq!(decision.action, PublishAction::Build);
        assert_eq!(decision.git_tag.as_deref(), Some("v0.1.4-canary.1"));
        assert_eq!(decision.commit, "c1");
        assert_eq!(decision.channels, [Canary]);
        assert!(decision.prerelease);
        assert!(!decision.merge_back_to_canary);
        for image in ["nemu-core", "nemu-matter"] {
            assert_eq!(tags_for(&plan.version_tags, image), ["0.1.4-canary.1"]);
            assert_eq!(tags_for(&plan.pointer_tags, image), ["canary"]);
        }
        // Third-party images are pinned and never tagged.
        assert_eq!(plan.version_tags.len(), 2);
        assert_eq!(plan.pointer_tags.len(), 2);
        assert_eq!(manifest.services.len(), crate::RELEASE_SERVICES.len());
        for service in &manifest.services {
            assert!(service.digest.starts_with("sha256:"));
            assert!(!service.image.contains([':', '@']));
        }
        let text = String::from_utf8(plan.signed_manifest).expect("utf8");
        for omitted in ["hotfix", "releaseNotes", "nextPin"] {
            assert!(!text.contains(omitted), "{omitted}");
        }
        let compose = &manifest.stack_files[0].contents;
        assert!(compose.contains("eclipse-mosquitto@sha256:"));
        assert!(compose.contains("image: nickfedor/watchtower:latest"));
        assert!(!compose.contains("nemu-core:latest"));
    }

    #[test]
    fn cuts_count_up_within_the_highest_target_in_use() {
        let ten: Vec<(String, String)> = (1..=10)
            .map(|n| (format!("0.1.4-canary.{n}"), format!("c{n}")))
            .collect();
        let ten: Vec<(&str, &str, &str)> = OLD_SCHEME
            .into_iter()
            .chain(
                ten.iter()
                    .map(|(version, commit)| (version.as_str(), commit.as_str(), "t")),
            )
            .collect();
        for (prior, expected) in [
            (vec![], "0.1.0-canary.1"),
            (OLD_SCHEME.to_vec(), "0.1.4-canary.1"),
            (ten, "0.1.4-canary.11"),
            (
                with(&[("0.1.4-canary.2", "c2", "t"), ("0.1.4", "c2", "t")]),
                "0.1.5-canary.1",
            ),
            // Advanced, then the earlier target was promoted.
            (
                with(&[
                    ("0.1.4-canary.2", "c2", "t"),
                    ("0.1.5-canary.1", "c3", "t"),
                    ("0.1.4", "c2", "t"),
                ]),
                "0.1.5-canary.2",
            ),
            // A hotfix took the target candidates were on.
            (
                with(&[("0.1.4-canary.2", "c2", "t"), ("0.1.4!", "h", "t")]),
                "0.1.5-canary.1",
            ),
            (
                with(&[
                    ("0.1.4-canary.2", "c2", "t"),
                    ("0.1.5-canary.3", "c3", "t"),
                    ("0.1.4!", "h", "t"),
                ]),
                "0.1.5-canary.4",
            ),
            (
                with(&[("0.2.0-canary.1", "c2", "t"), ("0.1.4!", "h", "t")]),
                "0.2.0-canary.2",
            ),
        ] {
            assert_eq!(version(&canary("new", &prior)), expected, "{prior:?}");
        }
    }

    #[test]
    fn minor_bump_and_advance_choose_the_target() {
        let patch = with(&[("0.1.4-canary.2", "c2", "t")]);
        let minor = with(&[("0.2.0-canary.3", "c3", "t")]);
        let past_minor = with(&[("0.2.0-canary.3", "c3", "t"), ("0.2.1-canary.1", "c4", "t")]);
        let released_minor = with(&[("0.2.0-canary.3", "c3", "t"), ("0.2.0", "c3", "t")]);
        for (prior, minor_bump, advance, expected) in [
            (&patch, true, false, "0.2.0-canary.1"),
            (&patch, false, true, "0.1.5-canary.1"),
            (&patch, true, true, "0.2.0-canary.1"),
            (&minor, false, false, "0.2.0-canary.4"),
            (&minor, true, false, "0.2.0-canary.4"),
            (&minor, false, true, "0.2.1-canary.1"),
            (&minor, true, true, "0.3.0-canary.1"),
            (&past_minor, false, false, "0.2.1-canary.2"),
            (&past_minor, true, false, "0.3.0-canary.1"),
            (&released_minor, true, false, "0.3.0-canary.1"),
            // No candidate uses 0.1.4 yet, so it is the next target.
            (&OLD_SCHEME.to_vec(), false, true, "0.1.4-canary.1"),
        ] {
            let mut request = canary("new", prior);
            request.push = false;
            request.minor_bump = minor_bump;
            request.advance_version = advance;
            assert_eq!(
                version(&request),
                expected,
                "{prior:?} {minor_bump} {advance}"
            );
        }
        let mut first = canary("new", &[]);
        first.minor_bump = true;
        assert_eq!(version(&first), "0.1.0-canary.1");
    }

    #[test]
    fn a_push_skips_when_the_newest_candidate_or_promotion_has_its_trees() {
        for (prior, expected) in [
            (with(&[]), PublishAction::Build),
            (
                with(&[("0.1.4-canary.1", "c1", "tree-new")]),
                PublishAction::Skip,
            ),
            (
                with(&[
                    ("0.1.4-canary.1", "c1", "tree-new"),
                    ("0.1.4", "c1", "tree-new"),
                ]),
                PublishAction::Skip,
            ),
            // A hotfix is not the baseline, in either direction.
            (
                with(&[("0.1.4-canary.1", "c1", "tree-new"), ("0.1.4!", "h", "t")]),
                PublishAction::Skip,
            ),
            (
                with(&[("0.1.4-canary.1", "c1", "t"), ("0.1.4!", "h", "tree-new")]),
                PublishAction::Build,
            ),
            // The newest cut, not any cut: a revert publishes.
            (
                with(&[
                    ("0.1.4-canary.9", "c1", "tree-new"),
                    ("0.1.4-canary.10", "c2", "t"),
                ]),
                PublishAction::Build,
            ),
        ] {
            let mut request = canary("new", &prior);
            assert_eq!(
                decide(&request).expect("decision").action,
                expected,
                "{prior:?}"
            );
            request.push = false;
            assert_eq!(
                decide(&request).expect("decision").action,
                PublishAction::Build
            );
        }
        let skipped = publish(canary(
            "new",
            &with(&[("0.1.4-canary.1", "c1", "tree-new")]),
        ));
        assert_eq!(plan_publish(&skipped, &key()), Err(PublishError::Skipped));
    }

    #[test]
    fn a_retried_canary_cut_finishes_the_same_version_and_manifest() {
        let mut first = publish(canary("c1", &OLD_SCHEME));
        first.release_notes = Some("\n- Faster pairing\n".to_string());
        let (plan, manifest) = planned(&first);
        assert_eq!(manifest.release_notes.as_deref(), Some("- Faster pairing"));

        // Interrupted before the tag: image tags and a draft do not allocate.
        assert_eq!(planned(&first).0, plan);

        // Interrupted after the tag, with the old build decision still in hand.
        let mut retry = first.clone();
        retry.release = serving(
            canary("c1", &with(&[("0.1.4-canary.1", "c1", "tree-new")])),
            "0.1.3",
            "0.1.3",
        );
        retry.source_manifest = Some(manifest);
        retry.release_notes = Some("- Something else".to_string());
        retry.build.as_mut().expect("build").resolved = resolved(9);
        let (finished, _) = planned(&retry);
        assert_eq!(finished.decision.action, PublishAction::Finish);
        assert_eq!(finished.decision.git_tag, None);
        assert_eq!(
            finished.decision.source_tag.as_deref(),
            Some("v0.1.4-canary.1")
        );
        assert_eq!(finished.decision.channels, [Canary]);
        assert_eq!(finished.signed_manifest, plan.signed_manifest);
        assert_eq!(finished.pointer_tags, plan.pointer_tags);
    }

    #[test]
    fn a_retry_does_not_move_a_channel_backwards() {
        let later = with(&[("0.1.4-canary.1", "c1", "t"), ("0.1.4-canary.2", "c2", "t")]);
        let prior = with(&[("0.1.4-canary.1", "c1", "t")]);
        for request in [
            canary("c1", &later),
            serving(canary("c1", &prior), "0.1.4", "0.1.4"),
            serving(
                hotfix("h", &with(&[("0.1.4!", "h", "t"), ("0.1.5!", "h2", "t")])),
                "0.1.3",
                "0.1.4",
            ),
            serving(
                hotfix("h", &with(&[("0.1.4!", "h", "t")])),
                "0.1.3",
                "0.1.5",
            ),
        ] {
            let decision = decide(&request).expect("decision");
            assert_eq!(decision.action, PublishAction::Finish);
            assert_eq!(decision.channels, []);
        }
    }

    #[test]
    fn a_rerun_behind_a_later_cut_is_refused_before_it_allocates() {
        let mut request = canary("older", &with(&[("0.1.4-canary.1", "c1", "t")]));
        request.cut_releases[4].contains_request = true;
        assert_eq!(refused(&request), PublishError::StaleCommit);

        // Canary may be behind a Hotfix Release on master.
        let mut behind_hotfix = canary("older", &with(&[("0.1.4!", "h", "t")]));
        behind_hotfix.cut_releases[4].contains_request = true;
        assert_eq!(version(&behind_hotfix), "0.1.5-canary.1");

        let mut stale_hotfix = hotfix("older", &with(&[("0.1.4!", "h", "t")]));
        stale_hotfix.cut_releases[4].contains_request = true;
        assert_eq!(refused(&stale_hotfix), PublishError::StaleCommit);
    }

    #[test]
    fn a_commit_has_at_most_one_candidate_and_one_stable_release() {
        let cut = with(&[("0.1.4-canary.2", "c1", "t")]);
        for (minor_bump, advance) in [(true, false), (false, true)] {
            let mut request = canary("c1", &cut);
            request.minor_bump = minor_bump;
            request.advance_version = advance;
            assert_eq!(
                refused(&request),
                if advance {
                    PublishError::NotAdvanced("0.1.4-canary.2".to_string())
                } else {
                    PublishError::AlreadyCut("0.1.4-canary.2".to_string())
                }
            );
        }
        // Retrying an interrupted advance finishes it; a finished one is cut,
        // unless this run may be what finished it.
        let advanced = with(&[("0.1.4-canary.2", "c1", "t"), ("0.1.5-canary.1", "c2", "t")]);
        let mut retry = serving(canary("c2", &advanced), "0.1.4-canary.2", "0.1.3");
        retry.push = false;
        retry.advance_version = true;
        assert_eq!(version(&retry), "0.1.5-canary.1");
        retry.channels.canary = Some("0.1.5-canary.1".to_string());
        assert!(matches!(refused(&retry), PublishError::AlreadyCut(_)));
        retry.resuming = true;
        assert_eq!(version(&retry), "0.1.5-canary.1");

        // A plain Release does not stop a candidate on its commit.
        let mut forced = canary("old-3", &OLD_SCHEME);
        forced.push = false;
        assert_eq!(version(&forced), "0.1.4-canary.1");
        // But promoting that one would be a second Stable Release there.
        let twice = with(&[("0.1.4-canary.1", "old-3", "tree-c")]);
        assert!(matches!(
            refused(&promote("0.1.4-canary.1", &twice)),
            PublishError::AlreadyCut(_)
        ));
        assert!(matches!(
            refused(&hotfix("old-3", &OLD_SCHEME)),
            PublishError::AlreadyCut(_)
        ));
        let dup = with(&[("0.1.4-canary.1", "c1", "t"), ("0.1.4-canary.2", "c1", "t")]);
        assert_eq!(refused(&canary("c1", &dup)), PublishError::CutTwice);
        let same_version = with(&[("0.1.3", "other", "t")]);
        assert_eq!(
            refused(&canary("new", &same_version)),
            PublishError::CutTwice
        );
    }

    #[test]
    fn an_explicit_canary_run_on_a_finished_candidate_is_refused() {
        let cut = with(&[("0.1.4-canary.1", "c1", "t")]);
        for minor in [false, true] {
            let prior = with(&[("0.2.0-canary.1", "c1", "t")]);
            let mut run = serving(canary("c1", &prior), "0.2.0-canary.1", "0.1.3");
            run.push = false;
            run.minor_bump = minor;
            assert!(matches!(refused(&run), PublishError::AlreadyCut(_)));
        }
        for served in ["0.1.4-canary.1", "0.1.4"] {
            let mut run = serving(canary("c1", &cut), served, "0.1.3");
            // A push re-run stays a harmless no-op.
            assert_eq!(
                decide(&run).expect("decision").action,
                PublishAction::Finish
            );
            run.push = false;
            assert_eq!(
                refused(&run),
                PublishError::AlreadyCut("0.1.4-canary.1".to_string())
            );
            // Interrupted after the channel write, then re-run.
            run.resuming = true;
            assert_eq!(
                decide(&run).expect("decision").action,
                PublishAction::Finish
            );
        }
        // Interrupted before the channel write.
        let mut run = serving(canary("c1", &cut), "0.1.3", "0.1.3");
        run.push = false;
        let decision = decide(&run).expect("decision");
        assert_eq!(decision.action, PublishAction::Finish);
        assert_eq!(decision.channels, [Canary]);
    }

    #[test]
    fn an_advance_finishes_only_a_cut_that_left_an_earlier_target() {
        for (prior, minor_bump, finishes) in [
            // The first cut of a cycle is not an advance.
            (with(&[("0.1.4-canary.1", "c", "t")]), false, false),
            (
                with(&[
                    ("0.1.4-canary.2", "c2", "t"),
                    ("0.1.4", "c2", "t"),
                    ("0.1.5-canary.1", "c", "t"),
                ]),
                false,
                false,
            ),
            (
                with(&[("0.1.4-canary.2", "c2", "t"), ("0.1.5-canary.1", "c", "t")]),
                false,
                true,
            ),
            // A minor bump is not a patch advance.
            (
                with(&[("0.1.4-canary.2", "c2", "t"), ("0.2.0-canary.1", "c", "t")]),
                false,
                false,
            ),
            (
                with(&[("0.1.4-canary.2", "c2", "t"), ("0.2.0-canary.1", "c", "t")]),
                true,
                true,
            ),
            (
                with(&[("0.2.0-canary.1", "c2", "t"), ("0.2.0-canary.2", "c", "t")]),
                false,
                false,
            ),
        ] {
            // What the channel served before the interrupted cut.
            let mut run = serving(canary("c", &prior), "0.1.3", "0.1.3");
            run.push = false;
            run.minor_bump = minor_bump;
            run.advance_version = true;
            for resuming in [false, true] {
                run.resuming = resuming;
                if finishes {
                    assert_eq!(
                        decide(&run).expect("decision").action,
                        PublishAction::Finish
                    );
                } else {
                    let error = refused(&run);
                    assert!(
                        matches!(error, PublishError::NotAdvanced(_)),
                        "{prior:?} {error}"
                    );
                }
            }
            // Finishing it without the option is the way on.
            run.advance_version = false;
            run.minor_bump = false;
            assert_eq!(
                decide(&run).expect("decision").action,
                PublishAction::Finish
            );
        }
    }

    #[test]
    fn promotion_changes_only_the_version_and_notes_and_moves_both_channels() {
        let mut candidate_request = publish(canary("c1", &OLD_SCHEME));
        candidate_request.release_notes = Some("- Candidate".to_string());
        let pin = BASE64.encode(
            SigningKey::from_bytes(&[0x33; 32])
                .verifying_key()
                .to_bytes(),
        );
        candidate_request.build.as_mut().expect("build").next_pin = Some(pin);
        let (_, candidate) = planned(&candidate_request);

        let prior = with(&[("0.1.4-canary.1", "c1", "tree-c")]);
        let release = serving(promote("0.1.4-canary.1", &prior), "0.1.4-canary.1", "0.1.3");
        let mut request = publish(release);
        request.source_manifest = Some(candidate.clone());
        request.build = None;
        let (plan, promoted) = planned(&request);
        assert_eq!(
            promoted,
            ReleaseManifest {
                platform_version: "0.1.4".to_string(),
                release_notes: None,
                ..candidate.clone()
            }
        );
        assert_eq!(plan.decision.action, PublishAction::Promote);
        assert_eq!(plan.decision.git_tag.as_deref(), Some("v0.1.4"));
        // The tag goes on the commit that was built, not on master's.
        assert_eq!(plan.decision.commit, "c1");
        assert_eq!(plan.decision.channels, [Stable, Canary]);
        assert!(!plan.decision.prerelease);
        assert!(!plan.decision.merge_back_to_canary);
        assert_eq!(tags_for(&plan.version_tags, "nemu-core"), ["0.1.4"]);
        assert_eq!(
            tags_for(&plan.pointer_tags, "nemu-core"),
            ["latest", "canary"]
        );

        request.release_notes = Some("- Everything".to_string());
        let (_, noted) = planned(&request);
        assert_eq!(noted.release_notes.as_deref(), Some("- Everything"));

        request.source_manifest = Some(promoted);
        assert_eq!(
            plan_publish(&request, &key()),
            Err(PublishError::CutVersion)
        );
        request.source_manifest = None;
        assert_eq!(
            plan_publish(&request, &key()),
            Err(PublishError::Incomplete)
        );
    }

    #[test]
    fn promotion_leaves_a_newer_canary_alone() {
        let prior = with(&[
            ("0.1.4-canary.2", "c2", "tree-c"),
            ("0.1.5-canary.1", "c3", "t"),
        ]);
        let mut request = serving(promote("0.1.4-canary.2", &prior), "0.1.5-canary.1", "0.1.3");
        assert_eq!(decide(&request).expect("decision").channels, [Stable]);
        // Nor when the newer candidate's channel manifest is not visible yet.
        request.channels.canary = Some("0.1.4-canary.2".to_string());
        assert_eq!(decide(&request).expect("decision").channels, [Stable]);
    }

    #[test]
    fn promotion_is_refused_unless_the_exact_candidate_may_become_stable() {
        let prior = with(&[
            ("0.1.4-canary.1", "c1", "tree-c"),
            ("0.1.4-canary.2", "c2", "tree-c"),
        ]);
        for (name, error) in [
            ("0.1.4", PublishError::CandidateName),
            ("v0.1.4-canary.2", PublishError::CandidateName),
            ("0.1.4-canary.02", PublishError::CandidateName),
            ("0.1.4-canary.2; rm -rf /", PublishError::CandidateName),
            ("0.1.4-canary.3", PublishError::CandidateUnknown),
            ("0.1.4-canary.1", PublishError::CandidateSuperseded),
        ] {
            assert_eq!(refused(&promote(name, &prior)), error, "{name}");
        }
        let mut trees = promote("0.1.4-canary.2", &prior);
        trees.platform_tree = "tree-master".to_string();
        assert_eq!(refused(&trees), PublishError::CandidateTrees);

        for stable in ["0.1.4", "0.1.5", "0.2.0"] {
            let request = serving(promote("0.1.4-canary.2", &prior), "0.1.4-canary.2", stable);
            assert_eq!(refused(&request), PublishError::NotNewer, "{stable}");
        }
        let passed = with(&[("0.1.4-canary.2", "c2", "tree-c"), ("0.1.5", "c9", "t")]);
        assert_eq!(
            refused(&promote("0.1.4-canary.2", &passed)),
            PublishError::NotNewer
        );

        // Taken by a hotfix, even one on the candidate's own commit.
        for hotfix_commit in ["h", "c2"] {
            let taken = with(&[
                ("0.1.4-canary.2", "c2", "tree-c"),
                ("0.1.4!", hotfix_commit, "tree-c"),
            ]);
            assert_eq!(
                refused(&promote("0.1.4-canary.2", &taken)),
                PublishError::CandidateTaken
            );
        }
        // Promoted from a different candidate.
        let taken = with(&[
            ("0.1.4-canary.1", "c1", "tree-c"),
            ("0.1.4-canary.2", "c2", "tree-c"),
            ("0.1.4", "c2", "tree-c"),
        ]);
        assert_eq!(
            refused(&promote("0.1.4-canary.1", &taken)),
            PublishError::CandidateTaken
        );
    }

    #[test]
    fn a_retried_promotion_finishes_whatever_is_left() {
        let prior = with(&[
            ("0.1.4-canary.2", "c2", "tree-c"),
            ("0.1.4", "c2", "tree-c"),
        ]);
        for (canary_at, stable_at, expected) in [
            ("0.1.4-canary.2", "0.1.3", vec![Stable, Canary]),
            ("0.1.4-canary.2", "0.1.4", vec![Stable, Canary]),
            ("0.1.4", "0.1.4", vec![Stable, Canary]),
            ("0.1.5-canary.1", "0.1.3", vec![Stable]),
            ("0.1.5-canary.1", "0.1.5", vec![]),
        ] {
            let mut request = serving(promote("0.1.4-canary.2", &prior), canary_at, stable_at);
            // master moved on after the interruption.
            request.platform_tree = "tree-later".to_string();
            let decision = decide(&request).expect("decision");
            assert_eq!(decision.action, PublishAction::Finish);
            assert_eq!(decision.platform_version, "0.1.4");
            assert_eq!(decision.source_tag.as_deref(), Some("v0.1.4"));
            assert_eq!(decision.git_tag, None);
            assert_eq!(decision.channels, expected, "{canary_at} {stable_at}");
        }
    }

    #[test]
    fn a_hotfix_takes_the_next_plain_patch_and_moves_stable_only() {
        let prior = with(&[("0.1.4-canary.2", "c2", "t"), ("0.2.0-canary.1", "c3", "t")]);
        let (plan, manifest) = planned(&publish(serving(
            hotfix("h", &prior),
            "0.2.0-canary.1",
            "0.1.3",
        )));
        assert_eq!(manifest.platform_version, "0.1.4");
        assert!(manifest.hotfix);
        assert_eq!(plan.decision.action, PublishAction::Build);
        assert_eq!(plan.decision.git_tag.as_deref(), Some("v0.1.4"));
        assert_eq!(plan.decision.commit, "h");
        assert_eq!(plan.decision.channels, [Stable]);
        assert!(plan.decision.merge_back_to_canary);
        assert!(!plan.decision.prerelease);
        assert_eq!(tags_for(&plan.pointer_tags, "nemu-core"), ["latest"]);

        let retried = with(&[("0.1.4-canary.2", "c2", "t"), ("0.1.4!", "h", "t")]);
        let mut retry = publish(serving(hotfix("h", &retried), "0.1.4-canary.2", "0.1.3"));
        retry.source_manifest = Some(manifest);
        let (finished, _) = planned(&retry);
        assert_eq!(finished.decision.action, PublishAction::Finish);
        assert_eq!(finished.signed_manifest, plan.signed_manifest);
        assert!(finished.decision.merge_back_to_canary);

        assert_eq!(version(&hotfix("h2", &retried)), "0.1.5");
        assert_eq!(
            refused(&serving(hotfix("h2", &retried), "0.1.4-canary.2", "0.1.5")),
            PublishError::NotNewer
        );
        assert_eq!(
            refused(&serving(canary("new", &retried), "0.1.5-canary.1", "0.1.4")),
            PublishError::NotNewer
        );
    }

    #[test]
    fn options_for_another_mode_and_an_untested_stable_publish_are_refused() {
        let prior = with(&[("0.1.4-canary.1", "c1", "tree-c")]);
        assert_eq!(refused(&promote("", &prior)), PublishError::StableMode);
        let mut both = promote("0.1.4-canary.1", &prior);
        both.hotfix = true;
        assert_eq!(refused(&both), PublishError::StableMode);
        for request in [
            ReleaseRequest {
                minor_bump: true,
                ..promote("0.1.4-canary.1", &prior)
            },
            ReleaseRequest {
                advance_version: true,
                ..hotfix("h", &prior)
            },
            ReleaseRequest {
                hotfix: true,
                ..canary("c", &prior)
            },
            ReleaseRequest {
                candidate: "0.1.4-canary.1".to_string(),
                ..canary("c", &prior)
            },
        ] {
            assert_eq!(refused(&request), PublishError::Options);
        }
        for request in [
            ReleaseRequest {
                branch: "canary".to_string(),
                ..hotfix("h", &prior)
            },
            ReleaseRequest {
                branch: "canary".to_string(),
                ..promote("0.1.4-canary.1", &prior)
            },
            ReleaseRequest {
                branch: "master".to_string(),
                ..canary("c", &prior)
            },
        ] {
            assert_eq!(refused(&request), PublishError::Branch);
        }
        assert_eq!(refused(&canary(" ", &prior)), PublishError::CommitMissing);
        for bad in ["1.0.0", "0.1.4-rc.1", "0.1.4-canary.0"] {
            assert_eq!(
                refused(&canary("c", &[(bad, "x", "t")])),
                PublishError::CutVersion
            );
            assert_eq!(
                refused(&serving(canary("c", &prior), bad, "0.1.3")),
                PublishError::CutVersion
            );
        }
    }

    #[test]
    fn notes_cover_the_changes_since_the_previous_release_of_that_kind() {
        let notes_since = |request: &ReleaseRequest| -> Option<String> {
            let decision: PublishDecision = decide(request).expect("decision");
            decision.notes_since
        };
        let prior = with(&[
            ("0.1.4-canary.9", "c9", "t"),
            ("0.1.4-canary.10", "c10", "tree-c"),
        ]);
        assert_eq!(notes_since(&canary("new", &[])), None);
        assert_eq!(
            notes_since(&canary("new", &OLD_SCHEME)).as_deref(),
            Some("v0.1.3")
        );
        assert_eq!(
            notes_since(&canary("new", &prior)).as_deref(),
            Some("v0.1.4-canary.10")
        );
        assert_eq!(
            notes_since(&promote("0.1.4-canary.10", &prior)).as_deref(),
            Some("v0.1.3")
        );
        assert_eq!(notes_since(&hotfix("h", &prior)).as_deref(), Some("v0.1.3"));
        let fixed = with(&[("0.1.4-canary.1", "c1", "t"), ("0.1.4!", "h", "t")]);
        assert_eq!(
            notes_since(&canary("new", &fixed)).as_deref(),
            Some("v0.1.4-canary.1")
        );
        let next = with(&[("0.1.4!", "h", "t"), ("0.1.5-canary.1", "c1", "tree-c")]);
        assert_eq!(
            notes_since(&promote("0.1.5-canary.1", &next)).as_deref(),
            Some("v0.1.4")
        );
        let ahead = with(&[
            ("0.1.4-canary.1", "c1", "tree-c"),
            ("0.2.0-canary.1", "c2", "t"),
        ]);
        assert_eq!(
            notes_since(&promote("0.1.4-canary.1", &ahead)).as_deref(),
            Some("v0.1.3")
        );
    }

    #[test]
    fn a_plan_that_differs_from_the_decision_is_refused() {
        let mut request = publish(canary("c1", &OLD_SCHEME));
        request.release.cut_releases = cuts(&with(&[("0.1.4-canary.1", "c0", "t")]));
        assert_eq!(plan_publish(&request, &key()), Err(PublishError::Drifted));
        request.expected_version = "0.1.4-canary.2".to_string();
        request.build = None;
        assert_eq!(
            plan_publish(&request, &key()),
            Err(PublishError::Incomplete)
        );
        let mut invalid = publish(canary("c1", &OLD_SCHEME));
        invalid.build.as_mut().expect("build").next_pin = Some("not-a-key".to_string());
        assert_eq!(plan_publish(&invalid, &key()), Err(PublishError::Pin));
    }

    #[test]
    fn changed_release_notes_do_not_verify() {
        let mut request = publish(canary("c1", &OLD_SCHEME));
        request.release_notes = Some("- Faster pairing".to_string());
        let (plan, _) = planned(&request);
        let forged = String::from_utf8(plan.signed_manifest)
            .expect("utf8")
            .replace("Faster pairing", "Slower pairing");
        assert!(verify_manifest(forged.as_bytes(), &key().verifying_key()).is_err());
    }

    #[test]
    fn the_shipped_compose_file_pins_every_service_digest() {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../infra/prod");
        let compose = fs::read_to_string(root.join("docker-compose.yml")).expect("compose");
        let mosquitto =
            fs::read_to_string(root.join("mosquitto/mosquitto.conf")).expect("mosquitto");
        let mut request = publish(canary("commit-shipped", &[]));
        request.build.as_mut().expect("build").stack_files = vec![
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
        let mut images = 0;
        for line in compose.lines() {
            let trimmed = line.trim_start();
            if !trimmed.starts_with("image:") {
                continue;
            }
            images += 1;
            assert!(trimmed.contains("@sha256:"), "{line}");
            assert!(!trimmed.contains(":latest"), "{line}");
            assert!(!trimmed.contains(":canary"), "{line}");
        }
        assert_eq!(images, crate::RELEASE_SERVICES.len());
        // The Updater replaced Watchtower (ADR-0028); the shipped stack has none.
        assert!(!compose.contains("watchtower"));
        // Core reaches the host Updater only through its socket (ADR-0033).
        assert!(compose.contains("./run:/run/nemu-updater"));
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
}
