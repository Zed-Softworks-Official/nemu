use std::collections::{HashMap, HashSet, VecDeque};
use std::sync::{Arc, Mutex};
use std::time::Duration as StdDuration;

use chrono::{DateTime, Duration, Utc};
use diesel::prelude::*;
use diesel::sql_types::{Timestamptz, Uuid as SqlUuid};
use thiserror::Error;
use uuid::Uuid;

use crate::db::schema::{
    capability_observation_keys, capability_observations, capability_recording_bounds,
};
use crate::state::DbPool;

use super::admission_journal::{self, AdmissionJournal, FinalizedGap, GapReason, GapScope};
use super::{
    CanonicalUnit, CapabilityId, CapabilityKind, CapabilityReading, CapabilityReport,
    HistoryAdmissionOutcome, HistoryRejection, IngestResult, RegisteredCapability, TimeTrust,
};

pub(super) const HISTORY_QUEUE_CAPACITY: usize = 1024;
pub(super) const HISTORY_FLUSH_BATCH: usize = 64;

#[derive(Debug, Clone, PartialEq, Eq)]
struct PendingObservation {
    observation_id: String,
    capability_id: CapabilityId,
    kind: CapabilityKind,
    unit: CanonicalUnit,
    value: i64,
    scale: u8,
    constraint_revision_id: String,
    schema_version: u16,
    observed_at: DateTime<Utc>,
    received_at: DateTime<Utc>,
    reset: Option<bool>,
    resolution: i64,
    freshness: Duration,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct HistoryBatch {
    bounds: Vec<(CapabilityId, DateTime<Utc>)>,
    observations: Vec<PendingObservation>,
}

impl HistoryBatch {
    fn is_empty(&self) -> bool {
        self.bounds.is_empty() && self.observations.is_empty()
    }
}

fn default_disk_floor() -> Arc<dyn Fn() -> bool + Send + Sync> {
    if cfg!(test) {
        Arc::new(|| false)
    } else {
        Arc::new(super::history_budget::live_disk_floor_breached)
    }
}

/// In-process admission policy. Postgres is consulted only by the flush loop.
pub(super) struct HistoryGate {
    capacity: usize,
    recording_since: HashMap<CapabilityId, DateTime<Utc>>,
    pending_bounds: Vec<(CapabilityId, DateTime<Utc>)>,
    /// Observation ids still waiting in a lane. Ids in `inflight` are reserved until the write
    /// commits. A replay after a successful flush is dropped by the observation-key table.
    queued_ids: HashSet<(String, CapabilityId)>,
    inflight: HashSet<(String, CapabilityId)>,
    rate_window: HashMap<CapabilityId, VecDeque<DateTime<Utc>>>,
    lanes: HashMap<CapabilityId, VecDeque<PendingObservation>>,
    order: VecDeque<CapabilityId>,
    queued: usize,
    disk_floor_breached: Arc<dyn Fn() -> bool + Send + Sync>,
    pressure_since: Option<DateTime<Utc>>,
    storage_since: Option<DateTime<Utc>>,
    untrusted_since: Option<DateTime<Utc>>,
    pending_finalizations: Vec<PendingFinalization>,
    pending_rejected: Vec<RejectedInterval>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) struct RejectedInterval {
    pub capability_id: Uuid,
    pub start: DateTime<Utc>,
    pub end: DateTime<Utc>,
}

struct PendingFinalization {
    reason: GapReason,
    scope: GapScope,
    onset: DateTime<Utc>,
    until: DateTime<Utc>,
}

struct JournalSignals {
    finalizations: Vec<PendingFinalization>,
    open_queue_pressure: Option<DateTime<Utc>>,
    open_untrusted: Option<DateTime<Utc>>,
}

/// Raw retention is the correction window. Older observations stay out of History.
pub(super) fn outside_correction_window(
    kind: CapabilityKind,
    observed_at: DateTime<Utc>,
    received_at: DateTime<Utc>,
) -> bool {
    let window = match kind {
        CapabilityKind::Power => Duration::hours(48),
        CapabilityKind::ImportedEnergy | CapabilityKind::ExportedEnergy => Duration::days(7),
        CapabilityKind::Voltage | CapabilityKind::Current => Duration::hours(24),
    };
    received_at.signed_duration_since(observed_at) > window
}

impl HistoryGate {
    pub(super) fn new(capacity: usize) -> Self {
        Self {
            capacity,
            recording_since: HashMap::new(),
            pending_bounds: Vec::new(),
            queued_ids: HashSet::new(),
            inflight: HashSet::new(),
            rate_window: HashMap::new(),
            lanes: HashMap::new(),
            order: VecDeque::new(),
            queued: 0,
            disk_floor_breached: default_disk_floor(),
            pressure_since: None,
            storage_since: None,
            untrusted_since: None,
            pending_finalizations: Vec::new(),
            pending_rejected: Vec::new(),
        }
    }

    pub(super) fn take_rejected_intervals(&mut self) -> Vec<RejectedInterval> {
        std::mem::take(&mut self.pending_rejected)
    }

    fn restore_rejected(&mut self, mut intervals: Vec<RejectedInterval>) {
        intervals.append(&mut self.pending_rejected);
        self.pending_rejected = intervals;
    }

    #[cfg(test)]
    pub(super) fn set_disk_floor_breached(
        &mut self,
        breached: impl Fn() -> bool + Send + Sync + 'static,
    ) {
        self.disk_floor_breached = Arc::new(breached);
    }

    #[cfg(test)]
    pub(super) fn queued_len(&self) -> usize {
        self.queued
    }

    #[cfg(test)]
    pub(super) fn queued_observed_at(&self, capability_id: CapabilityId) -> Option<DateTime<Utc>> {
        self.lanes
            .get(&capability_id)
            .and_then(|lane| lane.front())
            .map(|row| row.observed_at)
    }

    pub(super) fn admit(
        &mut self,
        result: &mut IngestResult,
        report: &CapabilityReport,
        received_at: DateTime<Utc>,
        lookup: impl Fn(CapabilityId) -> Option<RegisteredCapability>,
    ) {
        if (self.disk_floor_breached)() {
            let mut stopped = false;
            for outcome in &mut result.outcomes {
                if lookup(outcome.capability_id).is_some() {
                    self.note_recording(outcome.capability_id, received_at);
                }
                if outcome.history == HistoryAdmissionOutcome::Eligible {
                    outcome.history =
                        HistoryAdmissionOutcome::Rejected(HistoryRejection::DiskFloor);
                    stopped = true;
                }
            }
            if stopped {
                crate::capabilities::admission_journal::note_disk_floor(received_at);
            }
            return;
        }
        for outcome in &mut result.outcomes {
            let Some(registered) = lookup(outcome.capability_id) else {
                if outcome.history == HistoryAdmissionOutcome::Eligible {
                    outcome.history =
                        HistoryAdmissionOutcome::Rejected(HistoryRejection::InvalidCapability);
                }
                continue;
            };
            self.note_recording(outcome.capability_id, received_at);
            if matches!(
                outcome.history,
                HistoryAdmissionOutcome::Rejected(HistoryRejection::UntrustworthyTime)
            ) {
                self.untrusted_since.get_or_insert(received_at);
            } else if outcome.history == HistoryAdmissionOutcome::Eligible {
                if let Some(onset) = self.untrusted_since.take() {
                    self.note_loss(GapReason::UntrustedTime, GapScope::Home, onset, received_at);
                }
            }
            if outcome.history != HistoryAdmissionOutcome::Eligible {
                continue;
            }
            let Some(observation) = report
                .observations
                .iter()
                .find(|observation| observation.capability_id == outcome.capability_id)
            else {
                outcome.history =
                    HistoryAdmissionOutcome::Rejected(HistoryRejection::InvalidCapability);
                continue;
            };
            let CapabilityReading::Value(value) = &observation.reading else {
                outcome.history = HistoryAdmissionOutcome::Rejected(HistoryRejection::Unavailable);
                continue;
            };
            let Some(revision) = registered
                .declaration
                .constraint(value.constraint_revision_id())
            else {
                outcome.history =
                    HistoryAdmissionOutcome::Rejected(HistoryRejection::InvalidCapability);
                continue;
            };
            let Some(schema_version) = report.schema_version else {
                outcome.history =
                    HistoryAdmissionOutcome::Rejected(HistoryRejection::UnsupportedSchemaVersion);
                continue;
            };
            if schema_version != 1 {
                outcome.history =
                    HistoryAdmissionOutcome::Rejected(HistoryRejection::UnsupportedSchemaVersion);
                continue;
            }
            let Ok(freshness_ms) = i64::try_from(revision.freshness_ms) else {
                outcome.history =
                    HistoryAdmissionOutcome::Rejected(HistoryRejection::InvalidCapability);
                continue;
            };
            let Some(observation_id) = report.observation_id.clone() else {
                outcome.history =
                    HistoryAdmissionOutcome::Rejected(HistoryRejection::MissingObservationId);
                continue;
            };
            let Some(observed_at) = report.observed_at else {
                outcome.history =
                    HistoryAdmissionOutcome::Rejected(HistoryRejection::MissingObservedAt);
                continue;
            };
            let identity = (observation_id.clone(), outcome.capability_id);
            if self.queued_ids.contains(&identity) || self.inflight.contains(&identity) {
                outcome.history = HistoryAdmissionOutcome::Rejected(HistoryRejection::ExactReplay);
                continue;
            }
            if outside_correction_window(observation.kind, observed_at, received_at) {
                outcome.history = HistoryAdmissionOutcome::Rejected(HistoryRejection::Late);
                if let Some(end) = observed_at.checked_add_signed(Duration::microseconds(1)) {
                    self.pending_rejected.push(RejectedInterval {
                        capability_id: outcome.capability_id.into_uuid(),
                        start: observed_at,
                        end,
                    });
                }
                continue;
            }
            if !self.rate_allows(
                outcome.capability_id,
                received_at,
                &revision.history_admission,
            ) {
                outcome.history =
                    HistoryAdmissionOutcome::Rejected(HistoryRejection::AdmissionRate);
                continue;
            }
            if self.at_capacity() {
                outcome.history = HistoryAdmissionOutcome::Rejected(HistoryRejection::QueueFull);
                // Record the drop in memory. The flush loop journals it so admission does not fsync.
                self.note_loss(
                    GapReason::QueueLoss,
                    GapScope::Capability(outcome.capability_id),
                    received_at,
                    received_at,
                );
                self.pressure_since.get_or_insert(received_at);
                continue;
            }
            self.note_receipt(outcome.capability_id, received_at);
            self.enqueue(PendingObservation {
                observation_id,
                capability_id: outcome.capability_id,
                kind: observation.kind,
                unit: registered.declaration.unit,
                value: value.value(),
                scale: value.scale(),
                constraint_revision_id: value.constraint_revision_id().to_string(),
                schema_version,
                observed_at,
                received_at,
                reset: observation.reset,
                resolution: revision.resolution,
                freshness: Duration::milliseconds(freshness_ms),
            });
            if self.at_capacity() {
                self.pressure_since.get_or_insert(received_at);
            }
        }
        self.publish_queue();
    }

    fn note_recording(&mut self, id: CapabilityId, received_at: DateTime<Utc>) {
        if self.recording_since.contains_key(&id) {
            return;
        }
        self.recording_since.insert(id, received_at);
        self.pending_bounds.push((id, received_at));
    }

    fn rate_allows(
        &mut self,
        id: CapabilityId,
        received_at: DateTime<Utc>,
        rate: &super::HistoryAdmissionRate,
    ) -> bool {
        let Ok(interval_ms) = i64::try_from(rate.interval_ms) else {
            return false;
        };
        let window = Duration::milliseconds(interval_ms);
        let admitted_at = self.rate_window.entry(id).or_default();
        admitted_at.retain(|previous| received_at.signed_duration_since(*previous) < window);
        admitted_at.len() < rate.maximum_observations as usize
    }

    fn note_receipt(&mut self, id: CapabilityId, received_at: DateTime<Utc>) {
        self.rate_window
            .entry(id)
            .or_default()
            .push_back(received_at);
    }

    fn enqueue(&mut self, row: PendingObservation) {
        let id = row.capability_id;
        self.queued_ids.insert((row.observation_id.clone(), id));
        let lane = self.lanes.entry(id).or_default();
        let was_empty = lane.is_empty();
        lane.push_back(row);
        if was_empty {
            self.order.push_back(id);
        }
        self.queued += 1;
    }

    fn drain(&mut self, limit: usize) -> HistoryBatch {
        let bounds = std::mem::take(&mut self.pending_bounds);
        let mut observations = Vec::new();
        while observations.len() < limit {
            let Some(id) = self.order.pop_front() else {
                break;
            };
            let Some((row, more)) = self.lanes.get_mut(&id).and_then(|lane| {
                let row = lane.pop_front()?;
                Some((row, !lane.is_empty()))
            }) else {
                self.lanes.remove(&id);
                continue;
            };
            let identity = (row.observation_id.clone(), row.capability_id);
            self.queued_ids.remove(&identity);
            self.inflight.insert(identity);
            self.queued = self.queued.saturating_sub(1);
            if more {
                self.order.push_back(id);
            } else {
                self.lanes.remove(&id);
            }
            observations.push(row);
        }
        let batch = HistoryBatch {
            bounds,
            observations,
        };
        self.publish_queue();
        batch
    }

    fn acknowledge(&mut self, batch: &HistoryBatch) {
        for row in &batch.observations {
            self.inflight
                .remove(&(row.observation_id.clone(), row.capability_id));
        }
        self.publish_queue();
    }

    fn requeue(&mut self, batch: HistoryBatch) {
        let mut restored = batch.bounds;
        restored.append(&mut self.pending_bounds);
        self.pending_bounds = restored;
        for row in batch.observations.into_iter().rev() {
            let id = row.capability_id;
            self.inflight.remove(&(row.observation_id.clone(), id));
            self.queued_ids.insert((row.observation_id.clone(), id));
            let lane = self.lanes.entry(id).or_default();
            let was_empty = lane.is_empty();
            lane.push_front(row);
            self.queued += 1;
            if was_empty {
                self.order.push_front(id);
            }
        }
        self.publish_queue();
    }

    fn at_capacity(&self) -> bool {
        self.queued + self.inflight.len() >= self.capacity
    }

    fn below_capacity(&self) -> bool {
        !self.at_capacity()
    }

    fn note_loss(
        &mut self,
        reason: GapReason,
        scope: GapScope,
        onset: DateTime<Utc>,
        until: DateTime<Utc>,
    ) {
        self.pending_finalizations.push(PendingFinalization {
            reason,
            scope,
            onset,
            until,
        });
    }

    fn take_journal_signals(&mut self) -> JournalSignals {
        JournalSignals {
            finalizations: std::mem::take(&mut self.pending_finalizations),
            open_queue_pressure: self.pressure_since,
            open_untrusted: self.untrusted_since,
        }
    }

    fn note_storage(&mut self, at: DateTime<Utc>) -> DateTime<Utc> {
        *self.storage_since.get_or_insert(at)
    }

    fn clear_storage(&mut self) {
        self.storage_since = None;
    }

    fn publish_queue(&self) {
        admission_journal::publish_queue(admission_journal::QueueSnapshot {
            queued: self.queued,
            inflight: self.inflight.len(),
            capacity: self.capacity,
            pressured: self.at_capacity(),
        });
    }
}

#[derive(Clone)]
pub(super) struct HistoryRepository {
    pool: DbPool,
}

impl HistoryRepository {
    pub(super) fn new(pool: DbPool) -> Self {
        Self { pool }
    }

    async fn commit(&self, batch: HistoryBatch) -> Result<(), HistoryStoreError> {
        if batch.is_empty() {
            return Ok(());
        }
        let conn = self.pool.get().await?;
        conn.interact(move |conn| commit_sync(conn, &batch)).await?
    }

    async fn insert_rejected(
        &self,
        intervals: Vec<RejectedInterval>,
    ) -> Result<(), HistoryStoreError> {
        if intervals.is_empty() {
            return Ok(());
        }
        let conn = self.pool.get().await?;
        conn.interact(move |conn| {
            for interval in &intervals {
                diesel::sql_query(
                    "INSERT INTO history_missing_intervals (capability_id, started_at, ended_at)
                     VALUES ($1, $2, $3)
                     ON CONFLICT (capability_id, started_at, ended_at) DO NOTHING",
                )
                .bind::<SqlUuid, _>(interval.capability_id)
                .bind::<Timestamptz, _>(interval.start)
                .bind::<Timestamptz, _>(interval.end)
                .execute(conn)?;
            }
            Ok(())
        })
        .await?
    }

    async fn upsert_finalized(&self, gaps: Vec<FinalizedGap>) -> Result<(), HistoryStoreError> {
        if gaps.is_empty() {
            return Ok(());
        }
        let conn = self.pool.get().await?;
        conn.interact(move |conn| {
            for gap in &gaps {
                admission_journal::upsert_history_gap(conn, gap)?;
            }
            Ok(())
        })
        .await?
    }
}

fn commit_sync(conn: &mut PgConnection, batch: &HistoryBatch) -> Result<(), HistoryStoreError> {
    conn.transaction(|conn| {
        diesel::sql_query("SET LOCAL statement_timeout = '2s'").execute(conn)?;
        for (capability_id, recording_since) in &batch.bounds {
            diesel::insert_into(capability_recording_bounds::table)
                .values((
                    capability_recording_bounds::capability_id.eq(capability_id.into_uuid()),
                    capability_recording_bounds::recording_since.eq(*recording_since),
                ))
                .on_conflict(capability_recording_bounds::capability_id)
                .do_nothing()
                .execute(conn)?;
        }
        let mut written = Vec::new();
        for row in &batch.observations {
            let inserted = diesel::insert_into(capability_observation_keys::table)
                .values((
                    capability_observation_keys::observation_id.eq(&row.observation_id),
                    capability_observation_keys::capability_id.eq(row.capability_id.into_uuid()),
                ))
                .on_conflict((
                    capability_observation_keys::observation_id,
                    capability_observation_keys::capability_id,
                ))
                .do_nothing()
                .execute(conn)?;
            if inserted == 0 {
                written.push(written_observation(row, false));
                continue;
            }
            diesel::insert_into(capability_observations::table)
                .values((
                    capability_observations::observation_id.eq(&row.observation_id),
                    capability_observations::capability_id.eq(row.capability_id.into_uuid()),
                    capability_observations::kind.eq(row.kind.as_str()),
                    capability_observations::unit.eq(row.unit.as_str()),
                    capability_observations::value.eq(row.value),
                    capability_observations::scale.eq(i16::from(row.scale)),
                    capability_observations::constraint_revision_id.eq(&row.constraint_revision_id),
                    capability_observations::schema_version.eq(i16::try_from(row.schema_version)?),
                    capability_observations::time_trust.eq(TimeTrust::Trustworthy.as_str()),
                    capability_observations::observed_at.eq(row.observed_at),
                    capability_observations::received_at.eq(row.received_at),
                    capability_observations::reset.eq(row.reset),
                ))
                .execute(conn)?;
            written.push(written_observation(row, true));
        }
        super::history_retention::after_observation_write(conn, &written)?;
        Ok(())
    })
}

fn written_observation(
    row: &PendingObservation,
    newly_inserted: bool,
) -> super::history_retention::WrittenObservation {
    super::history_retention::WrittenObservation {
        capability_id: row.capability_id.into_uuid(),
        kind: row.kind,
        value: row.value,
        scale: row.scale,
        observed_at: row.observed_at,
        received_at: row.received_at,
        reset: row.reset.unwrap_or(false),
        resolution: row.resolution,
        freshness: row.freshness,
        newly_inserted,
    }
}

#[derive(Debug, Error)]
pub(super) enum HistoryStoreError {
    #[error("database pool error: {0}")]
    Pool(#[from] deadpool_diesel::PoolError),
    #[error("database interaction failed: {0}")]
    Interaction(#[from] deadpool_diesel::InteractError),
    #[error(transparent)]
    Database(#[from] diesel::result::Error),
    #[error("observation schema version does not fit in the history row")]
    SchemaVersion,
}

impl From<std::num::TryFromIntError> for HistoryStoreError {
    fn from(_: std::num::TryFromIntError) -> Self {
        Self::SchemaVersion
    }
}

pub(super) fn spawn_loop(gate: Arc<Mutex<HistoryGate>>, store: HistoryRepository) {
    tokio::spawn(async move {
        let opened =
            AdmissionJournal::open(&admission_journal::journal_path()).unwrap_or_else(|error| {
                tracing::warn!(%error, "history admission journal unavailable");
                AdmissionJournal::unpersisted_uncertain()
            });
        let journal = Arc::new(Mutex::new(opened));
        admission_journal::install(Arc::clone(&journal));
        reconcile_journal(&journal, &store).await;

        let mut interval = tokio::time::interval(StdDuration::from_millis(200));
        loop {
            interval.tick().await;
            let (batch, signals, rejected) = {
                let mut gate = gate.lock().expect("history gate poisoned");
                let rejected = gate.take_rejected_intervals();
                let signals = gate.take_journal_signals();
                let batch = gate.drain(HISTORY_FLUSH_BATCH);
                (batch, signals, rejected)
            };
            if let Err(error) = store.insert_rejected(rejected.clone()).await {
                tracing::warn!(%error, "rejected history interval persist failed");
                gate.lock()
                    .expect("history gate poisoned")
                    .restore_rejected(rejected);
            }
            apply_journal_signals(&journal, signals);
            if batch.is_empty() {
                let below_capacity = gate.lock().expect("history gate poisoned").below_capacity();
                if below_capacity {
                    if let Err(error) = journal
                        .lock()
                        .expect("admission journal poisoned")
                        .dismiss_provisional(GapReason::QueueLoss)
                    {
                        tracing::warn!(%error, "history queue-loss provisional clear failed");
                    }
                }
                reconcile_journal(&journal, &store).await;
                continue;
            }
            match store.commit(batch.clone()).await {
                Ok(()) => {
                    let (signals, below_capacity) = {
                        let mut gate = gate.lock().expect("history gate poisoned");
                        gate.acknowledge(&batch);
                        gate.clear_storage();
                        let below_capacity = gate.below_capacity();
                        if below_capacity {
                            gate.pressure_since = None;
                        }
                        (gate.take_journal_signals(), below_capacity)
                    };
                    apply_journal_signals(&journal, signals);
                    let result = {
                        let mut journal = journal.lock().expect("admission journal poisoned");
                        if below_capacity {
                            journal.clear_provisional()
                        } else {
                            journal.dismiss_provisional(GapReason::StorageFailure)
                        }
                    };
                    if let Err(error) = result {
                        tracing::warn!(%error, "history provisional clear failed");
                    }
                }
                Err(error) => {
                    tracing::warn!(%error, "capability history flush failed");
                    let onset = {
                        let mut gate = gate.lock().expect("history gate poisoned");
                        requeue_after_storage_outage(&mut gate, batch, Utc::now())
                    };
                    note_storage_outage(
                        &mut journal.lock().expect("admission journal poisoned"),
                        onset,
                    );
                }
            }
            reconcile_journal(&journal, &store).await;
        }
    });
}

fn requeue_after_storage_outage(
    gate: &mut HistoryGate,
    batch: HistoryBatch,
    now: DateTime<Utc>,
) -> DateTime<Utc> {
    gate.requeue(batch);
    gate.note_storage(now)
}

fn note_storage_outage(journal: &mut AdmissionJournal, onset: DateTime<Utc>) {
    if let Err(error) = journal.open_provisional(GapReason::StorageFailure, GapScope::Home, onset) {
        tracing::warn!(%error, "history storage-failure journal failed");
    }
}

fn apply_journal_signals(journal: &Mutex<AdmissionJournal>, signals: JournalSignals) {
    let mut journal = journal.lock().expect("admission journal poisoned");
    for gap in signals.finalizations {
        if let Err(error) = journal.finalize(gap.reason, gap.scope, gap.onset, gap.until) {
            tracing::warn!(%error, "history gap finalize failed");
        }
    }
    if let Some(onset) = signals.open_queue_pressure {
        if let Err(error) = journal.open_provisional(GapReason::QueueLoss, GapScope::Home, onset) {
            tracing::warn!(%error, "history queue-loss journal failed");
        }
    }
    if let Some(onset) = signals.open_untrusted {
        if let Err(error) =
            journal.open_provisional(GapReason::UntrustedTime, GapScope::Home, onset)
        {
            tracing::warn!(%error, "history untrusted-time journal failed");
        }
    }
    if let Err(error) = journal.persist_disk_floor() {
        tracing::warn!(%error, "history disk-floor journal failed");
    }
}

async fn reconcile_journal(journal: &Mutex<AdmissionJournal>, store: &HistoryRepository) {
    let gaps = journal
        .lock()
        .expect("admission journal poisoned")
        .finalized();
    if gaps.is_empty() {
        return;
    }
    match store.upsert_finalized(gaps.clone()).await {
        Ok(()) => {
            if let Err(error) = journal
                .lock()
                .expect("admission journal poisoned")
                .forget_reconciled(&gaps)
            {
                tracing::warn!(%error, "history gap journal update failed");
            }
        }
        Err(error) => tracing::warn!(%error, "history gap reconcile failed"),
    }
}

#[cfg(test)]
mod tests {
    use chrono::{TimeZone, Utc};
    use uuid::Uuid;

    use super::*;
    use crate::capabilities::{
        Availability, CapabilityKind, CapabilityObservation, CapabilityReading, CapabilityReport,
        CurrentState, CurrentStateDisposition, DeviceIdentity, IngestResult, NumericValue,
        ObservationOutcome, PhysicalScope, RegisteredCapability, StateEpoch,
    };

    fn at(second: i64) -> DateTime<Utc> {
        Utc.timestamp_opt(second, 0).single().unwrap()
    }

    fn capability(id: CapabilityId, kind: CapabilityKind, rate: u32) -> RegisteredCapability {
        let mut registered = RegisteredCapability::for_test(
            id,
            "zigbee",
            "plug-1",
            kind,
            PhysicalScope::Device,
            60_000,
        );
        registered.declaration.constraint_revisions[0]
            .history_admission
            .maximum_observations = rate;
        registered
    }

    fn report(
        observation_id: &str,
        observed_at: i64,
        capability_id: CapabilityId,
        kind: CapabilityKind,
        raw: i64,
        reset: Option<bool>,
    ) -> CapabilityReport {
        CapabilityReport {
            schema_version: Some(1),
            observation_id: Some(observation_id.to_string()),
            observed_at: Some(at(observed_at)),
            time_trust: TimeTrust::Trustworthy,
            observations: vec![CapabilityObservation {
                capability_id,
                kind,
                reading: CapabilityReading::Value(NumericValue::for_test(raw, 0, "limits-1")),
                reset,
            }],
        }
    }

    fn admit(
        gate: &mut HistoryGate,
        state: &CurrentState,
        report: CapabilityReport,
        received_at: DateTime<Utc>,
    ) -> IngestResult {
        let mut result = state.ingest(report.clone(), received_at);
        gate.admit(&mut result, &report, received_at, |id| state.registered(id));
        result
    }

    #[test]
    fn non_current_schema_is_not_queued_even_if_marked_eligible() {
        let id = CapabilityId::from_uuid(Uuid::from_u128(1));
        let registered = capability(id, CapabilityKind::Power, 60);
        let state = CurrentState::new(StateEpoch::from_uuid(Uuid::from_u128(9)));
        let device = registered.declaration.identity.device.clone();
        state.reconcile_manifest(&device, vec![registered], at(0));
        let mut report = report("obs-future", 10, id, CapabilityKind::Power, 100, None);
        report.schema_version = Some(2);
        let mut result = IngestResult {
            outcomes: vec![ObservationOutcome {
                capability_id: id,
                current: CurrentStateDisposition::Changed,
                history: HistoryAdmissionOutcome::Eligible,
            }],
            changes: Vec::new(),
        };
        let mut gate = HistoryGate::new(8);
        gate.admit(&mut result, &report, at(20), |capability_id| {
            state.registered(capability_id)
        });
        assert_eq!(
            result.outcomes[0].history,
            HistoryAdmissionOutcome::Rejected(HistoryRejection::UnsupportedSchemaVersion)
        );
        assert_eq!(gate.queued, 0);
    }

    #[test]
    fn observation_outside_the_correction_window_is_rejected() {
        let id = CapabilityId::from_uuid(Uuid::from_u128(21));
        let registered = capability(id, CapabilityKind::Power, 60);
        let state = CurrentState::new(StateEpoch::from_uuid(Uuid::from_u128(9)));
        let device = registered.declaration.identity.device.clone();
        state.reconcile_manifest(&device, vec![registered], at(0));
        let mut gate = HistoryGate::new(8);
        let received_at = at(10) + Duration::hours(48) + Duration::seconds(1);
        let result = admit(
            &mut gate,
            &state,
            report("late-1", 10, id, CapabilityKind::Power, 5, None),
            received_at,
        );
        assert_eq!(
            result.outcomes[0].history,
            HistoryAdmissionOutcome::Rejected(HistoryRejection::Late)
        );
        assert_eq!(gate.queued, 0);
        assert_eq!(result.outcomes[0].current, CurrentStateDisposition::Changed);
    }

    #[test]
    fn duplicate_observation_is_not_queued_twice() {
        let id = CapabilityId::from_uuid(Uuid::from_u128(1));
        let registered = capability(id, CapabilityKind::Power, 60);
        let state = CurrentState::new(StateEpoch::from_uuid(Uuid::from_u128(9)));
        let device = registered.declaration.identity.device.clone();
        state.reconcile_manifest(&device, vec![registered], at(0));
        let mut gate = HistoryGate::new(8);
        let first = admit(
            &mut gate,
            &state,
            report("obs-1", 10, id, CapabilityKind::Power, 100, Some(true)),
            at(20),
        );
        assert_eq!(first.outcomes[0].history, HistoryAdmissionOutcome::Eligible);
        let replay = admit(
            &mut gate,
            &state,
            report("obs-1", 11, id, CapabilityKind::Power, 110, Some(false)),
            at(21),
        );
        assert_eq!(replay.outcomes[0].current, CurrentStateDisposition::Changed);
        assert_eq!(
            replay.outcomes[0].history,
            HistoryAdmissionOutcome::Rejected(HistoryRejection::ExactReplay)
        );
        assert_eq!(gate.queued, 1);
        let batch = gate.drain(8);
        let row = &batch.observations[0];
        assert_eq!(row.observed_at, at(10));
        assert_eq!(row.received_at, at(20));
        assert_eq!(row.reset, Some(true));
        assert_eq!(gate.recording_since[&id], at(20));
    }

    #[test]
    fn admission_rate_keeps_the_first_recording_time() {
        let id = CapabilityId::from_uuid(Uuid::from_u128(2));
        let registered = capability(id, CapabilityKind::Power, 1);
        let state = CurrentState::new(StateEpoch::from_uuid(Uuid::from_u128(9)));
        let device = registered.declaration.identity.device.clone();
        state.reconcile_manifest(&device, vec![registered], at(0));
        let mut gate = HistoryGate::new(8);
        let first = admit(
            &mut gate,
            &state,
            report("obs-1", 10, id, CapabilityKind::Power, 100, None),
            at(10),
        );
        assert_eq!(first.outcomes[0].history, HistoryAdmissionOutcome::Eligible);
        let second = admit(
            &mut gate,
            &state,
            report("obs-2", 11, id, CapabilityKind::Power, 140, None),
            at(11),
        );
        assert_eq!(second.outcomes[0].current, CurrentStateDisposition::Changed);
        assert_eq!(
            second.outcomes[0].history,
            HistoryAdmissionOutcome::Rejected(HistoryRejection::AdmissionRate)
        );
        assert_eq!(gate.recording_since[&id], at(10));
        assert_eq!(gate.queued, 1);
        let current = state
            .snapshot()
            .capabilities
            .into_iter()
            .find(|capability| capability.capability_id == id)
            .unwrap();
        assert_eq!(current.value.unwrap().value(), 140);
        assert_eq!(current.availability, Availability::Available);
    }

    #[test]
    fn full_queue_rejects_without_using_the_rate_slot() {
        let power = CapabilityId::from_uuid(Uuid::from_u128(3));
        let energy = CapabilityId::from_uuid(Uuid::from_u128(4));
        let power_capability = capability(power, CapabilityKind::Power, 2);
        let energy_capability = capability(energy, CapabilityKind::ImportedEnergy, 2);
        let device = power_capability.declaration.identity.device.clone();
        let state = CurrentState::new(StateEpoch::from_uuid(Uuid::from_u128(9)));
        state.reconcile_manifest(&device, vec![power_capability, energy_capability], at(0));
        let mut gate = HistoryGate::new(1);
        assert_eq!(
            admit(
                &mut gate,
                &state,
                report("power-1", 10, power, CapabilityKind::Power, 100, None),
                at(10),
            )
            .outcomes[0]
                .history,
            HistoryAdmissionOutcome::Eligible
        );
        let rejected = admit(
            &mut gate,
            &state,
            report(
                "energy-1",
                10,
                energy,
                CapabilityKind::ImportedEnergy,
                50,
                None,
            ),
            at(10),
        );
        assert_eq!(
            rejected.outcomes[0].history,
            HistoryAdmissionOutcome::Rejected(HistoryRejection::QueueFull)
        );
        assert_eq!(
            rejected.outcomes[0].current,
            CurrentStateDisposition::Changed
        );
        let flushed = gate.drain(8);
        gate.acknowledge(&flushed);
        let retried = admit(
            &mut gate,
            &state,
            report(
                "energy-2",
                11,
                energy,
                CapabilityKind::ImportedEnergy,
                60,
                None,
            ),
            at(10),
        );
        assert_eq!(
            retried.outcomes[0].history,
            HistoryAdmissionOutcome::Eligible
        );
    }

    #[test]
    fn queue_full_records_scope_loss_without_journaling_inline() {
        let power = CapabilityId::from_uuid(Uuid::from_u128(3));
        let energy = CapabilityId::from_uuid(Uuid::from_u128(4));
        let power_capability = capability(power, CapabilityKind::Power, 2);
        let energy_capability = capability(energy, CapabilityKind::ImportedEnergy, 2);
        let device = power_capability.declaration.identity.device.clone();
        let state = CurrentState::new(StateEpoch::from_uuid(Uuid::from_u128(9)));
        state.reconcile_manifest(&device, vec![power_capability, energy_capability], at(0));
        let mut gate = HistoryGate::new(1);
        admit(
            &mut gate,
            &state,
            report("power-1", 10, power, CapabilityKind::Power, 100, None),
            at(10),
        );
        let rejected = admit(
            &mut gate,
            &state,
            report(
                "energy-1",
                10,
                energy,
                CapabilityKind::ImportedEnergy,
                50,
                None,
            ),
            at(10),
        );
        assert_eq!(
            rejected.outcomes[0].history,
            HistoryAdmissionOutcome::Rejected(HistoryRejection::QueueFull)
        );
        let signals = gate.take_journal_signals();
        assert_eq!(signals.finalizations.len(), 1);
        assert_eq!(signals.finalizations[0].reason, GapReason::QueueLoss);
        assert_eq!(signals.finalizations[0].scope, GapScope::Capability(energy));
        assert_eq!(signals.open_queue_pressure, Some(at(10)));
    }

    #[test]
    fn ineligible_reading_is_not_queued() {
        let id = CapabilityId::from_uuid(Uuid::from_u128(5));
        let registered = capability(id, CapabilityKind::Power, 60);
        let state = CurrentState::new(StateEpoch::from_uuid(Uuid::from_u128(9)));
        let device = registered.declaration.identity.device.clone();
        state.reconcile_manifest(&device, vec![registered], at(0));
        let mut reading = report("obs-1", 10, id, CapabilityKind::Power, 80, None);
        reading.time_trust = TimeTrust::Untrustworthy;
        let mut gate = HistoryGate::new(8);
        let ingested = admit(&mut gate, &state, reading, at(12));
        assert_eq!(
            ingested.outcomes[0].current,
            CurrentStateDisposition::Changed
        );
        assert_eq!(
            ingested.outcomes[0].history,
            HistoryAdmissionOutcome::Rejected(HistoryRejection::UntrustworthyTime)
        );
        assert_eq!(gate.queued, 0);
        assert_eq!(gate.recording_since[&id], at(12));
        assert!(gate.drain(8).observations.is_empty());
    }

    #[test]
    fn untrustworthy_time_records_a_home_interval_without_journaling_inline() {
        let id = CapabilityId::from_uuid(Uuid::from_u128(5));
        let registered = capability(id, CapabilityKind::Power, 60);
        let state = CurrentState::new(StateEpoch::from_uuid(Uuid::from_u128(9)));
        let device = registered.declaration.identity.device.clone();
        state.reconcile_manifest(&device, vec![registered], at(0));
        let mut reading = report("obs-1", 10, id, CapabilityKind::Power, 80, None);
        reading.time_trust = TimeTrust::Untrustworthy;
        let mut gate = HistoryGate::new(8);
        admit(&mut gate, &state, reading, at(12));
        let signals = gate.take_journal_signals();
        assert_eq!(signals.open_untrusted, Some(at(12)));
        assert!(signals.finalizations.is_empty());

        admit(
            &mut gate,
            &state,
            report("obs-2", 20, id, CapabilityKind::Power, 90, None),
            at(20),
        );
        let signals = gate.take_journal_signals();
        assert!(signals.open_untrusted.is_none());
        assert_eq!(signals.finalizations.len(), 1);
        assert_eq!(signals.finalizations[0].reason, GapReason::UntrustedTime);
        assert_eq!(signals.finalizations[0].scope, GapScope::Home);
        assert_eq!(signals.finalizations[0].onset, at(12));
        assert_eq!(signals.finalizations[0].until, at(20));
    }

    #[test]
    fn flush_alternates_between_capabilities() {
        let power = CapabilityId::from_uuid(Uuid::from_u128(6));
        let energy = CapabilityId::from_uuid(Uuid::from_u128(7));
        let power_capability = capability(power, CapabilityKind::Power, 60);
        let energy_capability = capability(energy, CapabilityKind::ImportedEnergy, 60);
        let device = power_capability.declaration.identity.device.clone();
        let state = CurrentState::new(StateEpoch::from_uuid(Uuid::from_u128(9)));
        state.reconcile_manifest(&device, vec![power_capability, energy_capability], at(0));
        let mut gate = HistoryGate::new(8);
        admit(
            &mut gate,
            &state,
            report("power-1", 10, power, CapabilityKind::Power, 10, None),
            at(10),
        );
        admit(
            &mut gate,
            &state,
            report("power-2", 11, power, CapabilityKind::Power, 11, None),
            at(11),
        );
        admit(
            &mut gate,
            &state,
            report(
                "energy-1",
                12,
                energy,
                CapabilityKind::ImportedEnergy,
                12,
                None,
            ),
            at(12),
        );
        let batch = gate.drain(2);
        let ids = batch
            .observations
            .iter()
            .map(|row| row.observation_id.as_str())
            .collect::<Vec<_>>();
        assert_eq!(ids, ["power-1", "energy-1"]);
        assert_eq!(gate.drain(2).observations[0].observation_id, "power-2");
    }

    #[test]
    fn failed_flush_returns_the_batch_to_the_queue() {
        let id = CapabilityId::from_uuid(Uuid::from_u128(8));
        let registered = capability(id, CapabilityKind::Power, 60);
        let state = CurrentState::new(StateEpoch::from_uuid(Uuid::from_u128(9)));
        let device = registered.declaration.identity.device.clone();
        state.reconcile_manifest(&device, vec![registered], at(0));
        let mut gate = HistoryGate::new(8);
        admit(
            &mut gate,
            &state,
            report("obs-1", 10, id, CapabilityKind::Power, 5, None),
            at(10),
        );
        let batch = gate.drain(8);
        assert_eq!(gate.queued, 0);
        gate.requeue(batch);
        assert_eq!(gate.queued, 1);
        assert_eq!(gate.drain(8).observations[0].observation_id, "obs-1");
        assert_eq!(gate.recording_since[&id], at(10));
    }

    #[test]
    fn postgres_outage_requeues_the_batch_and_opens_a_home_gap() {
        let id = CapabilityId::from_uuid(Uuid::from_u128(37));
        let registered = capability(id, CapabilityKind::Power, 60);
        let state = CurrentState::new(StateEpoch::from_uuid(Uuid::from_u128(9)));
        let device = registered.declaration.identity.device.clone();
        state.reconcile_manifest(&device, vec![registered], at(0));
        let mut gate = HistoryGate::new(8);
        admit(
            &mut gate,
            &state,
            report("obs-outage", 10, id, CapabilityKind::Power, 5, None),
            at(10),
        );
        let batch = gate.drain(8);
        assert_eq!(gate.queued, 0);
        let mut journal = AdmissionJournal::open_in_memory().unwrap();
        let onset = requeue_after_storage_outage(&mut gate, batch, at(30));
        note_storage_outage(&mut journal, onset);
        assert_eq!(onset, at(30));
        assert_eq!(gate.storage_since, Some(at(30)));
        assert_eq!(gate.queued, 1);
        assert_eq!(journal.provisional().len(), 1);
        assert_eq!(journal.provisional()[0].reason, GapReason::StorageFailure);
        assert_eq!(journal.provisional()[0].scope, GapScope::Home);
        assert_eq!(journal.provisional()[0].onset, at(30));
        assert_eq!(
            journal.gap_accounting(),
            admission_journal::GapAccounting::Certain
        );

        let again = gate.drain(8);
        let later = requeue_after_storage_outage(&mut gate, again, at(40));
        note_storage_outage(&mut journal, later);
        assert_eq!(later, at(30));
        assert_eq!(journal.provisional().len(), 1);
        assert_eq!(journal.provisional()[0].onset, at(30));

        let batch = gate.drain(8);
        let mut failed = AdmissionJournal::open_in_memory().unwrap();
        failed.fail_next_write();
        let onset = requeue_after_storage_outage(&mut gate, batch, at(50));
        note_storage_outage(&mut failed, onset);
        assert_eq!(onset, at(30));
        assert_eq!(gate.queued, 1);
        assert_eq!(gate.drain(8).observations[0].observation_id, "obs-outage");
        assert!(failed.provisional().is_empty());
        assert_eq!(
            failed.gap_accounting(),
            admission_journal::GapAccounting::Uncertain
        );
    }

    #[test]
    fn uncommitted_flush_keeps_the_queue_bound_and_identity() {
        let id = CapabilityId::from_uuid(Uuid::from_u128(12));
        let registered = capability(id, CapabilityKind::Power, 60);
        let state = CurrentState::new(StateEpoch::from_uuid(Uuid::from_u128(9)));
        let device = registered.declaration.identity.device.clone();
        state.reconcile_manifest(&device, vec![registered], at(0));
        let mut gate = HistoryGate::new(1);
        admit(
            &mut gate,
            &state,
            report("obs-1", 10, id, CapabilityKind::Power, 5, None),
            at(10),
        );
        let batch = gate.drain(8);
        assert_eq!(gate.queued, 0);
        let replay = admit(
            &mut gate,
            &state,
            report("obs-1", 11, id, CapabilityKind::Power, 6, None),
            at(11),
        );
        assert_eq!(
            replay.outcomes[0].history,
            HistoryAdmissionOutcome::Rejected(HistoryRejection::ExactReplay)
        );
        let other = CapabilityId::from_uuid(Uuid::from_u128(13));
        let other_capability = capability(other, CapabilityKind::ImportedEnergy, 60);
        state.reconcile_manifest(
            &device,
            vec![state.registered(id).unwrap(), other_capability],
            at(0),
        );
        let blocked = admit(
            &mut gate,
            &state,
            report(
                "energy-1",
                12,
                other,
                CapabilityKind::ImportedEnergy,
                9,
                None,
            ),
            at(12),
        );
        assert_eq!(
            blocked.outcomes[0].history,
            HistoryAdmissionOutcome::Rejected(HistoryRejection::QueueFull)
        );
        gate.acknowledge(&batch);
        let admitted = admit(
            &mut gate,
            &state,
            report(
                "energy-2",
                13,
                other,
                CapabilityKind::ImportedEnergy,
                10,
                None,
            ),
            at(13),
        );
        assert_eq!(
            admitted.outcomes[0].history,
            HistoryAdmissionOutcome::Eligible
        );
    }

    #[test]
    fn unknown_capability_does_not_start_recording() {
        let id = CapabilityId::from_uuid(Uuid::from_u128(10));
        let mut gate = HistoryGate::new(4);
        let reading = report("obs-1", 10, id, CapabilityKind::Power, 5, None);
        let mut result = IngestResult {
            outcomes: vec![super::super::ObservationOutcome {
                capability_id: id,
                current: CurrentStateDisposition::UnknownCapability,
                history: HistoryAdmissionOutcome::Rejected(HistoryRejection::InvalidCapability),
            }],
            changes: Vec::new(),
        };
        gate.admit(&mut result, &reading, at(10), |_| None);
        assert!(!gate.recording_since.contains_key(&id));
        assert!(gate.pending_bounds.is_empty());
    }

    #[test]
    fn disk_floor_rejects_eligible_history_and_leaves_current_state() {
        let id = CapabilityId::from_uuid(Uuid::from_u128(26));
        let other = CapabilityId::from_uuid(Uuid::from_u128(27));
        let registered = capability(id, CapabilityKind::Power, 60);
        let state = CurrentState::new(StateEpoch::from_uuid(Uuid::from_u128(9)));
        let device = registered.declaration.identity.device.clone();
        state.reconcile_manifest(&device, vec![registered], at(0));
        let mut gate = HistoryGate::new(8);
        gate.set_disk_floor_breached(|| true);
        crate::capabilities::admission_journal::clear_disk_floor_for_test();
        let report = report("floor-1", 10, id, CapabilityKind::Power, 5, None);
        let mut result = IngestResult {
            outcomes: vec![
                ObservationOutcome {
                    capability_id: id,
                    current: CurrentStateDisposition::Changed,
                    history: HistoryAdmissionOutcome::Eligible,
                },
                ObservationOutcome {
                    capability_id: other,
                    current: CurrentStateDisposition::Older,
                    history: HistoryAdmissionOutcome::Rejected(HistoryRejection::Late),
                },
            ],
            changes: Vec::new(),
        };
        gate.admit(&mut result, &report, at(20), |capability_id| {
            state.registered(capability_id)
        });
        assert_eq!(
            result.outcomes[0].history,
            HistoryAdmissionOutcome::Rejected(HistoryRejection::DiskFloor)
        );
        assert_eq!(result.outcomes[0].current, CurrentStateDisposition::Changed);
        assert_eq!(result.outcomes[1].current, CurrentStateDisposition::Older);
        assert_eq!(
            result.outcomes[1].history,
            HistoryAdmissionOutcome::Rejected(HistoryRejection::Late)
        );
        assert_eq!(gate.queued, 0);
        assert_eq!(
            crate::capabilities::admission_journal::disk_floor_onsets_for_test(),
            vec![at(20)]
        );
    }

    fn isolated_pool() -> DbPool {
        crate::db::test_pool()
    }

    #[tokio::test]
    #[ignore = "requires the isolated PostgreSQL database created by the verification script"]
    async fn stores_one_row_per_observation_and_keeps_recording_since() {
        let repository = crate::capabilities::CapabilityRepository::new(isolated_pool());
        let store = HistoryRepository::new(isolated_pool());
        let external_id = format!("plug-{}", Uuid::new_v4());
        let device = DeviceIdentity::new("zigbee", &external_id).unwrap();
        let declaration = RegisteredCapability::for_test(
            CapabilityId::from_uuid(Uuid::new_v4()),
            &device.protocol,
            &device.external_id,
            CapabilityKind::Power,
            PhysicalScope::Device,
            60_000,
        )
        .declaration;
        let registered = repository
            .reconcile_complete_manifest(
                crate::capabilities::CompleteCapabilityManifest {
                    device: device.clone(),
                    capabilities: vec![declaration],
                },
                at(1),
            )
            .await
            .unwrap();
        let id = registered[0].id;
        let state = CurrentState::new(StateEpoch::from_uuid(Uuid::from_u128(11)));
        state.reconcile_manifest(&device, registered, at(1));
        let mut gate = HistoryGate::new(8);
        admit(
            &mut gate,
            &state,
            report(
                "obs-kept",
                1_781_308_800,
                id,
                CapabilityKind::Power,
                25,
                Some(true),
            ),
            at(1_781_308_900),
        );
        admit(
            &mut gate,
            &state,
            report(
                "obs-kept",
                1_781_308_800,
                id,
                CapabilityKind::Power,
                25,
                Some(true),
            ),
            at(1_781_308_901),
        );
        let mut ancient = report(
            "obs-ancient",
            631_152_000,
            id,
            CapabilityKind::Power,
            7,
            None,
        );
        ancient.observed_at = Some(at(631_152_000));
        let ancient_result = admit(&mut gate, &state, ancient, at(1_781_308_902));
        assert_eq!(
            ancient_result.outcomes[0].history,
            HistoryAdmissionOutcome::Rejected(HistoryRejection::Late)
        );
        let batch = gate.drain(8);
        let recording_since = batch
            .bounds
            .iter()
            .find(|(capability_id, _)| *capability_id == id)
            .unwrap()
            .1;
        store.commit(batch.clone()).await.unwrap();
        let mut shifted = batch.clone();
        shifted.bounds.clear();
        for row in &mut shifted.observations {
            if row.observation_id == "obs-kept" {
                row.observed_at = at(1_781_400_000);
            }
        }
        store.commit(shifted).await.unwrap();
        store
            .commit(HistoryBatch {
                bounds: vec![(id, at(1_900_000_000))],
                observations: Vec::new(),
            })
            .await
            .unwrap();

        let conn = store.pool.get().await.unwrap();
        let capability_id = id.into_uuid();
        let rows = conn
            .interact(move |conn| stored_rows(conn, capability_id))
            .await
            .unwrap()
            .unwrap();
        assert_eq!(rows.len(), 1);
        let kept = rows
            .iter()
            .find(|row| row.observation_id == "obs-kept")
            .unwrap();
        assert_eq!(kept.value, 25);
        assert_eq!(kept.observed_at, at(1_781_308_800));
        assert_eq!(kept.received_at, at(1_781_308_900));
        assert_eq!(kept.reset, Some(true));
        assert!(kept.partition.contains("capability_observations_y2026"));
        assert!(rows.iter().all(|row| row.observation_id != "obs-ancient"));
        assert_eq!(rows[0].recording_since, recording_since);
    }

    #[derive(QueryableByName)]
    struct StoredHistoryRow {
        #[diesel(sql_type = diesel::sql_types::Text)]
        observation_id: String,
        #[diesel(sql_type = diesel::sql_types::BigInt)]
        value: i64,
        #[diesel(sql_type = diesel::sql_types::Timestamptz)]
        observed_at: DateTime<Utc>,
        #[diesel(sql_type = diesel::sql_types::Timestamptz)]
        received_at: DateTime<Utc>,
        #[diesel(sql_type = diesel::sql_types::Nullable<diesel::sql_types::Bool>)]
        reset: Option<bool>,
        #[diesel(sql_type = diesel::sql_types::Text)]
        partition: String,
        #[diesel(sql_type = diesel::sql_types::Timestamptz)]
        recording_since: DateTime<Utc>,
    }

    fn stored_rows(
        conn: &mut PgConnection,
        capability_id: Uuid,
    ) -> Result<Vec<StoredHistoryRow>, diesel::result::Error> {
        diesel::sql_query(
            "SELECT observation.observation_id,
                    observation.value,
                    observation.observed_at,
                    observation.received_at,
                    observation.reset,
                    observation.tableoid::regclass::text AS partition,
                    bounds.recording_since
             FROM capability_observations observation
             JOIN capability_recording_bounds bounds
               ON bounds.capability_id = observation.capability_id
             WHERE observation.capability_id = $1
             ORDER BY observation.observation_id",
        )
        .bind::<diesel::sql_types::Uuid, _>(capability_id)
        .load(conn)
    }
}
