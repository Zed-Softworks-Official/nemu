//! Authorized Device and Component History queries.
//!
//! Reads use a dedicated PostgreSQL pool (`HISTORY_QUERY_POOL_SIZE` connections),
//! a matching concurrency semaphore, and `SET LOCAL statement_timeout` on the
//! query transaction. That pool is neither the control pool nor the History
//! admission pool, so a query cannot take the last connection from commands or
//! identity. Admission keeps its own pool inside `CapabilityService`.
//!
//! The logical response is one transaction, so every series shares one snapshot.
//! Pagination cursors are intentionally absent. Readable series stay on the
//! Controller; this module does not write them to Convex.

use std::collections::BTreeMap;

use chrono::{DateTime, Duration, Utc};
use diesel::prelude::*;
use diesel::sql_types::{BigInt, Nullable, SmallInt, Text, Timestamptz, Uuid as SqlUuid};
use serde::{Deserialize, Serialize};
use thiserror::Error;
use uuid::Uuid;

use crate::api::auth::AuthenticatedClient;
use crate::pairing::members::find_member_by_user_id;
use crate::state::AppState;

use super::CapabilityKind;
use super::admission_journal::{self, GapReason, HistoryHealth, MemberReason};
use super::history_retention::{self, Resolution as RetainedResolution};
use super::home_calendar::{self, TimezonePeriod};

/// Hard cap for one series. Callers cannot raise it.
pub const ABSOLUTE_POINT_CAP: u32 = 1_000;
/// Small pool reserved for History reads.
pub const HISTORY_QUERY_POOL_SIZE: usize = 2;
/// At most one in-flight query per dedicated connection.
pub const HISTORY_QUERY_CONCURRENCY: usize = 2;
/// Applied with `SET LOCAL` so it ends with the query transaction.
pub const HISTORY_QUERY_STATEMENT_TIMEOUT: &str = "3s";

const BUCKET_SCAN_LIMIT: usize = 20_000;

pub fn history_query_timeout_sql() -> &'static str {
    "SET LOCAL statement_timeout = '3s'"
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum HistoryQueryError {
    #[error("unauthenticated")]
    Unauthenticated,
    #[error("forbidden")]
    Forbidden,
    #[error("invalid history query")]
    InvalidQuery,
    #[error("history query busy")]
    Busy,
    #[error("history query failed")]
    Database,
}

impl HistoryQueryError {
    pub fn code(&self) -> &'static str {
        match self {
            Self::Unauthenticated => "unauthenticated",
            Self::Forbidden => "forbidden",
            Self::InvalidQuery => "invalid_query",
            Self::Busy => "busy",
            Self::Database => "history_unavailable",
        }
    }

    pub fn message(&self) -> &'static str {
        match self {
            Self::Unauthenticated => "Authentication required",
            Self::Forbidden => "History is available to owners and members",
            Self::InvalidQuery => "History query is invalid",
            Self::Busy => "History query capacity is full",
            Self::Database => "History query failed",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HistoryRole {
    Owner,
    Member,
}

/// Active owners and members may read. Anonymous and inactive callers may not.
pub fn authorize_history_read(role: &str, status: &str) -> Result<HistoryRole, HistoryQueryError> {
    if status != "active" {
        return Err(if role.is_empty() {
            HistoryQueryError::Unauthenticated
        } else {
            HistoryQueryError::Forbidden
        });
    }
    match role {
        "owner" => Ok(HistoryRole::Owner),
        "member" => Ok(HistoryRole::Member),
        "" => Err(HistoryQueryError::Unauthenticated),
        _ => Err(HistoryQueryError::Forbidden),
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum QueryResolution {
    Raw,
    OneMinute,
    FiveMinute,
    FifteenMinute,
    Hourly,
    Daily,
    Monthly,
}

impl QueryResolution {
    fn rank(self) -> u8 {
        match self {
            Self::Raw => 0,
            Self::OneMinute => 1,
            Self::FiveMinute => 2,
            Self::FifteenMinute => 3,
            Self::Hourly => 4,
            Self::Daily => 5,
            Self::Monthly => 6,
        }
    }

    fn retained(self) -> Option<RetainedResolution> {
        Some(match self {
            Self::Raw => RetainedResolution::Raw,
            Self::OneMinute => RetainedResolution::OneMinute,
            Self::FiveMinute => RetainedResolution::FiveMinute,
            Self::FifteenMinute => RetainedResolution::FifteenMinute,
            Self::Hourly => RetainedResolution::Hourly,
            Self::Daily => RetainedResolution::Daily,
            Self::Monthly => return None,
        })
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum HistoryMetric {
    Power,
    ImportedEnergy,
    ExportedEnergy,
    Voltage,
    Current,
}

impl HistoryMetric {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Power => "power",
            Self::ImportedEnergy => "importedEnergy",
            Self::ExportedEnergy => "exportedEnergy",
            Self::Voltage => "voltage",
            Self::Current => "current",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum HistoryScope {
    Capability {
        capability_id: Uuid,
    },
    Device {
        device_id: Uuid,
    },
    Component {
        device_id: Uuid,
        component_path: Vec<String>,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryQueryRequest {
    pub scope: HistoryScope,
    pub metric: HistoryMetric,
    pub start: DateTime<Utc>,
    pub end: DateTime<Utc>,
    pub resolution: QueryResolution,
    pub freshness_limit_ms: u64,
    pub max_points: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Provenance {
    Measured,
    Estimated,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum IntervalKind {
    History,
    Missing,
    Stale,
    Rejected,
    Unavailable,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Coverage {
    pub covered_ns: i64,
    pub elapsed_ns: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryInterval {
    pub kind: IntervalKind,
    pub start: DateTime<Utc>,
    pub end: DateTime<Utc>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryPoint {
    pub start: DateTime<Utc>,
    pub end: DateTime<Utc>,
    pub value: i64,
    pub scale: u8,
    pub provenance: Provenance,
    pub coverage: Coverage,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistorySeries {
    pub capability_id: Uuid,
    pub label: String,
    pub resolution: QueryResolution,
    pub source_resolution: QueryResolution,
    pub provenance: Provenance,
    pub coverage: Coverage,
    pub recording_since: DateTime<Utc>,
    pub available_since: Option<DateTime<Utc>>,
    pub meter_epoch_boundaries: Vec<DateTime<Utc>>,
    pub gaps: Vec<HistoryInterval>,
    pub missing: Vec<HistoryInterval>,
    pub points: Vec<HistoryPoint>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryQueryResponse {
    pub as_of: DateTime<Utc>,
    pub series: Vec<HistorySeries>,
    pub reasons: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub health: Option<HistoryHealth>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct Span {
    start: DateTime<Utc>,
    end: DateTime<Utc>,
}

#[derive(Debug, Clone, Copy)]
struct InputInterval {
    kind: IntervalKind,
    start: DateTime<Utc>,
    end: DateTime<Utc>,
    reason: Option<GapReason>,
}

#[derive(Debug, Clone, Copy)]
pub(crate) struct RollupSample {
    start: DateTime<Utc>,
    end: DateTime<Utc>,
    value: Option<i64>,
    scale: u8,
    covered_ns: i64,
    elapsed_ns: i64,
    provenance: Provenance,
    /// Energy and stored estimates add. Means stay time-weighted.
    sum_values: bool,
}

#[derive(Debug, Clone, Copy)]
struct ObservationSample {
    at: DateTime<Utc>,
    value: i64,
    scale: u8,
}

struct AssembleInput {
    capability_id: Uuid,
    label: String,
    resolution: QueryResolution,
    source_resolution: QueryResolution,
    provenance: Provenance,
    recording_since: DateTime<Utc>,
    available_since: Option<DateTime<Utc>>,
    range: Span,
    buckets: Vec<Span>,
    samples: Vec<RollupSample>,
    observations: Vec<ObservationSample>,
    quality: Vec<InputInterval>,
    meter_epoch_boundaries: Vec<DateTime<Utc>>,
    freshness: Duration,
    point_limit: u32,
    reveal_gap_reasons: bool,
    periods: Vec<TimezonePeriod>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ResolutionChoice {
    pub resolution: QueryResolution,
    pub source_resolution: QueryResolution,
    pub point_limit: u32,
}

pub struct ResolutionInput<'a> {
    pub kind: CapabilityKind,
    pub requested: QueryResolution,
    pub start: DateTime<Utc>,
    pub end: DateTime<Utc>,
    pub max_points: u32,
    pub raw_points: u32,
    pub periods: &'a [TimezonePeriod],
}

/// Finest retained resolution that is not finer than requested and fits the point cap.
pub fn select_resolution(
    input: &ResolutionInput<'_>,
) -> Result<ResolutionChoice, HistoryQueryError> {
    let point_limit = effective_point_limit(input.max_points)?;
    if input.end <= input.start {
        return Err(HistoryQueryError::InvalidQuery);
    }
    let mut candidates = retained_candidates(input.kind, input.requested);
    if candidates.is_empty() {
        candidates.push(QueryResolution::Monthly);
    }
    let mut selected = *candidates.last().expect("candidate");
    for candidate in &candidates {
        let points = estimated_points(
            *candidate,
            input.start,
            input.end,
            input.periods,
            input.raw_points,
        )?;
        if points <= point_limit {
            selected = *candidate;
            break;
        }
    }
    let source_resolution = if selected == QueryResolution::Monthly {
        QueryResolution::Daily
    } else {
        selected
    };
    Ok(ResolutionChoice {
        resolution: selected,
        source_resolution,
        point_limit,
    })
}

pub fn effective_point_limit(max_points: u32) -> Result<u32, HistoryQueryError> {
    if max_points == 0 {
        return Err(HistoryQueryError::InvalidQuery);
    }
    Ok(max_points.min(ABSOLUTE_POINT_CAP))
}

fn retained_candidates(kind: CapabilityKind, requested: QueryResolution) -> Vec<QueryResolution> {
    let mut candidates: Vec<QueryResolution> = history_retention::retention_tiers(kind)
        .iter()
        .map(|tier| from_retained(tier.resolution))
        .filter(|resolution| resolution.rank() >= requested.rank())
        .collect();
    if !candidates.contains(&QueryResolution::Monthly) {
        candidates.push(QueryResolution::Monthly);
    }
    if requested == QueryResolution::Monthly {
        candidates.retain(|resolution| *resolution == QueryResolution::Monthly);
    }
    candidates
}

fn from_retained(resolution: RetainedResolution) -> QueryResolution {
    match resolution {
        RetainedResolution::Raw => QueryResolution::Raw,
        RetainedResolution::OneMinute => QueryResolution::OneMinute,
        RetainedResolution::FiveMinute => QueryResolution::FiveMinute,
        RetainedResolution::FifteenMinute => QueryResolution::FifteenMinute,
        RetainedResolution::Hourly => QueryResolution::Hourly,
        RetainedResolution::Daily => QueryResolution::Daily,
    }
}

fn estimated_points(
    resolution: QueryResolution,
    start: DateTime<Utc>,
    end: DateTime<Utc>,
    periods: &[TimezonePeriod],
    raw_points: u32,
) -> Result<u32, HistoryQueryError> {
    if resolution == QueryResolution::Raw {
        return Ok(raw_points);
    }
    let buckets = buckets_for(resolution, start, end, periods)?;
    if buckets.len() >= BUCKET_SCAN_LIMIT {
        return Ok(u32::MAX);
    }
    u32::try_from(buckets.len()).map_err(|_| HistoryQueryError::InvalidQuery)
}

fn buckets_for(
    resolution: QueryResolution,
    start: DateTime<Utc>,
    end: DateTime<Utc>,
    periods: &[TimezonePeriod],
) -> Result<Vec<Span>, HistoryQueryError> {
    if end <= start {
        return Err(HistoryQueryError::InvalidQuery);
    }
    match resolution {
        QueryResolution::Raw => Ok(Vec::new()),
        QueryResolution::Daily => calendar_buckets(false, start, end, periods),
        QueryResolution::Monthly => calendar_buckets(true, start, end, periods),
        other => {
            let retained = other.retained().ok_or(HistoryQueryError::InvalidQuery)?;
            Ok(history_retention::buckets_covering(retained, start, end)
                .into_iter()
                .take(BUCKET_SCAN_LIMIT)
                .map(|bucket| Span {
                    start: bucket.start,
                    end: bucket.end,
                })
                .collect())
        }
    }
}

fn calendar_buckets(
    monthly: bool,
    start: DateTime<Utc>,
    end: DateTime<Utc>,
    periods: &[TimezonePeriod],
) -> Result<Vec<Span>, HistoryQueryError> {
    let mut cursor = start;
    let mut buckets = Vec::new();
    while cursor < end && buckets.len() < BUCKET_SCAN_LIMIT {
        let timezone = timezone_at(periods, cursor);
        let bucket = if monthly {
            home_calendar::monthly_bucket(timezone, cursor)
        } else {
            home_calendar::daily_bucket(timezone, cursor)
        }
        .map_err(|_| HistoryQueryError::InvalidQuery)?;
        if bucket.end <= cursor {
            return Err(HistoryQueryError::InvalidQuery);
        }
        if bucket.end > start && bucket.start < end {
            buckets.push(Span {
                start: bucket.start,
                end: bucket.end,
            });
        }
        cursor = bucket.end;
    }
    Ok(buckets)
}

fn timezone_at<'a>(periods: &'a [TimezonePeriod], instant: DateTime<Utc>) -> &'a str {
    periods
        .iter()
        .rev()
        .find(|period| {
            instant >= period.effective_from
                && period
                    .effective_until
                    .map(|until| instant < until)
                    .unwrap_or(true)
        })
        .map(|period| period.timezone.as_str())
        .unwrap_or("UTC")
}

fn calendar_owner(
    monthly: bool,
    instant: DateTime<Utc>,
    periods: &[TimezonePeriod],
) -> Result<Span, HistoryQueryError> {
    let timezone = timezone_at(periods, instant);
    let bucket = if monthly {
        home_calendar::monthly_bucket(timezone, instant)
    } else {
        home_calendar::daily_bucket(timezone, instant)
    }
    .map_err(|_| HistoryQueryError::InvalidQuery)?;
    Ok(Span {
        start: bucket.start,
        end: bucket.end,
    })
}

/// Stored counter energy is returned as stored. A coverage-free estimate is omitted
/// instead of becoming a zero bucket.
pub(crate) fn read_stored_energy(stored: StoredEnergy) -> Option<RollupSample> {
    match stored {
        StoredEnergy::Counter {
            start,
            end,
            measured_energy,
            coverage_numerator,
            coverage_denominator,
            scale,
        } => {
            if coverage_numerator <= 0 || coverage_denominator <= 0 {
                return None;
            }
            Some(RollupSample {
                start,
                end,
                value: Some(measured_energy),
                scale,
                covered_ns: coverage_numerator,
                elapsed_ns: coverage_denominator,
                provenance: Provenance::Measured,
                sum_values: true,
            })
        }
        StoredEnergy::PowerEstimate {
            start,
            end,
            estimated,
            coverage_ns,
            elapsed_ns,
            scale,
        } => {
            if coverage_ns <= 0 {
                return None;
            }
            Some(RollupSample {
                start,
                end,
                value: Some(estimated),
                scale,
                covered_ns: coverage_ns,
                elapsed_ns,
                provenance: Provenance::Estimated,
                sum_values: true,
            })
        }
    }
}

pub(crate) enum StoredEnergy {
    Counter {
        start: DateTime<Utc>,
        end: DateTime<Utc>,
        measured_energy: i64,
        coverage_numerator: i64,
        coverage_denominator: i64,
        scale: u8,
    },
    PowerEstimate {
        start: DateTime<Utc>,
        end: DateTime<Utc>,
        estimated: i64,
        coverage_ns: i64,
        elapsed_ns: i64,
        scale: u8,
    },
}

pub fn metric_reads_kind(metric: HistoryMetric, kind: CapabilityKind) -> bool {
    match metric {
        HistoryMetric::Power => kind == CapabilityKind::Power,
        HistoryMetric::Voltage => kind == CapabilityKind::Voltage,
        HistoryMetric::Current => kind == CapabilityKind::Current,
        HistoryMetric::ImportedEnergy => {
            matches!(kind, CapabilityKind::ImportedEnergy | CapabilityKind::Power)
        }
        HistoryMetric::ExportedEnergy => {
            matches!(kind, CapabilityKind::ExportedEnergy | CapabilityKind::Power)
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CapabilityRef {
    pub id: Uuid,
    pub kind: CapabilityKind,
    pub scope_kind: String,
    pub component_path: Vec<String>,
}

pub fn capability_in_scope(scope: &HistoryScope, row: &CapabilityRef) -> bool {
    match scope {
        HistoryScope::Capability { capability_id } => row.id == *capability_id,
        HistoryScope::Device { .. } => row.scope_kind == "device" && row.component_path.is_empty(),
        HistoryScope::Component { component_path, .. } => {
            row.scope_kind == "component" && row.component_path == *component_path
        }
    }
}

pub fn series_label(metric: HistoryMetric, id: Uuid, path: &[String]) -> String {
    if path.is_empty() {
        format!("{} {id}", metric.as_str())
    } else {
        format!("{} {} {id}", metric.as_str(), path.join("/"))
    }
}

fn series_provenance(metric: HistoryMetric, kind: CapabilityKind) -> Provenance {
    match (metric, kind) {
        (HistoryMetric::ImportedEnergy | HistoryMetric::ExportedEnergy, CapabilityKind::Power) => {
            Provenance::Estimated
        }
        _ => Provenance::Measured,
    }
}

fn member_reason_token(reason: MemberReason) -> &'static str {
    match reason {
        MemberReason::Gap => "gap",
        MemberReason::Coverage => "coverage",
    }
}

fn safe_reasons(health: &HistoryHealth, series_have_gaps: bool) -> Vec<String> {
    let mut reasons: Vec<String> = health
        .member_projection()
        .reasons
        .iter()
        .copied()
        .map(member_reason_token)
        .map(str::to_string)
        .collect();
    if series_have_gaps && !reasons.iter().any(|reason| reason == "gap") {
        reasons.insert(0, member_reason_token(MemberReason::Gap).to_string());
    }
    reasons
}

fn assemble_series(input: AssembleInput) -> Result<HistorySeries, HistoryQueryError> {
    let mut gaps = Vec::new();
    let mut missing = Vec::new();
    for interval in &input.quality {
        let Some(clipped) = clip_span(interval.start, interval.end, input.range) else {
            continue;
        };
        let reason = if input.reveal_gap_reasons && interval.kind == IntervalKind::History {
            interval.reason.map(GapReason::as_str).map(str::to_string)
        } else {
            None
        };
        let rendered = HistoryInterval {
            kind: interval.kind,
            start: clipped.start,
            end: clipped.end,
            reason,
        };
        if interval.kind == IntervalKind::History {
            gaps.push(rendered);
        } else {
            missing.push(rendered);
        }
    }

    let mut points = if input.resolution == QueryResolution::Raw {
        assemble_raw(&input, &mut missing)?
    } else {
        assemble_buckets(&input, &mut missing)?
    };
    let covered = points
        .iter()
        .map(|point| point.coverage.covered_ns)
        .sum::<i64>();
    let elapsed = elapsed_ns(input.range.start, input.range.end);
    let limit = usize::try_from(input.point_limit).unwrap_or(usize::MAX);
    if points.len() > limit {
        points.truncate(limit);
    }
    Ok(HistorySeries {
        capability_id: input.capability_id,
        label: input.label,
        resolution: input.resolution,
        source_resolution: input.source_resolution,
        provenance: input.provenance,
        coverage: Coverage {
            covered_ns: covered.min(elapsed.max(0)),
            elapsed_ns: elapsed.max(0),
        },
        recording_since: input.recording_since,
        available_since: input.available_since,
        meter_epoch_boundaries: input.meter_epoch_boundaries,
        gaps,
        missing,
        points,
    })
}

fn assemble_raw(
    input: &AssembleInput,
    missing: &mut Vec<HistoryInterval>,
) -> Result<Vec<HistoryPoint>, HistoryQueryError> {
    let mut points = Vec::new();
    for observation in &input.observations {
        if observation.at < input.range.start || observation.at >= input.range.end {
            continue;
        }
        if quality_covers(&input.quality, observation.at, observation.at) {
            continue;
        }
        points.push(HistoryPoint {
            start: observation.at,
            end: observation.at,
            value: observation.value,
            scale: observation.scale,
            provenance: Provenance::Measured,
            coverage: Coverage {
                covered_ns: 0,
                elapsed_ns: 0,
            },
        });
    }
    let mut instants: Vec<DateTime<Utc>> = input.observations.iter().map(|row| row.at).collect();
    instants.sort();
    instants.dedup();
    for pair in instants.windows(2) {
        let gap = pair[1] - pair[0];
        if gap <= input.freshness {
            continue;
        }
        let start = pair[0]
            .checked_add_signed(Duration::nanoseconds(1))
            .unwrap_or(pair[0]);
        let end = pair[1]
            .checked_sub_signed(Duration::nanoseconds(1))
            .unwrap_or(pair[1]);
        if let Some(clipped) = clip_span(start, end, input.range) {
            missing.push(HistoryInterval {
                kind: IntervalKind::Stale,
                start: clipped.start,
                end: clipped.end,
                reason: None,
            });
        }
    }
    Ok(points)
}

fn assemble_buckets(
    input: &AssembleInput,
    missing: &mut Vec<HistoryInterval>,
) -> Result<Vec<HistoryPoint>, HistoryQueryError> {
    let grouped = group_samples(input)?;
    let mut points = Vec::new();
    for bucket in &input.buckets {
        if quality_covers(&input.quality, bucket.start, bucket.end) {
            continue;
        }
        let Some(sample) = grouped.get(&bucket.start).copied() else {
            if let Some(clipped) = clip_span(bucket.start, bucket.end, input.range) {
                missing.push(HistoryInterval {
                    kind: IntervalKind::Missing,
                    start: clipped.start,
                    end: clipped.end,
                    reason: None,
                });
            }
            continue;
        };
        let Some(value) = sample.value else {
            push_unusable(missing, *bucket, input.range);
            continue;
        };
        if sample.covered_ns <= 0 {
            push_unusable(missing, *bucket, input.range);
            continue;
        }
        points.push(HistoryPoint {
            start: bucket.start,
            end: bucket.end,
            value,
            scale: sample.scale,
            provenance: sample.provenance,
            coverage: Coverage {
                covered_ns: sample.covered_ns,
                elapsed_ns: sample.elapsed_ns.max(elapsed_ns(bucket.start, bucket.end)),
            },
        });
    }
    Ok(points)
}

fn push_unusable(missing: &mut Vec<HistoryInterval>, bucket: Span, range: Span) {
    if let Some(clipped) = clip_span(bucket.start, bucket.end, range) {
        missing.push(HistoryInterval {
            kind: IntervalKind::Unavailable,
            start: clipped.start,
            end: clipped.end,
            reason: None,
        });
    }
}

fn group_samples(
    input: &AssembleInput,
) -> Result<BTreeMap<DateTime<Utc>, RollupSample>, HistoryQueryError> {
    let monthly = input.resolution == QueryResolution::Monthly;
    let calendar = matches!(
        input.resolution,
        QueryResolution::Daily | QueryResolution::Monthly
    );
    let mut grouped: BTreeMap<DateTime<Utc>, Vec<RollupSample>> = BTreeMap::new();
    for sample in &input.samples {
        let key = if calendar {
            calendar_owner(monthly, sample.start, &input.periods)?.start
        } else {
            sample.start
        };
        grouped.entry(key).or_default().push(*sample);
    }
    let mut combined = BTreeMap::new();
    for (key, samples) in grouped {
        if let Some(sample) = combine_samples(&samples) {
            combined.insert(key, sample);
        }
    }
    Ok(combined)
}

fn combine_samples(samples: &[RollupSample]) -> Option<RollupSample> {
    let usable: Vec<&RollupSample> = samples
        .iter()
        .filter(|sample| sample.covered_ns > 0 && sample.value.is_some())
        .collect();
    if usable.is_empty() {
        return None;
    }
    let first = usable[0];
    let covered: i128 = usable
        .iter()
        .map(|sample| i128::from(sample.covered_ns))
        .sum();
    let elapsed: i128 = usable
        .iter()
        .map(|sample| i128::from(sample.elapsed_ns.max(0)))
        .sum();
    let provenance = if usable
        .iter()
        .any(|sample| sample.provenance == Provenance::Estimated)
    {
        Provenance::Estimated
    } else {
        Provenance::Measured
    };
    let sum_values = usable.iter().any(|sample| sample.sum_values);
    let value = if sum_values {
        usable
            .iter()
            .map(|sample| i128::from(sample.value.unwrap_or(0)))
            .sum::<i128>()
    } else {
        let weighted: i128 = usable
            .iter()
            .map(|sample| i128::from(sample.value.unwrap_or(0)) * i128::from(sample.covered_ns))
            .sum();
        if covered == 0 { 0 } else { weighted / covered }
    };
    let value = i64::try_from(value).ok()?;
    let covered_ns = i64::try_from(covered).unwrap_or(i64::MAX);
    let elapsed_ns = i64::try_from(elapsed.max(covered)).unwrap_or(i64::MAX);
    Some(RollupSample {
        start: first.start,
        end: first.end,
        value: Some(value),
        scale: first.scale,
        covered_ns,
        elapsed_ns,
        provenance,
        sum_values,
    })
}

fn quality_covers(intervals: &[InputInterval], start: DateTime<Utc>, end: DateTime<Utc>) -> bool {
    let end = if end < start { start } else { end };
    intervals.iter().any(|interval| {
        interval.start <= start && interval.end >= end.max(start) && interval.end > interval.start
    })
}

fn clip_span(start: DateTime<Utc>, end: DateTime<Utc>, range: Span) -> Option<Span> {
    let start = start.max(range.start);
    let end = end.min(range.end);
    (start < end).then_some(Span { start, end })
}

fn elapsed_ns(start: DateTime<Utc>, end: DateTime<Utc>) -> i64 {
    (end - start).num_nanoseconds().unwrap_or(i64::MAX)
}

fn parse_gap_reason(value: &str) -> Option<GapReason> {
    [
        GapReason::UntrustedTime,
        GapReason::StorageFailure,
        GapReason::QueueLoss,
        GapReason::DiskFloor,
    ]
    .into_iter()
    .find(|reason| reason.as_str() == value)
}

fn validate_request(request: &HistoryQueryRequest) -> Result<Duration, HistoryQueryError> {
    if request.end <= request.start || request.freshness_limit_ms == 0 {
        return Err(HistoryQueryError::InvalidQuery);
    }
    if let HistoryScope::Component { component_path, .. } = &request.scope {
        if component_path.is_empty() {
            return Err(HistoryQueryError::InvalidQuery);
        }
    }
    effective_point_limit(request.max_points)?;
    Ok(Duration::milliseconds(
        i64::try_from(request.freshness_limit_ms).map_err(|_| HistoryQueryError::InvalidQuery)?,
    ))
}

/// Both LAN and Relay call this. Identity lookup uses the control pool.
/// The series read uses only the History query pool.
pub async fn query_for_client(
    state: &AppState,
    auth: &AuthenticatedClient,
    request: HistoryQueryRequest,
) -> Result<HistoryQueryResponse, HistoryQueryError> {
    let role = caller_role(state, auth).await?;
    let freshness = validate_request(&request)?;
    let _permit = state
        .history_query_slots
        .try_acquire()
        .map_err(|_| HistoryQueryError::Busy)?;
    let conn = state
        .history_query_pool
        .get()
        .await
        .map_err(|_| HistoryQueryError::Database)?;
    let loaded = conn
        .interact(move |conn| load_query(conn, &request, freshness))
        .await
        .map_err(|_| HistoryQueryError::Database)?
        .map_err(|error| match error {
            QueryLoadError::Invalid => HistoryQueryError::InvalidQuery,
            QueryLoadError::Database(message) => {
                tracing::warn!(error = %message, "history query failed");
                HistoryQueryError::Database
            }
        })?;
    let health = admission_journal::current_health();
    finish_response(role, loaded, &health)
}

async fn caller_role(
    state: &AppState,
    auth: &AuthenticatedClient,
) -> Result<HistoryRole, HistoryQueryError> {
    let Some(user_id) = auth.user_id.as_deref() else {
        return Err(HistoryQueryError::Unauthenticated);
    };
    let member = find_member_by_user_id(&state.db, user_id)
        .await
        .map_err(|_| HistoryQueryError::Database)?;
    let Some(member) = member else {
        return Err(HistoryQueryError::Unauthenticated);
    };
    authorize_history_read(&member.role, &member.status)
}

fn finish_response(
    role: HistoryRole,
    loaded: LoadedQuery,
    health: &HistoryHealth,
) -> Result<HistoryQueryResponse, HistoryQueryError> {
    let reveal = role == HistoryRole::Owner;
    let mut series = Vec::with_capacity(loaded.series.len());
    for row in loaded.series {
        series.push(assemble_series(AssembleInput {
            capability_id: row.capability_id,
            label: row.label,
            resolution: row.resolution,
            source_resolution: row.source_resolution,
            provenance: row.provenance,
            recording_since: row.recording_since,
            available_since: row.available_since,
            range: row.range,
            buckets: row.buckets,
            samples: row.samples,
            observations: row.observations,
            quality: row.quality,
            meter_epoch_boundaries: row.meter_epoch_boundaries,
            freshness: row.freshness,
            point_limit: row.point_limit,
            reveal_gap_reasons: reveal,
            periods: row.periods,
        })?);
    }
    let series_have_gaps = series.iter().any(|row| !row.gaps.is_empty());
    Ok(HistoryQueryResponse {
        as_of: loaded.as_of,
        reasons: safe_reasons(health, series_have_gaps),
        health: match role {
            HistoryRole::Owner => Some(health.clone()),
            HistoryRole::Member => None,
        },
        series,
    })
}

enum QueryLoadError {
    Invalid,
    Database(String),
}

impl From<diesel::result::Error> for QueryLoadError {
    fn from(error: diesel::result::Error) -> Self {
        Self::Database(error.to_string())
    }
}

impl From<HistoryQueryError> for QueryLoadError {
    fn from(error: HistoryQueryError) -> Self {
        match error {
            HistoryQueryError::InvalidQuery => Self::Invalid,
            other => Self::Database(other.to_string()),
        }
    }
}

struct LoadedQuery {
    as_of: DateTime<Utc>,
    series: Vec<LoadedSeries>,
}

struct LoadedSeries {
    capability_id: Uuid,
    label: String,
    resolution: QueryResolution,
    source_resolution: QueryResolution,
    provenance: Provenance,
    recording_since: DateTime<Utc>,
    available_since: Option<DateTime<Utc>>,
    range: Span,
    buckets: Vec<Span>,
    samples: Vec<RollupSample>,
    observations: Vec<ObservationSample>,
    quality: Vec<InputInterval>,
    meter_epoch_boundaries: Vec<DateTime<Utc>>,
    freshness: Duration,
    point_limit: u32,
    periods: Vec<TimezonePeriod>,
}

fn load_query(
    conn: &mut PgConnection,
    request: &HistoryQueryRequest,
    freshness: Duration,
) -> Result<LoadedQuery, QueryLoadError> {
    conn.transaction(|conn| {
        diesel::sql_query(history_query_timeout_sql()).execute(conn)?;
        let as_of = Utc::now();
        let periods = load_periods(conn)?;
        let identities = load_identities(conn, &request.scope)?;
        let mut series = Vec::new();
        for identity in identities {
            let Some(row) = identity_ref(&identity) else {
                continue;
            };
            if !capability_in_scope(&request.scope, &row)
                || !metric_reads_kind(request.metric, row.kind)
            {
                continue;
            }
            let Some(recording_since) = load_recording_since(conn, row.id)? else {
                continue;
            };
            let available_since = load_available_since(conn, row.id)?;
            let raw_points = load_raw_count(conn, row.id, request.start, request.end)?;
            let choice = select_resolution(&ResolutionInput {
                kind: row.kind,
                requested: request.resolution,
                start: request.start,
                end: request.end,
                max_points: request.max_points,
                raw_points,
                periods: &periods,
            })?;
            let buckets = if choice.resolution == QueryResolution::Raw {
                Vec::new()
            } else if choice.resolution == QueryResolution::Monthly {
                buckets_for(
                    QueryResolution::Monthly,
                    request.start,
                    request.end,
                    &periods,
                )?
            } else {
                buckets_for(choice.resolution, request.start, request.end, &periods)?
            };
            let (samples, observations) = load_points(
                conn,
                row.id,
                row.kind,
                request.metric,
                choice.resolution,
                request.start,
                request.end,
                choice.point_limit,
            )?;
            let mut quality = load_gaps(conn, row.id, request.start, request.end)?;
            if choice.resolution != QueryResolution::Raw {
                for sample in &samples {
                    if sample.covered_ns <= 0 {
                        quality.push(InputInterval {
                            kind: IntervalKind::Unavailable,
                            start: sample.start,
                            end: sample.end,
                            reason: None,
                        });
                    }
                }
            }
            series.push(LoadedSeries {
                capability_id: row.id,
                label: series_label(request.metric, row.id, &row.component_path),
                resolution: choice.resolution,
                source_resolution: choice.source_resolution,
                provenance: series_provenance(request.metric, row.kind),
                recording_since,
                available_since,
                range: Span {
                    start: request.start,
                    end: request.end,
                },
                buckets,
                samples,
                observations,
                quality,
                meter_epoch_boundaries: load_epoch_boundaries(
                    conn,
                    row.id,
                    request.start,
                    request.end,
                )?,
                freshness,
                point_limit: choice.point_limit,
                periods: periods.clone(),
            });
        }
        Ok(LoadedQuery { as_of, series })
    })
}

#[derive(QueryableByName)]
struct PeriodRow {
    #[diesel(sql_type = Text)]
    timezone: String,
    #[diesel(sql_type = Timestamptz)]
    effective_from: DateTime<Utc>,
    #[diesel(sql_type = Nullable<Timestamptz>)]
    effective_until: Option<DateTime<Utc>>,
}

#[derive(QueryableByName)]
struct IdentityRow {
    #[diesel(sql_type = SqlUuid)]
    id: Uuid,
    #[diesel(sql_type = Text)]
    kind: String,
    #[diesel(sql_type = Text)]
    physical_scope_kind: String,
    #[diesel(sql_type = Text)]
    component_path: String,
}

#[derive(QueryableByName)]
struct BoundRow {
    #[diesel(sql_type = Timestamptz)]
    recording_since: DateTime<Utc>,
}

#[derive(QueryableByName)]
struct InstantRow {
    #[diesel(sql_type = Nullable<Timestamptz>)]
    instant: Option<DateTime<Utc>>,
}

#[derive(QueryableByName)]
struct CountRow {
    #[diesel(sql_type = BigInt)]
    count: i64,
}

#[derive(QueryableByName)]
struct PowerRow {
    #[diesel(sql_type = Timestamptz)]
    bucket_start: DateTime<Utc>,
    #[diesel(sql_type = Timestamptz)]
    bucket_end: DateTime<Utc>,
    #[diesel(sql_type = SmallInt)]
    scale: i16,
    #[diesel(sql_type = Nullable<BigInt>)]
    mean_value: Option<i64>,
    #[diesel(sql_type = BigInt)]
    estimated_import: i64,
    #[diesel(sql_type = BigInt)]
    estimated_export: i64,
    #[diesel(sql_type = BigInt)]
    coverage_ns: i64,
    #[diesel(sql_type = BigInt)]
    gap_ns: i64,
}

#[derive(QueryableByName)]
struct GaugeRow {
    #[diesel(sql_type = Timestamptz)]
    bucket_start: DateTime<Utc>,
    #[diesel(sql_type = Timestamptz)]
    bucket_end: DateTime<Utc>,
    #[diesel(sql_type = SmallInt)]
    scale: i16,
    #[diesel(sql_type = Nullable<BigInt>)]
    mean_value: Option<i64>,
    #[diesel(sql_type = BigInt)]
    coverage_ns: i64,
}

#[derive(QueryableByName)]
struct EnergyRow {
    #[diesel(sql_type = Timestamptz)]
    bucket_start: DateTime<Utc>,
    #[diesel(sql_type = Timestamptz)]
    bucket_end: DateTime<Utc>,
    #[diesel(sql_type = BigInt)]
    measured_energy: i64,
    #[diesel(sql_type = BigInt)]
    coverage_numerator: i64,
    #[diesel(sql_type = BigInt)]
    coverage_denominator: i64,
}

#[derive(QueryableByName)]
struct ObservationRow {
    #[diesel(sql_type = Timestamptz)]
    observed_at: DateTime<Utc>,
    #[diesel(sql_type = BigInt)]
    value: i64,
    #[diesel(sql_type = SmallInt)]
    scale: i16,
}

#[derive(QueryableByName)]
struct GapRow {
    #[diesel(sql_type = Text)]
    reason: String,
    #[diesel(sql_type = Timestamptz)]
    onset: DateTime<Utc>,
    #[diesel(sql_type = Nullable<Timestamptz>)]
    until: Option<DateTime<Utc>>,
}

#[derive(QueryableByName)]
struct EpochRow {
    #[diesel(sql_type = Timestamptz)]
    started_at: DateTime<Utc>,
}

fn load_periods(conn: &mut PgConnection) -> Result<Vec<TimezonePeriod>, diesel::result::Error> {
    let rows = diesel::sql_query(
        "SELECT timezone::text AS timezone, effective_from, effective_until
         FROM home_timezone_periods
         ORDER BY effective_from",
    )
    .load::<PeriodRow>(conn)?;
    Ok(rows
        .into_iter()
        .map(|row| TimezonePeriod {
            timezone: row.timezone,
            effective_from: row.effective_from,
            effective_until: row.effective_until,
        })
        .collect())
}

fn load_identities(
    conn: &mut PgConnection,
    scope: &HistoryScope,
) -> Result<Vec<IdentityRow>, diesel::result::Error> {
    match scope {
        HistoryScope::Capability { capability_id } => diesel::sql_query(
            "SELECT id, kind::text AS kind, physical_scope_kind::text AS physical_scope_kind,
                    COALESCE(array_to_string(component_path, '/'), '')::text AS component_path
             FROM capability_identities
             WHERE id = $1",
        )
        .bind::<SqlUuid, _>(*capability_id)
        .load(conn),
        HistoryScope::Device { device_id } | HistoryScope::Component { device_id, .. } => {
            diesel::sql_query(
                "SELECT ci.id, ci.kind::text AS kind,
                        ci.physical_scope_kind::text AS physical_scope_kind,
                        COALESCE(array_to_string(ci.component_path, '/'), '')::text AS component_path
                 FROM capability_identities ci
                 JOIN devices d
                   ON d.external_id = ci.device_external_id
                  AND d.protocol = ci.protocol
                 WHERE d.id = $1",
            )
            .bind::<SqlUuid, _>(*device_id)
            .load(conn)
        }
    }
}

fn identity_ref(row: &IdentityRow) -> Option<CapabilityRef> {
    let kind = CapabilityKind::parse(&row.kind).ok()?;
    let component_path = if row.component_path.is_empty() {
        Vec::new()
    } else {
        row.component_path.split('/').map(str::to_string).collect()
    };
    Some(CapabilityRef {
        id: row.id,
        kind,
        scope_kind: row.physical_scope_kind.clone(),
        component_path,
    })
}

fn load_recording_since(
    conn: &mut PgConnection,
    capability_id: Uuid,
) -> Result<Option<DateTime<Utc>>, diesel::result::Error> {
    let row = diesel::sql_query(
        "SELECT recording_since FROM capability_recording_bounds WHERE capability_id = $1",
    )
    .bind::<SqlUuid, _>(capability_id)
    .get_result::<BoundRow>(conn)
    .optional()?;
    Ok(row.map(|row| row.recording_since))
}

fn load_available_since(
    conn: &mut PgConnection,
    capability_id: Uuid,
) -> Result<Option<DateTime<Utc>>, diesel::result::Error> {
    let row = diesel::sql_query(
        "SELECT MIN(instant) AS instant FROM (
            SELECT MIN(observed_at) AS instant FROM capability_observations WHERE capability_id = $1
            UNION ALL
            SELECT MIN(bucket_start) FROM power_rollups WHERE capability_id = $1
            UNION ALL
            SELECT MIN(bucket_start) FROM gauge_rollups WHERE capability_id = $1
            UNION ALL
            SELECT MIN(bucket_start) FROM energy_counter_rollups WHERE capability_id = $1
        ) retained",
    )
    .bind::<SqlUuid, _>(capability_id)
    .get_result::<InstantRow>(conn)?;
    Ok(row.instant)
}

fn load_raw_count(
    conn: &mut PgConnection,
    capability_id: Uuid,
    start: DateTime<Utc>,
    end: DateTime<Utc>,
) -> Result<u32, diesel::result::Error> {
    let row = diesel::sql_query(
        "SELECT COUNT(*)::bigint AS count
         FROM capability_observations
         WHERE capability_id = $1 AND observed_at >= $2 AND observed_at < $3",
    )
    .bind::<SqlUuid, _>(capability_id)
    .bind::<Timestamptz, _>(start)
    .bind::<Timestamptz, _>(end)
    .get_result::<CountRow>(conn)?;
    Ok(u32::try_from(row.count.max(0)).unwrap_or(u32::MAX))
}

fn duration_predicate(resolution: QueryResolution) -> Option<&'static str> {
    match resolution {
        QueryResolution::OneMinute => Some("bucket_end - bucket_start = interval '1 minute'"),
        QueryResolution::FiveMinute => Some("bucket_end - bucket_start = interval '5 minutes'"),
        QueryResolution::FifteenMinute => Some("bucket_end - bucket_start = interval '15 minutes'"),
        QueryResolution::Hourly => Some("bucket_end - bucket_start = interval '1 hour'"),
        QueryResolution::Daily | QueryResolution::Monthly => Some(
            "bucket_end - bucket_start >= interval '23 hours' AND bucket_end - bucket_start <= interval '25 hours'",
        ),
        QueryResolution::Raw => None,
    }
}

fn load_points(
    conn: &mut PgConnection,
    capability_id: Uuid,
    kind: CapabilityKind,
    metric: HistoryMetric,
    resolution: QueryResolution,
    start: DateTime<Utc>,
    end: DateTime<Utc>,
    point_limit: u32,
) -> Result<(Vec<RollupSample>, Vec<ObservationSample>), diesel::result::Error> {
    if resolution == QueryResolution::Raw {
        let limit = i64::from(point_limit.min(ABSOLUTE_POINT_CAP));
        let rows = diesel::sql_query(
            "SELECT observed_at, value, scale
             FROM capability_observations
             WHERE capability_id = $1 AND observed_at >= $2 AND observed_at < $3
             ORDER BY observed_at
             LIMIT $4",
        )
        .bind::<SqlUuid, _>(capability_id)
        .bind::<Timestamptz, _>(start)
        .bind::<Timestamptz, _>(end)
        .bind::<BigInt, _>(limit)
        .load::<ObservationRow>(conn)?;
        let observations = rows
            .into_iter()
            .map(|row| ObservationSample {
                at: row.observed_at,
                value: row.value,
                scale: u8::try_from(row.scale).unwrap_or(0),
            })
            .collect();
        return Ok((Vec::new(), observations));
    }

    let Some(predicate) = duration_predicate(resolution) else {
        return Ok((Vec::new(), Vec::new()));
    };
    let samples = if matches!(
        kind,
        CapabilityKind::ImportedEnergy | CapabilityKind::ExportedEnergy
    ) {
        load_energy(conn, capability_id, start, end, predicate)?
    } else if kind == CapabilityKind::Power {
        load_power(conn, capability_id, metric, start, end, predicate)?
    } else {
        load_gauge(conn, capability_id, kind, start, end, predicate)?
    };
    Ok((samples, Vec::new()))
}

fn load_power(
    conn: &mut PgConnection,
    capability_id: Uuid,
    metric: HistoryMetric,
    start: DateTime<Utc>,
    end: DateTime<Utc>,
    predicate: &str,
) -> Result<Vec<RollupSample>, diesel::result::Error> {
    let sql = format!(
        "SELECT bucket_start, bucket_end, scale, mean_value, estimated_import, estimated_export,
                coverage_ns, gap_ns
         FROM power_rollups
         WHERE capability_id = $1 AND bucket_end > $2 AND bucket_start < $3 AND {predicate}
         ORDER BY bucket_start"
    );
    let rows = diesel::sql_query(sql)
        .bind::<SqlUuid, _>(capability_id)
        .bind::<Timestamptz, _>(start)
        .bind::<Timestamptz, _>(end)
        .load::<PowerRow>(conn)?;
    Ok(rows
        .into_iter()
        .map(|row| {
            let elapsed = elapsed_ns(row.bucket_start, row.bucket_end);
            let (value, provenance, sum_values) = match metric {
                HistoryMetric::ImportedEnergy => {
                    (Some(row.estimated_import), Provenance::Estimated, true)
                }
                HistoryMetric::ExportedEnergy => {
                    (Some(row.estimated_export), Provenance::Estimated, true)
                }
                _ => (row.mean_value, Provenance::Measured, false),
            };
            // `gap_ns` is the stored uncovered duration. Zero coverage stays a gap.
            let covered_ns = if row.coverage_ns <= 0 || row.gap_ns < 0 {
                0
            } else {
                row.coverage_ns
            };
            RollupSample {
                start: row.bucket_start,
                end: row.bucket_end,
                value,
                scale: u8::try_from(row.scale).unwrap_or(0),
                covered_ns,
                elapsed_ns: elapsed,
                provenance,
                sum_values,
            }
        })
        .collect())
}

fn load_gauge(
    conn: &mut PgConnection,
    capability_id: Uuid,
    kind: CapabilityKind,
    start: DateTime<Utc>,
    end: DateTime<Utc>,
    predicate: &str,
) -> Result<Vec<RollupSample>, diesel::result::Error> {
    let sql = format!(
        "SELECT bucket_start, bucket_end, scale, mean_value, coverage_ns
         FROM gauge_rollups
         WHERE capability_id = $1 AND gauge_kind = $2
           AND bucket_end > $3 AND bucket_start < $4 AND {predicate}
         ORDER BY bucket_start"
    );
    let rows = diesel::sql_query(sql)
        .bind::<SqlUuid, _>(capability_id)
        .bind::<Text, _>(kind.as_str())
        .bind::<Timestamptz, _>(start)
        .bind::<Timestamptz, _>(end)
        .load::<GaugeRow>(conn)?;
    Ok(rows
        .into_iter()
        .map(|row| RollupSample {
            start: row.bucket_start,
            end: row.bucket_end,
            value: row.mean_value,
            scale: u8::try_from(row.scale).unwrap_or(0),
            covered_ns: row.coverage_ns,
            elapsed_ns: elapsed_ns(row.bucket_start, row.bucket_end),
            provenance: Provenance::Measured,
            sum_values: false,
        })
        .collect())
}

fn load_energy(
    conn: &mut PgConnection,
    capability_id: Uuid,
    start: DateTime<Utc>,
    end: DateTime<Utc>,
    predicate: &str,
) -> Result<Vec<RollupSample>, diesel::result::Error> {
    let sql = format!(
        "SELECT bucket_start, bucket_end, measured_energy, coverage_numerator, coverage_denominator
         FROM energy_counter_rollups
         WHERE capability_id = $1 AND bucket_end > $2 AND bucket_start < $3 AND {predicate}
         ORDER BY bucket_start"
    );
    let rows = diesel::sql_query(sql)
        .bind::<SqlUuid, _>(capability_id)
        .bind::<Timestamptz, _>(start)
        .bind::<Timestamptz, _>(end)
        .load::<EnergyRow>(conn)?;
    Ok(rows
        .into_iter()
        .map(|row| RollupSample {
            start: row.bucket_start,
            end: row.bucket_end,
            value: Some(row.measured_energy),
            scale: 0,
            covered_ns: row.coverage_numerator,
            elapsed_ns: row.coverage_denominator,
            provenance: Provenance::Measured,
            sum_values: true,
        })
        .collect())
}

fn load_gaps(
    conn: &mut PgConnection,
    capability_id: Uuid,
    start: DateTime<Utc>,
    end: DateTime<Utc>,
) -> Result<Vec<InputInterval>, diesel::result::Error> {
    let rows = diesel::sql_query(
        "SELECT reason::text AS reason, onset, until
         FROM history_gaps
         WHERE capability_id = $1 AND onset < $3 AND (until IS NULL OR until > $2)
         ORDER BY onset",
    )
    .bind::<SqlUuid, _>(capability_id)
    .bind::<Timestamptz, _>(start)
    .bind::<Timestamptz, _>(end)
    .load::<GapRow>(conn)?;
    Ok(rows
        .into_iter()
        .map(|row| InputInterval {
            kind: IntervalKind::History,
            start: row.onset,
            end: row.until.unwrap_or(end),
            reason: parse_gap_reason(&row.reason),
        })
        .collect())
}

fn load_epoch_boundaries(
    conn: &mut PgConnection,
    capability_id: Uuid,
    start: DateTime<Utc>,
    end: DateTime<Utc>,
) -> Result<Vec<DateTime<Utc>>, diesel::result::Error> {
    let rows = diesel::sql_query(
        "SELECT started_at FROM meter_epochs
         WHERE capability_id = $1 AND started_at >= $2 AND started_at < $3
         ORDER BY started_at",
    )
    .bind::<SqlUuid, _>(capability_id)
    .bind::<Timestamptz, _>(start)
    .bind::<Timestamptz, _>(end)
    .load::<EpochRow>(conn)?;
    Ok(rows.into_iter().map(|row| row.started_at).collect())
}

#[cfg(test)]
mod tests {
    use chrono::{Duration, TimeZone, Utc};
    use uuid::Uuid;

    use super::{
        ABSOLUTE_POINT_CAP, AssembleInput, CapabilityKind, CapabilityRef,
        HISTORY_QUERY_CONCURRENCY, HISTORY_QUERY_POOL_SIZE, HistoryInterval, HistoryMetric,
        HistoryQueryRequest, HistoryQueryResponse, HistoryRole, HistoryScope, IntervalKind,
        ObservationSample, Provenance, QueryResolution, ResolutionInput, RollupSample, Span,
        StoredEnergy, authorize_history_read, buckets_for, capability_in_scope,
        effective_point_limit, history_query_timeout_sql, read_stored_energy, select_resolution,
        series_label,
    };
    use crate::capabilities::admission_journal::{
        GapAccounting, GapInterval, GapReason, GapScope, HealthStatus, HistoryHealth, QueueSnapshot,
    };
    use crate::capabilities::home_calendar::TimezonePeriod;

    fn utc(
        year: i32,
        month: u32,
        day: u32,
        hour: u32,
        minute: u32,
        second: u32,
    ) -> chrono::DateTime<Utc> {
        Utc.with_ymd_and_hms(year, month, day, hour, minute, second)
            .single()
            .expect("utc")
    }

    fn empty_input() -> AssembleInput {
        AssembleInput {
            capability_id: Uuid::nil(),
            label: "power 00000000-0000-0000-0000-000000000000".into(),
            resolution: QueryResolution::Hourly,
            source_resolution: QueryResolution::Hourly,
            provenance: Provenance::Measured,
            recording_since: utc(2020, 1, 1, 0, 0, 0),
            available_since: Some(utc(2024, 6, 1, 0, 0, 0)),
            range: Span {
                start: utc(2026, 1, 1, 0, 0, 0),
                end: utc(2026, 1, 1, 5, 0, 0),
            },
            buckets: Vec::new(),
            samples: Vec::new(),
            observations: Vec::new(),
            quality: Vec::new(),
            meter_epoch_boundaries: Vec::new(),
            freshness: Duration::minutes(1),
            point_limit: ABSOLUTE_POINT_CAP,
            reveal_gap_reasons: false,
            periods: Vec::new(),
        }
    }

    fn sample(
        start: chrono::DateTime<Utc>,
        value: i64,
        covered: i64,
        sum_values: bool,
    ) -> RollupSample {
        RollupSample {
            start,
            end: start + Duration::hours(1),
            value: Some(value),
            scale: 0,
            covered_ns: covered,
            elapsed_ns: covered.max(1),
            provenance: if sum_values {
                Provenance::Estimated
            } else {
                Provenance::Measured
            },
            sum_values,
        }
    }

    fn degraded_health() -> HistoryHealth {
        HistoryHealth {
            status: HealthStatus::Degraded,
            gap_accounting: GapAccounting::Uncertain,
            loss_warning: true,
            queue: QueueSnapshot {
                queued: 1024,
                inflight: 64,
                capacity: 1024,
                pressured: true,
            },
            gaps: vec![GapInterval {
                reason: GapReason::StorageFailure,
                scope: GapScope::Home,
                onset: utc(2026, 1, 1, 0, 0, 0),
                until: None,
            }],
        }
    }

    #[test]
    fn owners_and_members_can_read_without_requiring_owner() {
        assert_eq!(
            authorize_history_read("owner", "active").unwrap(),
            HistoryRole::Owner
        );
        assert_eq!(
            authorize_history_read("member", "active").unwrap(),
            HistoryRole::Member
        );
        assert_eq!(
            authorize_history_read("", "active"),
            Err(super::HistoryQueryError::Unauthenticated)
        );
        assert_eq!(
            authorize_history_read("owner", "pending"),
            Err(super::HistoryQueryError::Forbidden)
        );
        assert_eq!(
            authorize_history_read("guest", "active"),
            Err(super::HistoryQueryError::Forbidden)
        );
    }

    #[test]
    fn query_reads_use_a_dedicated_pool_timeout_and_concurrency_limit() {
        assert_eq!(HISTORY_QUERY_POOL_SIZE, 2);
        assert_eq!(HISTORY_QUERY_CONCURRENCY, HISTORY_QUERY_POOL_SIZE);
        assert_eq!(
            history_query_timeout_sql(),
            "SET LOCAL statement_timeout = '3s'"
        );
        assert_eq!(ABSOLUTE_POINT_CAP, 1_000);
    }

    #[test]
    fn coarsens_to_the_finest_retained_resolution_that_fits() {
        let choice = select_resolution(&ResolutionInput {
            kind: CapabilityKind::Power,
            requested: QueryResolution::OneMinute,
            start: utc(2026, 1, 1, 0, 0, 0),
            end: utc(2026, 1, 3, 0, 0, 0),
            max_points: 5_000,
            raw_points: 50_000,
            periods: &[],
        })
        .unwrap();
        assert_eq!(choice.resolution, QueryResolution::FifteenMinute);
        assert_eq!(choice.point_limit, ABSOLUTE_POINT_CAP);
        assert_eq!(choice.source_resolution, QueryResolution::FifteenMinute);
    }

    #[test]
    fn requested_coarser_resolution_is_not_refined() {
        let choice = select_resolution(&ResolutionInput {
            kind: CapabilityKind::Power,
            requested: QueryResolution::Hourly,
            start: utc(2026, 1, 1, 0, 0, 0),
            end: utc(2026, 1, 1, 2, 0, 0),
            max_points: 1_000,
            raw_points: 0,
            periods: &[],
        })
        .unwrap();
        assert_eq!(choice.resolution, QueryResolution::Hourly);
    }

    #[test]
    fn gauge_requests_skip_resolutions_that_are_not_retained() {
        let two_days = select_resolution(&ResolutionInput {
            kind: CapabilityKind::Voltage,
            requested: QueryResolution::OneMinute,
            start: utc(2026, 1, 1, 0, 0, 0),
            end: utc(2026, 1, 3, 0, 0, 0),
            max_points: 1_000,
            raw_points: 0,
            periods: &[],
        })
        .unwrap();
        assert_eq!(two_days.resolution, QueryResolution::FiveMinute);

        let eight_days = select_resolution(&ResolutionInput {
            kind: CapabilityKind::Voltage,
            requested: QueryResolution::OneMinute,
            start: utc(2026, 1, 1, 0, 0, 0),
            end: utc(2026, 1, 9, 0, 0, 0),
            max_points: 1_000,
            raw_points: 0,
            periods: &[],
        })
        .unwrap();
        assert_eq!(eight_days.resolution, QueryResolution::Hourly);
    }

    #[test]
    fn daily_history_past_the_point_cap_uses_monthly_calendar_buckets() {
        let choice = select_resolution(&ResolutionInput {
            kind: CapabilityKind::ImportedEnergy,
            requested: QueryResolution::Daily,
            start: utc(2020, 1, 1, 0, 0, 0),
            end: utc(2024, 1, 1, 0, 0, 0),
            max_points: 1_000,
            raw_points: 0,
            periods: &[],
        })
        .unwrap();
        assert_eq!(choice.resolution, QueryResolution::Monthly);
        assert_eq!(choice.source_resolution, QueryResolution::Daily);
    }

    #[test]
    fn daily_buckets_follow_the_home_calendar() {
        let periods = [TimezonePeriod {
            timezone: "America/Los_Angeles".into(),
            effective_from: utc(2020, 1, 1, 0, 0, 0),
            effective_until: None,
        }];
        let start = utc(2026, 3, 8, 8, 0, 0);
        let end = utc(2026, 3, 9, 7, 0, 0);
        let buckets = buckets_for(QueryResolution::Daily, start, end, &periods).unwrap();
        assert_eq!(buckets.len(), 1);
        assert_eq!(buckets[0].start, start);
        assert_eq!(buckets[0].end, end);
        assert_ne!(end - start, Duration::hours(24));
    }

    #[test]
    fn series_point_count_never_exceeds_the_caller_maximum_or_1000() {
        let start = utc(2026, 1, 1, 0, 0, 0);
        let mut input = empty_input();
        input.range = Span {
            start,
            end: start + Duration::hours(40),
        };
        input.point_limit = 10;
        input.buckets = (0..40)
            .map(|hour| Span {
                start: start + Duration::hours(hour),
                end: start + Duration::hours(hour + 1),
            })
            .collect();
        input.samples = (0..40)
            .map(|hour| sample(start + Duration::hours(hour), hour, 1, false))
            .collect();
        let series = super::assemble_series(input).unwrap();
        assert_eq!(series.points.len(), 10);
        assert!(series.points.len() <= ABSOLUTE_POINT_CAP as usize);
        assert_eq!(effective_point_limit(5_000).unwrap(), ABSOLUTE_POINT_CAP);
        assert!(effective_point_limit(0).is_err());
    }

    #[test]
    fn missing_stale_rejected_and_unavailable_intervals_are_not_zero_buckets() {
        let start = utc(2026, 1, 1, 0, 0, 0);
        let mut input = empty_input();
        input.buckets = (0..5)
            .map(|hour| Span {
                start: start + Duration::hours(hour),
                end: start + Duration::hours(hour + 1),
            })
            .collect();
        input.samples = (0..5)
            .map(|hour| sample(start + Duration::hours(hour), 0, 3_600_000_000_000, false))
            .collect();
        let kinds = [
            IntervalKind::Missing,
            IntervalKind::Stale,
            IntervalKind::Rejected,
            IntervalKind::Unavailable,
        ];
        input.quality = kinds
            .into_iter()
            .enumerate()
            .map(|(hour, kind)| super::InputInterval {
                kind,
                start: start + Duration::hours(hour as i64),
                end: start + Duration::hours(hour as i64 + 1),
                reason: None,
            })
            .collect();
        let series = super::assemble_series(input).unwrap();
        assert_eq!(series.points.len(), 1);
        assert_eq!(series.points[0].value, 0);
        assert_eq!(series.points[0].start, start + Duration::hours(4));
        for kind in kinds {
            assert!(
                series.missing.iter().any(|interval| interval.kind == kind),
                "missing {kind:?}"
            );
        }
        assert!(
            series
                .points
                .iter()
                .all(|point| point.start >= start + Duration::hours(4))
        );
    }

    #[test]
    fn raw_gaps_beyond_freshness_are_stale_and_not_filled_with_zero() {
        let mut input = empty_input();
        input.resolution = QueryResolution::Raw;
        input.freshness = Duration::minutes(1);
        input.observations = vec![
            ObservationSample {
                at: utc(2026, 1, 1, 0, 0, 0),
                value: 0,
                scale: 0,
            },
            ObservationSample {
                at: utc(2026, 1, 1, 0, 10, 0),
                value: 5,
                scale: 0,
            },
        ];
        let series = super::assemble_series(input).unwrap();
        assert_eq!(series.points.len(), 2);
        assert!(
            series
                .missing
                .iter()
                .any(|interval| interval.kind == IntervalKind::Stale)
        );
        assert!(
            series
                .points
                .iter()
                .all(|point| point.value == 0 || point.value == 5)
        );
    }

    #[test]
    fn stored_counter_energy_is_not_recomputed_and_empty_estimates_are_omitted() {
        let measured = read_stored_energy(StoredEnergy::Counter {
            start: utc(2026, 1, 1, 0, 0, 0),
            end: utc(2026, 1, 1, 1, 0, 0),
            measured_energy: 15,
            coverage_numerator: 1,
            coverage_denominator: 1,
            scale: 3,
        })
        .unwrap();
        assert_eq!(measured.value, Some(15));
        assert_eq!(measured.provenance, Provenance::Measured);

        assert!(
            read_stored_energy(StoredEnergy::PowerEstimate {
                start: utc(2026, 1, 1, 0, 0, 0),
                end: utc(2026, 1, 1, 1, 0, 0),
                estimated: 0,
                coverage_ns: 0,
                elapsed_ns: 1,
                scale: 0,
            })
            .is_none()
        );
    }

    #[test]
    fn monthly_buckets_sum_stored_daily_energy_without_a_zero_day() {
        let start = utc(2026, 1, 1, 0, 0, 0);
        let end = utc(2026, 2, 1, 0, 0, 0);
        let mut input = empty_input();
        input.resolution = QueryResolution::Monthly;
        input.source_resolution = QueryResolution::Daily;
        input.provenance = Provenance::Measured;
        input.range = Span { start, end };
        input.buckets = buckets_for(QueryResolution::Monthly, start, end, &[]).unwrap();
        input.samples = vec![
            RollupSample {
                start: utc(2026, 1, 1, 0, 0, 0),
                end: utc(2026, 1, 2, 0, 0, 0),
                value: Some(10),
                scale: 0,
                covered_ns: 1,
                elapsed_ns: 1,
                provenance: Provenance::Measured,
                sum_values: true,
            },
            RollupSample {
                start: utc(2026, 1, 3, 0, 0, 0),
                end: utc(2026, 1, 4, 0, 0, 0),
                value: Some(30),
                scale: 0,
                covered_ns: 1,
                elapsed_ns: 1,
                provenance: Provenance::Measured,
                sum_values: true,
            },
        ];
        let series = super::assemble_series(input).unwrap();
        assert_eq!(series.points.len(), 1);
        assert_eq!(series.points[0].value, 40);
        assert_eq!(series.resolution, QueryResolution::Monthly);
        assert_eq!(series.source_resolution, QueryResolution::Daily);
    }

    #[test]
    fn recording_since_does_not_advance_and_available_since_is_earliest_retained() {
        let mut input = empty_input();
        input.recording_since = utc(2020, 1, 1, 0, 0, 0);
        input.available_since = Some(utc(2024, 6, 1, 0, 0, 0));
        input.meter_epoch_boundaries = vec![utc(2026, 1, 1, 2, 0, 0)];
        input.buckets = vec![Span {
            start: utc(2026, 1, 1, 0, 0, 0),
            end: utc(2026, 1, 1, 1, 0, 0),
        }];
        input.samples = vec![sample(utc(2026, 1, 1, 0, 0, 0), 4, 1, false)];
        let series = super::assemble_series(input).unwrap();
        assert_eq!(series.recording_since, utc(2020, 1, 1, 0, 0, 0));
        assert_eq!(series.available_since, Some(utc(2024, 6, 1, 0, 0, 0)));
        assert_eq!(
            series.meter_epoch_boundaries,
            vec![utc(2026, 1, 1, 2, 0, 0)]
        );
        assert!(series.coverage.elapsed_ns > 0);
    }

    #[test]
    fn members_receive_safe_reasons_without_operational_health() {
        let health = degraded_health();
        let mut input = empty_input();
        input.reveal_gap_reasons = false;
        input.quality = vec![super::InputInterval {
            kind: IntervalKind::History,
            start: utc(2026, 1, 1, 0, 0, 0),
            end: utc(2026, 1, 1, 1, 0, 0),
            reason: Some(GapReason::StorageFailure),
        }];
        input.buckets = vec![Span {
            start: utc(2026, 1, 1, 0, 0, 0),
            end: utc(2026, 1, 1, 1, 0, 0),
        }];
        input.samples = vec![sample(utc(2026, 1, 1, 0, 0, 0), 0, 1, false)];
        let series = super::assemble_series(input).unwrap();
        assert_eq!(series.gaps.len(), 1);
        assert!(series.gaps[0].reason.is_none());
        assert!(series.points.is_empty());

        let response = HistoryQueryResponse {
            as_of: utc(2026, 1, 2, 0, 0, 0),
            series: vec![series],
            reasons: super::safe_reasons(&health, true),
            health: None,
        };
        let json = serde_json::to_value(&response).unwrap();
        let rendered = json.to_string();
        assert!(json.get("health").is_none());
        assert!(!rendered.contains("queue"));
        assert!(!rendered.contains("1024"));
        assert!(!rendered.contains("storage_failure"));
        assert!(!rendered.contains("lossWarning"));
        assert!(
            json["reasons"]
                .as_array()
                .unwrap()
                .iter()
                .any(|reason| reason == "gap")
        );
        assert!(
            json["reasons"]
                .as_array()
                .unwrap()
                .iter()
                .any(|reason| reason == "coverage")
        );
    }

    #[test]
    fn owners_receive_operational_health_and_gap_reasons() {
        let health = degraded_health();
        let mut input = empty_input();
        input.reveal_gap_reasons = true;
        input.quality = vec![super::InputInterval {
            kind: IntervalKind::History,
            start: utc(2026, 1, 1, 0, 0, 0),
            end: utc(2026, 1, 1, 1, 0, 0),
            reason: Some(GapReason::StorageFailure),
        }];
        let series = super::assemble_series(input).unwrap();
        assert_eq!(
            series.gaps[0].reason.as_deref(),
            Some(GapReason::StorageFailure.as_str())
        );
        let response = HistoryQueryResponse {
            as_of: utc(2026, 1, 2, 0, 0, 0),
            series: vec![series],
            reasons: super::safe_reasons(&health, true),
            health: Some(health),
        };
        let json = serde_json::to_value(&response).unwrap();
        assert_eq!(json["health"]["queue"]["queued"], 1024);
    }

    #[test]
    fn device_scope_excludes_component_capabilities_and_labels_series() {
        let device = Uuid::from_u128(1);
        let component = Uuid::from_u128(2);
        let direct = CapabilityRef {
            id: device,
            kind: CapabilityKind::Power,
            scope_kind: "device".into(),
            component_path: Vec::new(),
        };
        let child = CapabilityRef {
            id: component,
            kind: CapabilityKind::Power,
            scope_kind: "component".into(),
            component_path: vec!["outlet-1".into()],
        };
        let device_scope = HistoryScope::Device { device_id: device };
        assert!(capability_in_scope(&device_scope, &direct));
        assert!(!capability_in_scope(&device_scope, &child));
        let component_scope = HistoryScope::Component {
            device_id: device,
            component_path: vec!["outlet-1".into()],
        };
        assert!(capability_in_scope(&component_scope, &child));
        assert!(!capability_in_scope(&component_scope, &direct));
        assert_ne!(
            series_label(HistoryMetric::Power, device, &[]),
            series_label(HistoryMetric::Power, component, &["outlet-1".into()])
        );
    }

    #[test]
    fn query_request_accepts_capability_device_and_component_scope() {
        let capability: HistoryQueryRequest = serde_json::from_value(serde_json::json!({
            "scope": { "type": "capability", "capabilityId": "00000000-0000-0000-0000-000000000001" },
            "metric": "importedEnergy",
            "start": "2026-10-01T00:00:00Z",
            "end": "2026-10-02T00:00:00Z",
            "resolution": "fifteen_minute",
            "freshnessLimitMs": 60000,
            "maxPoints": 1000
        }))
        .unwrap();
        assert!(matches!(capability.scope, HistoryScope::Capability { .. }));
        assert_eq!(capability.metric, HistoryMetric::ImportedEnergy);
        assert_eq!(capability.resolution, QueryResolution::FifteenMinute);

        let device: HistoryQueryRequest = serde_json::from_value(serde_json::json!({
            "scope": { "type": "device", "deviceId": "00000000-0000-0000-0000-000000000002" },
            "metric": "power",
            "start": "2026-10-01T00:00:00Z",
            "end": "2026-10-01T01:00:00Z",
            "resolution": "hourly",
            "freshnessLimitMs": 1000,
            "maxPoints": 24
        }))
        .unwrap();
        assert!(matches!(device.scope, HistoryScope::Device { .. }));

        let component: HistoryQueryRequest = serde_json::from_value(serde_json::json!({
            "scope": {
                "type": "component",
                "deviceId": "00000000-0000-0000-0000-000000000002",
                "componentPath": ["outlet-1"]
            },
            "metric": "voltage",
            "start": "2026-10-01T00:00:00Z",
            "end": "2026-10-01T01:00:00Z",
            "resolution": "five_minute",
            "freshnessLimitMs": 1000,
            "maxPoints": 24
        }))
        .unwrap();
        assert!(matches!(component.scope, HistoryScope::Component { .. }));

        let home = serde_json::from_value::<HistoryQueryRequest>(serde_json::json!({
            "scope": { "type": "home" },
            "metric": "power",
            "start": "2026-10-01T00:00:00Z",
            "end": "2026-10-01T01:00:00Z",
            "resolution": "hourly",
            "freshnessLimitMs": 1000,
            "maxPoints": 24
        }));
        assert!(home.is_err());
    }

    #[test]
    fn absent_daily_buckets_are_missing_intervals() {
        let start = utc(2026, 1, 1, 0, 0, 0);
        let end = utc(2026, 1, 4, 0, 0, 0);
        let mut input = empty_input();
        input.resolution = QueryResolution::Daily;
        input.range = Span { start, end };
        input.buckets = buckets_for(QueryResolution::Daily, start, end, &[]).unwrap();
        input.samples = vec![
            RollupSample {
                start,
                end: utc(2026, 1, 2, 0, 0, 0),
                value: Some(10),
                scale: 0,
                covered_ns: 1,
                elapsed_ns: 1,
                provenance: Provenance::Measured,
                sum_values: true,
            },
            RollupSample {
                start: utc(2026, 1, 3, 0, 0, 0),
                end,
                value: Some(30),
                scale: 0,
                covered_ns: 1,
                elapsed_ns: 1,
                provenance: Provenance::Measured,
                sum_values: true,
            },
        ];
        let series = super::assemble_series(input).unwrap();
        assert_eq!(
            series
                .points
                .iter()
                .map(|point| point.value)
                .collect::<Vec<_>>(),
            vec![10, 30]
        );
        assert!(
            series
                .missing
                .iter()
                .any(|interval: &HistoryInterval| { interval.kind == IntervalKind::Missing })
        );
        assert!(!series.points.iter().any(|point| point.value == 0));
    }
}
