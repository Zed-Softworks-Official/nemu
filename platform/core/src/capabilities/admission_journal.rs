use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use chrono::{DateTime, SecondsFormat, Utc};
use serde::Serialize;
use serde::ser::{SerializeStruct, Serializer};
use thiserror::Error;
use uuid::Uuid;

use super::CapabilityId;

const MAX_FINALIZED_GAPS: usize = 64;
const JOURNAL_HEADER: &str = "NEMU_HISTORY_JOURNAL 1";

/// Recording-loss reasons stored on History gaps. `disk_floor` is included for
/// NEM-26; this ticket finalizes the other three.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum GapReason {
    UntrustedTime,
    StorageFailure,
    QueueLoss,
    DiskFloor,
    /// Downtime from a History backup snapshot until recording resumes.
    /// Member-facing History still says only that a gap exists.
    Restore,
}

impl GapReason {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::UntrustedTime => "untrusted_time",
            Self::StorageFailure => "storage_failure",
            Self::QueueLoss => "queue_loss",
            Self::DiskFloor => "disk_floor",
            Self::Restore => "restore",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "untrusted_time" => Some(Self::UntrustedTime),
            "storage_failure" => Some(Self::StorageFailure),
            "queue_loss" => Some(Self::QueueLoss),
            "disk_floor" => Some(Self::DiskFloor),
            "restore" => Some(Self::Restore),
            _ => None,
        }
    }
}

/// `Home` is stored as a null capability scope.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum GapScope {
    Home,
    Capability(CapabilityId),
}

impl GapScope {
    fn parse(value: &str) -> Option<Self> {
        if value == "*" {
            return Some(Self::Home);
        }
        let id = Uuid::parse_str(value).ok()?;
        Some(Self::Capability(CapabilityId::from_uuid(id)))
    }

    fn as_token(self) -> String {
        match self {
            Self::Home => "*".to_string(),
            Self::Capability(id) => id.into_uuid().to_string(),
        }
    }

    fn capability_id(self) -> Option<Uuid> {
        match self {
            Self::Home => None,
            Self::Capability(id) => Some(id.into_uuid()),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum GapAccounting {
    Certain,
    Uncertain,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GapInterval {
    pub reason: GapReason,
    pub scope: GapScope,
    pub onset: DateTime<Utc>,
    pub until: Option<DateTime<Utc>>,
}

impl Serialize for GapInterval {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let mut state = serializer.serialize_struct("GapInterval", 4)?;
        state.serialize_field("reason", self.reason.as_str())?;
        state.serialize_field("capabilityId", &self.scope.capability_id())?;
        state.serialize_field("onset", &self.onset)?;
        state.serialize_field("until", &self.until)?;
        state.end()
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FinalizedGap {
    pub reason: GapReason,
    pub scope: GapScope,
    pub onset: DateTime<Utc>,
    pub until: DateTime<Utc>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QueueSnapshot {
    pub queued: usize,
    pub inflight: usize,
    pub capacity: usize,
    pub pressured: bool,
}

impl QueueSnapshot {
    pub fn idle() -> Self {
        Self {
            queued: 0,
            inflight: 0,
            capacity: 0,
            pressured: false,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum HealthStatus {
    Ok,
    Degraded,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryHealth {
    pub status: HealthStatus,
    pub gap_accounting: GapAccounting,
    pub loss_warning: bool,
    pub queue: QueueSnapshot,
    pub gaps: Vec<GapInterval>,
}

impl HistoryHealth {
    fn healthy(queue: QueueSnapshot) -> Self {
        Self {
            status: HealthStatus::Ok,
            gap_accounting: GapAccounting::Certain,
            loss_warning: false,
            queue,
            gaps: Vec::new(),
        }
    }

    pub fn member_projection(&self) -> MemberHistoryProjection {
        project_member_history(self)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MemberReason {
    Gap,
    Coverage,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MemberHistoryProjection {
    pub reasons: Vec<MemberReason>,
}

/// Member-facing view of History health. Operational reason codes, queue state,
/// onset, and disk detail stay on the Owner health type.
pub fn project_member_history(health: &HistoryHealth) -> MemberHistoryProjection {
    let mut reasons = Vec::new();
    if !health.gaps.is_empty() {
        reasons.push(MemberReason::Gap);
    }
    if health.gap_accounting == GapAccounting::Uncertain {
        reasons.push(MemberReason::Coverage);
    }
    MemberHistoryProjection { reasons }
}

#[derive(Debug, Error)]
pub enum JournalError {
    #[error("admission journal write failed: {0}")]
    Io(String),
    #[error("history gap reconcile failed: {0}")]
    Database(String),
}

pub trait GapRecorder {
    fn upsert_gap(&mut self, gap: &FinalizedGap) -> Result<(), JournalError>;
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Record {
    Provisional {
        reason: GapReason,
        scope: GapScope,
        onset: DateTime<Utc>,
    },
    Finalized {
        reason: GapReason,
        scope: GapScope,
        onset: DateTime<Utc>,
        until: DateTime<Utc>,
    },
}

impl Record {
    fn is_finalized(self) -> bool {
        matches!(self, Self::Finalized { .. })
    }

    fn reason(self) -> GapReason {
        match self {
            Self::Provisional { reason, .. } | Self::Finalized { reason, .. } => reason,
        }
    }

    fn scope(self) -> GapScope {
        match self {
            Self::Provisional { scope, .. } | Self::Finalized { scope, .. } => scope,
        }
    }

    fn onset(self) -> DateTime<Utc> {
        match self {
            Self::Provisional { onset, .. } | Self::Finalized { onset, .. } => onset,
        }
    }

    fn until(self) -> DateTime<Utc> {
        match self {
            Self::Provisional { onset, .. } => onset,
            Self::Finalized { until, .. } => until,
        }
    }

    fn interval(self) -> GapInterval {
        GapInterval {
            reason: self.reason(),
            scope: self.scope(),
            onset: self.onset(),
            until: match self {
                Self::Provisional { .. } => None,
                Self::Finalized { until, .. } => Some(until),
            },
        }
    }
}

enum JournalStore {
    Memory(String),
    File(PathBuf),
}

impl JournalStore {
    fn read(&self) -> std::io::Result<String> {
        match self {
            Self::Memory(contents) => Ok(contents.clone()),
            Self::File(path) => match std::fs::read_to_string(path) {
                Ok(contents) => Ok(contents),
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(String::new()),
                Err(error) => Err(error),
            },
        }
    }

    fn write(&mut self, contents: &str) -> std::io::Result<()> {
        match self {
            Self::Memory(slot) => {
                *slot = contents.to_string();
                Ok(())
            }
            Self::File(path) => write_fsynced(path, contents),
        }
    }
}

pub struct AdmissionJournal {
    store: JournalStore,
    records: Vec<Record>,
    accounting: GapAccounting,
    pending_disk_floor: Option<DateTime<Utc>>,
    fail_next_write: bool,
    broken: bool,
}

impl AdmissionJournal {
    pub fn open_in_memory() -> Result<Self, JournalError> {
        Ok(Self::empty(JournalStore::Memory(String::new())))
    }

    pub(crate) fn unpersisted_uncertain() -> Self {
        Self {
            broken: true,
            accounting: GapAccounting::Uncertain,
            ..Self::empty(JournalStore::Memory(String::new()))
        }
    }

    pub fn open(path: &Path) -> Result<Self, JournalError> {
        Self::open_at(path, Utc::now())
    }

    pub fn open_at(path: &Path, opened_at: DateTime<Utc>) -> Result<Self, JournalError> {
        let store = JournalStore::File(path.to_path_buf());
        let mut journal = Self::load(store)?;
        journal.finalize_provisionals(opened_at);
        Ok(journal)
    }

    fn empty(store: JournalStore) -> Self {
        Self {
            store,
            records: Vec::new(),
            accounting: GapAccounting::Certain,
            pending_disk_floor: None,
            fail_next_write: false,
            broken: false,
        }
    }

    fn load(store: JournalStore) -> Result<Self, JournalError> {
        let contents = store
            .read()
            .map_err(|error| JournalError::Io(error.to_string()))?;
        let (records, accounting) = parse_journal(&contents);
        Ok(Self {
            store,
            records,
            accounting,
            pending_disk_floor: None,
            fail_next_write: false,
            broken: false,
        })
    }

    fn finalize_provisionals(&mut self, opened_at: DateTime<Utc>) {
        let before = self.records.clone();
        for record in &mut self.records {
            if let Record::Provisional {
                reason,
                scope,
                onset,
            } = *record
            {
                let until = if opened_at > onset { opened_at } else { onset };
                *record = Record::Finalized {
                    reason,
                    scope,
                    onset,
                    until,
                };
            }
        }
        self.coalesce();
        self.enforce_bound();
        if self.records != before {
            if self.persist().is_err() {
                self.accounting = GapAccounting::Uncertain;
            }
        }
    }

    pub fn open_provisional(
        &mut self,
        reason: GapReason,
        scope: GapScope,
        onset: DateTime<Utc>,
    ) -> Result<(), JournalError> {
        if let Some(existing) = self.provisional_onset(reason, scope) {
            if onset >= existing {
                return Ok(());
            }
        }
        let snapshot = self.records.clone();
        self.records.retain(|record| {
            !matches!(
                record,
                Record::Provisional {
                    reason: current_reason,
                    scope: current_scope,
                    ..
                } if *current_reason == reason && *current_scope == scope
            )
        });
        self.records.push(Record::Provisional {
            reason,
            scope,
            onset,
        });
        self.commit(snapshot)
    }

    /// Removes queue-pressure and storage-failure provisionals. A successful
    /// drain does not create a gap and does not lift a disk-floor suspension.
    pub fn clear_provisional(&mut self) -> Result<(), JournalError> {
        self.dismiss_reasons(&[GapReason::QueueLoss, GapReason::StorageFailure])
    }

    pub(crate) fn dismiss_provisional(&mut self, reason: GapReason) -> Result<(), JournalError> {
        self.dismiss_reasons(&[reason])
    }

    fn dismiss_reasons(&mut self, reasons: &[GapReason]) -> Result<(), JournalError> {
        let snapshot = self.records.clone();
        self.records.retain(|record| match record {
            Record::Provisional { reason, .. } => !reasons.contains(reason),
            Record::Finalized { .. } => true,
        });
        if self.records == snapshot {
            return Ok(());
        }
        self.commit(snapshot)
    }

    pub fn finalize(
        &mut self,
        reason: GapReason,
        scope: GapScope,
        onset: DateTime<Utc>,
        until: DateTime<Utc>,
    ) -> Result<(), JournalError> {
        let snapshot = self.records.clone();
        self.records.retain(|record| {
            !matches!(
                record,
                Record::Provisional {
                    reason: current_reason,
                    scope: current_scope,
                    ..
                } if *current_reason == reason && *current_scope == scope
            )
        });
        self.records.push(Record::Finalized {
            reason,
            scope,
            onset,
            until,
        });
        self.coalesce();
        self.enforce_bound();
        self.commit(snapshot)
    }

    pub fn reconcile<R: GapRecorder>(&mut self, recorder: &mut R) -> Result<(), JournalError> {
        let gaps = self.finalized();
        if gaps.is_empty() {
            return Ok(());
        }
        for gap in &gaps {
            recorder.upsert_gap(gap)?;
        }
        self.forget_reconciled(&gaps)
    }

    pub(crate) fn forget_reconciled(&mut self, gaps: &[FinalizedGap]) -> Result<(), JournalError> {
        let snapshot = self.records.clone();
        self.records.retain(|record| match record {
            Record::Finalized {
                reason,
                scope,
                onset,
                until,
            } => !gaps.iter().any(|gap| {
                gap.reason == *reason
                    && gap.scope == *scope
                    && gap.onset == *onset
                    && gap.until == *until
            }),
            Record::Provisional { .. } => true,
        });
        if self.records == snapshot {
            return Ok(());
        }
        self.commit(snapshot)
    }

    pub fn fail_next_write(&mut self) {
        self.fail_next_write = true;
    }

    pub fn provisional(&self) -> Vec<GapInterval> {
        self.records
            .iter()
            .copied()
            .filter(|record| !record.is_finalized())
            .map(Record::interval)
            .collect()
    }

    pub fn finalized(&self) -> Vec<FinalizedGap> {
        self.records
            .iter()
            .copied()
            .filter_map(|record| match record {
                Record::Finalized {
                    reason,
                    scope,
                    onset,
                    until,
                } => Some(FinalizedGap {
                    reason,
                    scope,
                    onset,
                    until,
                }),
                Record::Provisional { .. } => None,
            })
            .collect()
    }

    pub fn gap_accounting(&self) -> GapAccounting {
        self.accounting
    }

    pub fn loss_warning(&self) -> bool {
        self.records.iter().any(|record| !record.is_finalized())
            || self.accounting == GapAccounting::Uncertain
    }

    pub fn health(&self, queue: QueueSnapshot) -> HistoryHealth {
        let loss_warning = self.loss_warning();
        HistoryHealth {
            status: if loss_warning {
                HealthStatus::Degraded
            } else {
                HealthStatus::Ok
            },
            gap_accounting: self.accounting,
            loss_warning,
            queue,
            gaps: self.records.iter().copied().map(Record::interval).collect(),
        }
    }

    pub fn pending_disk_floor(&self) -> Option<DateTime<Utc>> {
        self.pending_disk_floor
    }

    pub fn persist_disk_floor(&mut self) -> Result<(), JournalError> {
        let Some(onset) = self.pending_disk_floor.take() else {
            return Ok(());
        };
        let result = self.open_provisional(GapReason::DiskFloor, GapScope::Home, onset);
        if result.is_err() {
            self.remember_disk_floor(onset);
        }
        result
    }

    fn remember_disk_floor(&mut self, onset: DateTime<Utc>) {
        self.pending_disk_floor = Some(match self.pending_disk_floor {
            Some(existing) if existing <= onset => existing,
            _ => onset,
        });
    }

    fn provisional_onset(&self, reason: GapReason, scope: GapScope) -> Option<DateTime<Utc>> {
        self.records.iter().find_map(|record| match record {
            Record::Provisional {
                reason: current_reason,
                scope: current_scope,
                onset,
            } if *current_reason == reason && *current_scope == scope => Some(*onset),
            _ => None,
        })
    }

    fn coalesce(&mut self) {
        let mut provisionals = Vec::new();
        let mut finalized = Vec::new();
        for record in self.records.drain(..) {
            if record.is_finalized() {
                finalized.push(record);
            } else {
                provisionals.push(record);
            }
        }
        finalized.sort_by_key(|record| {
            (
                record.reason(),
                record.scope(),
                record.onset(),
                record.until(),
            )
        });
        let mut merged: Vec<Record> = Vec::new();
        for record in finalized {
            if let Some(Record::Finalized {
                reason,
                scope,
                until,
                ..
            }) = merged.last_mut()
                && *reason == record.reason()
                && *scope == record.scope()
                && record.onset() <= *until
            {
                if record.until() > *until {
                    *until = record.until();
                }
            } else {
                merged.push(record);
            }
        }
        self.records = provisionals;
        self.records.extend(merged);
    }

    fn enforce_bound(&mut self) {
        while self
            .records
            .iter()
            .filter(|record| record.is_finalized())
            .count()
            > MAX_FINALIZED_GAPS
        {
            if !self.fold_oldest_same_reason() {
                break;
            }
        }
    }

    fn fold_oldest_same_reason(&mut self) -> bool {
        let mut provisionals = Vec::new();
        let mut finalized = Vec::new();
        for record in self.records.drain(..) {
            if record.is_finalized() {
                finalized.push(record);
            } else {
                provisionals.push(record);
            }
        }
        finalized.sort_by_key(|record| record.onset());
        let mut pair = None;
        for left in 0..finalized.len() {
            for right in (left + 1)..finalized.len() {
                if finalized[left].reason() == finalized[right].reason() {
                    pair = Some((left, right));
                    break;
                }
            }
            if pair.is_some() {
                break;
            }
        }
        let Some((left, right)) = pair else {
            self.records = provisionals;
            self.records.extend(finalized);
            return false;
        };
        let second = finalized.remove(right);
        let first = finalized.remove(left);
        let scope = if first.scope() == second.scope() {
            first.scope()
        } else {
            GapScope::Home
        };
        finalized.push(Record::Finalized {
            reason: first.reason(),
            scope,
            onset: first.onset().min(second.onset()),
            until: first.until().max(second.until()),
        });
        self.records = provisionals;
        self.records.extend(finalized);
        self.coalesce();
        true
    }

    fn commit(&mut self, snapshot: Vec<Record>) -> Result<(), JournalError> {
        if let Err(error) = self.persist() {
            self.records = snapshot;
            self.accounting = GapAccounting::Uncertain;
            let _ = self.persist();
            return Err(error);
        }
        Ok(())
    }

    fn persist(&mut self) -> Result<(), JournalError> {
        if self.broken || self.fail_next_write {
            self.fail_next_write = false;
            self.accounting = GapAccounting::Uncertain;
            return Err(JournalError::Io(
                "admission journal write failed".to_string(),
            ));
        }
        let rendered = self.render();
        match self.store.write(&rendered) {
            Ok(()) => Ok(()),
            Err(error) => {
                self.accounting = GapAccounting::Uncertain;
                Err(JournalError::Io(error.to_string()))
            }
        }
    }

    fn render(&self) -> String {
        let mut lines = vec![
            JOURNAL_HEADER.to_string(),
            format!(
                "accounting {}",
                match self.accounting {
                    GapAccounting::Certain => "certain",
                    GapAccounting::Uncertain => "uncertain",
                }
            ),
        ];
        for record in &self.records {
            lines.push(render_record(*record));
        }
        let mut text = lines.join("\n");
        text.push('\n');
        text
    }
}

fn render_record(record: Record) -> String {
    match record {
        Record::Provisional {
            reason,
            scope,
            onset,
        } => format!(
            "P {} {} {}",
            reason.as_str(),
            scope.as_token(),
            format_time(onset)
        ),
        Record::Finalized {
            reason,
            scope,
            onset,
            until,
        } => format!(
            "F {} {} {} {}",
            reason.as_str(),
            scope.as_token(),
            format_time(onset),
            format_time(until)
        ),
    }
}

fn format_time(time: DateTime<Utc>) -> String {
    time.to_rfc3339_opts(SecondsFormat::Secs, true)
}

fn parse_journal(contents: &str) -> (Vec<Record>, GapAccounting) {
    let mut accounting = GapAccounting::Certain;
    let mut records = Vec::new();
    for line in contents.lines() {
        let line = line.trim();
        if line.is_empty() || line == JOURNAL_HEADER {
            continue;
        }
        if let Some(value) = line.strip_prefix("accounting ") {
            if value.trim() == "uncertain" {
                accounting = GapAccounting::Uncertain;
            }
            continue;
        }
        match parse_record(line) {
            Some(record) => records.push(record),
            None => accounting = GapAccounting::Uncertain,
        }
    }
    (records, accounting)
}

fn parse_record(line: &str) -> Option<Record> {
    let mut parts = line.split_whitespace();
    let kind = parts.next()?;
    let reason = GapReason::parse(parts.next()?)?;
    let scope = GapScope::parse(parts.next()?)?;
    let onset = parse_time(parts.next()?)?;
    match kind {
        "P" => {
            if parts.next().is_some() {
                return None;
            }
            Some(Record::Provisional {
                reason,
                scope,
                onset,
            })
        }
        "F" => {
            let until = parse_time(parts.next()?)?;
            if parts.next().is_some() {
                return None;
            }
            Some(Record::Finalized {
                reason,
                scope,
                onset,
                until,
            })
        }
        _ => None,
    }
}

fn parse_time(value: &str) -> Option<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(value)
        .ok()
        .map(|time| time.with_timezone(&Utc))
}

fn write_fsynced(path: &Path, contents: &str) -> std::io::Result<()> {
    let parent = match path.parent() {
        Some(parent) if !parent.as_os_str().is_empty() => parent,
        _ => Path::new("."),
    };
    std::fs::create_dir_all(parent)?;
    let mut temporary_name = path.file_name().unwrap_or_default().to_os_string();
    temporary_name.push(".tmp");
    let temporary = parent.join(temporary_name);
    {
        use std::io::Write;
        let mut file = std::fs::OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .open(&temporary)?;
        file.write_all(contents.as_bytes())?;
        file.sync_all()?;
    }
    std::fs::rename(&temporary, path)?;
    if let Ok(directory) = std::fs::File::open(parent) {
        let _ = directory.sync_all();
    }
    Ok(())
}

static INSTALLED: Mutex<Option<Arc<Mutex<AdmissionJournal>>>> = Mutex::new(None);
static PENDING_DISK_FLOOR: Mutex<Option<DateTime<Utc>>> = Mutex::new(None);
static QUEUE: Mutex<QueueSnapshot> = Mutex::new(QueueSnapshot {
    queued: 0,
    inflight: 0,
    capacity: 0,
    pressured: false,
});

/// Records a disk-floor admission stop for NEM-26.
///
/// The note stays in memory. The History flush loop persists the provisional
/// gap, so this function does not fsync and does not run on the Command path's
/// critical section beyond a mutex store.
pub fn note_disk_floor(onset: DateTime<Utc>) {
    if let Some(journal) = INSTALLED
        .lock()
        .expect("admission journal install poisoned")
        .clone()
    {
        journal
            .lock()
            .expect("admission journal poisoned")
            .remember_disk_floor(onset);
        return;
    }
    let mut pending = PENDING_DISK_FLOOR.lock().expect("disk floor note poisoned");
    *pending = Some(match *pending {
        Some(existing) if existing <= onset => existing,
        _ => onset,
    });
}

#[cfg(test)]
pub(crate) fn clear_disk_floor_for_test() {
    *PENDING_DISK_FLOOR.lock().expect("disk floor note poisoned") = None;
    if let Some(journal) = INSTALLED
        .lock()
        .expect("admission journal install poisoned")
        .clone()
    {
        journal
            .lock()
            .expect("admission journal poisoned")
            .pending_disk_floor = None;
    }
}

#[cfg(test)]
pub(crate) fn disk_floor_onsets_for_test() -> Vec<DateTime<Utc>> {
    if let Some(journal) = INSTALLED
        .lock()
        .expect("admission journal install poisoned")
        .clone()
    {
        return journal
            .lock()
            .expect("admission journal poisoned")
            .pending_disk_floor
            .into_iter()
            .collect();
    }
    PENDING_DISK_FLOOR
        .lock()
        .expect("disk floor note poisoned")
        .into_iter()
        .collect()
}

pub(crate) fn install(journal: Arc<Mutex<AdmissionJournal>>) {
    if let Some(onset) = PENDING_DISK_FLOOR
        .lock()
        .expect("disk floor note poisoned")
        .take()
    {
        journal
            .lock()
            .expect("admission journal poisoned")
            .remember_disk_floor(onset);
    }
    *INSTALLED
        .lock()
        .expect("admission journal install poisoned") = Some(journal);
}

fn clear_install() {
    *INSTALLED
        .lock()
        .expect("admission journal install poisoned") = None;
}

pub(crate) fn publish_queue(snapshot: QueueSnapshot) {
    *QUEUE.lock().expect("history queue snapshot poisoned") = snapshot;
}

pub(crate) fn current_health() -> HistoryHealth {
    let queue = *QUEUE.lock().expect("history queue snapshot poisoned");
    let Some(journal) = INSTALLED
        .lock()
        .expect("admission journal install poisoned")
        .clone()
    else {
        return HistoryHealth::healthy(queue);
    };
    journal
        .lock()
        .expect("admission journal poisoned")
        .health(queue)
}

pub(crate) fn journal_path() -> PathBuf {
    if let Ok(path) = std::env::var("NEMU_HISTORY_JOURNAL_PATH") {
        if !path.is_empty() {
            return PathBuf::from(path);
        }
    }
    let dir = std::env::var("NEMU_DATA_DIR").unwrap_or_else(|_| ".".to_string());
    PathBuf::from(dir).join("history-admission.journal")
}

pub(crate) fn upsert_history_gap(
    conn: &mut diesel::PgConnection,
    gap: &FinalizedGap,
) -> Result<(), diesel::result::Error> {
    use diesel::prelude::*;
    use diesel::sql_types::{Text, Timestamptz, Uuid as SqlUuid};

    conn.transaction(|conn| {
        diesel::sql_query("SET LOCAL statement_timeout = '2s'").execute(conn)?;
        match gap.scope {
            GapScope::Capability(id) => {
                diesel::sql_query(
                    "INSERT INTO history_gaps (capability_id, reason, onset, until) \
                     VALUES ($1, $2, $3, $4) \
                     ON CONFLICT (reason, capability_id, onset) WHERE capability_id IS NOT NULL \
                     DO UPDATE SET until = EXCLUDED.until",
                )
                .bind::<SqlUuid, _>(id.into_uuid())
                .bind::<Text, _>(gap.reason.as_str())
                .bind::<Timestamptz, _>(gap.onset)
                .bind::<Timestamptz, _>(gap.until)
                .execute(conn)?;
            }
            GapScope::Home => {
                diesel::sql_query(
                    "INSERT INTO history_gaps (capability_id, reason, onset, until) \
                     VALUES (NULL, $1, $2, $3) \
                     ON CONFLICT (reason, onset) WHERE capability_id IS NULL \
                     DO UPDATE SET until = EXCLUDED.until",
                )
                .bind::<Text, _>(gap.reason.as_str())
                .bind::<Timestamptz, _>(gap.onset)
                .bind::<Timestamptz, _>(gap.until)
                .execute(conn)?;
            }
        }
        Ok(())
    })
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use chrono::TimeZone;
    use uuid::Uuid;

    use super::*;

    fn at(second: i64) -> DateTime<Utc> {
        Utc.timestamp_opt(second, 0).single().unwrap()
    }

    fn temp_path() -> std::path::PathBuf {
        std::env::temp_dir().join(format!(
            "nemu-history-journal-{}-{}",
            std::process::id(),
            Uuid::new_v4()
        ))
    }

    #[test]
    fn successful_clear_removes_provisional_without_a_gap() {
        let mut journal = AdmissionJournal::open_in_memory().unwrap();
        let onset = at(1_700_000_000);
        journal
            .open_provisional(GapReason::QueueLoss, GapScope::Home, onset)
            .unwrap();
        assert!(journal.loss_warning());
        assert_eq!(journal.gap_accounting(), GapAccounting::Certain);
        assert_eq!(journal.provisional().len(), 1);
        assert_eq!(journal.provisional()[0].reason, GapReason::QueueLoss);
        assert_eq!(journal.provisional()[0].onset, onset);
        assert_eq!(journal.provisional()[0].until, None);

        journal.clear_provisional().unwrap();
        assert!(journal.provisional().is_empty());
        assert!(journal.finalized().is_empty());
        assert!(!journal.loss_warning());
    }

    #[test]
    fn clear_leaves_disk_floor_and_finalized_gaps() {
        let mut journal = AdmissionJournal::open_in_memory().unwrap();
        let onset = at(1_700_000_000);
        journal
            .open_provisional(GapReason::DiskFloor, GapScope::Home, onset)
            .unwrap();
        journal
            .finalize(
                GapReason::UntrustedTime,
                GapScope::Home,
                onset,
                at(1_700_000_050),
            )
            .unwrap();
        journal
            .open_provisional(GapReason::StorageFailure, GapScope::Home, onset)
            .unwrap();
        journal.clear_provisional().unwrap();
        assert!(
            journal
                .provisional()
                .iter()
                .any(|gap| gap.reason == GapReason::DiskFloor)
        );
        assert!(
            journal
                .provisional()
                .iter()
                .all(|gap| gap.reason != GapReason::StorageFailure)
        );
        assert_eq!(journal.finalized().len(), 1);
        assert_eq!(journal.finalized()[0].reason, GapReason::UntrustedTime);
    }

    #[test]
    fn finalize_records_reason_and_affected_scope() {
        let mut journal = AdmissionJournal::open_in_memory().unwrap();
        let id = CapabilityId::from_uuid(Uuid::from_u128(7));
        let onset = at(1_700_000_000);
        let until = at(1_700_000_030);
        journal
            .finalize(GapReason::QueueLoss, GapScope::Capability(id), onset, until)
            .unwrap();
        let gaps = journal.finalized();
        assert_eq!(gaps.len(), 1);
        assert_eq!(gaps[0].reason, GapReason::QueueLoss);
        assert_eq!(gaps[0].scope, GapScope::Capability(id));
        assert_eq!(gaps[0].onset, onset);
        assert_eq!(gaps[0].until, until);
        journal.clear_provisional().unwrap();
        assert_eq!(journal.finalized().len(), 1);
    }

    #[test]
    fn unclean_startup_finalizes_unresolved_provisionals() {
        let path = temp_path();
        let onset = at(1_700_000_000);
        {
            let mut journal = AdmissionJournal::open(&path).unwrap();
            journal
                .open_provisional(GapReason::StorageFailure, GapScope::Home, onset)
                .unwrap();
        }
        let opened_at = at(1_700_000_100);
        let journal = AdmissionJournal::open_at(&path, opened_at).unwrap();
        assert!(journal.provisional().is_empty());
        let gaps = journal.finalized();
        assert_eq!(gaps.len(), 1);
        assert_eq!(gaps[0].reason, GapReason::StorageFailure);
        assert_eq!(gaps[0].scope, GapScope::Home);
        assert_eq!(gaps[0].onset, onset);
        assert_eq!(gaps[0].until, opened_at);

        let again = AdmissionJournal::open_at(&path, at(1_700_000_200)).unwrap();
        assert_eq!(again.finalized().len(), 1);
        assert_eq!(again.finalized()[0].until, opened_at);
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn recovery_coalesces_adjacent_losses_only() {
        let mut journal = AdmissionJournal::open_in_memory().unwrap();
        let id = CapabilityId::from_uuid(Uuid::from_u128(9));
        journal
            .finalize(
                GapReason::QueueLoss,
                GapScope::Capability(id),
                at(100),
                at(110),
            )
            .unwrap();
        journal
            .finalize(
                GapReason::QueueLoss,
                GapScope::Capability(id),
                at(110),
                at(130),
            )
            .unwrap();
        assert_eq!(journal.finalized().len(), 1);
        assert_eq!(journal.finalized()[0].onset, at(100));
        assert_eq!(journal.finalized()[0].until, at(130));

        journal
            .finalize(
                GapReason::QueueLoss,
                GapScope::Capability(id),
                at(200),
                at(210),
            )
            .unwrap();
        assert_eq!(journal.finalized().len(), 2);

        journal
            .finalize(
                GapReason::StorageFailure,
                GapScope::Capability(id),
                at(110),
                at(120),
            )
            .unwrap();
        assert_eq!(journal.finalized().len(), 3);

        journal
            .finalize(GapReason::QueueLoss, GapScope::Home, at(100), at(130))
            .unwrap();
        assert_eq!(journal.finalized().len(), 4);
    }

    #[derive(Default)]
    struct FakeRecorder {
        gaps: Vec<FinalizedGap>,
        fail: bool,
    }

    impl GapRecorder for FakeRecorder {
        fn upsert_gap(&mut self, gap: &FinalizedGap) -> Result<(), JournalError> {
            if self.fail {
                return Err(JournalError::Io("recorder failed".into()));
            }
            if let Some(existing) = self.gaps.iter_mut().find(|row| {
                row.reason == gap.reason && row.scope == gap.scope && row.onset == gap.onset
            }) {
                existing.until = gap.until;
            } else {
                self.gaps.push(gap.clone());
            }
            Ok(())
        }
    }

    #[test]
    fn reconcile_is_idempotent_and_drops_reconciled_journal_records() {
        let mut journal = AdmissionJournal::open_in_memory().unwrap();
        let onset = at(100);
        journal
            .open_provisional(GapReason::QueueLoss, GapScope::Home, onset)
            .unwrap();
        journal
            .finalize(GapReason::StorageFailure, GapScope::Home, at(100), at(110))
            .unwrap();
        journal
            .finalize(GapReason::StorageFailure, GapScope::Home, at(110), at(140))
            .unwrap();
        let mut recorder = FakeRecorder::default();
        journal.reconcile(&mut recorder).unwrap();
        assert_eq!(recorder.gaps.len(), 1);
        assert_eq!(recorder.gaps[0].onset, at(100));
        assert_eq!(recorder.gaps[0].until, at(140));
        assert!(journal.finalized().is_empty());
        assert_eq!(journal.provisional().len(), 1);

        journal.reconcile(&mut recorder).unwrap();
        assert_eq!(recorder.gaps.len(), 1);

        recorder
            .upsert_gap(&FinalizedGap {
                reason: GapReason::StorageFailure,
                scope: GapScope::Home,
                onset: at(100),
                until: at(180),
            })
            .unwrap();
        assert_eq!(recorder.gaps.len(), 1);
        assert_eq!(recorder.gaps[0].until, at(180));
    }

    #[test]
    fn failed_reconcile_keeps_journal_records_for_a_later_idempotent_retry() {
        let mut journal = AdmissionJournal::open_in_memory().unwrap();
        journal
            .finalize(GapReason::QueueLoss, GapScope::Home, at(10), at(20))
            .unwrap();
        let mut recorder = FakeRecorder {
            fail: true,
            ..FakeRecorder::default()
        };
        assert!(journal.reconcile(&mut recorder).is_err());
        assert_eq!(journal.finalized().len(), 1);

        recorder.fail = false;
        journal.fail_next_write();
        assert!(journal.reconcile(&mut recorder).is_err());
        assert_eq!(journal.gap_accounting(), GapAccounting::Uncertain);
        assert_eq!(journal.finalized().len(), 1);
        assert_eq!(recorder.gaps.len(), 1);

        journal.reconcile(&mut recorder).unwrap();
        assert!(journal.finalized().is_empty());
        assert_eq!(recorder.gaps.len(), 1);
        assert_eq!(journal.gap_accounting(), GapAccounting::Uncertain);
    }

    #[test]
    fn failed_journal_write_marks_gap_accounting_uncertain() {
        let mut journal = AdmissionJournal::open_in_memory().unwrap();
        journal.fail_next_write();
        let error = journal.open_provisional(GapReason::StorageFailure, GapScope::Home, at(1));
        assert!(error.is_err());
        assert_eq!(journal.gap_accounting(), GapAccounting::Uncertain);
        journal
            .open_provisional(GapReason::QueueLoss, GapScope::Home, at(2))
            .unwrap();
        assert_eq!(journal.gap_accounting(), GapAccounting::Uncertain);
    }

    #[test]
    fn provisional_entry_degrades_history_health() {
        let mut journal = AdmissionJournal::open_in_memory().unwrap();
        let onset = at(1_700_000_000);
        journal
            .open_provisional(GapReason::StorageFailure, GapScope::Home, onset)
            .unwrap();
        let health = journal.health(QueueSnapshot {
            queued: 1024,
            inflight: 64,
            capacity: 1024,
            pressured: true,
        });
        assert_eq!(health.status, HealthStatus::Degraded);
        assert!(health.loss_warning);
        assert_eq!(health.gap_accounting, GapAccounting::Certain);
        assert_eq!(health.queue.queued, 1024);
        assert_eq!(health.queue.pressured, true);
        assert_eq!(health.gaps.len(), 1);
        assert_eq!(health.gaps[0].reason, GapReason::StorageFailure);
        assert_eq!(health.gaps[0].scope, GapScope::Home);
        assert_eq!(health.gaps[0].onset, onset);
        assert_eq!(health.gaps[0].until, None);
    }

    #[test]
    fn member_projection_hides_operational_detail() {
        let health = HistoryHealth {
            status: HealthStatus::Degraded,
            gap_accounting: GapAccounting::Uncertain,
            loss_warning: true,
            queue: QueueSnapshot {
                queued: 1024,
                inflight: 64,
                capacity: 1024,
                pressured: true,
            },
            gaps: vec![
                GapInterval {
                    reason: GapReason::StorageFailure,
                    scope: GapScope::Home,
                    onset: at(10),
                    until: None,
                },
                GapInterval {
                    reason: GapReason::QueueLoss,
                    scope: GapScope::Capability(CapabilityId::from_uuid(Uuid::from_u128(1))),
                    onset: at(10),
                    until: Some(at(12)),
                },
                GapInterval {
                    reason: GapReason::DiskFloor,
                    scope: GapScope::Home,
                    onset: at(10),
                    until: None,
                },
                GapInterval {
                    reason: GapReason::UntrustedTime,
                    scope: GapScope::Home,
                    onset: at(4),
                    until: Some(at(9)),
                },
                GapInterval {
                    reason: GapReason::Restore,
                    scope: GapScope::Home,
                    onset: at(4),
                    until: Some(at(9)),
                },
            ],
        };
        let projected = health.member_projection();
        assert_eq!(
            projected.reasons,
            vec![MemberReason::Gap, MemberReason::Coverage]
        );
        let rendered = format!("{projected:?}");
        assert!(!rendered.contains("storage"));
        assert!(!rendered.contains("queue"));
        assert!(!rendered.contains("disk"));
        assert!(!rendered.contains("1024"));
        assert!(!rendered.contains("untrusted_time"));
        assert!(!rendered.contains("restore"));
    }

    #[test]
    fn member_projection_reports_only_the_safe_reasons_that_apply() {
        let healthy = HistoryHealth {
            status: HealthStatus::Ok,
            gap_accounting: GapAccounting::Certain,
            loss_warning: false,
            queue: QueueSnapshot::idle(),
            gaps: Vec::new(),
        };
        assert!(healthy.member_projection().reasons.is_empty());

        let uncertain = HistoryHealth {
            gap_accounting: GapAccounting::Uncertain,
            ..healthy.clone()
        };
        assert_eq!(
            uncertain.member_projection().reasons,
            vec![MemberReason::Coverage]
        );

        let gap_only = HistoryHealth {
            gaps: vec![GapInterval {
                reason: GapReason::DiskFloor,
                scope: GapScope::Home,
                onset: at(1),
                until: None,
            }],
            ..healthy
        };
        assert_eq!(
            gap_only.member_projection().reasons,
            vec![MemberReason::Gap]
        );
    }

    #[test]
    fn note_disk_floor_records_an_in_memory_request() {
        let journal = Arc::new(Mutex::new(AdmissionJournal::open_in_memory().unwrap()));
        super::install(Arc::clone(&journal));
        note_disk_floor(at(40));
        {
            let journal = journal.lock().expect("journal");
            assert_eq!(journal.pending_disk_floor(), Some(at(40)));
            assert!(journal.provisional().is_empty());
        }
        journal
            .lock()
            .expect("journal")
            .persist_disk_floor()
            .unwrap();
        let journal = journal.lock().expect("journal");
        assert_eq!(journal.pending_disk_floor(), None);
        assert_eq!(journal.provisional().len(), 1);
        assert_eq!(journal.provisional()[0].reason, GapReason::DiskFloor);
        assert_eq!(journal.provisional()[0].scope, GapScope::Home);
        assert_eq!(journal.provisional()[0].onset, at(40));
        super::clear_install();
    }

    #[test]
    fn gap_reasons_include_disk_floor() {
        assert_eq!(GapReason::UntrustedTime.as_str(), "untrusted_time");
        assert_eq!(GapReason::StorageFailure.as_str(), "storage_failure");
        assert_eq!(GapReason::QueueLoss.as_str(), "queue_loss");
        assert_eq!(GapReason::DiskFloor.as_str(), "disk_floor");
        assert_eq!(GapReason::Restore.as_str(), "restore");
        assert_eq!(GapReason::parse("restore"), Some(GapReason::Restore));
    }
}
