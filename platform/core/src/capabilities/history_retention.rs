//! Correction-window recomputation and convergent History retention.
//!
//! Readable History stays on the Controller. Checkpoints are relational rows, not JSON.

use std::collections::HashMap;

use chrono::{DateTime, Duration, Months, Timelike, Utc};
use diesel::prelude::*;
use diesel::sql_types::{Array, BigInt, Bool, Nullable, Text, Timestamptz, Uuid as SqlUuid};
use thiserror::Error;
use uuid::Uuid;

use crate::db::schema::{capability_observations, history_gaps, history_retention_checkpoints};
use crate::diagnostics::{DiagnosticPartition, MAX_BYTES};

use super::CapabilityKind;
use super::gauge_rollup::{
    self, GaugeKind, GaugeObservation, GaugeRollup, PowerRollup, RollupInput,
};
use super::history::outside_correction_window;
use super::meter_epoch::{
    self, CounterObservation, EnergyCounterRollup, MeasuredEnergyQuery, MeterEpoch,
};

/// History budget fraction that starts cleanup. 90 percent, integer arithmetic.
pub const CLEANUP_START_PERCENT: u128 = 90;
/// Cleanup keeps going until usage is strictly below this fraction of the budget.
pub const CLEANUP_STOP_PERCENT: u128 = 80;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum Resolution {
    Raw,
    OneMinute,
    FiveMinute,
    FifteenMinute,
    Hourly,
    Daily,
}

impl Resolution {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Raw => "raw",
            Self::OneMinute => "one_minute",
            Self::FiveMinute => "five_minute",
            Self::FifteenMinute => "fifteen_minute",
            Self::Hourly => "hourly",
            Self::Daily => "daily",
        }
    }

    fn parse(value: &str) -> Option<Self> {
        Some(match value {
            "raw" => Self::Raw,
            "one_minute" => Self::OneMinute,
            "five_minute" => Self::FiveMinute,
            "fifteen_minute" => Self::FifteenMinute,
            "hourly" => Self::Hourly,
            "daily" => Self::Daily,
            _ => return None,
        })
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RetainFor {
    Hours(i64),
    Days(i64),
    Months(u32),
    Years(u32),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RetentionTier {
    pub resolution: Resolution,
    pub retain: RetainFor,
}

const POWER_TIERS: [RetentionTier; 5] = [
    RetentionTier {
        resolution: Resolution::Raw,
        retain: RetainFor::Hours(48),
    },
    RetentionTier {
        resolution: Resolution::OneMinute,
        retain: RetainFor::Days(7),
    },
    RetentionTier {
        resolution: Resolution::FifteenMinute,
        retain: RetainFor::Months(13),
    },
    RetentionTier {
        resolution: Resolution::Hourly,
        retain: RetainFor::Years(5),
    },
    RetentionTier {
        resolution: Resolution::Daily,
        retain: RetainFor::Years(10),
    },
];

const ENERGY_TIERS: [RetentionTier; 4] = [
    RetentionTier {
        resolution: Resolution::Raw,
        retain: RetainFor::Days(7),
    },
    RetentionTier {
        resolution: Resolution::FifteenMinute,
        retain: RetainFor::Months(13),
    },
    RetentionTier {
        resolution: Resolution::Hourly,
        retain: RetainFor::Years(5),
    },
    RetentionTier {
        resolution: Resolution::Daily,
        retain: RetainFor::Years(10),
    },
];

const GAUGE_TIERS: [RetentionTier; 4] = [
    RetentionTier {
        resolution: Resolution::Raw,
        retain: RetainFor::Hours(24),
    },
    RetentionTier {
        resolution: Resolution::FiveMinute,
        retain: RetainFor::Days(7),
    },
    RetentionTier {
        resolution: Resolution::Hourly,
        retain: RetainFor::Months(13),
    },
    RetentionTier {
        resolution: Resolution::Daily,
        retain: RetainFor::Years(5),
    },
];

pub fn retention_tiers(kind: CapabilityKind) -> &'static [RetentionTier] {
    match kind {
        CapabilityKind::Power => &POWER_TIERS,
        CapabilityKind::ImportedEnergy | CapabilityKind::ExportedEnergy => &ENERGY_TIERS,
        CapabilityKind::Voltage | CapabilityKind::Current => &GAUGE_TIERS,
    }
}

pub fn raw_retention(kind: CapabilityKind) -> RetainFor {
    retention_tiers(kind)[0].retain
}

pub fn next_resolution(kind: CapabilityKind, resolution: Resolution) -> Option<Resolution> {
    let tiers = retention_tiers(kind);
    let index = tiers
        .iter()
        .position(|tier| tier.resolution == resolution)?;
    tiers.get(index + 1).map(|tier| tier.resolution)
}

pub fn retained_until(instant: DateTime<Utc>, retain: RetainFor) -> Option<DateTime<Utc>> {
    match retain {
        RetainFor::Hours(hours) => instant.checked_add_signed(Duration::hours(hours)),
        RetainFor::Days(days) => instant.checked_add_signed(Duration::days(days)),
        RetainFor::Months(months) => instant.checked_add_months(Months::new(months)),
        RetainFor::Years(years) => {
            instant.checked_add_months(Months::new(years.saturating_mul(12)))
        }
    }
}

/// True when `now` is strictly after the retention instant. The boundary itself is still kept.
pub fn past_retention(instant: DateTime<Utc>, now: DateTime<Utc>, retain: RetainFor) -> bool {
    retained_until(instant, retain).is_some_and(|until| now > until)
}

pub fn observation_is_correctable(
    kind: CapabilityKind,
    observed_at: DateTime<Utc>,
    received_at: DateTime<Utc>,
) -> bool {
    !outside_correction_window(kind, observed_at, received_at)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TimeSpan {
    pub start: DateTime<Utc>,
    pub end: DateTime<Utc>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub struct RollupBucket {
    pub resolution: Resolution,
    pub start: DateTime<Utc>,
    pub end: DateTime<Utc>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SeriesPoint {
    pub observed_at: DateTime<Utc>,
    pub value: i64,
    pub scale: u8,
    pub reset: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct AcceptedObservation {
    pub observed_at: DateTime<Utc>,
    pub received_at: DateTime<Utc>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SeriesRecompute {
    pub capability_id: Uuid,
    pub kind: CapabilityKind,
    pub points: Vec<SeriesPoint>,
    pub accepted: Vec<AcceptedObservation>,
    pub counter_resolution: i64,
    pub freshness: Duration,
    pub breaks: Vec<TimeSpan>,
    pub history_gaps: Vec<TimeSpan>,
    pub unavailable: Vec<TimeSpan>,
    pub uncertain_identity: Vec<TimeSpan>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RecomputedRollups {
    pub power: Vec<(Resolution, PowerRollup)>,
    pub gauge: Vec<(Resolution, GaugeRollup)>,
    pub energy: Vec<(Resolution, EnergyCounterRollup)>,
    pub epochs: Vec<MeterEpoch>,
}

impl RecomputedRollups {
    fn empty() -> Self {
        Self {
            power: Vec::new(),
            gauge: Vec::new(),
            energy: Vec::new(),
            epochs: Vec::new(),
        }
    }
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum RecomputeError {
    #[error(transparent)]
    Gauge(#[from] gauge_rollup::RollupError),
    #[error(transparent)]
    Energy(#[from] meter_epoch::MeterEpochError),
}

pub fn energy_counter_upsert_sql() -> &'static str {
    meter_epoch::energy_counter_rollup_upsert_sql()
}

pub fn epoch_upsert_sql() -> &'static str {
    meter_epoch::meter_epoch_upsert_sql()
}

pub fn checkpoint_upsert_sql() -> &'static str {
    "INSERT INTO history_retention_checkpoints (
    capability_id, kind, step, resolution, range_start, range_end, verified
) VALUES ($1, $2, $3, $4, $5, $6, $7)
ON CONFLICT (capability_id, step, resolution, range_start, range_end) DO UPDATE SET
    verified = EXCLUDED.verified"
}

pub fn buckets_covering(
    resolution: Resolution,
    start: DateTime<Utc>,
    end: DateTime<Utc>,
) -> Vec<RollupBucket> {
    if resolution == Resolution::Raw || end <= start {
        return Vec::new();
    }
    let step = bucket_length(resolution);
    if step <= Duration::zero() {
        return Vec::new();
    }
    let mut cursor = align_start(start, resolution);
    let mut buckets = Vec::new();
    while cursor < end && buckets.len() < 200_000 {
        let next = match cursor.checked_add_signed(step) {
            Some(next) if next > cursor => next,
            _ => break,
        };
        buckets.push(RollupBucket {
            resolution,
            start: cursor,
            end: next,
        });
        cursor = next;
    }
    buckets
}

pub fn recompute_series(request: &SeriesRecompute) -> Result<RecomputedRollups, RecomputeError> {
    let points = ordered_points(&request.points);
    let buckets = affected_buckets(request.kind, &points, &request.accepted);
    if buckets.is_empty() {
        return Ok(RecomputedRollups::empty());
    }
    let mut rollups = RecomputedRollups::empty();
    // One resolution per call. Overlapping buckets of different resolutions would split one
    // counter delta across every bucket instead of recomputing each tier on its own.
    match request.kind {
        CapabilityKind::Power => {
            for (resolution, group) in buckets_by_resolution(&buckets) {
                let input = RollupInput {
                    observations: gauge_points(&points),
                    breaks: gauge_spans(&request.breaks),
                    freshness: request.freshness,
                    buckets: group.iter().map(gauge_bucket).collect(),
                };
                for row in gauge_rollup::rollup_power(&input)? {
                    rollups.power.push((resolution, row));
                }
            }
        }
        CapabilityKind::Voltage | CapabilityKind::Current => {
            for (resolution, group) in buckets_by_resolution(&buckets) {
                let input = RollupInput {
                    observations: gauge_points(&points),
                    breaks: gauge_spans(&request.breaks),
                    freshness: request.freshness,
                    buckets: group.iter().map(gauge_bucket).collect(),
                };
                for row in gauge_rollup::rollup_gauge(&input)? {
                    rollups.gauge.push((resolution, row));
                }
            }
        }
        CapabilityKind::ImportedEnergy | CapabilityKind::ExportedEnergy => {
            let query = MeasuredEnergyQuery {
                capability_id: request.capability_id,
                resolution: request.counter_resolution,
                observations: counter_points(&points),
                history_gaps: meter_spans(&request.history_gaps),
                unavailable: meter_spans(&request.unavailable),
                uncertain_identity: meter_spans(&request.uncertain_identity),
                state_epoch_changes: Vec::new(),
            };
            for (resolution, group) in buckets_by_resolution(&buckets) {
                let meter_buckets: Vec<_> = group.iter().map(meter_bucket).collect();
                let measured = meter_epoch::measure_energy(&query, &meter_buckets)?;
                if rollups.epochs.is_empty() {
                    rollups.epochs = measured.epochs;
                }
                for row in measured.rollups {
                    rollups.energy.push((resolution, row));
                }
            }
        }
    }
    rollups.power.sort_by(bucket_order);
    rollups.gauge.sort_by(bucket_order);
    rollups.energy.sort_by(bucket_order);
    rollups.epochs.sort_by_key(|epoch| epoch.started_at);
    Ok(rollups)
}

fn bucket_order<T>(left: &(Resolution, T), right: &(Resolution, T)) -> std::cmp::Ordering
where
    T: BucketTimed,
{
    left.0
        .cmp(&right.0)
        .then(left.1.bucket_start().cmp(&right.1.bucket_start()))
}

trait BucketTimed {
    fn bucket_start(&self) -> DateTime<Utc>;
}

impl BucketTimed for PowerRollup {
    fn bucket_start(&self) -> DateTime<Utc> {
        self.bucket.start
    }
}

impl BucketTimed for GaugeRollup {
    fn bucket_start(&self) -> DateTime<Utc> {
        self.bucket.start
    }
}

impl BucketTimed for EnergyCounterRollup {
    fn bucket_start(&self) -> DateTime<Utc> {
        self.bucket.start
    }
}

fn buckets_by_resolution(buckets: &[RollupBucket]) -> Vec<(Resolution, Vec<RollupBucket>)> {
    let mut groups: Vec<(Resolution, Vec<RollupBucket>)> = Vec::new();
    for bucket in buckets {
        if let Some((_, group)) = groups
            .iter_mut()
            .find(|(resolution, _)| *resolution == bucket.resolution)
        {
            group.push(*bucket);
        } else {
            groups.push((bucket.resolution, vec![*bucket]));
        }
    }
    groups
}

fn ordered_points(points: &[SeriesPoint]) -> Vec<SeriesPoint> {
    let mut points = points.to_vec();
    points.sort_by_key(|point| point.observed_at);
    points.dedup_by(|left, right| left.observed_at == right.observed_at);
    points
}

fn affected_buckets(
    kind: CapabilityKind,
    points: &[SeriesPoint],
    accepted: &[AcceptedObservation],
) -> Vec<RollupBucket> {
    let mut buckets = Vec::new();
    for observation in accepted {
        if !observation_is_correctable(kind, observation.observed_at, observation.received_at) {
            continue;
        }
        let (start, end) = influence_span(points, observation.observed_at);
        for tier in retention_tiers(kind) {
            if tier.resolution == Resolution::Raw {
                continue;
            }
            if past_retention(
                observation.observed_at,
                observation.received_at,
                tier.retain,
            ) {
                continue;
            }
            for bucket in buckets_covering(tier.resolution, start, end) {
                if !past_retention(bucket.start, observation.received_at, tier.retain) {
                    buckets.push(bucket);
                }
            }
        }
    }
    buckets.sort();
    buckets.dedup();
    buckets
}

fn influence_span(
    points: &[SeriesPoint],
    accepted_at: DateTime<Utc>,
) -> (DateTime<Utc>, DateTime<Utc>) {
    let prev = points
        .iter()
        .filter(|point| point.observed_at < accepted_at)
        .max_by_key(|point| point.observed_at);
    let next = points
        .iter()
        .filter(|point| point.observed_at > accepted_at)
        .min_by_key(|point| point.observed_at);
    let start = prev.map(|point| point.observed_at).unwrap_or(accepted_at);
    let end = next
        .map(|point| point.observed_at)
        .or_else(|| prev.map(|_| accepted_at))
        .unwrap_or_else(|| accepted_at + Duration::nanoseconds(1));
    if end <= start {
        (start, start + Duration::nanoseconds(1))
    } else {
        (start, end)
    }
}

fn gauge_points(points: &[SeriesPoint]) -> Vec<GaugeObservation> {
    points
        .iter()
        .map(|point| GaugeObservation {
            observed_at: point.observed_at,
            value: point.value,
            scale: point.scale,
        })
        .collect()
}

fn counter_points(points: &[SeriesPoint]) -> Vec<CounterObservation> {
    points
        .iter()
        .map(|point| CounterObservation {
            observed_at: point.observed_at,
            value: point.value,
            reset: point.reset,
            identity_changed: false,
        })
        .collect()
}

fn gauge_spans(spans: &[TimeSpan]) -> Vec<gauge_rollup::ClosedInterval> {
    spans
        .iter()
        .filter(|span| span.end > span.start)
        .map(|span| gauge_rollup::ClosedInterval {
            start: span.start,
            end: span.end,
        })
        .collect()
}

fn meter_spans(spans: &[TimeSpan]) -> Vec<meter_epoch::ClosedInterval> {
    spans
        .iter()
        .filter(|span| span.end > span.start)
        .map(|span| meter_epoch::ClosedInterval {
            start: span.start,
            end: span.end,
        })
        .collect()
}

fn gauge_bucket(bucket: &RollupBucket) -> gauge_rollup::ClosedInterval {
    gauge_rollup::ClosedInterval {
        start: bucket.start,
        end: bucket.end,
    }
}

fn meter_bucket(bucket: &RollupBucket) -> meter_epoch::ClosedInterval {
    meter_epoch::ClosedInterval {
        start: bucket.start,
        end: bucket.end,
    }
}

fn bucket_length(resolution: Resolution) -> Duration {
    match resolution {
        Resolution::Raw => Duration::zero(),
        Resolution::OneMinute => Duration::minutes(1),
        Resolution::FiveMinute => Duration::minutes(5),
        Resolution::FifteenMinute => Duration::minutes(15),
        Resolution::Hourly => Duration::hours(1),
        Resolution::Daily => Duration::days(1),
    }
}

fn align_start(at: DateTime<Utc>, resolution: Resolution) -> DateTime<Utc> {
    match resolution {
        Resolution::Daily => at
            .date_naive()
            .and_hms_opt(0, 0, 0)
            .expect("utc midnight")
            .and_utc(),
        Resolution::Hourly => floor_minutes(at, 60),
        Resolution::FifteenMinute => floor_minutes(at, 15),
        Resolution::FiveMinute => floor_minutes(at, 5),
        Resolution::OneMinute | Resolution::Raw => floor_minutes(at, 1),
    }
}

fn floor_minutes(at: DateTime<Utc>, step: u32) -> DateTime<Utc> {
    let minute_of_day = at.hour() * 60 + at.minute();
    let floored = minute_of_day - minute_of_day % step;
    at.date_naive()
        .and_hms_opt(floored / 60, floored % 60, 0)
        .expect("aligned minute")
        .and_utc()
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct BucketUpsert {
    pub capability_id: Uuid,
    pub resolution: Resolution,
    pub bucket_start: DateTime<Utc>,
    pub value: i64,
}

/// In-memory stand-in for the existing `ON CONFLICT` rollup upserts.
pub fn upsert_bucket_rows(table: &mut Vec<BucketUpsert>, rows: &[BucketUpsert]) {
    for row in rows {
        if let Some(existing) = table.iter_mut().find(|kept| {
            kept.capability_id == row.capability_id
                && kept.resolution == row.resolution
                && kept.bucket_start == row.bucket_start
        }) {
            *existing = *row;
        } else {
            table.push(*row);
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RetentionStep {
    Rollup,
    Cleanup,
}

impl RetentionStep {
    fn as_str(self) -> &'static str {
        match self {
            Self::Rollup => "rollup",
            Self::Cleanup => "cleanup",
        }
    }

    fn parse(value: &str) -> Option<Self> {
        match value {
            "rollup" => Some(Self::Rollup),
            "cleanup" => Some(Self::Cleanup),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Checkpoint {
    pub capability_id: Uuid,
    pub kind: CapabilityKind,
    pub step: RetentionStep,
    pub resolution: Resolution,
    pub range_start: DateTime<Utc>,
    pub range_end: DateTime<Utc>,
    pub verified: bool,
}

pub fn upsert_checkpoint(table: &mut Vec<Checkpoint>, checkpoint: Checkpoint) {
    if let Some(existing) = table
        .iter_mut()
        .find(|row| same_checkpoint_key(row, &checkpoint))
    {
        existing.kind = checkpoint.kind;
        existing.verified = checkpoint.verified;
        return;
    }
    table.push(checkpoint);
}

pub fn rerun_is_noop(checkpoints: &[Checkpoint], step: &Checkpoint) -> bool {
    checkpoints
        .iter()
        .any(|row| row.verified && same_checkpoint_key(row, step))
}

fn same_checkpoint_key(left: &Checkpoint, right: &Checkpoint) -> bool {
    left.capability_id == right.capability_id
        && left.step == right.step
        && left.resolution == right.resolution
        && left.range_start == right.range_start
        && left.range_end == right.range_end
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RollupRerun {
    Noop,
    Recompute,
}

pub fn rollup_rerun(
    checkpoints: &[Checkpoint],
    capability_id: Uuid,
    kind: CapabilityKind,
    buckets: &[RollupBucket],
) -> RollupRerun {
    if buckets.is_empty()
        || buckets
            .iter()
            .all(|bucket| verified_rollup_covers(checkpoints, capability_id, kind, bucket))
    {
        RollupRerun::Noop
    } else {
        RollupRerun::Recompute
    }
}

fn verified_rollup_covers(
    checkpoints: &[Checkpoint],
    capability_id: Uuid,
    kind: CapabilityKind,
    bucket: &RollupBucket,
) -> bool {
    checkpoints.iter().any(|row| {
        row.verified
            && row.step == RetentionStep::Rollup
            && row.capability_id == capability_id
            && row.kind == kind
            && row.resolution == bucket.resolution
            && row.range_start == bucket.start
            && row.range_end == bucket.end
    })
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct HistoryRange {
    pub capability_id: Uuid,
    pub kind: CapabilityKind,
    pub resolution: Resolution,
    pub start: DateTime<Utc>,
    pub end: DateTime<Utc>,
    pub bytes: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DropBlocked {
    NextTierUnverified,
    OnlyRemainingVerified,
}

pub fn usage_reaches_start(usage_bytes: u64, budget_bytes: u64) -> bool {
    if budget_bytes == 0 {
        return usage_bytes > 0;
    }
    u128::from(usage_bytes) * 100 >= u128::from(budget_bytes) * CLEANUP_START_PERCENT
}

pub fn usage_below_stop(usage_bytes: u64, budget_bytes: u64) -> bool {
    if budget_bytes == 0 {
        return usage_bytes == 0;
    }
    u128::from(usage_bytes) * 100 < u128::from(budget_bytes) * CLEANUP_STOP_PERCENT
}

pub fn history_cleanup_running(usage_bytes: u64, budget_bytes: u64, already_running: bool) -> bool {
    if usage_below_stop(usage_bytes, budget_bytes) {
        return false;
    }
    already_running || usage_reaches_start(usage_bytes, budget_bytes)
}

pub fn diagnostic_partitions_to_prune(
    partitions: &[DiagnosticPartition],
    now: DateTime<Utc>,
) -> Vec<String> {
    let Some(oldest_end) = now.checked_sub_signed(crate::diagnostics::max_age()) else {
        return Vec::new();
    };
    crate::diagnostics::partitions_to_drop(partitions.to_vec(), oldest_end, MAX_BYTES)
}

pub struct CleanupInput<'a> {
    pub now: DateTime<Utc>,
    pub usage_bytes: u64,
    pub budget_bytes: u64,
    pub already_running: bool,
    pub diagnostic_partitions: &'a [DiagnosticPartition],
    pub ranges: &'a [HistoryRange],
    pub checkpoints: &'a [Checkpoint],
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CleanupAction {
    PruneDiagnostics { partitions: Vec<String> },
    DropRange(HistoryRange),
}

pub fn plan_cleanup(input: &CleanupInput<'_>) -> Vec<CleanupAction> {
    let mut actions = Vec::new();
    let partitions = diagnostic_partitions_to_prune(input.diagnostic_partitions, input.now);
    if !partitions.is_empty() {
        actions.push(CleanupAction::PruneDiagnostics { partitions });
    }
    if !history_cleanup_running(input.usage_bytes, input.budget_bytes, input.already_running) {
        return actions;
    }
    let mut usage = input.usage_bytes;
    let mut dropping = Vec::new();
    for index in candidate_indexes(input.ranges, input.now) {
        if usage_below_stop(usage, input.budget_bytes) {
            break;
        }
        let range = input.ranges[index];
        if cleanup_already_verified(input.checkpoints, &range) {
            continue;
        }
        if drop_block(&range, input.ranges, input.checkpoints, &dropping).is_some() {
            continue;
        }
        actions.push(CleanupAction::DropRange(range));
        dropping.push(index);
        usage = usage.saturating_sub(range.bytes);
    }
    actions
}

/// Inputs the running sweep loads after diagnostic partitions have already been pruned.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SweepSnapshot {
    pub now: DateTime<Utc>,
    pub usage_bytes: u64,
    pub budget_bytes: u64,
    pub already_running: bool,
    pub ranges: Vec<HistoryRange>,
    pub checkpoints: Vec<Checkpoint>,
}

pub fn planned_drops(snapshot: &SweepSnapshot) -> Vec<HistoryRange> {
    plan_cleanup(&CleanupInput {
        now: snapshot.now,
        usage_bytes: snapshot.usage_bytes,
        budget_bytes: snapshot.budget_bytes,
        already_running: snapshot.already_running,
        diagnostic_partitions: &[],
        ranges: &snapshot.ranges,
        checkpoints: &snapshot.checkpoints,
    })
    .into_iter()
    .filter_map(|action| match action {
        CleanupAction::DropRange(range) => Some(range),
        CleanupAction::PruneDiagnostics { .. } => None,
    })
    .collect()
}

/// Applies only the ranges `planned_drops` returns, in that order. Daily stays last
/// because the planner already orders it.
pub fn apply_planned_drops(
    snapshot: &SweepSnapshot,
    mut apply: impl FnMut(&HistoryRange) -> Result<(), String>,
) -> Result<Vec<HistoryRange>, String> {
    let drops = planned_drops(snapshot);
    for range in &drops {
        apply(range)?;
    }
    Ok(drops)
}

pub async fn sweep_budget(
    pool: &crate::state::DbPool,
    now: DateTime<Utc>,
    already_running: bool,
) -> Result<bool, String> {
    let conn = pool.get().await.map_err(|error| error.to_string())?;
    conn.interact(move |conn| apply_budget_sweep(conn, now, already_running))
        .await
        .map_err(|error| error.to_string())?
}

fn apply_budget_sweep(
    conn: &mut PgConnection,
    now: DateTime<Utc>,
    already_running: bool,
) -> Result<bool, String> {
    let Some(snapshot) = load_sweep_snapshot(conn, now, already_running)? else {
        return Ok(false);
    };
    let drops = apply_planned_drops(&snapshot, |range| {
        delete_history_range(conn, range).map_err(|error| error.to_string())
    })?;
    let dropped_bytes = drops
        .iter()
        .fold(0u64, |total, range| total.saturating_add(range.bytes));
    let remaining = snapshot.usage_bytes.saturating_sub(dropped_bytes);
    let started = history_cleanup_running(
        snapshot.usage_bytes,
        snapshot.budget_bytes,
        snapshot.already_running,
    );
    Ok(history_cleanup_running(
        remaining,
        snapshot.budget_bytes,
        started,
    ))
}

fn delete_history_range(
    conn: &mut PgConnection,
    range: &HistoryRange,
) -> Result<(), diesel::result::Error> {
    match range.resolution {
        Resolution::Raw => {
            diesel::sql_query(
                "DELETE FROM capability_observations
                 WHERE capability_id = $1 AND kind = $2
                   AND observed_at >= $3 AND observed_at < $4",
            )
            .bind::<SqlUuid, _>(range.capability_id)
            .bind::<Text, _>(range.kind.as_str())
            .bind::<Timestamptz, _>(range.start)
            .bind::<Timestamptz, _>(range.end)
            .execute(conn)?;
        }
        _ => match range.kind {
            CapabilityKind::Power => {
                diesel::sql_query(
                    "DELETE FROM power_rollups
                     WHERE capability_id = $1 AND bucket_start = $2 AND bucket_end = $3",
                )
                .bind::<SqlUuid, _>(range.capability_id)
                .bind::<Timestamptz, _>(range.start)
                .bind::<Timestamptz, _>(range.end)
                .execute(conn)?;
            }
            CapabilityKind::Voltage | CapabilityKind::Current => {
                diesel::sql_query(
                    "DELETE FROM gauge_rollups
                     WHERE capability_id = $1 AND gauge_kind = $2
                       AND bucket_start = $3 AND bucket_end = $4",
                )
                .bind::<SqlUuid, _>(range.capability_id)
                .bind::<Text, _>(range.kind.as_str())
                .bind::<Timestamptz, _>(range.start)
                .bind::<Timestamptz, _>(range.end)
                .execute(conn)?;
            }
            CapabilityKind::ImportedEnergy | CapabilityKind::ExportedEnergy => {
                diesel::sql_query(
                    "DELETE FROM energy_counter_rollups
                     WHERE capability_id = $1 AND bucket_start = $2 AND bucket_end = $3",
                )
                .bind::<SqlUuid, _>(range.capability_id)
                .bind::<Timestamptz, _>(range.start)
                .bind::<Timestamptz, _>(range.end)
                .execute(conn)?;
            }
        },
    }
    upsert_checkpoint_row(
        conn,
        &Checkpoint {
            capability_id: range.capability_id,
            kind: range.kind,
            step: RetentionStep::Cleanup,
            resolution: range.resolution,
            range_start: range.start,
            range_end: range.end,
            verified: true,
        },
    )
}

fn load_sweep_snapshot(
    conn: &mut PgConnection,
    now: DateTime<Utc>,
    already_running: bool,
) -> Result<Option<SweepSnapshot>, String> {
    let usage_bytes = history_usage_bytes(conn)?;
    let filesystem_total = super::history_budget::read_filesystem_stats(
        &super::history_budget::filesystem_path(None),
    )
    .ok()
    .map(|stats| stats.total_bytes);
    let Some(budget_bytes) = configured_budget_bytes(conn, filesystem_total)? else {
        return Ok(None);
    };
    Ok(Some(SweepSnapshot {
        now,
        usage_bytes,
        budget_bytes,
        already_running,
        ranges: load_expired_ranges(conn, now)?,
        checkpoints: load_all_checkpoints(conn)?,
    }))
}

fn history_usage_bytes(conn: &mut PgConnection) -> Result<u64, String> {
    let names: Vec<String> = super::history_budget::HISTORY_RELATIONS
        .iter()
        .map(|name| (*name).to_string())
        .collect();
    let rows = diesel::sql_query(super::history_budget::HISTORY_USAGE_SQL)
        .bind::<Array<Text>, _>(names)
        .load::<SweepUsageRow>(conn)
        .map_err(|error| error.to_string())?;
    let reported: Vec<(&str, u64)> = rows
        .iter()
        .filter_map(|row| {
            u64::try_from(row.bytes)
                .ok()
                .map(|bytes| (row.name.as_str(), bytes))
        })
        .collect();
    Ok(super::history_budget::history_usage_bytes(&reported))
}

fn configured_budget_bytes(
    conn: &mut PgConnection,
    filesystem_total: Option<u64>,
) -> Result<Option<u64>, String> {
    let stored = diesel::sql_query("SELECT budget_bytes FROM history_budget WHERE id = 1")
        .get_result::<SweepBudgetRow>(conn)
        .optional()
        .map_err(|error| error.to_string())?;
    if let Some(row) = stored {
        return Ok(Some(u64::try_from(row.budget_bytes).unwrap_or(0)));
    }
    Ok(filesystem_total.map(super::history_budget::default_budget_bytes))
}

fn load_expired_ranges(
    conn: &mut PgConnection,
    now: DateTime<Utc>,
) -> Result<Vec<HistoryRange>, String> {
    let mut ranges = Vec::new();
    let raw_rows = diesel::sql_query(
        "SELECT capability_id, kind, observed_at, pg_column_size(capability_observations.*)::bigint AS bytes
         FROM capability_observations",
    )
    .load::<RawRangeRow>(conn)
    .map_err(|error| error.to_string())?;
    for row in raw_rows {
        let Ok(kind) = CapabilityKind::parse(&row.kind) else {
            continue;
        };
        let Some(end) = row.observed_at.checked_add_signed(Duration::microseconds(1)) else {
            continue;
        };
        let range = HistoryRange {
            capability_id: row.capability_id,
            kind,
            resolution: Resolution::Raw,
            start: row.observed_at,
            end,
            bytes: u64::try_from(row.bytes).unwrap_or(0),
        };
        if range_expired(&range, now) {
            ranges.push(range);
        }
    }
    let rollup_sql = [
        "SELECT r.capability_id, i.kind, r.bucket_start, r.bucket_end,
                pg_column_size(r.*)::bigint AS bytes
         FROM power_rollups r
         JOIN capability_identities i ON i.id = r.capability_id",
        "SELECT capability_id, gauge_kind AS kind, bucket_start, bucket_end,
                pg_column_size(gauge_rollups.*)::bigint AS bytes
         FROM gauge_rollups",
        "SELECT r.capability_id, i.kind, r.bucket_start, r.bucket_end,
                pg_column_size(r.*)::bigint AS bytes
         FROM energy_counter_rollups r
         JOIN capability_identities i ON i.id = r.capability_id",
    ];
    for sql in rollup_sql {
        let rows = diesel::sql_query(sql)
            .load::<RollupRangeRow>(conn)
            .map_err(|error| error.to_string())?;
        for row in rows {
            let Ok(kind) = CapabilityKind::parse(&row.kind) else {
                continue;
            };
            let Some(resolution) = resolution_of_span(row.bucket_start, row.bucket_end) else {
                continue;
            };
            if !retention_tiers(kind)
                .iter()
                .any(|tier| tier.resolution == resolution)
            {
                continue;
            }
            let range = HistoryRange {
                capability_id: row.capability_id,
                kind,
                resolution,
                start: row.bucket_start,
                end: row.bucket_end,
                bytes: u64::try_from(row.bytes).unwrap_or(0),
            };
            if range_expired(&range, now) {
                ranges.push(range);
            }
        }
    }
    Ok(ranges)
}

fn resolution_of_span(start: DateTime<Utc>, end: DateTime<Utc>) -> Option<Resolution> {
    let seconds = (end - start).num_seconds();
    Some(match seconds {
        60 => Resolution::OneMinute,
        300 => Resolution::FiveMinute,
        900 => Resolution::FifteenMinute,
        3600 => Resolution::Hourly,
        82_800..=90_000 => Resolution::Daily,
        _ => return None,
    })
}

fn load_all_checkpoints(conn: &mut PgConnection) -> Result<Vec<Checkpoint>, String> {
    let rows = diesel::sql_query(
        "SELECT capability_id, kind, step, resolution, range_start, range_end, verified
         FROM history_retention_checkpoints",
    )
    .load::<SweepCheckpointRow>(conn)
    .map_err(|error| error.to_string())?;
    Ok(rows
        .into_iter()
        .filter_map(|row| {
            Some(Checkpoint {
                capability_id: row.capability_id,
                kind: CapabilityKind::parse(&row.kind).ok()?,
                step: RetentionStep::parse(&row.step)?,
                resolution: Resolution::parse(&row.resolution)?,
                range_start: row.range_start,
                range_end: row.range_end,
                verified: row.verified,
            })
        })
        .collect())
}

#[derive(QueryableByName)]
struct SweepUsageRow {
    #[diesel(sql_type = Text)]
    name: String,
    #[diesel(sql_type = BigInt)]
    bytes: i64,
}

#[derive(QueryableByName)]
struct SweepBudgetRow {
    #[diesel(sql_type = BigInt)]
    budget_bytes: i64,
}

#[derive(QueryableByName)]
struct SweepCheckpointRow {
    #[diesel(sql_type = SqlUuid)]
    capability_id: Uuid,
    #[diesel(sql_type = Text)]
    kind: String,
    #[diesel(sql_type = Text)]
    step: String,
    #[diesel(sql_type = Text)]
    resolution: String,
    #[diesel(sql_type = Timestamptz)]
    range_start: DateTime<Utc>,
    #[diesel(sql_type = Timestamptz)]
    range_end: DateTime<Utc>,
    #[diesel(sql_type = Bool)]
    verified: bool,
}

#[derive(QueryableByName)]
struct RawRangeRow {
    #[diesel(sql_type = SqlUuid)]
    capability_id: Uuid,
    #[diesel(sql_type = Text)]
    kind: String,
    #[diesel(sql_type = Timestamptz)]
    observed_at: DateTime<Utc>,
    #[diesel(sql_type = BigInt)]
    bytes: i64,
}

#[derive(QueryableByName)]
struct RollupRangeRow {
    #[diesel(sql_type = SqlUuid)]
    capability_id: Uuid,
    #[diesel(sql_type = Text)]
    kind: String,
    #[diesel(sql_type = Timestamptz)]
    bucket_start: DateTime<Utc>,
    #[diesel(sql_type = Timestamptz)]
    bucket_end: DateTime<Utc>,
    #[diesel(sql_type = BigInt)]
    bytes: i64,
}

pub fn drop_block(
    range: &HistoryRange,
    ranges: &[HistoryRange],
    checkpoints: &[Checkpoint],
    dropping: &[usize],
) -> Option<DropBlocked> {
    match next_resolution(range.kind, range.resolution) {
        Some(next) => {
            if next_tier_verified(range, next, checkpoints) {
                None
            } else if verified_rollup_range(range, checkpoints) {
                Some(DropBlocked::OnlyRemainingVerified)
            } else {
                Some(DropBlocked::NextTierUnverified)
            }
        }
        None => overlapping_finer_remains(range, ranges, checkpoints, dropping)
            .then_some(DropBlocked::OnlyRemainingVerified),
    }
}

fn candidate_indexes(ranges: &[HistoryRange], now: DateTime<Utc>) -> Vec<usize> {
    let mut indexes: Vec<usize> = ranges
        .iter()
        .enumerate()
        .filter(|(_, range)| range_expired(range, now))
        .map(|(index, _)| index)
        .collect();
    indexes.sort_by(|&left, &right| {
        let left = &ranges[left];
        let right = &ranges[right];
        (left.resolution == Resolution::Daily)
            .cmp(&(right.resolution == Resolution::Daily))
            .then(left.start.cmp(&right.start))
            .then(left.resolution.cmp(&right.resolution))
            .then(left.capability_id.cmp(&right.capability_id))
            .then(left.end.cmp(&right.end))
    });
    indexes
}

fn range_expired(range: &HistoryRange, now: DateTime<Utc>) -> bool {
    if range.end <= range.start {
        return false;
    }
    retention_tiers(range.kind)
        .iter()
        .find(|tier| tier.resolution == range.resolution)
        .is_some_and(|tier| past_retention(range.end, now, tier.retain))
}

fn next_tier_verified(range: &HistoryRange, next: Resolution, checkpoints: &[Checkpoint]) -> bool {
    let buckets = buckets_covering(next, range.start, range.end);
    !buckets.is_empty()
        && buckets.iter().all(|bucket| {
            verified_rollup_covers(checkpoints, range.capability_id, range.kind, bucket)
        })
}

fn verified_rollup_range(range: &HistoryRange, checkpoints: &[Checkpoint]) -> bool {
    checkpoints.iter().any(|row| {
        row.verified
            && row.step == RetentionStep::Rollup
            && row.capability_id == range.capability_id
            && row.kind == range.kind
            && row.resolution == range.resolution
            && row.range_start == range.start
            && row.range_end == range.end
    })
}

fn cleanup_already_verified(checkpoints: &[Checkpoint], range: &HistoryRange) -> bool {
    checkpoints.iter().any(|row| {
        row.verified
            && row.step == RetentionStep::Cleanup
            && row.capability_id == range.capability_id
            && row.resolution == range.resolution
            && row.range_start == range.start
            && row.range_end == range.end
    })
}

fn overlapping_finer_remains(
    daily: &HistoryRange,
    ranges: &[HistoryRange],
    checkpoints: &[Checkpoint],
    dropping: &[usize],
) -> bool {
    ranges.iter().enumerate().any(|(index, range)| {
        range.capability_id == daily.capability_id
            && range.kind == daily.kind
            && range.resolution != Resolution::Daily
            && range.start < daily.end
            && daily.start < range.end
            && !dropping.contains(&index)
            && !cleanup_already_verified(checkpoints, range)
    })
}

#[derive(Debug, Clone)]
pub(super) struct WrittenObservation {
    pub capability_id: Uuid,
    pub kind: CapabilityKind,
    pub value: i64,
    pub scale: u8,
    pub observed_at: DateTime<Utc>,
    pub received_at: DateTime<Utc>,
    pub reset: bool,
    pub resolution: i64,
    pub freshness: Duration,
    pub newly_inserted: bool,
}

pub(super) fn after_observation_write(
    conn: &mut PgConnection,
    written: &[WrittenObservation],
) -> Result<(), diesel::result::Error> {
    let mut groups: HashMap<Uuid, Vec<&WrittenObservation>> = HashMap::new();
    for row in written {
        groups.entry(row.capability_id).or_default().push(row);
    }
    for (capability_id, rows) in groups {
        recompute_capability(conn, capability_id, &rows)?;
    }
    Ok(())
}

fn recompute_capability(
    conn: &mut PgConnection,
    capability_id: Uuid,
    rows: &[&WrittenObservation],
) -> Result<(), diesel::result::Error> {
    let kind = rows[0].kind;
    let newly_inserted = rows.iter().any(|row| row.newly_inserted);
    let latest_received = rows
        .iter()
        .map(|row| row.received_at)
        .max()
        .unwrap_or(rows[0].received_at);
    let earliest_window = rows
        .iter()
        .map(|row| window_start(kind, row.received_at))
        .min()
        .unwrap_or(latest_received);
    let mut points = load_points(conn, capability_id, kind, earliest_window, latest_received)?;
    if points.is_empty() {
        points = rows
            .iter()
            .map(|row| SeriesPoint {
                observed_at: row.observed_at,
                value: row.value,
                scale: row.scale,
                reset: row.reset,
            })
            .collect();
    }
    let accepted: Vec<AcceptedObservation> = rows
        .iter()
        .map(|row| AcceptedObservation {
            observed_at: row.observed_at,
            received_at: row.received_at,
        })
        .collect();
    let ordered = ordered_points(&points);
    let buckets = affected_buckets(kind, &ordered, &accepted);
    if buckets.is_empty() {
        return Ok(());
    }
    if !newly_inserted
        && rollup_rerun(
            &load_checkpoints(conn, capability_id)?,
            capability_id,
            kind,
            &buckets,
        ) == RollupRerun::Noop
    {
        return Ok(());
    }
    let (resolution, freshness) = constraint_for(&rows);
    let gaps = load_gaps(conn, capability_id, latest_received)?;
    let request = SeriesRecompute {
        capability_id,
        kind,
        points,
        accepted,
        counter_resolution: resolution,
        freshness,
        breaks: gaps.clone(),
        history_gaps: gaps,
        unavailable: Vec::new(),
        uncertain_identity: Vec::new(),
    };
    let rollups = recompute_series(&request).map_err(|error| failure(error.to_string()))?;
    persist_rollups(conn, capability_id, kind, &rollups)?;
    mark_rollup_checkpoints(conn, capability_id, kind, &buckets)?;
    Ok(())
}

fn constraint_for(rows: &[&WrittenObservation]) -> (i64, Duration) {
    let mut chosen: Vec<&&WrittenObservation> =
        rows.iter().filter(|row| row.newly_inserted).collect();
    if chosen.is_empty() {
        chosen = rows.iter().collect();
    }
    chosen.sort_by_key(|row| row.observed_at);
    let freshness = chosen
        .iter()
        .map(|row| row.freshness)
        .min()
        .unwrap_or(Duration::seconds(1));
    let resolution = chosen.first().map(|row| row.resolution).unwrap_or(0);
    (resolution, freshness)
}

fn window_start(kind: CapabilityKind, received_at: DateTime<Utc>) -> DateTime<Utc> {
    match raw_retention(kind) {
        RetainFor::Hours(hours) => received_at
            .checked_sub_signed(Duration::hours(hours))
            .unwrap_or(received_at),
        RetainFor::Days(days) => received_at
            .checked_sub_signed(Duration::days(days))
            .unwrap_or(received_at),
        RetainFor::Months(_) | RetainFor::Years(_) => received_at,
    }
}

fn load_points(
    conn: &mut PgConnection,
    capability_id: Uuid,
    kind: CapabilityKind,
    window_start: DateTime<Utc>,
    latest_received: DateTime<Utc>,
) -> Result<Vec<SeriesPoint>, diesel::result::Error> {
    let rows: Vec<(DateTime<Utc>, i64, i16, Option<bool>)> = capability_observations::table
        .filter(capability_observations::capability_id.eq(capability_id))
        .filter(capability_observations::kind.eq(kind.as_str()))
        .filter(capability_observations::observed_at.ge(window_start))
        .filter(capability_observations::observed_at.le(latest_received))
        .order((
            capability_observations::observed_at.asc(),
            capability_observations::observation_id.asc(),
        ))
        .select((
            capability_observations::observed_at,
            capability_observations::value,
            capability_observations::scale,
            capability_observations::reset,
        ))
        .load(conn)?;
    rows.into_iter()
        .map(|(observed_at, value, scale, reset)| {
            let scale =
                u8::try_from(scale).map_err(|_| failure("observation scale is out of range"))?;
            Ok(SeriesPoint {
                observed_at,
                value,
                scale,
                reset: reset.unwrap_or(false),
            })
        })
        .collect()
}

fn load_gaps(
    conn: &mut PgConnection,
    capability_id: Uuid,
    latest_received: DateTime<Utc>,
) -> Result<Vec<TimeSpan>, diesel::result::Error> {
    let rows: Vec<(DateTime<Utc>, Option<DateTime<Utc>>)> = history_gaps::table
        .filter(
            history_gaps::capability_id
                .eq(capability_id)
                .or(history_gaps::capability_id.is_null()),
        )
        .select((history_gaps::onset, history_gaps::until))
        .load(conn)?;
    Ok(rows
        .into_iter()
        .filter_map(|(onset, until)| {
            let end = until.unwrap_or(latest_received);
            (end > onset).then_some(TimeSpan { start: onset, end })
        })
        .collect())
}

fn load_checkpoints(
    conn: &mut PgConnection,
    capability_id: Uuid,
) -> Result<Vec<Checkpoint>, diesel::result::Error> {
    let rows: Vec<(
        Uuid,
        String,
        String,
        String,
        DateTime<Utc>,
        DateTime<Utc>,
        bool,
    )> = history_retention_checkpoints::table
        .filter(history_retention_checkpoints::capability_id.eq(capability_id))
        .select((
            history_retention_checkpoints::capability_id,
            history_retention_checkpoints::kind,
            history_retention_checkpoints::step,
            history_retention_checkpoints::resolution,
            history_retention_checkpoints::range_start,
            history_retention_checkpoints::range_end,
            history_retention_checkpoints::verified,
        ))
        .load(conn)?;
    Ok(rows
        .into_iter()
        .filter_map(
            |(capability_id, kind, step, resolution, range_start, range_end, verified)| {
                Some(Checkpoint {
                    capability_id,
                    kind: CapabilityKind::parse(&kind).ok()?,
                    step: RetentionStep::parse(&step)?,
                    resolution: Resolution::parse(&resolution)?,
                    range_start,
                    range_end,
                    verified,
                })
            },
        )
        .collect())
}

fn persist_rollups(
    conn: &mut PgConnection,
    capability_id: Uuid,
    kind: CapabilityKind,
    rollups: &RecomputedRollups,
) -> Result<(), diesel::result::Error> {
    match kind {
        CapabilityKind::Power => {
            let rows: Vec<PowerRollup> = rollups.power.iter().map(|(_, row)| row.clone()).collect();
            gauge_rollup::upsert_power_rollups(conn, capability_id, &rows)?;
        }
        CapabilityKind::Voltage | CapabilityKind::Current => {
            let rows: Vec<GaugeRollup> = rollups.gauge.iter().map(|(_, row)| row.clone()).collect();
            let gauge_kind = match kind {
                CapabilityKind::Voltage => GaugeKind::Voltage,
                CapabilityKind::Current => GaugeKind::Current,
                _ => unreachable!("voltage and current are the only gauge kinds"),
            };
            gauge_rollup::upsert_gauge_rollups(conn, capability_id, gauge_kind, &rows)?;
        }
        CapabilityKind::ImportedEnergy | CapabilityKind::ExportedEnergy => {
            for epoch in &rollups.epochs {
                diesel::sql_query(epoch_upsert_sql())
                    .bind::<SqlUuid, _>(epoch.capability_id)
                    .bind::<Timestamptz, _>(epoch.started_at)
                    .bind::<Nullable<Timestamptz>, _>(epoch.ended_at)
                    .bind::<Text, _>(epoch.reason.as_str())
                    .execute(conn)?;
            }
            for (_, rollup) in &rollups.energy {
                diesel::sql_query(energy_counter_upsert_sql())
                    .bind::<SqlUuid, _>(rollup.capability_id)
                    .bind::<Timestamptz, _>(rollup.bucket.start)
                    .bind::<Timestamptz, _>(rollup.bucket.end)
                    .bind::<Timestamptz, _>(rollup.first.observed_at)
                    .bind::<BigInt, _>(rollup.first.value)
                    .bind::<Timestamptz, _>(rollup.last.observed_at)
                    .bind::<BigInt, _>(rollup.last.value)
                    .bind::<BigInt, _>(rollup.measured_energy)
                    .bind::<BigInt, _>(rollup.coverage_numerator)
                    .bind::<BigInt, _>(rollup.coverage_denominator)
                    .bind::<Text, _>(rollup.allocation.as_str())
                    .bind::<Text, _>(rollup.provenance.as_str())
                    .execute(conn)?;
            }
        }
    }
    Ok(())
}

fn mark_rollup_checkpoints(
    conn: &mut PgConnection,
    capability_id: Uuid,
    kind: CapabilityKind,
    buckets: &[RollupBucket],
) -> Result<(), diesel::result::Error> {
    for bucket in buckets {
        upsert_checkpoint_row(
            conn,
            &Checkpoint {
                capability_id,
                kind,
                step: RetentionStep::Rollup,
                resolution: bucket.resolution,
                range_start: bucket.start,
                range_end: bucket.end,
                verified: true,
            },
        )?;
    }
    Ok(())
}

fn upsert_checkpoint_row(
    conn: &mut PgConnection,
    checkpoint: &Checkpoint,
) -> Result<(), diesel::result::Error> {
    diesel::sql_query(checkpoint_upsert_sql())
        .bind::<SqlUuid, _>(checkpoint.capability_id)
        .bind::<Text, _>(checkpoint.kind.as_str())
        .bind::<Text, _>(checkpoint.step.as_str())
        .bind::<Text, _>(checkpoint.resolution.as_str())
        .bind::<Timestamptz, _>(checkpoint.range_start)
        .bind::<Timestamptz, _>(checkpoint.range_end)
        .bind::<Bool, _>(checkpoint.verified)
        .execute(conn)?;
    Ok(())
}

#[derive(Debug)]
struct RetentionFailure(String);

impl std::fmt::Display for RetentionFailure {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(&self.0)
    }
}

impl std::error::Error for RetentionFailure {}

fn failure(message: impl Into<String>) -> diesel::result::Error {
    diesel::result::Error::QueryBuilderError(Box::new(RetentionFailure(message.into())))
}

#[cfg(test)]
mod tests {
    use chrono::TimeZone;
    use uuid::Uuid;

    use super::*;
    use crate::capabilities::{
        CapabilityId, CapabilityKind, CapabilityObservation, CapabilityReading, CapabilityReport,
        CurrentState, CurrentStateDisposition, HistoryAdmissionOutcome, HistoryRejection,
        IngestResult, NumericValue, PhysicalScope, RegisteredCapability, StateEpoch, TimeTrust,
    };
    use crate::diagnostics::{DiagnosticKind, DiagnosticPartition, MAX_BYTES};

    fn at(seconds: i64) -> DateTime<Utc> {
        DateTime::from_timestamp(seconds, 0).unwrap()
    }

    fn utc(year: i32, month: u32, day: u32, hour: u32, minute: u32, second: u32) -> DateTime<Utc> {
        Utc.with_ymd_and_hms(year, month, day, hour, minute, second)
            .single()
            .unwrap()
    }

    fn point(seconds: i64, value: i64) -> SeriesPoint {
        SeriesPoint {
            observed_at: at(seconds),
            value,
            scale: 0,
            reset: false,
        }
    }

    fn accepted(observed: DateTime<Utc>, received: DateTime<Utc>) -> AcceptedObservation {
        AcceptedObservation {
            observed_at: observed,
            received_at: received,
        }
    }

    fn blank_request(
        kind: CapabilityKind,
        points: Vec<SeriesPoint>,
        accepted_at: DateTime<Utc>,
        received_at: DateTime<Utc>,
    ) -> SeriesRecompute {
        SeriesRecompute {
            capability_id: Uuid::from_u128(9),
            kind,
            points,
            accepted: vec![accepted(accepted_at, received_at)],
            counter_resolution: 1,
            freshness: Duration::hours(2),
            breaks: Vec::new(),
            history_gaps: Vec::new(),
            unavailable: Vec::new(),
            uncertain_identity: Vec::new(),
        }
    }

    #[test]
    fn retention_tiers_match_the_accepted_calendar() {
        assert_eq!(
            retention_tiers(CapabilityKind::Power),
            &[
                RetentionTier {
                    resolution: Resolution::Raw,
                    retain: RetainFor::Hours(48),
                },
                RetentionTier {
                    resolution: Resolution::OneMinute,
                    retain: RetainFor::Days(7),
                },
                RetentionTier {
                    resolution: Resolution::FifteenMinute,
                    retain: RetainFor::Months(13),
                },
                RetentionTier {
                    resolution: Resolution::Hourly,
                    retain: RetainFor::Years(5),
                },
                RetentionTier {
                    resolution: Resolution::Daily,
                    retain: RetainFor::Years(10),
                },
            ]
        );
        assert_eq!(
            retention_tiers(CapabilityKind::ImportedEnergy),
            retention_tiers(CapabilityKind::ExportedEnergy)
        );
        assert!(
            retention_tiers(CapabilityKind::ImportedEnergy)
                .iter()
                .all(|tier| {
                    !matches!(
                        tier.resolution,
                        Resolution::OneMinute | Resolution::FiveMinute
                    )
                })
        );
        assert_eq!(
            retention_tiers(CapabilityKind::Voltage),
            retention_tiers(CapabilityKind::Current)
        );
        assert_eq!(
            retention_tiers(CapabilityKind::Voltage)[1].resolution,
            Resolution::FiveMinute
        );
        assert_eq!(
            retention_tiers(CapabilityKind::Voltage)
                .last()
                .unwrap()
                .retain,
            RetainFor::Years(5)
        );
        let start = utc(2024, 1, 15, 0, 0, 0);
        assert_eq!(
            retained_until(start, RetainFor::Months(13)).unwrap(),
            utc(2025, 2, 15, 0, 0, 0)
        );
        assert!(!past_retention(
            start,
            utc(2025, 2, 15, 0, 0, 0),
            RetainFor::Months(13)
        ));
        assert!(past_retention(
            start,
            utc(2025, 2, 15, 0, 0, 1),
            RetainFor::Months(13)
        ));
        assert_eq!(
            retained_until(utc(2020, 1, 1, 0, 0, 0), RetainFor::Years(5)).unwrap(),
            utc(2025, 1, 1, 0, 0, 0)
        );
        assert_eq!(
            retained_until(utc(2016, 1, 1, 0, 0, 0), RetainFor::Years(10)).unwrap(),
            utc(2026, 1, 1, 0, 0, 0)
        );
        assert_eq!(
            next_resolution(CapabilityKind::Power, Resolution::Raw),
            Some(Resolution::OneMinute)
        );
        assert_eq!(
            next_resolution(CapabilityKind::ImportedEnergy, Resolution::Raw),
            Some(Resolution::FifteenMinute)
        );
        assert_eq!(
            next_resolution(CapabilityKind::Voltage, Resolution::Raw),
            Some(Resolution::FiveMinute)
        );
        assert_eq!(
            next_resolution(CapabilityKind::Power, Resolution::Daily),
            None
        );
    }

    #[test]
    fn correction_window_is_each_kinds_raw_retention() {
        let observed = at(1_700_000_000);
        for kind in [
            CapabilityKind::Power,
            CapabilityKind::ImportedEnergy,
            CapabilityKind::ExportedEnergy,
            CapabilityKind::Voltage,
            CapabilityKind::Current,
        ] {
            let window = match raw_retention(kind) {
                RetainFor::Hours(hours) => Duration::hours(hours),
                RetainFor::Days(days) => Duration::days(days),
                other => panic!("raw retention is a fixed duration, got {other:?}"),
            };
            let on_window = observed + window;
            let past_window = on_window + Duration::seconds(1);
            assert!(
                !outside_correction_window(kind, observed, on_window),
                "{kind:?} keeps the raw boundary"
            );
            assert!(
                outside_correction_window(kind, observed, past_window),
                "{kind:?} rejects beyond raw retention"
            );
            assert!(observation_is_correctable(kind, observed, on_window));
            assert!(!observation_is_correctable(kind, observed, past_window));
            assert!(!past_retention(observed, on_window, raw_retention(kind)));
            assert!(past_retention(observed, past_window, raw_retention(kind)));
        }
    }

    #[test]
    fn late_observation_keeps_original_time_and_emits_late_history_diagnostic() {
        let id = CapabilityId::from_uuid(Uuid::from_u128(21));
        let observed = at(1_700_000_000);
        let reading = report("late-kept", observed, id, CapabilityKind::Power, 5);
        let original = reading.observed_at;
        let mut gate = super::super::history::HistoryGate::new(8);
        let state = registered_state(id, CapabilityKind::Power);
        let inside = admit(
            &mut gate,
            &state,
            reading.clone(),
            observed + Duration::hours(48),
        );
        assert_eq!(
            inside.outcomes[0].history,
            HistoryAdmissionOutcome::Eligible
        );
        assert_eq!(reading.observed_at, original);
        assert_eq!(gate.queued_observed_at(id), original);
        assert!(super::super::service::diagnostic_writes(&inside.outcomes, observed).is_empty());

        let rejected_id = CapabilityId::from_uuid(Uuid::from_u128(22));
        let rejected_reading = report("late-old", observed, rejected_id, CapabilityKind::Power, 5);
        let received = observed + Duration::hours(48) + Duration::seconds(1);
        let mut gate = super::super::history::HistoryGate::new(8);
        let rejected_state = registered_state(rejected_id, CapabilityKind::Power);
        let rejected = admit(
            &mut gate,
            &rejected_state,
            rejected_reading.clone(),
            received,
        );
        assert_eq!(
            rejected.outcomes[0].history,
            HistoryAdmissionOutcome::Rejected(HistoryRejection::Late)
        );
        assert_eq!(
            rejected.outcomes[0].current,
            CurrentStateDisposition::Changed
        );
        assert_eq!(rejected_reading.observed_at, original);
        assert_ne!(rejected_reading.observed_at, Some(received));
        assert_eq!(gate.queued_len(), 0);
        assert_eq!(gate.queued_observed_at(rejected_id), None);
        let writes = super::super::service::diagnostic_writes(&rejected.outcomes, received);
        assert_eq!(writes.len(), 1);
        assert_eq!(writes[0].kind, DiagnosticKind::LateHistoryRejection);
        assert_eq!(writes[0].received_at, received);
        let rejected_intervals = gate.take_rejected_intervals();
        assert_eq!(rejected_intervals.len(), 1);
        assert_eq!(rejected_intervals[0].capability_id, rejected_id.into_uuid());
        assert_eq!(rejected_intervals[0].start, observed);
        assert!(rejected_intervals[0].end > rejected_intervals[0].start);
    }

    #[test]
    fn accepted_late_power_observation_recomputes_rollups_idempotently() {
        let observed = at(0);
        let received = at(3_600);
        let request = blank_request(
            CapabilityKind::Power,
            vec![point(0, 10), point(3_600, 10)],
            observed,
            received,
        );
        let first = recompute_series(&request).unwrap();
        let second = recompute_series(&request).unwrap();
        assert_eq!(first, second);
        assert_eq!(request.points[0].observed_at, observed);
        let resolutions: Vec<_> = first
            .power
            .iter()
            .map(|(resolution, _)| *resolution)
            .collect();
        assert!(resolutions.contains(&Resolution::OneMinute));
        assert!(resolutions.contains(&Resolution::FifteenMinute));
        assert!(resolutions.contains(&Resolution::Hourly));
        assert!(resolutions.contains(&Resolution::Daily));
        assert!(!resolutions.contains(&Resolution::FiveMinute));
        let hourly = first
            .power
            .iter()
            .find(|(resolution, _)| *resolution == Resolution::Hourly)
            .unwrap();
        let manual = gauge_rollup::rollup_power(&RollupInput {
            observations: vec![
                GaugeObservation {
                    observed_at: at(0),
                    value: 10,
                    scale: 0,
                },
                GaugeObservation {
                    observed_at: at(3_600),
                    value: 10,
                    scale: 0,
                },
            ],
            breaks: Vec::new(),
            freshness: Duration::hours(2),
            buckets: vec![gauge_rollup::ClosedInterval {
                start: at(0),
                end: at(3_600),
            }],
        })
        .unwrap();
        assert_eq!(hourly.1, manual[0]);
        assert_eq!(hourly.1.estimated_import, 10);
        assert!(first.gauge.is_empty());
        assert!(first.energy.is_empty());

        let mut stale = request.clone();
        stale.accepted[0].received_at = observed + Duration::hours(48) + Duration::seconds(1);
        assert!(recompute_series(&stale).unwrap().power.is_empty());
        assert_eq!(stale.points[0].observed_at, observed);

        let mut table = Vec::new();
        let rows = bucket_rows(request.capability_id, &first);
        upsert_bucket_rows(&mut table, &rows);
        let once = table.clone();
        upsert_bucket_rows(&mut table, &rows);
        assert_eq!(table, once);
    }

    #[test]
    fn accepted_late_energy_observation_recomputes_with_meter_epochs() {
        let observed = at(0);
        let received = at(900) + Duration::hours(1);
        let request = blank_request(
            CapabilityKind::ImportedEnergy,
            vec![point(0, 0), point(900, 50)],
            observed,
            received,
        );
        let first = recompute_series(&request).unwrap();
        assert_eq!(recompute_series(&request).unwrap(), first);
        assert!(first.power.is_empty());
        assert!(first.gauge.is_empty());
        let resolutions: Vec<_> = first
            .energy
            .iter()
            .map(|(resolution, _)| *resolution)
            .collect();
        assert!(resolutions.contains(&Resolution::FifteenMinute));
        assert!(resolutions.contains(&Resolution::Hourly));
        assert!(resolutions.contains(&Resolution::Daily));
        assert!(!resolutions.contains(&Resolution::OneMinute));
        let quarter = first
            .energy
            .iter()
            .find(|(resolution, _)| *resolution == Resolution::FifteenMinute)
            .unwrap();
        let manual = meter_epoch::measure_energy(
            &MeasuredEnergyQuery {
                capability_id: request.capability_id,
                resolution: 1,
                observations: vec![
                    CounterObservation {
                        observed_at: at(0),
                        value: 0,
                        reset: false,
                        identity_changed: false,
                    },
                    CounterObservation {
                        observed_at: at(900),
                        value: 50,
                        reset: false,
                        identity_changed: false,
                    },
                ],
                history_gaps: Vec::new(),
                unavailable: Vec::new(),
                uncertain_identity: Vec::new(),
                state_epoch_changes: Vec::new(),
            },
            &[meter_epoch::ClosedInterval {
                start: at(0),
                end: at(900),
            }],
        )
        .unwrap();
        assert_eq!(quarter.1.measured_energy, manual.rollups[0].measured_energy);
        assert_eq!(quarter.1.first.observed_at, observed);
        assert_eq!(quarter.1.last.observed_at, at(900));
        assert_ne!(quarter.1.first.observed_at, received);
        assert_eq!(first.epochs[0].started_at, observed);
        assert_eq!(
            energy_counter_upsert_sql(),
            meter_epoch::energy_counter_rollup_upsert_sql()
        );
        assert!(energy_counter_upsert_sql().contains("ON CONFLICT (capability_id, bucket_start)"));
        assert_eq!(epoch_upsert_sql(), meter_epoch::meter_epoch_upsert_sql());
        assert!(epoch_upsert_sql().contains("ON CONFLICT (capability_id, started_at)"));
        assert!(!energy_counter_upsert_sql().to_lowercase().contains("jsonb"));
    }

    #[test]
    fn voltage_and_current_recompute_gauge_rollups() {
        for (kind, value) in [(CapabilityKind::Voltage, 120), (CapabilityKind::Current, 5)] {
            let request = blank_request(
                kind,
                vec![point(0, value), point(3_600, value)],
                at(0),
                at(3_600),
            );
            let rollups = recompute_series(&request).unwrap();
            assert_eq!(recompute_series(&request).unwrap(), rollups);
            assert!(rollups.power.is_empty());
            assert!(rollups.energy.is_empty());
            let resolutions: Vec<_> = rollups
                .gauge
                .iter()
                .map(|(resolution, _)| *resolution)
                .collect();
            assert!(resolutions.contains(&Resolution::FiveMinute));
            assert!(resolutions.contains(&Resolution::Hourly));
            assert!(resolutions.contains(&Resolution::Daily));
            assert!(!resolutions.contains(&Resolution::OneMinute));
            assert!(!resolutions.contains(&Resolution::FifteenMinute));
            let hourly = rollups
                .gauge
                .iter()
                .find(|(resolution, _)| *resolution == Resolution::Hourly)
                .unwrap();
            let manual = gauge_rollup::rollup_gauge(&RollupInput {
                observations: vec![
                    GaugeObservation {
                        observed_at: at(0),
                        value,
                        scale: 0,
                    },
                    GaugeObservation {
                        observed_at: at(3_600),
                        value,
                        scale: 0,
                    },
                ],
                breaks: Vec::new(),
                freshness: Duration::hours(2),
                buckets: vec![gauge_rollup::ClosedInterval {
                    start: at(0),
                    end: at(3_600),
                }],
            })
            .unwrap();
            assert_eq!(hourly.1, manual[0]);
            assert_eq!(hourly.1.mean, Some(value));
        }
    }

    #[test]
    fn verified_checkpoint_rerun_is_a_noop_and_keeps_the_only_verified_result() {
        let capability_id = Uuid::from_u128(7);
        let bucket = RollupBucket {
            resolution: Resolution::OneMinute,
            start: at(0),
            end: at(60),
        };
        let checkpoint = Checkpoint {
            capability_id,
            kind: CapabilityKind::Power,
            step: RetentionStep::Rollup,
            resolution: Resolution::OneMinute,
            range_start: bucket.start,
            range_end: bucket.end,
            verified: true,
        };
        let mut stored = vec![checkpoint];
        upsert_checkpoint(&mut stored, checkpoint);
        assert_eq!(stored.len(), 1);
        assert!(rerun_is_noop(&stored, &checkpoint));
        assert_eq!(
            rollup_rerun(&stored, capability_id, CapabilityKind::Power, &[bucket]),
            RollupRerun::Noop
        );
        assert_eq!(stored, vec![checkpoint]);

        let now = utc(2026, 6, 15, 0, 0, 0);
        let raw = HistoryRange {
            capability_id,
            kind: CapabilityKind::Power,
            resolution: Resolution::Raw,
            start: utc(2026, 6, 12, 22, 59, 0),
            end: utc(2026, 6, 12, 23, 0, 0),
            bytes: 100,
        };
        let verified_minute = Checkpoint {
            capability_id,
            kind: CapabilityKind::Power,
            step: RetentionStep::Rollup,
            resolution: Resolution::OneMinute,
            range_start: raw.start,
            range_end: raw.end,
            verified: true,
        };
        let checkpoints = vec![
            verified_minute,
            Checkpoint {
                step: RetentionStep::Cleanup,
                verified: true,
                resolution: Resolution::Raw,
                range_start: raw.start,
                range_end: raw.end,
                ..verified_minute
            },
        ];
        let plan = plan_cleanup(&CleanupInput {
            now,
            usage_bytes: 900,
            budget_bytes: 1_000,
            already_running: false,
            diagnostic_partitions: &[],
            ranges: &[raw],
            checkpoints: &checkpoints,
        });
        assert!(plan.is_empty());
        assert_eq!(checkpoints[0], verified_minute);
        assert!(rerun_is_noop(&checkpoints, &checkpoints[1]));
    }

    #[test]
    fn crash_restart_resumes_unverified_rollup_and_partition_deletion() {
        let range = verified_raw_range();
        let now = range.end + Duration::hours(48) + Duration::seconds(1);
        let verified_rollup = raw_verified(&range);
        let buckets: Vec<RollupBucket> = verified_rollup
            .iter()
            .map(|row| RollupBucket {
                resolution: row.resolution,
                start: row.range_start,
                end: row.range_end,
            })
            .collect();
        assert!(!buckets.is_empty());
        assert_eq!(
            rollup_rerun(&[], range.capability_id, range.kind, &buckets),
            RollupRerun::Recompute
        );
        let unverified_rollup: Vec<Checkpoint> = verified_rollup
            .iter()
            .copied()
            .map(|row| Checkpoint {
                verified: false,
                ..row
            })
            .collect();
        assert_eq!(
            rollup_rerun(
                &unverified_rollup,
                range.capability_id,
                range.kind,
                &buckets
            ),
            RollupRerun::Recompute
        );
        assert_eq!(
            rollup_rerun(&verified_rollup, range.capability_id, range.kind, &buckets),
            RollupRerun::Noop
        );

        assert_eq!(
            plan_drops(900, 1_000, false, now, &[range], &verified_rollup),
            vec![CleanupAction::DropRange(range)]
        );
        let mut checkpoints = verified_rollup.clone();
        let cleanup = Checkpoint {
            capability_id: range.capability_id,
            kind: range.kind,
            step: RetentionStep::Cleanup,
            resolution: Resolution::Raw,
            range_start: range.start,
            range_end: range.end,
            verified: false,
        };
        upsert_checkpoint(&mut checkpoints, cleanup);
        assert_eq!(checkpoints.len(), verified_rollup.len() + 1);
        assert_eq!(
            plan_drops(900, 1_000, false, now, &[range], &checkpoints),
            vec![CleanupAction::DropRange(range)]
        );
        upsert_checkpoint(
            &mut checkpoints,
            Checkpoint {
                verified: true,
                ..cleanup
            },
        );
        assert_eq!(checkpoints.len(), verified_rollup.len() + 1);
        assert!(rerun_is_noop(
            &checkpoints,
            checkpoints.last().expect("cleanup checkpoint")
        ));
        assert!(plan_drops(900, 1_000, false, now, &[range], &checkpoints).is_empty());

        let older = DiagnosticPartition {
            name: "diagnostic_events_2026010100".to_string(),
            range_end: now - Duration::hours(50),
            bytes: 10,
        };
        let newer = DiagnosticPartition {
            name: "diagnostic_events_2026010101".to_string(),
            range_end: now - Duration::hours(49),
            bytes: 10,
        };
        let kept = DiagnosticPartition {
            name: "diagnostic_events_2026010200".to_string(),
            range_end: now,
            bytes: 10,
        };
        let history = DiagnosticPartition {
            name: "capability_observations_y2026".to_string(),
            range_end: now - Duration::days(30),
            bytes: MAX_BYTES,
        };
        assert_eq!(
            diagnostic_partitions_to_prune(
                &[history.clone(), older.clone(), newer.clone(), kept.clone()],
                now
            ),
            vec![older.name.clone(), newer.name.clone()]
        );
        assert_eq!(
            diagnostic_partitions_to_prune(&[newer.clone(), kept.clone()], now),
            vec![newer.name.clone()]
        );
        assert!(diagnostic_partitions_to_prune(&[kept, history], now).is_empty());
    }

    #[test]
    fn planner_refuses_to_drop_fine_tier_until_next_resolution_is_verified() {
        let capability_id = Uuid::from_u128(7);
        let raw = HistoryRange {
            capability_id,
            kind: CapabilityKind::Power,
            resolution: Resolution::Raw,
            start: at(0),
            end: at(120),
            bytes: 100,
        };
        let now = at(120) + Duration::hours(48) + Duration::seconds(1);
        let one = Checkpoint {
            capability_id,
            kind: CapabilityKind::Power,
            step: RetentionStep::Rollup,
            resolution: Resolution::OneMinute,
            range_start: at(0),
            range_end: at(60),
            verified: true,
        };
        assert_eq!(
            drop_block(&raw, &[raw], &[one], &[]),
            Some(DropBlocked::NextTierUnverified)
        );
        let both = [
            one,
            Checkpoint {
                range_start: at(60),
                range_end: at(120),
                ..one
            },
        ];
        assert_eq!(drop_block(&raw, &[raw], &both, &[]), None);
        let plan = plan_cleanup(&CleanupInput {
            now,
            usage_bytes: 900,
            budget_bytes: 1_000,
            already_running: false,
            diagnostic_partitions: &[],
            ranges: &[raw],
            checkpoints: &both,
        });
        assert_eq!(plan, vec![CleanupAction::DropRange(raw)]);

        let minute = HistoryRange {
            capability_id,
            kind: CapabilityKind::Power,
            resolution: Resolution::OneMinute,
            start: at(0),
            end: at(60),
            bytes: 80,
        };
        let minute_verified = Checkpoint {
            capability_id,
            kind: CapabilityKind::Power,
            step: RetentionStep::Rollup,
            resolution: Resolution::OneMinute,
            range_start: minute.start,
            range_end: minute.end,
            verified: true,
        };
        let aged = minute.end + Duration::days(8);
        assert_eq!(
            drop_block(&minute, &[minute], &[minute_verified], &[]),
            Some(DropBlocked::OnlyRemainingVerified)
        );
        let kept = plan_cleanup(&CleanupInput {
            now: aged,
            usage_bytes: 950,
            budget_bytes: 1_000,
            already_running: true,
            diagnostic_partitions: &[],
            ranges: &[minute],
            checkpoints: &[minute_verified],
        });
        assert!(kept.is_empty());
        assert_eq!(
            plan_cleanup(&CleanupInput {
                now: aged,
                usage_bytes: 950,
                budget_bytes: 1_000,
                already_running: true,
                diagnostic_partitions: &[],
                ranges: &[minute],
                checkpoints: &[minute_verified],
            }),
            kept
        );
    }

    #[test]
    fn cleanup_starts_at_ninety_percent_and_stops_below_eighty() {
        assert!(!usage_reaches_start(899, 1_000));
        assert!(usage_reaches_start(900, 1_000));
        assert!(!usage_below_stop(800, 1_000));
        assert!(usage_below_stop(799, 1_000));
        assert!(!history_cleanup_running(850, 1_000, false));
        assert!(history_cleanup_running(850, 1_000, true));
        assert!(history_cleanup_running(800, 1_000, true));
        assert!(!history_cleanup_running(799, 1_000, true));
        assert!(usage_reaches_start(u64::MAX, u64::MAX));
        assert!(!usage_below_stop(u64::MAX, u64::MAX));

        let range = verified_raw_range();
        let checkpoints = raw_verified(&range);
        let now = range.end + Duration::hours(48) + Duration::seconds(1);
        assert!(plan_drops(899, 1_000, false, now, &[range], &checkpoints).is_empty());
        assert_eq!(
            plan_drops(900, 1_000, false, now, &[range], &checkpoints),
            vec![CleanupAction::DropRange(range)]
        );
        assert!(plan_drops(850, 1_000, false, now, &[range], &checkpoints).is_empty());
        assert_eq!(
            plan_drops(850, 1_000, true, now, &[range], &checkpoints),
            vec![CleanupAction::DropRange(range)]
        );
        assert!(plan_drops(799, 1_000, true, now, &[range], &checkpoints).is_empty());

        let mut older = range;
        older.end = at(60);
        older.start = at(0);
        older.bytes = 150;
        let mut newer = range;
        newer.start = at(60);
        newer.end = at(120);
        newer.bytes = 150;
        let checkpoints = [raw_verified(&older), raw_verified(&newer)].concat();
        let now = at(120) + Duration::hours(48) + Duration::seconds(1);
        let dropped = plan_drops(900, 1_000, false, now, &[newer, older], &checkpoints);
        assert_eq!(dropped, vec![CleanupAction::DropRange(older)]);
    }

    #[test]
    fn cleanup_prunes_diagnostics_before_fine_history_and_daily_last() {
        let now = utc(2026, 6, 15, 0, 0, 0);
        let raw = HistoryRange {
            capability_id: Uuid::from_u128(7),
            kind: CapabilityKind::Power,
            resolution: Resolution::Raw,
            start: utc(2026, 6, 12, 22, 59, 0),
            end: utc(2026, 6, 12, 23, 0, 0),
            bytes: 50,
        };
        let daily = HistoryRange {
            capability_id: raw.capability_id,
            kind: CapabilityKind::Power,
            resolution: Resolution::Daily,
            start: utc(2014, 6, 14, 0, 0, 0),
            end: utc(2014, 6, 15, 0, 0, 0),
            bytes: 50,
        };
        let checkpoints = raw_verified(&raw);
        let diagnostics = [
            DiagnosticPartition {
                name: "capability_observations_y2026".to_string(),
                range_end: now - Duration::days(30),
                bytes: MAX_BYTES,
            },
            DiagnosticPartition {
                name: "diagnostic_events_2026050100".to_string(),
                range_end: now - Duration::hours(49),
                bytes: 10,
            },
        ];
        let actions = plan_cleanup(&CleanupInput {
            now,
            usage_bytes: 900,
            budget_bytes: 1_000,
            already_running: false,
            diagnostic_partitions: &diagnostics,
            ranges: &[daily, raw],
            checkpoints: &checkpoints,
        });
        assert_eq!(
            actions,
            vec![
                CleanupAction::PruneDiagnostics {
                    partitions: vec!["diagnostic_events_2026050100".to_string()],
                },
                CleanupAction::DropRange(raw),
                CleanupAction::DropRange(daily),
            ]
        );

        let low = plan_cleanup(&CleanupInput {
            now,
            usage_bytes: 100,
            budget_bytes: 1_000,
            already_running: false,
            diagnostic_partitions: &diagnostics,
            ranges: &[daily, raw],
            checkpoints: &checkpoints,
        });
        assert_eq!(
            low,
            vec![CleanupAction::PruneDiagnostics {
                partitions: vec!["diagnostic_events_2026050100".to_string()],
            }]
        );

        let blocked_daily = HistoryRange {
            start: raw.start - Duration::days(1),
            end: raw.end,
            ..daily
        };
        let preserved = plan_cleanup(&CleanupInput {
            now,
            usage_bytes: 900,
            budget_bytes: 1_000,
            already_running: false,
            diagnostic_partitions: &[],
            ranges: &[raw, blocked_daily],
            checkpoints: &[],
        });
        assert!(preserved.is_empty());
        assert_eq!(
            drop_block(&blocked_daily, &[raw, blocked_daily], &[], &[]),
            Some(DropBlocked::OnlyRemainingVerified)
        );
    }

    #[test]
    fn checkpoint_table_is_relational_without_jsonb() {
        let migration =
            include_str!("../../migrations/2026-10-19-000005-0000_history_retention/up.sql");
        assert!(migration.contains("CREATE TABLE history_retention_checkpoints"));
        assert!(migration.contains("REFERENCES capability_identities"));
        assert!(
            migration
                .contains("PRIMARY KEY (capability_id, step, resolution, range_start, range_end)")
        );
        assert!(migration.contains("'rollup'"));
        assert!(migration.contains("'cleanup'"));
        assert!(!migration.to_lowercase().contains("jsonb"));
        assert!(!checkpoint_upsert_sql().to_lowercase().contains("jsonb"));
        assert!(
            checkpoint_upsert_sql()
                .contains("ON CONFLICT (capability_id, step, resolution, range_start, range_end)")
        );
        let down =
            include_str!("../../migrations/2026-10-19-000005-0000_history_retention/down.sql");
        assert!(down.contains("DROP TABLE history_retention_checkpoints"));
    }

    fn bucket_rows(capability_id: Uuid, rollups: &RecomputedRollups) -> Vec<BucketUpsert> {
        rollups
            .power
            .iter()
            .map(|(resolution, rollup)| BucketUpsert {
                capability_id,
                resolution: *resolution,
                bucket_start: rollup.bucket.start,
                value: rollup.estimated_import,
            })
            .chain(
                rollups
                    .energy
                    .iter()
                    .map(|(resolution, rollup)| BucketUpsert {
                        capability_id,
                        resolution: *resolution,
                        bucket_start: rollup.bucket.start,
                        value: rollup.measured_energy,
                    }),
            )
            .collect()
    }

    fn verified_raw_range() -> HistoryRange {
        HistoryRange {
            capability_id: Uuid::from_u128(7),
            kind: CapabilityKind::Power,
            resolution: Resolution::Raw,
            start: at(0),
            end: at(60),
            bytes: 100,
        }
    }

    fn raw_verified(range: &HistoryRange) -> Vec<Checkpoint> {
        buckets_covering(Resolution::OneMinute, range.start, range.end)
            .into_iter()
            .map(|bucket| Checkpoint {
                capability_id: range.capability_id,
                kind: range.kind,
                step: RetentionStep::Rollup,
                resolution: bucket.resolution,
                range_start: bucket.start,
                range_end: bucket.end,
                verified: true,
            })
            .collect()
    }

    fn plan_drops(
        usage_bytes: u64,
        budget_bytes: u64,
        already_running: bool,
        now: DateTime<Utc>,
        ranges: &[HistoryRange],
        checkpoints: &[Checkpoint],
    ) -> Vec<CleanupAction> {
        plan_cleanup(&CleanupInput {
            now,
            usage_bytes,
            budget_bytes,
            already_running,
            diagnostic_partitions: &[],
            ranges,
            checkpoints,
        })
    }

    fn registered_state(id: CapabilityId, kind: CapabilityKind) -> CurrentState {
        let registered = RegisteredCapability::for_test(
            id,
            "zigbee",
            "plug-1",
            kind,
            PhysicalScope::Device,
            60_000,
        );
        let state = CurrentState::new(StateEpoch::from_uuid(Uuid::from_u128(9)));
        let device = registered.declaration.identity.device.clone();
        state.reconcile_manifest(&device, vec![registered], at(0));
        state
    }

    fn report(
        observation_id: &str,
        observed_at: DateTime<Utc>,
        capability_id: CapabilityId,
        kind: CapabilityKind,
        raw: i64,
    ) -> CapabilityReport {
        CapabilityReport {
            schema_version: Some(1),
            observation_id: Some(observation_id.to_string()),
            observed_at: Some(observed_at),
            time_trust: TimeTrust::Trustworthy,
            observations: vec![CapabilityObservation {
                capability_id,
                kind,
                reading: CapabilityReading::Value(NumericValue::for_test(raw, 0, "limits-1")),
                reset: None,
            }],
        }
    }

    fn admit(
        gate: &mut super::super::history::HistoryGate,
        state: &CurrentState,
        report: CapabilityReport,
        received_at: DateTime<Utc>,
    ) -> IngestResult {
        let mut result = state.ingest(report.clone(), received_at);
        gate.admit(&mut result, &report, received_at, |id| state.registered(id));
        result
    }

    #[test]
    fn sweep_applies_the_planner_drop_at_ninety_percent_and_not_below_eighty() {
        let now = utc(2026, 6, 15, 0, 0, 0);
        let raw = HistoryRange {
            capability_id: Uuid::from_u128(7),
            kind: CapabilityKind::Power,
            resolution: Resolution::Raw,
            start: utc(2026, 6, 12, 22, 59, 0),
            end: utc(2026, 6, 12, 23, 0, 0),
            bytes: 50,
        };
        let daily = HistoryRange {
            capability_id: raw.capability_id,
            kind: CapabilityKind::Power,
            resolution: Resolution::Daily,
            start: utc(2014, 6, 14, 0, 0, 0),
            end: utc(2014, 6, 15, 0, 0, 0),
            bytes: 50,
        };
        let fresh = HistoryRange {
            capability_id: raw.capability_id,
            kind: CapabilityKind::Power,
            resolution: Resolution::Raw,
            start: now - Duration::minutes(1),
            end: now,
            bytes: 500,
        };
        let checkpoints = raw_verified(&raw);
        let high = SweepSnapshot {
            now,
            usage_bytes: 900,
            budget_bytes: 1_000,
            already_running: false,
            ranges: vec![daily, fresh, raw],
            checkpoints: checkpoints.clone(),
        };
        let mut dropped = Vec::new();
        let applied = apply_planned_drops(&high, |range| {
            dropped.push(*range);
            Ok(())
        })
        .unwrap();
        let planned = planned_drops(&high);
        assert_eq!(applied, planned);
        assert_eq!(dropped, planned);
        assert_eq!(
            applied,
            vec![
                CleanupAction::DropRange(raw),
                CleanupAction::DropRange(daily),
            ]
            .into_iter()
            .filter_map(|action| match action {
                CleanupAction::DropRange(range) => Some(range),
                CleanupAction::PruneDiagnostics { .. } => None,
            })
            .collect::<Vec<_>>()
        );
        assert_eq!(applied.last().unwrap().resolution, Resolution::Daily);
        assert!(applied.iter().all(|range| range.start != fresh.start));

        let low = SweepSnapshot {
            usage_bytes: 799,
            ..high
        };
        let mut quiet = Vec::new();
        let none = apply_planned_drops(&low, |range| {
            quiet.push(*range);
            Ok(())
        })
        .unwrap();
        assert!(none.is_empty());
        assert!(quiet.is_empty());
    }
}
