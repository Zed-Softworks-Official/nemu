//! Encrypted Controller-local History backup and restore.
//!
//! The plaintext archive stays on the Controller. Callers outside the Controller
//! receive only ciphertext. The backup key is not written into the archive and
//! this module does not log the plaintext.

use std::collections::{HashMap, HashSet};
use std::io;

use base64::Engine;
use base64::engine::general_purpose::STANDARD as BASE64;
use chacha20poly1305::XChaCha20Poly1305;
use chacha20poly1305::aead::{Aead, KeyInit, Payload};
use chrono::{DateTime, Utc};
use diesel::prelude::*;
use diesel::sql_types::Uuid as SqlUuid;
use diesel::sql_types::{Array, BigInt, Bool, Nullable, SmallInt, Text, Timestamptz};
use rand::Rng;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use thiserror::Error;
use uuid::Uuid;

use crate::api::auth::AuthenticatedClient;
use crate::audit::{self, AuditKind, AuditWrite};
use crate::identity::ControllerIdentity;
use crate::pairing::members::find_member_by_user_id;
use crate::state::AppState;

use super::admission_journal::GapReason;
use super::history_retention::{Resolution, past_retention, raw_retention, retention_tiers};
use super::{
    CapabilityId, CapabilityKind, CapabilityService, ConstraintRevision, FixedPointBounds,
    HistoryAdmissionRate,
};

const ARCHIVE_VERSION: u32 = 1;
const MAGIC: &[u8] = b"NEMUHSB1";
const NONCE_LEN: usize = 24;
const KEY_DOMAIN: &[u8] = b"nemu-history-backup-v1";

#[derive(Debug, Error, PartialEq, Eq)]
pub enum BackupError {
    #[error("authentication required")]
    Unauthenticated,
    #[error("only the owner can back up or restore History")]
    Forbidden,
    #[error("history backup could not be read")]
    Corrupt,
    #[error("history backup was rejected")]
    Rejected,
    #[error("recording cannot resume before the backup snapshot")]
    ResumeBeforeSnapshot,
    #[error("history backup could not be stored")]
    Store,
}

impl BackupError {
    pub fn code(&self) -> &'static str {
        match self {
            Self::Unauthenticated => "unauthenticated",
            Self::Forbidden => "owner_required",
            Self::Corrupt | Self::Rejected | Self::ResumeBeforeSnapshot => {
                "history_backup_rejected"
            }
            Self::Store => "history_backup_failed",
        }
    }

    pub fn message(&self) -> &'static str {
        match self {
            Self::Unauthenticated => "Authentication required",
            Self::Forbidden => "Only the home owner can back up or restore History",
            Self::Corrupt | Self::Rejected | Self::ResumeBeforeSnapshot => {
                "History backup was rejected"
            }
            Self::Store => "History backup failed",
        }
    }
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum BackupClientError {
    #[error("authentication required")]
    Unauthenticated,
    #[error("only the owner can back up or restore History")]
    Forbidden,
    #[error("history backup was rejected")]
    Rejected,
    #[error("history backup failed")]
    Failed,
}

impl BackupClientError {
    pub fn code(&self) -> &'static str {
        match self {
            Self::Unauthenticated => "unauthenticated",
            Self::Forbidden => "owner_required",
            Self::Rejected => "history_backup_rejected",
            Self::Failed => "history_backup_failed",
        }
    }

    pub fn message(&self) -> &'static str {
        match self {
            Self::Unauthenticated => "Authentication required",
            Self::Forbidden => "Only the home owner can back up or restore History",
            Self::Rejected => "History backup was rejected",
            Self::Failed => "History backup failed",
        }
    }
}

impl From<BackupError> for BackupClientError {
    fn from(error: BackupError) -> Self {
        match error {
            BackupError::Unauthenticated => Self::Unauthenticated,
            BackupError::Forbidden => Self::Forbidden,
            BackupError::Corrupt | BackupError::Rejected | BackupError::ResumeBeforeSnapshot => {
                Self::Rejected
            }
            BackupError::Store => Self::Failed,
        }
    }
}

/// Key that stays on the Controller. Debug output does not reveal the bytes.
pub struct BackupKey([u8; 32]);

impl BackupKey {
    pub fn from_bytes(bytes: [u8; 32]) -> Self {
        Self(bytes)
    }

    #[cfg(test)]
    fn raw(&self) -> &[u8; 32] {
        &self.0
    }
}

impl std::fmt::Debug for BackupKey {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("BackupKey(redacted)")
    }
}

impl Drop for BackupKey {
    fn drop(&mut self) {
        self.0.fill(0);
    }
}

/// Domain-separated from Access Client recovery. The secret itself is not the archive key.
pub fn backup_key_from_controller_secret(secret: &[u8]) -> BackupKey {
    let mut hasher = Sha256::new();
    hasher.update(KEY_DOMAIN);
    hasher.update(secret);
    let digest = hasher.finalize();
    let mut bytes = [0u8; 32];
    bytes.copy_from_slice(&digest);
    BackupKey(bytes)
}

fn history_backup_key(identity: &ControllerIdentity) -> Result<BackupKey, BackupError> {
    let mut secret = BASE64
        .decode(identity.keypair.private_key_b64.as_bytes())
        .map_err(|_| BackupError::Store)?;
    let key = backup_key_from_controller_secret(&secret);
    secret.fill(0);
    Ok(key)
}

/// Active owners may export and restore. Members and inactive callers may not.
pub fn authorize_history_backup(role: &str, status: &str) -> Result<(), BackupError> {
    if role.is_empty() || status.is_empty() {
        return Err(BackupError::Unauthenticated);
    }
    if status != "active" || role != "owner" {
        return Err(BackupError::Forbidden);
    }
    Ok(())
}

/// Member-facing label for any History gap, including restore downtime.
#[derive(Debug, Serialize)]
pub struct MemberHistoryGap {
    pub kind: &'static str,
    pub safe_reason: &'static str,
}

pub fn member_history_gap(reason: GapReason) -> MemberHistoryGap {
    let _ = reason;
    MemberHistoryGap {
        kind: "history",
        safe_reason: "gap",
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ArchivedCapability {
    pub id: Uuid,
    pub protocol: String,
    pub device_external_id: String,
    pub component_path: Vec<String>,
    pub kind: String,
    pub physical_scope_kind: String,
    pub physical_scope_component_id: String,
    pub tombstoned_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ArchivedObservation {
    pub observation_id: String,
    pub capability_id: Uuid,
    pub kind: String,
    pub unit: String,
    pub value: i64,
    pub scale: u8,
    pub constraint_revision_id: String,
    pub schema_version: u16,
    pub time_trust: String,
    pub observed_at: DateTime<Utc>,
    pub received_at: DateTime<Utc>,
    pub reset: Option<bool>,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct ArchivedObservationKey {
    pub observation_id: String,
    pub capability_id: Uuid,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ArchivedPowerRollup {
    pub capability_id: Uuid,
    pub kind: String,
    pub resolution: String,
    pub bucket_start: DateTime<Utc>,
    pub bucket_end: DateTime<Utc>,
    pub scale: u8,
    pub mean_value: Option<i64>,
    pub observed_min: Option<i64>,
    pub observed_max: Option<i64>,
    pub estimated_import: i64,
    pub estimated_export: i64,
    pub coverage_ns: i64,
    pub gap_ns: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ArchivedGaugeRollup {
    pub capability_id: Uuid,
    pub kind: String,
    pub resolution: String,
    pub bucket_start: DateTime<Utc>,
    pub bucket_end: DateTime<Utc>,
    pub scale: u8,
    pub mean_value: Option<i64>,
    pub observed_min: Option<i64>,
    pub observed_max: Option<i64>,
    pub coverage_ns: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ArchivedEnergyRollup {
    pub capability_id: Uuid,
    pub kind: String,
    pub resolution: String,
    pub bucket_start: DateTime<Utc>,
    pub bucket_end: DateTime<Utc>,
    pub first_observed_at: DateTime<Utc>,
    pub first_value: i64,
    pub last_observed_at: DateTime<Utc>,
    pub last_value: i64,
    pub measured_energy: i64,
    pub coverage_numerator: i64,
    pub coverage_denominator: i64,
    pub allocation: String,
    pub provenance: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ArchivedGap {
    pub capability_id: Option<Uuid>,
    pub reason: String,
    pub onset: DateTime<Utc>,
    pub until: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ArchivedRecordingBound {
    pub capability_id: Uuid,
    pub recording_since: DateTime<Utc>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ArchivedMeterEpoch {
    pub capability_id: Uuid,
    pub started_at: DateTime<Utc>,
    pub ended_at: Option<DateTime<Utc>>,
    pub reason: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ArchivedConstraintRevision {
    pub capability_id: Uuid,
    pub revision: ConstraintRevision,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ArchivedTimezonePeriod {
    pub timezone: String,
    pub effective_from: DateTime<Utc>,
    pub effective_until: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ArchivedDesignation {
    pub id: Uuid,
    pub effective_from: DateTime<Utc>,
    pub effective_until: Option<DateTime<Utc>>,
    pub power_capability_id: Option<Uuid>,
    pub imported_energy_capability_id: Option<Uuid>,
    pub exported_energy_capability_id: Option<Uuid>,
    pub protocol: String,
    pub device_external_id: String,
    pub component_path: Vec<String>,
    pub physical_scope_kind: String,
    pub physical_scope_component_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ArchivedBudget {
    pub budget_bytes: i64,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct HistorySnapshot {
    pub snapshot_at: DateTime<Utc>,
    pub capabilities: Vec<ArchivedCapability>,
    pub observations: Vec<ArchivedObservation>,
    pub observation_keys: Vec<ArchivedObservationKey>,
    pub power_rollups: Vec<ArchivedPowerRollup>,
    pub gauge_rollups: Vec<ArchivedGaugeRollup>,
    pub energy_rollups: Vec<ArchivedEnergyRollup>,
    pub gaps: Vec<ArchivedGap>,
    pub recording_bounds: Vec<ArchivedRecordingBound>,
    pub meter_epochs: Vec<ArchivedMeterEpoch>,
    pub constraint_revisions: Vec<ArchivedConstraintRevision>,
    pub timezone_periods: Vec<ArchivedTimezonePeriod>,
    pub designation_periods: Vec<ArchivedDesignation>,
    pub budget: Option<ArchivedBudget>,
}

impl Default for HistorySnapshot {
    fn default() -> Self {
        Self {
            snapshot_at: DateTime::<Utc>::UNIX_EPOCH,
            capabilities: Vec::new(),
            observations: Vec::new(),
            observation_keys: Vec::new(),
            power_rollups: Vec::new(),
            gauge_rollups: Vec::new(),
            energy_rollups: Vec::new(),
            gaps: Vec::new(),
            recording_bounds: Vec::new(),
            meter_epochs: Vec::new(),
            constraint_revisions: Vec::new(),
            timezone_periods: Vec::new(),
            designation_periods: Vec::new(),
            budget: None,
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
struct ArchiveDocument {
    version: u32,
    snapshot: HistorySnapshot,
}

pub struct RestoredHistory {
    pub snapshot: HistorySnapshot,
    pub audit: AuditWrite,
}

#[derive(Clone, PartialEq, Eq, Hash)]
struct StableIdentity {
    protocol: String,
    device_external_id: String,
    component_path: Vec<String>,
    kind: String,
    physical_scope_kind: String,
    physical_scope_component_id: String,
}

fn stable_identity(capability: &ArchivedCapability) -> StableIdentity {
    StableIdentity {
        protocol: capability.protocol.clone(),
        device_external_id: capability.device_external_id.clone(),
        component_path: capability.component_path.clone(),
        kind: capability.kind.clone(),
        physical_scope_kind: capability.physical_scope_kind.clone(),
        physical_scope_component_id: capability.physical_scope_component_id.clone(),
    }
}

fn parse_resolution(value: &str) -> Option<Resolution> {
    Some(match value {
        "raw" => Resolution::Raw,
        "one_minute" => Resolution::OneMinute,
        "five_minute" => Resolution::FiveMinute,
        "fifteen_minute" => Resolution::FifteenMinute,
        "hourly" => Resolution::Hourly,
        "daily" => Resolution::Daily,
        _ => return None,
    })
}

fn within_retention(
    kind: &str,
    resolution: &str,
    instant: DateTime<Utc>,
    now: DateTime<Utc>,
) -> bool {
    let Ok(kind) = CapabilityKind::parse(kind) else {
        return true;
    };
    let Some(resolution) = parse_resolution(resolution) else {
        return true;
    };
    let retain = if resolution == Resolution::Raw {
        raw_retention(kind)
    } else {
        match retention_tiers(kind)
            .iter()
            .find(|tier| tier.resolution == resolution)
        {
            Some(tier) => tier.retain,
            None => return true,
        }
    };
    !past_retention(instant, now, retain)
}

fn observation_kept(observation: &ArchivedObservation, now: DateTime<Utc>) -> bool {
    within_retention(&observation.kind, "raw", observation.observed_at, now)
}

fn observation_restorable(
    observation: &ArchivedObservation,
    snapshot_at: DateTime<Utc>,
    resumed_at: DateTime<Utc>,
) -> bool {
    observation_kept(observation, snapshot_at) && observation_kept(observation, resumed_at)
}

fn retain_snapshot(source: &HistorySnapshot, backup_at: DateTime<Utc>) -> HistorySnapshot {
    let observations: Vec<_> = source
        .observations
        .iter()
        .filter(|observation| observation_kept(observation, backup_at))
        .cloned()
        .collect();
    let mut snapshot = source.clone();
    snapshot.snapshot_at = backup_at;
    snapshot.observation_keys = keys_covering(&observations, &source.observation_keys);
    snapshot.observations = observations;
    snapshot.power_rollups.retain(|rollup| {
        within_retention(
            &rollup.kind,
            &rollup.resolution,
            rollup.bucket_end,
            backup_at,
        )
    });
    snapshot.gauge_rollups.retain(|rollup| {
        within_retention(
            &rollup.kind,
            &rollup.resolution,
            rollup.bucket_end,
            backup_at,
        )
    });
    snapshot.energy_rollups.retain(|rollup| {
        within_retention(
            &rollup.kind,
            &rollup.resolution,
            rollup.bucket_end,
            backup_at,
        )
    });
    snapshot
}

fn keys_covering(
    observations: &[ArchivedObservation],
    existing: &[ArchivedObservationKey],
) -> Vec<ArchivedObservationKey> {
    let mut keys = Vec::new();
    for observation in observations {
        let key = ArchivedObservationKey {
            observation_id: observation.observation_id.clone(),
            capability_id: observation.capability_id,
        };
        if !keys.contains(&key) {
            keys.push(key);
        }
    }
    for key in existing {
        if observations.iter().any(|observation| {
            observation.observation_id == key.observation_id
                && observation.capability_id == key.capability_id
        }) && !keys.contains(key)
        {
            keys.push(key.clone());
        }
    }
    keys
}

pub fn export_history(
    role: &str,
    status: &str,
    source: &HistorySnapshot,
    key: &BackupKey,
    backup_at: DateTime<Utc>,
) -> Result<Vec<u8>, BackupError> {
    authorize_history_backup(role, status)?;
    let retained = retain_snapshot(source, backup_at);
    seal_archive(&retained, key)
}

pub fn import_history(
    role: &str,
    status: &str,
    current: &HistorySnapshot,
    archive: &[u8],
    key: &BackupKey,
    resumed_at: DateTime<Utc>,
    actor_user_id: Option<&str>,
) -> Result<RestoredHistory, BackupError> {
    authorize_history_backup(role, status)?;
    let opened = open_archive(archive, key)?;
    if resumed_at < opened.snapshot_at {
        return Err(BackupError::ResumeBeforeSnapshot);
    }
    let snapshot = merge_snapshot(current, &opened, resumed_at);
    let audit = AuditWrite {
        kind: AuditKind::Restore,
        actor_user_id: actor_user_id.map(str::to_string),
        summary: "Restored retained History".to_string(),
        detail: serde_json::json!({
            "snapshotAt": opened.snapshot_at.to_rfc3339(),
            "resumedAt": resumed_at.to_rfc3339(),
        }),
    };
    Ok(RestoredHistory { snapshot, audit })
}

fn merge_snapshot(
    current: &HistorySnapshot,
    archive: &HistorySnapshot,
    resumed_at: DateTime<Utc>,
) -> HistorySnapshot {
    let (capabilities, ids) = reconcile_capabilities(&current.capabilities, &archive.capabilities);
    let mut observations = current.observations.clone();
    let mut seen_observations: HashSet<(String, Uuid, DateTime<Utc>)> = observations
        .iter()
        .map(|observation| {
            (
                observation.observation_id.clone(),
                observation.capability_id,
                observation.observed_at,
            )
        })
        .collect();
    for observation in &archive.observations {
        if !observation_restorable(observation, archive.snapshot_at, resumed_at) {
            continue;
        }
        let mut restored = observation.clone();
        restored.capability_id = remap(&ids, observation.capability_id);
        let identity = (
            restored.observation_id.clone(),
            restored.capability_id,
            restored.observed_at,
        );
        if seen_observations.insert(identity) {
            observations.push(restored);
        }
    }

    let mut power_rollups = current.power_rollups.clone();
    for rollup in &archive.power_rollups {
        if !within_retention(
            &rollup.kind,
            &rollup.resolution,
            rollup.bucket_end,
            archive.snapshot_at,
        ) || !within_retention(
            &rollup.kind,
            &rollup.resolution,
            rollup.bucket_end,
            resumed_at,
        ) {
            continue;
        }
        let mut restored = rollup.clone();
        restored.capability_id = remap(&ids, rollup.capability_id);
        if !power_rollups.iter().any(|existing| {
            existing.capability_id == restored.capability_id
                && existing.bucket_start == restored.bucket_start
        }) {
            power_rollups.push(restored);
        }
    }

    let mut gauge_rollups = current.gauge_rollups.clone();
    for rollup in &archive.gauge_rollups {
        if !within_retention(
            &rollup.kind,
            &rollup.resolution,
            rollup.bucket_end,
            archive.snapshot_at,
        ) || !within_retention(
            &rollup.kind,
            &rollup.resolution,
            rollup.bucket_end,
            resumed_at,
        ) {
            continue;
        }
        let mut restored = rollup.clone();
        restored.capability_id = remap(&ids, rollup.capability_id);
        if !gauge_rollups.iter().any(|existing| {
            existing.capability_id == restored.capability_id
                && existing.bucket_start == restored.bucket_start
        }) {
            gauge_rollups.push(restored);
        }
    }

    let mut energy_rollups = current.energy_rollups.clone();
    for rollup in &archive.energy_rollups {
        if !within_retention(
            &rollup.kind,
            &rollup.resolution,
            rollup.bucket_end,
            archive.snapshot_at,
        ) || !within_retention(
            &rollup.kind,
            &rollup.resolution,
            rollup.bucket_end,
            resumed_at,
        ) {
            continue;
        }
        let mut restored = rollup.clone();
        restored.capability_id = remap(&ids, rollup.capability_id);
        if !energy_rollups.iter().any(|existing| {
            existing.capability_id == restored.capability_id
                && existing.bucket_start == restored.bucket_start
        }) {
            energy_rollups.push(restored);
        }
    }

    let mut gaps = current.gaps.clone();
    for gap in &archive.gaps {
        let mut restored = gap.clone();
        restored.capability_id = gap.capability_id.map(|id| remap(&ids, id));
        upsert_gap(&mut gaps, restored);
    }
    if resumed_at > archive.snapshot_at {
        upsert_gap(
            &mut gaps,
            ArchivedGap {
                capability_id: None,
                reason: GapReason::Restore.as_str().to_string(),
                onset: archive.snapshot_at,
                until: Some(resumed_at),
            },
        );
    }

    let mut recording_bounds = current.recording_bounds.clone();
    for bound in &archive.recording_bounds {
        let capability_id = remap(&ids, bound.capability_id);
        if let Some(existing) = recording_bounds
            .iter_mut()
            .find(|row| row.capability_id == capability_id)
        {
            if bound.recording_since < existing.recording_since {
                existing.recording_since = bound.recording_since;
            }
        } else {
            recording_bounds.push(ArchivedRecordingBound {
                capability_id,
                recording_since: bound.recording_since,
            });
        }
    }

    let mut meter_epochs = current.meter_epochs.clone();
    for epoch in &archive.meter_epochs {
        let mut restored = epoch.clone();
        restored.capability_id = remap(&ids, epoch.capability_id);
        if !meter_epochs.iter().any(|existing| {
            existing.capability_id == restored.capability_id
                && existing.started_at == restored.started_at
        }) {
            meter_epochs.push(restored);
        }
    }

    let mut constraint_revisions = current.constraint_revisions.clone();
    for revision in &archive.constraint_revisions {
        let capability_id = remap(&ids, revision.capability_id);
        let revision_id = revision.revision.revision_id.clone();
        if !constraint_revisions.iter().any(|existing| {
            existing.capability_id == capability_id && existing.revision.revision_id == revision_id
        }) {
            constraint_revisions.push(ArchivedConstraintRevision {
                capability_id,
                revision: revision.revision.clone(),
            });
        }
    }

    let mut timezone_periods = current.timezone_periods.clone();
    for period in &archive.timezone_periods {
        if !timezone_periods
            .iter()
            .any(|existing| existing.effective_from == period.effective_from)
        {
            timezone_periods.push(period.clone());
        }
    }

    let mut designation_periods = current.designation_periods.clone();
    for period in &archive.designation_periods {
        let mut restored = period.clone();
        restored.power_capability_id = period.power_capability_id.map(|id| remap(&ids, id));
        restored.imported_energy_capability_id = period
            .imported_energy_capability_id
            .map(|id| remap(&ids, id));
        restored.exported_energy_capability_id = period
            .exported_energy_capability_id
            .map(|id| remap(&ids, id));
        if !designation_periods
            .iter()
            .any(|existing| existing.id == restored.id)
        {
            designation_periods.push(restored);
        }
    }

    let observation_keys = keys_covering(&observations, &current.observation_keys);

    HistorySnapshot {
        snapshot_at: resumed_at,
        capabilities,
        observations,
        observation_keys,
        power_rollups,
        gauge_rollups,
        energy_rollups,
        gaps,
        recording_bounds,
        meter_epochs,
        constraint_revisions,
        timezone_periods,
        designation_periods,
        budget: archive.budget.clone().or(current.budget.clone()),
    }
}

fn remap(ids: &HashMap<Uuid, Uuid>, id: Uuid) -> Uuid {
    ids.get(&id).copied().unwrap_or(id)
}

fn reconcile_capabilities(
    current: &[ArchivedCapability],
    archive: &[ArchivedCapability],
) -> (Vec<ArchivedCapability>, HashMap<Uuid, Uuid>) {
    let mut capabilities = current.to_vec();
    let mut by_identity: HashMap<StableIdentity, usize> = capabilities
        .iter()
        .enumerate()
        .map(|(index, capability)| (stable_identity(capability), index))
        .collect();
    let mut ids = HashMap::new();
    for archived in archive {
        let identity = stable_identity(archived);
        if let Some(&index) = by_identity.get(&identity) {
            ids.insert(archived.id, capabilities[index].id);
            continue;
        }
        let mut created = archived.clone();
        if capabilities
            .iter()
            .any(|capability| capability.id == created.id)
        {
            created.id = Uuid::new_v4();
        }
        ids.insert(archived.id, created.id);
        by_identity.insert(identity, capabilities.len());
        capabilities.push(created);
    }
    (capabilities, ids)
}

fn upsert_gap(gaps: &mut Vec<ArchivedGap>, gap: ArchivedGap) {
    if let Some(existing) = gaps.iter_mut().find(|row| {
        row.capability_id == gap.capability_id && row.reason == gap.reason && row.onset == gap.onset
    }) {
        existing.until = merge_until(existing.until, gap.until);
    } else {
        gaps.push(gap);
    }
}

fn merge_until(
    existing: Option<DateTime<Utc>>,
    incoming: Option<DateTime<Utc>>,
) -> Option<DateTime<Utc>> {
    match (existing, incoming) {
        (Some(left), Some(right)) => Some(left.max(right)),
        (None, _) => None,
        (existing, None) => existing,
    }
}

fn seal_archive(snapshot: &HistorySnapshot, key: &BackupKey) -> Result<Vec<u8>, BackupError> {
    let document = ArchiveDocument {
        version: ARCHIVE_VERSION,
        snapshot: snapshot.clone(),
    };
    let mut plaintext = serde_json::to_vec(&document).map_err(|_| BackupError::Store)?;
    let sealed = encrypt(&plaintext, key);
    plaintext.fill(0);
    sealed
}

fn open_archive(bytes: &[u8], key: &BackupKey) -> Result<HistorySnapshot, BackupError> {
    let plaintext = decrypt(bytes, key)?;
    let document: ArchiveDocument =
        serde_json::from_slice(&plaintext).map_err(|_| BackupError::Corrupt)?;
    if document.version != ARCHIVE_VERSION {
        return Err(BackupError::Corrupt);
    }
    Ok(document.snapshot)
}

fn encrypt(plaintext: &[u8], key: &BackupKey) -> Result<Vec<u8>, BackupError> {
    let cipher = XChaCha20Poly1305::new_from_slice(&key.0).map_err(|_| BackupError::Store)?;
    let mut nonce_bytes = [0u8; NONCE_LEN];
    rand::rng().fill_bytes(&mut nonce_bytes);
    let nonce = chacha20poly1305::XNonce::from_slice(&nonce_bytes);
    let ciphertext = cipher
        .encrypt(
            nonce,
            Payload {
                msg: plaintext,
                aad: MAGIC,
            },
        )
        .map_err(|_| BackupError::Store)?;
    let mut sealed = Vec::with_capacity(MAGIC.len() + NONCE_LEN + ciphertext.len());
    sealed.extend_from_slice(MAGIC);
    sealed.extend_from_slice(&nonce_bytes);
    sealed.extend_from_slice(&ciphertext);
    Ok(sealed)
}

fn decrypt(bytes: &[u8], key: &BackupKey) -> Result<Vec<u8>, BackupError> {
    if bytes.len() < MAGIC.len() + NONCE_LEN + 16 || !bytes.starts_with(MAGIC) {
        return Err(BackupError::Corrupt);
    }
    let nonce_bytes = &bytes[MAGIC.len()..MAGIC.len() + NONCE_LEN];
    let ciphertext = &bytes[MAGIC.len() + NONCE_LEN..];
    let cipher = XChaCha20Poly1305::new_from_slice(&key.0).map_err(|_| BackupError::Store)?;
    let nonce = chacha20poly1305::XNonce::from_slice(nonce_bytes);
    cipher
        .decrypt(
            nonce,
            Payload {
                msg: ciphertext,
                aad: MAGIC,
            },
        )
        .map_err(|_| BackupError::Rejected)
}

fn attach_constraint_revisions(snapshot: &mut HistorySnapshot, service: &CapabilityService) {
    for capability in snapshot.capabilities.clone() {
        let Some(revisions) = service.constraint_revisions(CapabilityId::from_uuid(capability.id))
        else {
            continue;
        };
        for revision in revisions {
            let revision_id = revision.revision_id.clone();
            if snapshot.constraint_revisions.iter().any(|existing| {
                existing.capability_id == capability.id
                    && existing.revision.revision_id == revision_id
            }) {
                continue;
            }
            snapshot
                .constraint_revisions
                .push(ArchivedConstraintRevision {
                    capability_id: capability.id,
                    revision,
                });
        }
    }
}

pub async fn export_for_client(
    state: &AppState,
    auth: &AuthenticatedClient,
) -> Result<String, BackupClientError> {
    let (role, status) = caller_membership(state, auth).await?;
    authorize_history_backup(&role, &status)?;
    let key = history_backup_key(&state.identity)?;
    let backup_at = Utc::now();
    let conn = state
        .db
        .get()
        .await
        .map_err(|_| BackupClientError::Failed)?;
    let mut snapshot = conn
        .interact(load_history_snapshot)
        .await
        .map_err(|_| BackupClientError::Failed)?
        .map_err(|_| BackupClientError::Failed)?;
    attach_constraint_revisions(&mut snapshot, &state.capabilities);
    let bytes = export_history(&role, &status, &snapshot, &key, backup_at)?;
    Ok(BASE64.encode(bytes))
}

pub async fn import_for_client(
    state: &AppState,
    auth: &AuthenticatedClient,
    archive_b64: &str,
) -> Result<(), BackupClientError> {
    let (role, status) = caller_membership(state, auth).await?;
    authorize_history_backup(&role, &status)?;
    let bytes = BASE64
        .decode(archive_b64)
        .map_err(|_| BackupClientError::Rejected)?;
    let key = history_backup_key(&state.identity)?;
    let resumed_at = Utc::now();
    let actor = auth.user_id.clone();
    let conn = state
        .db
        .get()
        .await
        .map_err(|_| BackupClientError::Failed)?;
    let current = conn
        .interact(load_history_snapshot)
        .await
        .map_err(|_| BackupClientError::Failed)?
        .map_err(|_| BackupClientError::Failed)?;
    let restored = import_history(
        &role,
        &status,
        &current,
        &bytes,
        &key,
        resumed_at,
        actor.as_deref(),
    )?;
    let conn = state
        .db
        .get()
        .await
        .map_err(|_| BackupClientError::Failed)?;
    conn.interact(move |conn| apply_history_restore(conn, &restored.snapshot, &restored.audit))
        .await
        .map_err(|_| BackupClientError::Failed)?
        .map_err(|_| BackupClientError::Failed)
}

async fn caller_membership(
    state: &AppState,
    auth: &AuthenticatedClient,
) -> Result<(String, String), BackupClientError> {
    let Some(user_id) = auth.user_id.as_deref() else {
        return Err(BackupClientError::Unauthenticated);
    };
    let member = find_member_by_user_id(&state.db, user_id)
        .await
        .map_err(|_| BackupClientError::Failed)?;
    let Some(member) = member else {
        return Err(BackupClientError::Unauthenticated);
    };
    Ok((member.role, member.status))
}

fn load_history_snapshot(
    conn: &mut PgConnection,
) -> Result<HistorySnapshot, diesel::result::Error> {
    let capabilities = load_capabilities(conn)?;
    let kinds: HashMap<Uuid, String> = capabilities
        .iter()
        .map(|capability| (capability.id, capability.kind.clone()))
        .collect();
    Ok(HistorySnapshot {
        snapshot_at: Utc::now(),
        observations: load_observations(conn)?,
        observation_keys: load_observation_keys(conn)?,
        power_rollups: load_power_rollups(conn)?,
        gauge_rollups: load_gauge_rollups(conn)?,
        energy_rollups: load_energy_rollups(conn, &kinds)?,
        gaps: load_gaps(conn)?,
        recording_bounds: load_recording_bounds(conn)?,
        meter_epochs: load_meter_epochs(conn)?,
        constraint_revisions: Vec::new(),
        timezone_periods: load_timezone_periods(conn)?,
        designation_periods: load_designations(conn)?,
        budget: load_budget(conn)?,
        capabilities,
    })
}

fn apply_history_restore(
    conn: &mut PgConnection,
    snapshot: &HistorySnapshot,
    audit: &AuditWrite,
) -> Result<(), diesel::result::Error> {
    conn.transaction(|conn| {
        for capability in &snapshot.capabilities {
            insert_capability(conn, capability)?;
        }
        for key in &snapshot.observation_keys {
            insert_observation_key(conn, key)?;
        }
        for observation in &snapshot.observations {
            insert_observation(conn, observation)?;
        }
        for rollup in &snapshot.power_rollups {
            insert_power_rollup(conn, rollup)?;
        }
        for rollup in &snapshot.gauge_rollups {
            insert_gauge_rollup(conn, rollup)?;
        }
        for rollup in &snapshot.energy_rollups {
            insert_energy_rollup(conn, rollup)?;
        }
        for gap in &snapshot.gaps {
            insert_gap(conn, gap)?;
        }
        for bound in &snapshot.recording_bounds {
            insert_recording_bound(conn, bound)?;
        }
        for epoch in &snapshot.meter_epochs {
            insert_meter_epoch(conn, epoch)?;
        }
        for period in &snapshot.timezone_periods {
            insert_timezone_period(conn, period)?;
        }
        for period in &snapshot.designation_periods {
            insert_designation(conn, period)?;
        }
        if let Some(budget) = &snapshot.budget {
            insert_budget(conn, budget)?;
        }
        audit::insert_on(conn, audit)?;
        Ok(())
    })
}

fn db_failure(message: &str) -> diesel::result::Error {
    diesel::result::Error::QueryBuilderError(Box::new(io::Error::new(
        io::ErrorKind::InvalidData,
        message.to_string(),
    )))
}

fn insert_capability(
    conn: &mut PgConnection,
    capability: &ArchivedCapability,
) -> Result<(), diesel::result::Error> {
    diesel::sql_query(
        "INSERT INTO capability_identities (
            id, protocol, device_external_id, component_path, kind,
            physical_scope_kind, physical_scope_component_id, tombstoned_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (
            protocol, device_external_id, component_path, kind,
            physical_scope_kind, physical_scope_component_id
        ) DO UPDATE SET tombstoned_at = CASE
            WHEN capability_identities.tombstoned_at IS NOT NULL
            THEN capability_identities.tombstoned_at
            ELSE EXCLUDED.tombstoned_at
        END",
    )
    .bind::<SqlUuid, _>(capability.id)
    .bind::<Text, _>(&capability.protocol)
    .bind::<Text, _>(&capability.device_external_id)
    .bind::<Array<Text>, _>(&capability.component_path)
    .bind::<Text, _>(&capability.kind)
    .bind::<Text, _>(&capability.physical_scope_kind)
    .bind::<Text, _>(&capability.physical_scope_component_id)
    .bind::<Nullable<Timestamptz>, _>(capability.tombstoned_at)
    .execute(conn)?;
    Ok(())
}

fn insert_observation_key(
    conn: &mut PgConnection,
    key: &ArchivedObservationKey,
) -> Result<(), diesel::result::Error> {
    diesel::sql_query(
        "INSERT INTO capability_observation_keys (observation_id, capability_id)
         VALUES ($1, $2)
         ON CONFLICT (observation_id, capability_id) DO NOTHING",
    )
    .bind::<Text, _>(&key.observation_id)
    .bind::<SqlUuid, _>(key.capability_id)
    .execute(conn)?;
    Ok(())
}

fn insert_observation(
    conn: &mut PgConnection,
    observation: &ArchivedObservation,
) -> Result<(), diesel::result::Error> {
    diesel::sql_query(
        "INSERT INTO capability_observations (
            observation_id, capability_id, kind, unit, value, scale,
            constraint_revision_id, schema_version, time_trust, observed_at, received_at, reset
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (observation_id, capability_id, observed_at) DO NOTHING",
    )
    .bind::<Text, _>(&observation.observation_id)
    .bind::<SqlUuid, _>(observation.capability_id)
    .bind::<Text, _>(&observation.kind)
    .bind::<Text, _>(&observation.unit)
    .bind::<BigInt, _>(observation.value)
    .bind::<SmallInt, _>(i16::from(observation.scale))
    .bind::<Text, _>(&observation.constraint_revision_id)
    .bind::<SmallInt, _>(i16::try_from(observation.schema_version).unwrap_or(1))
    .bind::<Text, _>(&observation.time_trust)
    .bind::<Timestamptz, _>(observation.observed_at)
    .bind::<Timestamptz, _>(observation.received_at)
    .bind::<Nullable<Bool>, _>(observation.reset)
    .execute(conn)?;
    Ok(())
}

fn insert_power_rollup(
    conn: &mut PgConnection,
    rollup: &ArchivedPowerRollup,
) -> Result<(), diesel::result::Error> {
    diesel::sql_query(
        "INSERT INTO power_rollups (
            capability_id, bucket_start, bucket_end, scale, mean_value, observed_min,
            observed_max, estimated_import, estimated_export, coverage_ns, gap_ns
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (capability_id, bucket_start) DO NOTHING",
    )
    .bind::<SqlUuid, _>(rollup.capability_id)
    .bind::<Timestamptz, _>(rollup.bucket_start)
    .bind::<Timestamptz, _>(rollup.bucket_end)
    .bind::<SmallInt, _>(i16::from(rollup.scale))
    .bind::<Nullable<BigInt>, _>(rollup.mean_value)
    .bind::<Nullable<BigInt>, _>(rollup.observed_min)
    .bind::<Nullable<BigInt>, _>(rollup.observed_max)
    .bind::<BigInt, _>(rollup.estimated_import)
    .bind::<BigInt, _>(rollup.estimated_export)
    .bind::<BigInt, _>(rollup.coverage_ns)
    .bind::<BigInt, _>(rollup.gap_ns)
    .execute(conn)?;
    Ok(())
}

fn insert_gauge_rollup(
    conn: &mut PgConnection,
    rollup: &ArchivedGaugeRollup,
) -> Result<(), diesel::result::Error> {
    diesel::sql_query(
        "INSERT INTO gauge_rollups (
            capability_id, gauge_kind, bucket_start, bucket_end, scale, mean_value,
            observed_min, observed_max, coverage_ns
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (capability_id, bucket_start) DO NOTHING",
    )
    .bind::<SqlUuid, _>(rollup.capability_id)
    .bind::<Text, _>(&rollup.kind)
    .bind::<Timestamptz, _>(rollup.bucket_start)
    .bind::<Timestamptz, _>(rollup.bucket_end)
    .bind::<SmallInt, _>(i16::from(rollup.scale))
    .bind::<Nullable<BigInt>, _>(rollup.mean_value)
    .bind::<Nullable<BigInt>, _>(rollup.observed_min)
    .bind::<Nullable<BigInt>, _>(rollup.observed_max)
    .bind::<BigInt, _>(rollup.coverage_ns)
    .execute(conn)?;
    Ok(())
}

fn insert_energy_rollup(
    conn: &mut PgConnection,
    rollup: &ArchivedEnergyRollup,
) -> Result<(), diesel::result::Error> {
    diesel::sql_query(
        "INSERT INTO energy_counter_rollups (
            capability_id, bucket_start, bucket_end, first_observed_at, first_value,
            last_observed_at, last_value, measured_energy, coverage_numerator,
            coverage_denominator, allocation, provenance
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (capability_id, bucket_start) DO NOTHING",
    )
    .bind::<SqlUuid, _>(rollup.capability_id)
    .bind::<Timestamptz, _>(rollup.bucket_start)
    .bind::<Timestamptz, _>(rollup.bucket_end)
    .bind::<Timestamptz, _>(rollup.first_observed_at)
    .bind::<BigInt, _>(rollup.first_value)
    .bind::<Timestamptz, _>(rollup.last_observed_at)
    .bind::<BigInt, _>(rollup.last_value)
    .bind::<BigInt, _>(rollup.measured_energy)
    .bind::<BigInt, _>(rollup.coverage_numerator)
    .bind::<BigInt, _>(rollup.coverage_denominator)
    .bind::<Text, _>(&rollup.allocation)
    .bind::<Text, _>(&rollup.provenance)
    .execute(conn)?;
    Ok(())
}

fn insert_gap(conn: &mut PgConnection, gap: &ArchivedGap) -> Result<(), diesel::result::Error> {
    if GapReason::parse(&gap.reason).is_none() {
        return Err(db_failure("unknown history gap reason"));
    }
    match gap.capability_id {
        Some(capability_id) => {
            diesel::sql_query(
                "INSERT INTO history_gaps (capability_id, reason, onset, until)
                 VALUES ($1, $2, $3, $4)
                 ON CONFLICT (reason, capability_id, onset) WHERE capability_id IS NOT NULL
                 DO UPDATE SET until = EXCLUDED.until",
            )
            .bind::<SqlUuid, _>(capability_id)
            .bind::<Text, _>(&gap.reason)
            .bind::<Timestamptz, _>(gap.onset)
            .bind::<Nullable<Timestamptz>, _>(gap.until)
            .execute(conn)?;
        }
        None => {
            diesel::sql_query(
                "INSERT INTO history_gaps (capability_id, reason, onset, until)
                 VALUES (NULL, $1, $2, $3)
                 ON CONFLICT (reason, onset) WHERE capability_id IS NULL
                 DO UPDATE SET until = EXCLUDED.until",
            )
            .bind::<Text, _>(&gap.reason)
            .bind::<Timestamptz, _>(gap.onset)
            .bind::<Nullable<Timestamptz>, _>(gap.until)
            .execute(conn)?;
        }
    }
    Ok(())
}

fn insert_recording_bound(
    conn: &mut PgConnection,
    bound: &ArchivedRecordingBound,
) -> Result<(), diesel::result::Error> {
    diesel::sql_query(
        "INSERT INTO capability_recording_bounds (capability_id, recording_since)
         VALUES ($1, $2)
         ON CONFLICT (capability_id) DO UPDATE
         SET recording_since = LEAST(capability_recording_bounds.recording_since, EXCLUDED.recording_since)",
    )
    .bind::<SqlUuid, _>(bound.capability_id)
    .bind::<Timestamptz, _>(bound.recording_since)
    .execute(conn)?;
    Ok(())
}

fn insert_meter_epoch(
    conn: &mut PgConnection,
    epoch: &ArchivedMeterEpoch,
) -> Result<(), diesel::result::Error> {
    diesel::sql_query(
        "INSERT INTO meter_epochs (capability_id, started_at, ended_at, reason)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (capability_id, started_at) DO NOTHING",
    )
    .bind::<SqlUuid, _>(epoch.capability_id)
    .bind::<Timestamptz, _>(epoch.started_at)
    .bind::<Nullable<Timestamptz>, _>(epoch.ended_at)
    .bind::<Text, _>(&epoch.reason)
    .execute(conn)?;
    Ok(())
}

fn insert_timezone_period(
    conn: &mut PgConnection,
    period: &ArchivedTimezonePeriod,
) -> Result<(), diesel::result::Error> {
    diesel::sql_query(
        "INSERT INTO home_timezone_periods (timezone, effective_from, effective_until)
         VALUES ($1, $2, $3)
         ON CONFLICT (effective_from) DO NOTHING",
    )
    .bind::<Text, _>(&period.timezone)
    .bind::<Timestamptz, _>(period.effective_from)
    .bind::<Nullable<Timestamptz>, _>(period.effective_until)
    .execute(conn)?;
    Ok(())
}

fn insert_designation(
    conn: &mut PgConnection,
    period: &ArchivedDesignation,
) -> Result<(), diesel::result::Error> {
    diesel::sql_query(
        "INSERT INTO home_meter_designation_periods (
            id, effective_from, effective_until, power_capability_id,
            imported_energy_capability_id, exported_energy_capability_id, protocol,
            device_external_id, component_path, physical_scope_kind, physical_scope_component_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (id) DO NOTHING",
    )
    .bind::<SqlUuid, _>(period.id)
    .bind::<Timestamptz, _>(period.effective_from)
    .bind::<Nullable<Timestamptz>, _>(period.effective_until)
    .bind::<Nullable<SqlUuid>, _>(period.power_capability_id)
    .bind::<Nullable<SqlUuid>, _>(period.imported_energy_capability_id)
    .bind::<Nullable<SqlUuid>, _>(period.exported_energy_capability_id)
    .bind::<Text, _>(&period.protocol)
    .bind::<Text, _>(&period.device_external_id)
    .bind::<Array<Text>, _>(&period.component_path)
    .bind::<Text, _>(&period.physical_scope_kind)
    .bind::<Text, _>(&period.physical_scope_component_id)
    .execute(conn)?;
    Ok(())
}

fn insert_budget(
    conn: &mut PgConnection,
    budget: &ArchivedBudget,
) -> Result<(), diesel::result::Error> {
    diesel::sql_query(
        "INSERT INTO history_budget (id, budget_bytes, updated_at)
         VALUES (1, $1, $2)
         ON CONFLICT (id) DO UPDATE
         SET budget_bytes = EXCLUDED.budget_bytes, updated_at = EXCLUDED.updated_at",
    )
    .bind::<BigInt, _>(budget.budget_bytes)
    .bind::<Timestamptz, _>(budget.updated_at)
    .execute(conn)?;
    Ok(())
}

#[derive(QueryableByName)]
struct CapabilityIdentityRow {
    #[diesel(sql_type = SqlUuid)]
    id: Uuid,
    #[diesel(sql_type = Text)]
    protocol: String,
    #[diesel(sql_type = Text)]
    device_external_id: String,
    #[diesel(sql_type = Array<Nullable<Text>>)]
    component_path: Vec<Option<String>>,
    #[diesel(sql_type = Text)]
    kind: String,
    #[diesel(sql_type = Text)]
    physical_scope_kind: String,
    #[diesel(sql_type = Text)]
    physical_scope_component_id: String,
    #[diesel(sql_type = Nullable<Timestamptz>)]
    tombstoned_at: Option<DateTime<Utc>>,
}

fn load_capabilities(
    conn: &mut PgConnection,
) -> Result<Vec<ArchivedCapability>, diesel::result::Error> {
    let rows = diesel::sql_query(
        "SELECT id, protocol, device_external_id, component_path, kind,
                physical_scope_kind, physical_scope_component_id, tombstoned_at
         FROM capability_identities
         ORDER BY created_at",
    )
    .load::<CapabilityIdentityRow>(conn)?;
    Ok(rows
        .into_iter()
        .map(|row| ArchivedCapability {
            id: row.id,
            protocol: row.protocol,
            device_external_id: row.device_external_id,
            component_path: row.component_path.into_iter().flatten().collect(),
            kind: row.kind,
            physical_scope_kind: row.physical_scope_kind,
            physical_scope_component_id: row.physical_scope_component_id,
            tombstoned_at: row.tombstoned_at,
        })
        .collect())
}

#[derive(QueryableByName)]
struct ObservationSqlRow {
    #[diesel(sql_type = Text)]
    observation_id: String,
    #[diesel(sql_type = SqlUuid)]
    capability_id: Uuid,
    #[diesel(sql_type = Text)]
    kind: String,
    #[diesel(sql_type = Text)]
    unit: String,
    #[diesel(sql_type = BigInt)]
    value: i64,
    #[diesel(sql_type = SmallInt)]
    scale: i16,
    #[diesel(sql_type = Text)]
    constraint_revision_id: String,
    #[diesel(sql_type = SmallInt)]
    schema_version: i16,
    #[diesel(sql_type = Text)]
    time_trust: String,
    #[diesel(sql_type = Timestamptz)]
    observed_at: DateTime<Utc>,
    #[diesel(sql_type = Timestamptz)]
    received_at: DateTime<Utc>,
    #[diesel(sql_type = Nullable<Bool>)]
    reset: Option<bool>,
}

fn load_observations(
    conn: &mut PgConnection,
) -> Result<Vec<ArchivedObservation>, diesel::result::Error> {
    let rows = diesel::sql_query(
        "SELECT observation_id, capability_id, kind, unit, value, scale,
                constraint_revision_id, schema_version, time_trust, observed_at, received_at, reset
         FROM capability_observations
         ORDER BY observed_at, observation_id",
    )
    .load::<ObservationSqlRow>(conn)?;
    Ok(rows
        .into_iter()
        .map(|row| ArchivedObservation {
            observation_id: row.observation_id,
            capability_id: row.capability_id,
            kind: row.kind,
            unit: row.unit,
            value: row.value,
            scale: u8::try_from(row.scale).unwrap_or(0),
            constraint_revision_id: row.constraint_revision_id,
            schema_version: u16::try_from(row.schema_version).unwrap_or(1),
            time_trust: row.time_trust,
            observed_at: row.observed_at,
            received_at: row.received_at,
            reset: row.reset,
        })
        .collect())
}

#[derive(QueryableByName)]
struct KeySqlRow {
    #[diesel(sql_type = Text)]
    observation_id: String,
    #[diesel(sql_type = SqlUuid)]
    capability_id: Uuid,
}

fn load_observation_keys(
    conn: &mut PgConnection,
) -> Result<Vec<ArchivedObservationKey>, diesel::result::Error> {
    let rows = diesel::sql_query(
        "SELECT observation_id, capability_id FROM capability_observation_keys
         ORDER BY observation_id",
    )
    .load::<KeySqlRow>(conn)?;
    Ok(rows
        .into_iter()
        .map(|row| ArchivedObservationKey {
            observation_id: row.observation_id,
            capability_id: row.capability_id,
        })
        .collect())
}

fn infer_resolution(start: DateTime<Utc>, end: DateTime<Utc>) -> String {
    let seconds = (end - start).num_seconds();
    match seconds {
        60 => "one_minute",
        300 => "five_minute",
        900 => "fifteen_minute",
        3600 => "hourly",
        82_800..=90_000 => "daily",
        _ => "unspecified",
    }
    .to_string()
}

#[derive(QueryableByName)]
struct PowerSqlRow {
    #[diesel(sql_type = SqlUuid)]
    capability_id: Uuid,
    #[diesel(sql_type = Timestamptz)]
    bucket_start: DateTime<Utc>,
    #[diesel(sql_type = Timestamptz)]
    bucket_end: DateTime<Utc>,
    #[diesel(sql_type = SmallInt)]
    scale: i16,
    #[diesel(sql_type = Nullable<BigInt>)]
    mean_value: Option<i64>,
    #[diesel(sql_type = Nullable<BigInt>)]
    observed_min: Option<i64>,
    #[diesel(sql_type = Nullable<BigInt>)]
    observed_max: Option<i64>,
    #[diesel(sql_type = BigInt)]
    estimated_import: i64,
    #[diesel(sql_type = BigInt)]
    estimated_export: i64,
    #[diesel(sql_type = BigInt)]
    coverage_ns: i64,
    #[diesel(sql_type = BigInt)]
    gap_ns: i64,
}

fn load_power_rollups(
    conn: &mut PgConnection,
) -> Result<Vec<ArchivedPowerRollup>, diesel::result::Error> {
    let rows = diesel::sql_query(
        "SELECT capability_id, bucket_start, bucket_end, scale, mean_value, observed_min,
                observed_max, estimated_import, estimated_export, coverage_ns, gap_ns
         FROM power_rollups
         ORDER BY bucket_start",
    )
    .load::<PowerSqlRow>(conn)?;
    Ok(rows
        .into_iter()
        .map(|row| ArchivedPowerRollup {
            capability_id: row.capability_id,
            kind: CapabilityKind::Power.as_str().to_string(),
            resolution: infer_resolution(row.bucket_start, row.bucket_end),
            bucket_start: row.bucket_start,
            bucket_end: row.bucket_end,
            scale: u8::try_from(row.scale).unwrap_or(0),
            mean_value: row.mean_value,
            observed_min: row.observed_min,
            observed_max: row.observed_max,
            estimated_import: row.estimated_import,
            estimated_export: row.estimated_export,
            coverage_ns: row.coverage_ns,
            gap_ns: row.gap_ns,
        })
        .collect())
}

#[derive(QueryableByName)]
struct GaugeSqlRow {
    #[diesel(sql_type = SqlUuid)]
    capability_id: Uuid,
    #[diesel(sql_type = Text)]
    gauge_kind: String,
    #[diesel(sql_type = Timestamptz)]
    bucket_start: DateTime<Utc>,
    #[diesel(sql_type = Timestamptz)]
    bucket_end: DateTime<Utc>,
    #[diesel(sql_type = SmallInt)]
    scale: i16,
    #[diesel(sql_type = Nullable<BigInt>)]
    mean_value: Option<i64>,
    #[diesel(sql_type = Nullable<BigInt>)]
    observed_min: Option<i64>,
    #[diesel(sql_type = Nullable<BigInt>)]
    observed_max: Option<i64>,
    #[diesel(sql_type = BigInt)]
    coverage_ns: i64,
}

fn load_gauge_rollups(
    conn: &mut PgConnection,
) -> Result<Vec<ArchivedGaugeRollup>, diesel::result::Error> {
    let rows = diesel::sql_query(
        "SELECT capability_id, gauge_kind, bucket_start, bucket_end, scale, mean_value,
                observed_min, observed_max, coverage_ns
         FROM gauge_rollups
         ORDER BY bucket_start",
    )
    .load::<GaugeSqlRow>(conn)?;
    Ok(rows
        .into_iter()
        .map(|row| ArchivedGaugeRollup {
            capability_id: row.capability_id,
            kind: row.gauge_kind,
            resolution: infer_resolution(row.bucket_start, row.bucket_end),
            bucket_start: row.bucket_start,
            bucket_end: row.bucket_end,
            scale: u8::try_from(row.scale).unwrap_or(0),
            mean_value: row.mean_value,
            observed_min: row.observed_min,
            observed_max: row.observed_max,
            coverage_ns: row.coverage_ns,
        })
        .collect())
}

#[derive(QueryableByName)]
struct EnergySqlRow {
    #[diesel(sql_type = SqlUuid)]
    capability_id: Uuid,
    #[diesel(sql_type = Timestamptz)]
    bucket_start: DateTime<Utc>,
    #[diesel(sql_type = Timestamptz)]
    bucket_end: DateTime<Utc>,
    #[diesel(sql_type = Timestamptz)]
    first_observed_at: DateTime<Utc>,
    #[diesel(sql_type = BigInt)]
    first_value: i64,
    #[diesel(sql_type = Timestamptz)]
    last_observed_at: DateTime<Utc>,
    #[diesel(sql_type = BigInt)]
    last_value: i64,
    #[diesel(sql_type = BigInt)]
    measured_energy: i64,
    #[diesel(sql_type = BigInt)]
    coverage_numerator: i64,
    #[diesel(sql_type = BigInt)]
    coverage_denominator: i64,
    #[diesel(sql_type = Text)]
    allocation: String,
    #[diesel(sql_type = Text)]
    provenance: String,
}

fn load_energy_rollups(
    conn: &mut PgConnection,
    kinds: &HashMap<Uuid, String>,
) -> Result<Vec<ArchivedEnergyRollup>, diesel::result::Error> {
    let rows = diesel::sql_query(
        "SELECT capability_id, bucket_start, bucket_end, first_observed_at, first_value,
                last_observed_at, last_value, measured_energy, coverage_numerator,
                coverage_denominator, allocation, provenance
         FROM energy_counter_rollups
         ORDER BY bucket_start",
    )
    .load::<EnergySqlRow>(conn)?;
    Ok(rows
        .into_iter()
        .map(|row| ArchivedEnergyRollup {
            kind: kinds
                .get(&row.capability_id)
                .cloned()
                .unwrap_or_else(|| CapabilityKind::ImportedEnergy.as_str().to_string()),
            capability_id: row.capability_id,
            resolution: infer_resolution(row.bucket_start, row.bucket_end),
            bucket_start: row.bucket_start,
            bucket_end: row.bucket_end,
            first_observed_at: row.first_observed_at,
            first_value: row.first_value,
            last_observed_at: row.last_observed_at,
            last_value: row.last_value,
            measured_energy: row.measured_energy,
            coverage_numerator: row.coverage_numerator,
            coverage_denominator: row.coverage_denominator,
            allocation: row.allocation,
            provenance: row.provenance,
        })
        .collect())
}

#[derive(QueryableByName)]
struct GapSqlRow {
    #[diesel(sql_type = Nullable<SqlUuid>)]
    capability_id: Option<Uuid>,
    #[diesel(sql_type = Text)]
    reason: String,
    #[diesel(sql_type = Timestamptz)]
    onset: DateTime<Utc>,
    #[diesel(sql_type = Nullable<Timestamptz>)]
    until: Option<DateTime<Utc>>,
}

fn load_gaps(conn: &mut PgConnection) -> Result<Vec<ArchivedGap>, diesel::result::Error> {
    let rows = diesel::sql_query(
        "SELECT capability_id, reason, onset, until FROM history_gaps ORDER BY onset",
    )
    .load::<GapSqlRow>(conn)?;
    Ok(rows
        .into_iter()
        .map(|row| ArchivedGap {
            capability_id: row.capability_id,
            reason: row.reason,
            onset: row.onset,
            until: row.until,
        })
        .collect())
}

#[derive(QueryableByName)]
struct BoundSqlRow {
    #[diesel(sql_type = SqlUuid)]
    capability_id: Uuid,
    #[diesel(sql_type = Timestamptz)]
    recording_since: DateTime<Utc>,
}

fn load_recording_bounds(
    conn: &mut PgConnection,
) -> Result<Vec<ArchivedRecordingBound>, diesel::result::Error> {
    let rows =
        diesel::sql_query("SELECT capability_id, recording_since FROM capability_recording_bounds")
            .load::<BoundSqlRow>(conn)?;
    Ok(rows
        .into_iter()
        .map(|row| ArchivedRecordingBound {
            capability_id: row.capability_id,
            recording_since: row.recording_since,
        })
        .collect())
}

#[derive(QueryableByName)]
struct EpochSqlRow {
    #[diesel(sql_type = SqlUuid)]
    capability_id: Uuid,
    #[diesel(sql_type = Timestamptz)]
    started_at: DateTime<Utc>,
    #[diesel(sql_type = Nullable<Timestamptz>)]
    ended_at: Option<DateTime<Utc>>,
    #[diesel(sql_type = Text)]
    reason: String,
}

fn load_meter_epochs(
    conn: &mut PgConnection,
) -> Result<Vec<ArchivedMeterEpoch>, diesel::result::Error> {
    let rows = diesel::sql_query(
        "SELECT capability_id, started_at, ended_at, reason FROM meter_epochs ORDER BY started_at",
    )
    .load::<EpochSqlRow>(conn)?;
    Ok(rows
        .into_iter()
        .map(|row| ArchivedMeterEpoch {
            capability_id: row.capability_id,
            started_at: row.started_at,
            ended_at: row.ended_at,
            reason: row.reason,
        })
        .collect())
}

#[derive(QueryableByName)]
struct TimezoneSqlRow {
    #[diesel(sql_type = Text)]
    timezone: String,
    #[diesel(sql_type = Timestamptz)]
    effective_from: DateTime<Utc>,
    #[diesel(sql_type = Nullable<Timestamptz>)]
    effective_until: Option<DateTime<Utc>>,
}

fn load_timezone_periods(
    conn: &mut PgConnection,
) -> Result<Vec<ArchivedTimezonePeriod>, diesel::result::Error> {
    let rows = diesel::sql_query(
        "SELECT timezone, effective_from, effective_until
         FROM home_timezone_periods
         ORDER BY effective_from",
    )
    .load::<TimezoneSqlRow>(conn)?;
    Ok(rows
        .into_iter()
        .map(|row| ArchivedTimezonePeriod {
            timezone: row.timezone,
            effective_from: row.effective_from,
            effective_until: row.effective_until,
        })
        .collect())
}

#[derive(QueryableByName)]
struct DesignationSqlRow {
    #[diesel(sql_type = SqlUuid)]
    id: Uuid,
    #[diesel(sql_type = Timestamptz)]
    effective_from: DateTime<Utc>,
    #[diesel(sql_type = Nullable<Timestamptz>)]
    effective_until: Option<DateTime<Utc>>,
    #[diesel(sql_type = Nullable<SqlUuid>)]
    power_capability_id: Option<Uuid>,
    #[diesel(sql_type = Nullable<SqlUuid>)]
    imported_energy_capability_id: Option<Uuid>,
    #[diesel(sql_type = Nullable<SqlUuid>)]
    exported_energy_capability_id: Option<Uuid>,
    #[diesel(sql_type = Text)]
    protocol: String,
    #[diesel(sql_type = Text)]
    device_external_id: String,
    #[diesel(sql_type = Array<Text>)]
    component_path: Vec<String>,
    #[diesel(sql_type = Text)]
    physical_scope_kind: String,
    #[diesel(sql_type = Text)]
    physical_scope_component_id: String,
}

fn load_designations(
    conn: &mut PgConnection,
) -> Result<Vec<ArchivedDesignation>, diesel::result::Error> {
    let rows = diesel::sql_query(
        "SELECT id, effective_from, effective_until, power_capability_id,
                imported_energy_capability_id, exported_energy_capability_id, protocol,
                device_external_id, component_path, physical_scope_kind, physical_scope_component_id
         FROM home_meter_designation_periods
         ORDER BY effective_from",
    )
    .load::<DesignationSqlRow>(conn)?;
    Ok(rows
        .into_iter()
        .map(|row| ArchivedDesignation {
            id: row.id,
            effective_from: row.effective_from,
            effective_until: row.effective_until,
            power_capability_id: row.power_capability_id,
            imported_energy_capability_id: row.imported_energy_capability_id,
            exported_energy_capability_id: row.exported_energy_capability_id,
            protocol: row.protocol,
            device_external_id: row.device_external_id,
            component_path: row.component_path,
            physical_scope_kind: row.physical_scope_kind,
            physical_scope_component_id: row.physical_scope_component_id,
        })
        .collect())
}

#[derive(QueryableByName)]
struct BudgetSqlRow {
    #[diesel(sql_type = BigInt)]
    budget_bytes: i64,
    #[diesel(sql_type = Timestamptz)]
    updated_at: DateTime<Utc>,
}

fn load_budget(conn: &mut PgConnection) -> Result<Option<ArchivedBudget>, diesel::result::Error> {
    let row = diesel::sql_query("SELECT budget_bytes, updated_at FROM history_budget WHERE id = 1")
        .get_result::<BudgetSqlRow>(conn)
        .optional()?;
    Ok(row.map(|row| ArchivedBudget {
        budget_bytes: row.budget_bytes,
        updated_at: row.updated_at,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Duration;

    const READING: i64 = 8_675_309_012_345;
    const OBSERVATION_ID: &str = "obs-history-backup-9f3c1a";
    const DEVICE_ID: &str = "meter-history-backup-1";

    fn at_backup() -> DateTime<Utc> {
        DateTime::from_timestamp(1_700_000_000, 0).unwrap()
    }

    fn key() -> BackupKey {
        BackupKey::from_bytes([9u8; 32])
    }

    fn capability(id: Uuid, kind: &str) -> ArchivedCapability {
        ArchivedCapability {
            id,
            protocol: "matter".into(),
            device_external_id: DEVICE_ID.into(),
            component_path: Vec::new(),
            kind: kind.into(),
            physical_scope_kind: "device".into(),
            physical_scope_component_id: String::new(),
            tombstoned_at: None,
        }
    }

    fn observation(
        observation_id: &str,
        capability_id: Uuid,
        kind: &str,
        unit: &str,
        observed_at: DateTime<Utc>,
        value: i64,
        revision: &str,
    ) -> ArchivedObservation {
        ArchivedObservation {
            observation_id: observation_id.into(),
            capability_id,
            kind: kind.into(),
            unit: unit.into(),
            value,
            scale: 0,
            constraint_revision_id: revision.into(),
            schema_version: 1,
            time_trust: "trustworthy".into(),
            observed_at,
            received_at: observed_at,
            reset: None,
        }
    }

    fn power_rollup(
        capability_id: Uuid,
        resolution: &str,
        bucket_end: DateTime<Utc>,
    ) -> ArchivedPowerRollup {
        let bucket_start = bucket_end
            - match resolution {
                "one_minute" => Duration::minutes(1),
                "fifteen_minute" => Duration::minutes(15),
                "hourly" => Duration::hours(1),
                _ => Duration::hours(24),
            };
        ArchivedPowerRollup {
            capability_id,
            kind: "power".into(),
            resolution: resolution.into(),
            bucket_start,
            bucket_end,
            scale: 0,
            mean_value: None,
            observed_min: None,
            observed_max: None,
            estimated_import: 0,
            estimated_export: 0,
            coverage_ns: 0,
            gap_ns: 0,
        }
    }

    fn gauge_rollup(
        capability_id: Uuid,
        resolution: &str,
        bucket_end: DateTime<Utc>,
    ) -> ArchivedGaugeRollup {
        let bucket_start = bucket_end
            - match resolution {
                "five_minute" => Duration::minutes(5),
                "hourly" => Duration::hours(1),
                _ => Duration::hours(24),
            };
        ArchivedGaugeRollup {
            capability_id,
            kind: "voltage".into(),
            resolution: resolution.into(),
            bucket_start,
            bucket_end,
            scale: 0,
            mean_value: None,
            observed_min: None,
            observed_max: None,
            coverage_ns: 0,
        }
    }

    fn energy_rollup(
        capability_id: Uuid,
        resolution: &str,
        bucket_end: DateTime<Utc>,
    ) -> ArchivedEnergyRollup {
        let bucket_start = bucket_end
            - match resolution {
                "fifteen_minute" => Duration::minutes(15),
                "hourly" => Duration::hours(1),
                _ => Duration::hours(24),
            };
        ArchivedEnergyRollup {
            capability_id,
            kind: "importedEnergy".into(),
            resolution: resolution.into(),
            bucket_start,
            bucket_end,
            first_observed_at: bucket_start,
            first_value: 0,
            last_observed_at: bucket_end,
            last_value: 1,
            measured_energy: 1,
            coverage_numerator: 1,
            coverage_denominator: 1,
            allocation: "exact".into(),
            provenance: "measured_from_counter".into(),
        }
    }

    fn revision(capability_id: Uuid, at: DateTime<Utc>) -> ArchivedConstraintRevision {
        ArchivedConstraintRevision {
            capability_id,
            revision: ConstraintRevision {
                revision_id: "rev-kept".into(),
                declared_at: at,
                effective_at: at,
                scale: 0,
                bounds: FixedPointBounds {
                    minimum: 0,
                    maximum: 9_000_000_000_000_000,
                },
                resolution: 1,
                freshness_ms: 60_000,
                history_admission: HistoryAdmissionRate {
                    maximum_observations: 60,
                    interval_ms: 60_000,
                },
                accuracy: None,
            },
        }
    }

    fn rich_history() -> HistorySnapshot {
        let backup = at_backup();
        let power = Uuid::from_u128(11);
        let energy = Uuid::from_u128(12);
        let gauge = Uuid::from_u128(13);
        let fresh_power = observation(
            OBSERVATION_ID,
            power,
            "power",
            "W",
            backup - Duration::hours(1),
            READING,
            "rev-kept",
        );
        let expired_power = observation(
            "obs-power-expired",
            power,
            "power",
            "W",
            backup - Duration::hours(49),
            1,
            "rev-old",
        );
        let fresh_energy = observation(
            "obs-energy-fresh",
            energy,
            "importedEnergy",
            "Wh",
            backup - Duration::days(1),
            10,
            "rev-energy",
        );
        let expired_energy = observation(
            "obs-energy-expired",
            energy,
            "importedEnergy",
            "Wh",
            backup - Duration::days(8),
            2,
            "rev-energy-old",
        );
        let fresh_gauge = observation(
            "obs-gauge-fresh",
            gauge,
            "voltage",
            "V",
            backup - Duration::hours(1),
            120,
            "rev-gauge",
        );
        let expired_gauge = observation(
            "obs-gauge-expired",
            gauge,
            "voltage",
            "V",
            backup - Duration::hours(25),
            3,
            "rev-gauge-old",
        );
        let observations = vec![
            fresh_power,
            expired_power,
            fresh_energy,
            expired_energy,
            fresh_gauge,
            expired_gauge,
        ];
        let observation_keys = observations
            .iter()
            .map(|observation| ArchivedObservationKey {
                observation_id: observation.observation_id.clone(),
                capability_id: observation.capability_id,
            })
            .collect();
        HistorySnapshot {
            snapshot_at: backup,
            capabilities: vec![
                capability(power, "power"),
                capability(energy, "importedEnergy"),
                capability(gauge, "voltage"),
            ],
            observation_keys,
            observations,
            power_rollups: vec![
                power_rollup(power, "one_minute", backup - Duration::days(1)),
                power_rollup(power, "one_minute", backup - Duration::days(8)),
                power_rollup(power, "fifteen_minute", backup - Duration::days(1)),
                power_rollup(power, "hourly", backup - Duration::days(30)),
                power_rollup(power, "daily", backup - Duration::days(30)),
            ],
            gauge_rollups: vec![
                gauge_rollup(gauge, "five_minute", backup - Duration::days(1)),
                gauge_rollup(gauge, "hourly", backup - Duration::days(30)),
                gauge_rollup(gauge, "daily", backup - Duration::days(30)),
            ],
            energy_rollups: vec![
                energy_rollup(energy, "fifteen_minute", backup - Duration::days(1)),
                energy_rollup(energy, "hourly", backup - Duration::days(30)),
                energy_rollup(energy, "daily", backup - Duration::days(400)),
            ],
            gaps: vec![ArchivedGap {
                capability_id: Some(power),
                reason: "storage_failure".into(),
                onset: backup - Duration::hours(2),
                until: Some(backup - Duration::hours(1)),
            }],
            recording_bounds: vec![ArchivedRecordingBound {
                capability_id: power,
                recording_since: backup - Duration::days(20),
            }],
            meter_epochs: vec![ArchivedMeterEpoch {
                capability_id: energy,
                started_at: backup - Duration::days(3),
                ended_at: None,
                reason: "initial".into(),
            }],
            constraint_revisions: vec![revision(power, backup - Duration::days(20))],
            timezone_periods: vec![ArchivedTimezonePeriod {
                timezone: "America/Los_Angeles".into(),
                effective_from: backup - Duration::days(30),
                effective_until: None,
            }],
            designation_periods: vec![ArchivedDesignation {
                id: Uuid::from_u128(70),
                effective_from: backup - Duration::days(10),
                effective_until: None,
                power_capability_id: Some(power),
                imported_energy_capability_id: Some(energy),
                exported_energy_capability_id: None,
                protocol: "matter".into(),
                device_external_id: DEVICE_ID.into(),
                component_path: Vec::new(),
                physical_scope_kind: "device".into(),
                physical_scope_component_id: String::new(),
            }],
            budget: Some(ArchivedBudget {
                budget_bytes: 4096,
                updated_at: backup,
            }),
        }
    }

    fn contains_text(haystack: &[u8], needle: &str) -> bool {
        let needle = needle.as_bytes();
        !needle.is_empty()
            && haystack
                .windows(needle.len())
                .any(|window| window == needle)
    }

    fn observation_ids(snapshot: &HistorySnapshot) -> HashSet<&str> {
        snapshot
            .observations
            .iter()
            .map(|observation| observation.observation_id.as_str())
            .collect()
    }

    #[test]
    fn export_includes_every_retained_resolution_and_metadata() {
        let backup = at_backup();
        let bytes = export_history("owner", "active", &rich_history(), &key(), backup).unwrap();
        let opened = open_archive(&bytes, &key()).unwrap();
        let ids = observation_ids(&opened);
        assert!(ids.contains(OBSERVATION_ID));
        assert!(ids.contains("obs-energy-fresh"));
        assert!(ids.contains("obs-gauge-fresh"));
        assert!(!ids.contains("obs-power-expired"));
        assert!(!ids.contains("obs-energy-expired"));
        assert!(!ids.contains("obs-gauge-expired"));
        assert_eq!(
            opened
                .power_rollups
                .iter()
                .filter(|rollup| rollup.resolution == "one_minute")
                .count(),
            1
        );
        for resolution in ["fifteen_minute", "hourly", "daily"] {
            assert!(
                opened
                    .power_rollups
                    .iter()
                    .any(|rollup| rollup.resolution == resolution),
                "{resolution}"
            );
        }
        for resolution in ["five_minute", "hourly", "daily"] {
            assert!(
                opened
                    .gauge_rollups
                    .iter()
                    .any(|rollup| rollup.resolution == resolution)
            );
        }
        for resolution in ["fifteen_minute", "hourly", "daily"] {
            assert!(
                opened
                    .energy_rollups
                    .iter()
                    .any(|rollup| rollup.resolution == resolution)
            );
        }
        assert!(
            opened
                .observation_keys
                .iter()
                .any(|key| key.observation_id == OBSERVATION_ID)
        );
        assert!(
            !opened
                .observation_keys
                .iter()
                .any(|key| key.observation_id == "obs-power-expired")
        );
        assert_eq!(opened.gaps.len(), 1);
        assert_eq!(opened.gaps[0].reason, "storage_failure");
        assert_eq!(opened.recording_bounds.len(), 1);
        assert_eq!(opened.meter_epochs.len(), 1);
        assert_eq!(opened.meter_epochs[0].reason, "initial");
        assert_eq!(
            opened.constraint_revisions[0].revision.revision_id,
            "rev-kept"
        );
        assert_eq!(opened.timezone_periods[0].timezone, "America/Los_Angeles");
        assert_eq!(opened.designation_periods.len(), 1);
        assert_eq!(opened.budget.unwrap().budget_bytes, 4096);
        assert_eq!(opened.snapshot_at, backup);
    }

    #[test]
    fn ciphertext_does_not_contain_history_plaintext() {
        let secret = b"controller-private-key-material-backup";
        let derived = backup_key_from_controller_secret(secret);
        let backup = at_backup();
        let bytes = export_history("owner", "active", &rich_history(), &derived, backup).unwrap();
        let opened = open_archive(&bytes, &derived).unwrap();
        let capability_id = opened
            .observations
            .iter()
            .find(|observation| observation.observation_id == OBSERVATION_ID)
            .unwrap()
            .capability_id;
        assert_eq!(
            opened
                .observations
                .iter()
                .find(|observation| observation.observation_id == OBSERVATION_ID)
                .unwrap()
                .value,
            READING
        );
        assert!(!contains_text(&bytes, OBSERVATION_ID));
        assert!(!contains_text(&bytes, &capability_id.to_string()));
        assert!(!contains_text(
            &bytes,
            &capability_id.to_string().replace('-', "")
        ));
        assert!(!contains_text(&bytes, &READING.to_string()));
        assert!(!contains_text(&bytes, "rev-kept"));
        assert!(!contains_text(&bytes, DEVICE_ID));
        assert!(!contains_text(&bytes, std::str::from_utf8(secret).unwrap()));
        assert!(!bytes.windows(32).any(|window| window == derived.raw()));
        assert_eq!(format!("{derived:?}"), "BackupKey(redacted)");
    }

    #[test]
    fn restore_reconciles_capability_id_and_keeps_original_time() {
        let backup = at_backup();
        let archive_id = Uuid::from_u128(21);
        let local_id = Uuid::from_u128(22);
        let observed_at = backup - Duration::minutes(30);
        let mut source = HistorySnapshot::default();
        source.snapshot_at = backup;
        source.capabilities.push(capability(archive_id, "power"));
        source.observations.push(observation(
            "obs-stable",
            archive_id,
            "power",
            "W",
            observed_at,
            42,
            "rev-on-obs",
        ));
        source.power_rollups.push(power_rollup(
            archive_id,
            "hourly",
            backup - Duration::hours(2),
        ));
        source.recording_bounds.push(ArchivedRecordingBound {
            capability_id: archive_id,
            recording_since: backup - Duration::days(10),
        });
        let bytes = export_history("owner", "active", &source, &key(), backup).unwrap();

        let mut current = HistorySnapshot::default();
        current.capabilities.push(capability(local_id, "power"));
        current.recording_bounds.push(ArchivedRecordingBound {
            capability_id: local_id,
            recording_since: backup - Duration::days(3),
        });
        let resumed = backup + Duration::hours(2);
        let restored = import_history(
            "owner",
            "active",
            &current,
            &bytes,
            &key(),
            resumed,
            Some("owner-1"),
        )
        .unwrap();
        assert_eq!(restored.snapshot.capabilities.len(), 1);
        assert_eq!(restored.snapshot.capabilities[0].id, local_id);
        assert!(restored.snapshot.capabilities[0].tombstoned_at.is_none());
        assert_eq!(restored.snapshot.observations.len(), 1);
        let observation = &restored.snapshot.observations[0];
        assert_eq!(observation.observation_id, "obs-stable");
        assert_eq!(observation.capability_id, local_id);
        assert_eq!(observation.observed_at, observed_at);
        assert_eq!(observation.constraint_revision_id, "rev-on-obs");
        assert_eq!(restored.snapshot.power_rollups.len(), 1);
        assert_eq!(restored.snapshot.power_rollups[0].capability_id, local_id);
        assert_eq!(
            restored.snapshot.recording_bounds[0].recording_since,
            backup - Duration::days(10)
        );
    }

    #[test]
    fn restoring_the_same_archive_twice_does_not_duplicate_rows() {
        let backup = at_backup();
        let source = rich_history();
        let bytes = export_history("owner", "active", &source, &key(), backup).unwrap();
        let resumed = backup + Duration::hours(3);
        let first = import_history(
            "owner",
            "active",
            &HistorySnapshot::default(),
            &bytes,
            &key(),
            resumed,
            Some("owner-1"),
        )
        .unwrap();
        let second = import_history(
            "owner",
            "active",
            &first.snapshot,
            &bytes,
            &key(),
            resumed,
            Some("owner-1"),
        )
        .unwrap();
        assert_eq!(
            first.snapshot.observations.len(),
            second.snapshot.observations.len()
        );
        assert_eq!(
            first.snapshot.observation_keys.len(),
            second.snapshot.observation_keys.len()
        );
        assert_eq!(
            first.snapshot.power_rollups.len(),
            second.snapshot.power_rollups.len()
        );
        assert_eq!(
            first.snapshot.gauge_rollups.len(),
            second.snapshot.gauge_rollups.len()
        );
        assert_eq!(
            first.snapshot.energy_rollups.len(),
            second.snapshot.energy_rollups.len()
        );
        assert_eq!(
            second
                .snapshot
                .gaps
                .iter()
                .filter(|gap| gap.reason == GapReason::Restore.as_str())
                .count(),
            1
        );
    }

    #[test]
    fn restore_opens_one_gap_from_snapshot_until_recording_resumes() {
        let backup = at_backup();
        let bytes = export_history("owner", "active", &rich_history(), &key(), backup).unwrap();
        let resumed = backup + Duration::hours(5);
        let restored = import_history(
            "owner",
            "active",
            &HistorySnapshot::default(),
            &bytes,
            &key(),
            resumed,
            Some("owner-1"),
        )
        .unwrap();
        let restore_gaps: Vec<_> = restored
            .snapshot
            .gaps
            .iter()
            .filter(|gap| gap.reason == "restore")
            .collect();
        assert_eq!(restore_gaps.len(), 1);
        assert!(restore_gaps[0].capability_id.is_none());
        assert_eq!(restore_gaps[0].onset, backup);
        assert_eq!(restore_gaps[0].until, Some(resumed));
        let member = member_history_gap(GapReason::Restore);
        let rendered = serde_json::to_string(&member).unwrap();
        assert_eq!(member.safe_reason, "gap");
        assert!(!rendered.contains("restore"));
        assert!(!rendered.contains(GapReason::Restore.as_str()));
    }

    #[test]
    fn restore_drops_rows_expired_at_backup_or_outside_retention_now() {
        let backup = at_backup();
        let power = Uuid::from_u128(11);
        let mut source = HistorySnapshot::default();
        source.snapshot_at = backup;
        source.capabilities.push(capability(power, "power"));
        source.observations.push(observation(
            "obs-expired-at-backup",
            power,
            "power",
            "W",
            backup - Duration::hours(49),
            4,
            "rev-old",
        ));
        source.observations.push(observation(
            "obs-expires-before-resume",
            power,
            "power",
            "W",
            backup - Duration::hours(10),
            5,
            "rev-mid",
        ));
        source.observations.push(observation(
            "obs-still-retained",
            power,
            "power",
            "W",
            backup - Duration::minutes(30),
            6,
            "rev-new",
        ));
        source.power_rollups.push(power_rollup(
            power,
            "one_minute",
            backup - Duration::days(8),
        ));
        source
            .power_rollups
            .push(power_rollup(power, "daily", backup - Duration::days(30)));
        let bytes = seal_archive(&source, &key()).unwrap();
        let resumed = backup + Duration::hours(40);
        let restored = import_history(
            "owner",
            "active",
            &HistorySnapshot::default(),
            &bytes,
            &key(),
            resumed,
            Some("owner-1"),
        )
        .unwrap();
        let ids = observation_ids(&restored.snapshot);
        assert!(!ids.contains("obs-expired-at-backup"));
        assert!(!ids.contains("obs-expires-before-resume"));
        assert!(ids.contains("obs-still-retained"));
        assert!(
            !restored
                .snapshot
                .power_rollups
                .iter()
                .any(|rollup| rollup.resolution == "one_minute")
        );
        assert!(
            restored
                .snapshot
                .power_rollups
                .iter()
                .any(|rollup| rollup.resolution == "daily")
        );
    }

    #[test]
    fn tombstoned_capability_stays_tombstoned_while_history_returns() {
        let backup = at_backup();
        let archive_id = Uuid::from_u128(31);
        let local_id = Uuid::from_u128(32);
        let tombstoned_at = backup - Duration::days(1);
        let observed_at = backup - Duration::minutes(20);
        let mut source = HistorySnapshot::default();
        source.capabilities.push(capability(archive_id, "power"));
        source.observations.push(observation(
            "obs-tomb",
            archive_id,
            "power",
            "W",
            observed_at,
            7,
            "rev-tomb",
        ));
        let bytes = export_history("owner", "active", &source, &key(), backup).unwrap();
        let mut current = HistorySnapshot::default();
        let mut local = capability(local_id, "power");
        local.tombstoned_at = Some(tombstoned_at);
        current.capabilities.push(local);
        let restored = import_history(
            "owner",
            "active",
            &current,
            &bytes,
            &key(),
            backup + Duration::minutes(10),
            Some("owner-1"),
        )
        .unwrap();
        assert_eq!(restored.snapshot.capabilities.len(), 1);
        assert_eq!(restored.snapshot.capabilities[0].id, local_id);
        assert_eq!(
            restored.snapshot.capabilities[0].tombstoned_at,
            Some(tombstoned_at)
        );
        assert_eq!(restored.snapshot.observations.len(), 1);
        assert_eq!(restored.snapshot.observations[0].capability_id, local_id);
        assert_eq!(restored.snapshot.observations[0].observation_id, "obs-tomb");
        assert_eq!(restored.snapshot.observations[0].observed_at, observed_at);
    }

    #[test]
    fn restore_audit_is_written_only_when_restore_commits() {
        let backup = at_backup();
        let bytes = export_history("owner", "active", &rich_history(), &key(), backup).unwrap();
        let mut snapshot = HistorySnapshot::default();
        let mut audits = Vec::new();
        let attempt = |current: &HistorySnapshot,
                       archive: &[u8],
                       backup_key: &BackupKey,
                       resumed_at: DateTime<Utc>,
                       role: &str| {
            import_history(
                role,
                "active",
                current,
                archive,
                backup_key,
                resumed_at,
                Some("owner-1"),
            )
        };
        let rejected = attempt(
            &snapshot,
            b"not-a-backup",
            &key(),
            backup + Duration::hours(1),
            "owner",
        );
        assert!(rejected.is_err());
        let wrong_key = BackupKey::from_bytes([3u8; 32]);
        let rejected = attempt(
            &snapshot,
            &bytes,
            &wrong_key,
            backup + Duration::hours(1),
            "owner",
        );
        assert!(rejected.is_err());
        let rejected = attempt(
            &snapshot,
            &bytes,
            &key(),
            backup + Duration::hours(1),
            "member",
        );
        assert!(matches!(rejected, Err(BackupError::Forbidden)));
        assert!(audits.is_empty());
        assert!(snapshot.observations.is_empty());
        let restored = attempt(
            &snapshot,
            &bytes,
            &key(),
            backup + Duration::hours(1),
            "owner",
        )
        .unwrap();
        audits.push(restored.audit.kind);
        snapshot = restored.snapshot;
        assert_eq!(audits, vec![AuditKind::Restore]);
        let before = snapshot.clone();
        let rejected = attempt(
            &snapshot,
            &bytes,
            &key(),
            backup - Duration::seconds(1),
            "owner",
        );
        assert!(rejected.is_err());
        assert_eq!(audits, vec![AuditKind::Restore]);
        assert_eq!(snapshot, before);
    }

    #[test]
    fn members_cannot_export_or_restore_history() {
        let backup = at_backup();
        let source = rich_history();
        assert_eq!(
            export_history("member", "active", &source, &key(), backup),
            Err(BackupError::Forbidden)
        );
        assert_eq!(
            export_history("", "", &source, &key(), backup),
            Err(BackupError::Unauthenticated)
        );
        assert_eq!(
            export_history("owner", "pending", &source, &key(), backup),
            Err(BackupError::Forbidden)
        );
        let bytes = export_history("owner", "active", &source, &key(), backup).unwrap();
        assert!(matches!(
            import_history(
                "member",
                "active",
                &HistorySnapshot::default(),
                &bytes,
                &key(),
                backup + Duration::hours(1),
                Some("member-1"),
            ),
            Err(BackupError::Forbidden)
        ));
    }
}
