//! Authorized Device, Component, and Home History queries.
//!
//! Reads use a dedicated PostgreSQL pool (`HISTORY_QUERY_POOL_SIZE` connections),
//! a matching concurrency semaphore, and `SET LOCAL statement_timeout` on the
//! query transaction. That pool is neither the control pool nor the History
//! admission pool, so a query cannot take the last connection from commands or
//! identity. Admission keeps its own pool inside `CapabilityService`.
//!
//! The logical response is one repeatable-read transaction. Core chooses one
//! asOf and one bucket set, materializes every series, then pages that capture.
//! Later pages come from the in-memory cursor, which keeps only unreturned
//! scope pages plus the query, asOf, and PostgreSQL snapshot id. Readable
//! series and cursors stay on the Controller; this module does not write them
//! to Convex.

use std::collections::{BTreeMap, HashMap, VecDeque};

use chrono::{DateTime, Duration, Utc};
use diesel::prelude::*;
use diesel::sql_types::{BigInt, Nullable, SmallInt, Text, Timestamptz, Uuid as SqlUuid};
use serde::de::{self, Deserializer};
use serde::{Deserialize, Serialize};
use thiserror::Error;
use uuid::Uuid;

use crate::api::auth::AuthenticatedClient;
use crate::pairing::members::find_member_by_user_id;
use crate::state::AppState;

use super::CapabilityKind;
use super::admission_journal::{self, GapReason, HistoryHealth, MemberReason};
use super::contributor_breakdown::{
    self, AlignedBucket, BreakdownInput, BreakdownMeter, BreakdownQuantity, BreakdownScope,
    ContributorBreakdown, HomeMeterScope, SeriesProvenance,
};
use super::history_retention::{self, Resolution as RetainedResolution};
use super::home_calendar::{self, TimezonePeriod};

/// Hard cap for one series. Callers cannot raise it.
pub const ABSOLUTE_POINT_CAP: u32 = 1_000;
/// Scope pages never split a series. A page holds at most this many series.
pub const SERIES_PAGE_LIMIT: usize = 20;
/// Cursors expire a few minutes after the snapshot is materialized.
pub const HISTORY_CURSOR_TTL_SECONDS: i64 = 300;
/// Live cursors stay in Core memory and are capped.
pub const MAX_LIVE_HISTORY_CURSORS: usize = 32;
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

pub fn history_query_isolation_sql() -> &'static str {
    "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ"
}

pub fn history_snapshot_id_sql() -> &'static str {
    "SELECT pg_current_snapshot()::text AS snapshot"
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
    Home,
}

/// A fresh query or a continuation of one already materialized. A cursor wins
/// so Core does not recompute a page from a newer database state.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum HistoryQueryRequest {
    Continuation { cursor: String },
    Query(HistoryQueryBody),
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryQueryBody {
    pub scope: HistoryScope,
    pub metric: HistoryMetric,
    pub start: DateTime<Utc>,
    pub end: DateTime<Utc>,
    pub resolution: QueryResolution,
    pub freshness_limit_ms: u64,
    pub max_points: u32,
    /// Home queries rank downstream contributors when this is set. Other scopes
    /// ignore it. The result stays on this query; there is no second request.
    #[serde(default)]
    pub breakdown: bool,
}

impl<'de> Deserialize<'de> for HistoryQueryRequest {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let value = serde_json::Value::deserialize(deserializer)?;
        if let Some(cursor) = value.get("cursor").and_then(|cursor| cursor.as_str()) {
            if !cursor.is_empty() {
                return Ok(Self::Continuation {
                    cursor: cursor.to_string(),
                });
            }
        }
        let body = serde_json::from_value(value).map_err(de::Error::custom)?;
        Ok(Self::Query(body))
    }
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
    /// A response bucket that contains a Home-meter designation boundary.
    #[serde(default, skip_serializing_if = "skip_false")]
    pub partial: bool,
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
    /// Every Home-meter designation boundary in the query window.
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub designation_boundaries: Vec<DateTime<Utc>>,
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
    /// True until the last scope page. Clients must not aggregate across scopes
    /// while this is true.
    pub incomplete: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_cursor: Option<String>,
    /// Omitted unless the caller asked for a Home breakdown. Percentages and
    /// Unattributed are present only when the calculation proved them.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub breakdown: Option<ContributorBreakdown>,
}

#[derive(Debug, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum HistoryQueryOutcome {
    #[serde(rename = "historyQueryResult")]
    Page(HistoryQueryResponse),
    #[serde(rename = "historyQueryRestart")]
    Restart(HistoryQueryRestart),
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryQueryRestart {
    pub reason: RestartReason,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum RestartReason {
    CursorExpired,
    CursorUnknown,
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

struct SeriesEstimate {
    kind: CapabilityKind,
    raw_points: u32,
}

struct AlignInput<'a> {
    requested: QueryResolution,
    start: DateTime<Utc>,
    end: DateTime<Utc>,
    max_points: u32,
    periods: &'a [TimezonePeriod],
    series: &'a [SeriesEstimate],
}

struct ResponsePlan {
    resolution: QueryResolution,
    source_resolution: QueryResolution,
    point_limit: u32,
    buckets: Vec<Span>,
}

/// One resolution and one bucket list for every series in the logical response.
/// Month buckets are derived here and are not written back to PostgreSQL.
fn align_response(input: &AlignInput<'_>) -> Result<ResponsePlan, HistoryQueryError> {
    let mut selected: Option<ResolutionChoice> = None;
    for series in input.series {
        let choice = select_resolution(&ResolutionInput {
            kind: series.kind,
            requested: input.requested,
            start: input.start,
            end: input.end,
            max_points: input.max_points,
            raw_points: series.raw_points,
            periods: input.periods,
        })?;
        selected = Some(match selected {
            Some(current) if choice.resolution.rank() > current.resolution.rank() => choice,
            Some(current) => current,
            None => choice,
        });
    }
    let choice = selected.ok_or(HistoryQueryError::InvalidQuery)?;
    let buckets = if choice.resolution == QueryResolution::Raw {
        Vec::new()
    } else {
        buckets_for(choice.resolution, input.start, input.end, input.periods)?
    };
    Ok(ResponsePlan {
        resolution: choice.resolution,
        source_resolution: choice.source_resolution,
        point_limit: choice.point_limit,
        buckets,
    })
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
        HistoryScope::Home => false,
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
        designation_boundaries: Vec::new(),
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
            partial: false,
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
            partial: false,
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

fn skip_false(value: &bool) -> bool {
    !*value
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
        GapReason::Restore,
    ]
    .into_iter()
    .find(|reason| reason.as_str() == value)
}

fn validate_request(request: &HistoryQueryBody) -> Result<Duration, HistoryQueryError> {
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
/// The series read uses only the History query pool. Cursor fetches do not
/// touch PostgreSQL.
pub async fn query_for_client(
    state: &AppState,
    auth: &AuthenticatedClient,
    request: HistoryQueryRequest,
) -> Result<HistoryQueryOutcome, HistoryQueryError> {
    let role = caller_role(state, auth).await?;
    match request {
        HistoryQueryRequest::Continuation { cursor } => {
            let mut cursors = state
                .history_cursors
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            Ok(cursors.continue_page(Utc::now(), &cursor, role))
        }
        HistoryQueryRequest::Query(request) => {
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
            let mut loaded = conn
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
            let breakdown = loaded.breakdown_input.take().map(|mut input| {
                fill_breakdown_accuracy(
                    &mut input,
                    &state.capabilities,
                    loaded.query.start,
                    loaded.query.end,
                );
                contributor_breakdown::calculate_contributor_breakdown(&input)
            });
            let health = admission_journal::current_health();
            let now = Utc::now();
            let mut cursors = state
                .history_cursors
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            finish_response(role, loaded, breakdown, &health, &mut cursors, now)
        }
    }
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
    breakdown: Option<ContributorBreakdown>,
    health: &HistoryHealth,
    cursors: &mut HistoryCursorStore,
    now: DateTime<Utc>,
) -> Result<HistoryQueryOutcome, HistoryQueryError> {
    if let Some(mut series) = loaded.home_series {
        if role != HistoryRole::Owner {
            for row in &mut series {
                for gap in &mut row.gaps {
                    gap.reason = None;
                }
            }
        }
        let series_have_gaps = series.iter().any(|row| !row.gaps.is_empty());
        return Ok(HistoryQueryOutcome::Page(cursors.open_page(
            now,
            MaterializedHistory {
                role,
                query: loaded.query,
                as_of: loaded.as_of,
                snapshot: loaded.snapshot,
                buckets: loaded.home_buckets,
                series,
                reasons: safe_reasons(health, series_have_gaps),
                health: match role {
                    HistoryRole::Owner => Some(health.clone()),
                    HistoryRole::Member => None,
                },
                breakdown,
            },
        )));
    }
    let reveal = role == HistoryRole::Owner;
    let mut series = Vec::with_capacity(loaded.series.len());
    let mut buckets = Vec::new();
    for row in loaded.series {
        if buckets.is_empty() {
            buckets.clone_from(&row.buckets);
        }
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
    Ok(HistoryQueryOutcome::Page(cursors.open_page(
        now,
        MaterializedHistory {
            role,
            query: loaded.query,
            as_of: loaded.as_of,
            snapshot: loaded.snapshot,
            buckets,
            series,
            reasons: safe_reasons(health, series_have_gaps),
            health: match role {
                HistoryRole::Owner => Some(health.clone()),
                HistoryRole::Member => None,
            },
            breakdown: None,
        },
    )))
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
    snapshot: String,
    query: HistoryQueryBody,
    series: Vec<LoadedSeries>,
    home_series: Option<Vec<HistorySeries>>,
    home_buckets: Vec<Span>,
    breakdown_input: Option<BreakdownInput>,
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

#[derive(Clone)]
struct HomePeriodSlice {
    capability_id: Uuid,
    effective_from: DateTime<Utc>,
    effective_until: Option<DateTime<Utc>>,
    provenance: Provenance,
    label: String,
    meter_epoch_boundaries: Vec<DateTime<Utc>>,
}

#[derive(Clone)]
struct HomeObservation {
    capability_id: Uuid,
    start: DateTime<Utc>,
    end: DateTime<Utc>,
    value: i64,
    scale: u8,
    covered_ns: i64,
    elapsed_ns: i64,
    provenance: Provenance,
    sum_values: bool,
}

struct HomeAssembly<'a> {
    metric: HistoryMetric,
    range: Span,
    resolution: QueryResolution,
    source_resolution: QueryResolution,
    buckets: &'a [Span],
    recording_since: DateTime<Utc>,
    /// Periods that supply this metric.
    periods: &'a [HomePeriodSlice],
    /// Every designation period, including ones that do not supply this metric.
    boundary_periods: &'a [HomePeriodSlice],
    samples: &'a [HomeObservation],
    quality: &'a [(Uuid, InputInterval)],
    reveal_gap_reasons: bool,
}

struct HomeLoad {
    series: Vec<HistorySeries>,
    buckets: Vec<Span>,
}

fn designated_source(
    period: &super::home_meter::DesignationPeriod,
    metric: HistoryMetric,
) -> Option<(Uuid, Provenance, CapabilityKind)> {
    match metric {
        HistoryMetric::Power => period
            .power_capability_id
            .map(|id| (id, Provenance::Measured, CapabilityKind::Power)),
        HistoryMetric::ImportedEnergy => {
            if let Some(id) = period.imported_energy_capability_id {
                Some((id, Provenance::Measured, CapabilityKind::ImportedEnergy))
            } else {
                period
                    .power_capability_id
                    .map(|id| (id, Provenance::Estimated, CapabilityKind::Power))
            }
        }
        HistoryMetric::ExportedEnergy => {
            if let Some(id) = period.exported_energy_capability_id {
                Some((id, Provenance::Measured, CapabilityKind::ExportedEnergy))
            } else {
                period
                    .power_capability_id
                    .map(|id| (id, Provenance::Estimated, CapabilityKind::Power))
            }
        }
        HistoryMetric::Voltage | HistoryMetric::Current => None,
    }
}

fn clip_period(
    from: DateTime<Utc>,
    until: Option<DateTime<Utc>>,
    range_start: DateTime<Utc>,
    range_end: DateTime<Utc>,
) -> Option<Span> {
    let start = from.max(range_start);
    let end = until.unwrap_or(range_end).min(range_end);
    (start < end).then_some(Span { start, end })
}

fn intersect_span(left: Span, right: Span) -> Option<Span> {
    let start = left.start.max(right.start);
    let end = left.end.min(right.end);
    (start < end).then_some(Span { start, end })
}

/// Instants where a designation starts or ends inside the query window.
fn designation_boundary_instants(periods: &[HomePeriodSlice], range: Span) -> Vec<DateTime<Utc>> {
    let mut bounds = Vec::new();
    for period in periods {
        if range.start <= period.effective_from && period.effective_from <= range.end {
            bounds.push(period.effective_from);
        }
        if let Some(until) = period.effective_until {
            if range.start <= until && until <= range.end {
                bounds.push(until);
            }
        }
    }
    bounds.sort();
    bounds.dedup();
    bounds
}

fn bucket_crosses_boundary(bucket: Span, boundaries: &[DateTime<Utc>]) -> bool {
    boundaries
        .iter()
        .any(|boundary| bucket.start < *boundary && *boundary < bucket.end)
}

fn uncovered_spans(range: Span, segments: &[Span]) -> Vec<Span> {
    let mut cursor = range.start;
    let mut gaps = Vec::new();
    for segment in segments {
        if segment.start > cursor {
            let end = segment.start.min(range.end);
            if cursor < end {
                gaps.push(Span { start: cursor, end });
            }
        }
        if segment.end > cursor {
            cursor = segment.end;
        }
    }
    if cursor < range.end {
        gaps.push(Span {
            start: cursor,
            end: range.end,
        });
    }
    gaps
}

fn sample_during_period(sample: &HomeObservation, period: &HomePeriodSlice) -> bool {
    if let Some(until) = period.effective_until {
        return sample_in_window(
            sample,
            Span {
                start: period.effective_from,
                end: until,
            },
        );
    }
    sample.start >= period.effective_from || sample.end > period.effective_from
}

fn sample_in_window(sample: &HomeObservation, window: Span) -> bool {
    if sample.start == sample.end {
        return sample.start >= window.start && sample.start < window.end;
    }
    intersect_span(
        Span {
            start: sample.start,
            end: sample.end,
        },
        window,
    )
    .is_some()
}

fn scaled_sample_value(sample: &HomeObservation, window: Span) -> Option<i128> {
    if sample.start == sample.end {
        return sample_in_window(sample, window).then_some(i128::from(sample.value));
    }
    let overlap = intersect_span(
        Span {
            start: sample.start,
            end: sample.end,
        },
        window,
    )?;
    if !sample.sum_values {
        return Some(i128::from(sample.value));
    }
    let sample_ns = elapsed_ns(sample.start, sample.end).max(1);
    let overlap_ns = elapsed_ns(overlap.start, overlap.end);
    Some(i128::from(sample.value) * i128::from(overlap_ns) / i128::from(sample_ns))
}

/// Home results follow designation periods. Values never combine across a
/// boundary, undesignated time stays missing, and a bucket that contains a
/// boundary is partial.
fn assemble_home_history(input: &HomeAssembly<'_>) -> Vec<HistorySeries> {
    let boundaries = designation_boundary_instants(input.boundary_periods, input.range);
    let mut segments = Vec::new();
    for period in input.periods {
        if let Some(span) = clip_period(
            period.effective_from,
            period.effective_until,
            input.range.start,
            input.range.end,
        ) {
            segments.push((period, span));
        }
    }
    let segment_spans: Vec<Span> = segments.iter().map(|(_, span)| *span).collect();
    let undesignated = uncovered_spans(input.range, &segment_spans);
    if segments.is_empty() {
        let Some(period) = input.periods.first() else {
            return Vec::new();
        };
        return vec![home_series(
            input,
            period,
            &boundaries,
            Vec::new(),
            undesignated_missing(&undesignated),
            Vec::new(),
        )];
    }
    segments
        .iter()
        .map(|(period, span)| {
            let (points, mut missing) = home_points(input, period, *span, &boundaries);
            missing.extend(undesignated_missing(&undesignated));
            missing.extend(home_rejected(input, period.capability_id, *span));
            let gaps = home_gaps(input, period.capability_id, *span);
            home_series(input, period, &boundaries, points, missing, gaps)
        })
        .collect()
}

fn undesignated_missing(spans: &[Span]) -> Vec<HistoryInterval> {
    spans
        .iter()
        .map(|span| HistoryInterval {
            kind: IntervalKind::Missing,
            start: span.start,
            end: span.end,
            reason: None,
        })
        .collect()
}

fn home_rejected(
    input: &HomeAssembly<'_>,
    capability_id: Uuid,
    span: Span,
) -> Vec<HistoryInterval> {
    input
        .quality
        .iter()
        .filter(|(id, interval)| *id == capability_id && interval.kind == IntervalKind::Rejected)
        .filter_map(|(_, interval)| {
            let clipped = clip_span(interval.start, interval.end, span)?;
            Some(HistoryInterval {
                kind: IntervalKind::Rejected,
                start: clipped.start,
                end: clipped.end,
                reason: None,
            })
        })
        .collect()
}

fn home_gaps(input: &HomeAssembly<'_>, capability_id: Uuid, span: Span) -> Vec<HistoryInterval> {
    input
        .quality
        .iter()
        .filter(|(id, _)| *id == capability_id)
        .filter_map(|(_, interval)| {
            let clipped = clip_span(interval.start, interval.end, span)?;
            if interval.kind != IntervalKind::History {
                return None;
            }
            Some(HistoryInterval {
                kind: IntervalKind::History,
                start: clipped.start,
                end: clipped.end,
                reason: if input.reveal_gap_reasons {
                    interval.reason.map(GapReason::as_str).map(str::to_string)
                } else {
                    None
                },
            })
        })
        .collect()
}

fn home_points(
    input: &HomeAssembly<'_>,
    period: &HomePeriodSlice,
    span: Span,
    boundaries: &[DateTime<Utc>],
) -> (Vec<HistoryPoint>, Vec<HistoryInterval>) {
    if input.resolution == QueryResolution::Raw {
        let points = input
            .samples
            .iter()
            .filter(|sample| {
                sample.capability_id == period.capability_id && sample_in_window(sample, span)
            })
            .map(|sample| HistoryPoint {
                start: sample.start,
                end: sample.end,
                value: sample.value,
                scale: sample.scale,
                provenance: sample.provenance,
                coverage: Coverage {
                    covered_ns: sample.covered_ns,
                    elapsed_ns: sample.elapsed_ns,
                },
                partial: false,
            })
            .collect();
        return (points, Vec::new());
    }
    let mut points = Vec::new();
    let mut missing = Vec::new();
    for bucket in input.buckets {
        let Some(window) = intersect_span(*bucket, span) else {
            continue;
        };
        let partial = bucket_crosses_boundary(*bucket, boundaries);
        let usable: Vec<&HomeObservation> = input
            .samples
            .iter()
            .filter(|sample| {
                sample.capability_id == period.capability_id && sample_in_window(sample, window)
            })
            .collect();
        if usable.is_empty() {
            missing.push(HistoryInterval {
                kind: IntervalKind::Missing,
                start: window.start,
                end: window.end,
                reason: None,
            });
            continue;
        }
        let sums = usable.iter().any(|sample| sample.sum_values);
        let value = if sums {
            usable.iter().fold(0i128, |total, sample| {
                total + scaled_sample_value(sample, window).unwrap_or(0)
            })
        } else {
            let mut weighted = 0i128;
            let mut weight = 0i128;
            for sample in &usable {
                let overlap = if sample.start == sample.end {
                    Span {
                        start: sample.start,
                        end: sample.end,
                    }
                } else {
                    let Some(overlap) = intersect_span(
                        Span {
                            start: sample.start,
                            end: sample.end,
                        },
                        window,
                    ) else {
                        continue;
                    };
                    overlap
                };
                let sample_weight = elapsed_ns(overlap.start, overlap.end).max(1);
                weighted += i128::from(sample.value) * i128::from(sample_weight);
                weight += i128::from(sample_weight);
            }
            if weight == 0 {
                i128::from(usable[0].value)
            } else {
                weighted / weight
            }
        };
        let Some(value) = i64::try_from(value).ok() else {
            missing.push(HistoryInterval {
                kind: IntervalKind::Unavailable,
                start: window.start,
                end: window.end,
                reason: None,
            });
            continue;
        };
        let scale = usable[0].scale;
        let provenance = usable[0].provenance;
        let covered = usable.iter().fold(0i128, |total, sample| {
            if sample.sum_values && sample.start != sample.end {
                let sample_ns = elapsed_ns(sample.start, sample.end).max(1);
                let overlap_ns = intersect_span(
                    Span {
                        start: sample.start,
                        end: sample.end,
                    },
                    window,
                )
                .map(|overlap| elapsed_ns(overlap.start, overlap.end))
                .unwrap_or(0);
                total
                    + i128::from(sample.covered_ns) * i128::from(overlap_ns) / i128::from(sample_ns)
            } else {
                total + i128::from(sample.covered_ns)
            }
        });
        points.push(HistoryPoint {
            start: if partial { window.start } else { bucket.start },
            end: if partial { window.end } else { bucket.end },
            value,
            scale,
            provenance,
            coverage: Coverage {
                covered_ns: i64::try_from(covered).unwrap_or(0),
                elapsed_ns: elapsed_ns(window.start, window.end).max(0),
            },
            partial,
        });
    }
    (points, missing)
}

fn home_series(
    input: &HomeAssembly<'_>,
    period: &HomePeriodSlice,
    boundaries: &[DateTime<Utc>],
    points: Vec<HistoryPoint>,
    missing: Vec<HistoryInterval>,
    gaps: Vec<HistoryInterval>,
) -> HistorySeries {
    let covered: i64 = points.iter().map(|point| point.coverage.covered_ns).sum();
    let elapsed = elapsed_ns(input.range.start, input.range.end).max(0);
    let available_since = input
        .samples
        .iter()
        .filter(|sample| {
            input.periods.iter().any(|period| {
                sample.capability_id == period.capability_id && sample_during_period(sample, period)
            })
        })
        .map(|sample| sample.start)
        .min();
    HistorySeries {
        capability_id: period.capability_id,
        label: if period.label.is_empty() {
            series_label(input.metric, period.capability_id, &[])
        } else {
            period.label.clone()
        },
        resolution: input.resolution,
        source_resolution: input.source_resolution,
        provenance: period.provenance,
        coverage: Coverage {
            covered_ns: covered.min(elapsed),
            elapsed_ns: elapsed,
        },
        recording_since: input.recording_since,
        available_since,
        meter_epoch_boundaries: period.meter_epoch_boundaries.clone(),
        designation_boundaries: boundaries.to_vec(),
        gaps,
        missing,
        points,
    }
}

fn load_home_series(
    conn: &mut PgConnection,
    request: &HistoryQueryBody,
    freshness: Duration,
    timezone_periods: &[TimezonePeriod],
) -> Result<HomeLoad, QueryLoadError> {
    let _ = freshness;
    let stored = super::home_meter::load_all_periods(conn)?;
    let Some(recording_since) = stored.iter().map(|period| period.effective_from).min() else {
        return Ok(HomeLoad {
            series: Vec::new(),
            buckets: Vec::new(),
        });
    };
    struct Slice {
        capability_id: Uuid,
        kind: CapabilityKind,
        provenance: Provenance,
        effective_from: DateTime<Utc>,
        effective_until: Option<DateTime<Utc>>,
        component_path: Vec<String>,
    }
    let mut slices = Vec::new();
    let mut estimates = Vec::new();
    for period in &stored {
        let Some((capability_id, provenance, kind)) = designated_source(period, request.metric)
        else {
            continue;
        };
        let raw_points = clip_period(
            period.effective_from,
            period.effective_until,
            request.start,
            request.end,
        )
        .map(|span| load_raw_count(conn, capability_id, span.start, span.end))
        .transpose()?
        .unwrap_or(0);
        estimates.push(SeriesEstimate { kind, raw_points });
        slices.push(Slice {
            capability_id,
            kind,
            provenance,
            effective_from: period.effective_from,
            effective_until: period.effective_until,
            component_path: period.component_path.clone(),
        });
    }
    if slices.is_empty() {
        return Ok(HomeLoad {
            series: Vec::new(),
            buckets: Vec::new(),
        });
    }
    let plan = align_response(&AlignInput {
        requested: request.resolution,
        start: request.start,
        end: request.end,
        max_points: request.max_points,
        periods: timezone_periods,
        series: &estimates,
    })?;
    let mut samples = Vec::new();
    let mut quality = Vec::new();
    let mut epochs = Vec::new();
    for slice in &slices {
        let Some(span) = clip_period(
            slice.effective_from,
            slice.effective_until,
            request.start,
            request.end,
        ) else {
            epochs.push((slice.capability_id, slice.effective_from, Vec::new()));
            continue;
        };
        let (loaded, observations) = load_points(
            conn,
            slice.capability_id,
            slice.kind,
            request.metric,
            plan.resolution,
            span.start,
            span.end,
            plan.point_limit,
        )?;
        for sample in loaded {
            let Some(value) = sample.value else {
                continue;
            };
            samples.push(HomeObservation {
                capability_id: slice.capability_id,
                start: sample.start,
                end: sample.end,
                value,
                scale: sample.scale,
                covered_ns: sample.covered_ns,
                elapsed_ns: sample.elapsed_ns,
                provenance: sample.provenance,
                sum_values: sample.sum_values,
            });
        }
        for observation in observations {
            samples.push(HomeObservation {
                capability_id: slice.capability_id,
                start: observation.at,
                end: observation.at,
                value: observation.value,
                scale: observation.scale,
                covered_ns: 0,
                elapsed_ns: 0,
                provenance: Provenance::Measured,
                sum_values: false,
            });
        }
        for interval in load_gaps(conn, slice.capability_id, span.start, span.end)? {
            quality.push((slice.capability_id, interval));
        }
        let rejected =
            load_rejected_intervals(conn, slice.capability_id, span.start, span.end)?;
        let mut rejected_quality = Vec::new();
        append_rejected_intervals(&mut rejected_quality, &rejected);
        for interval in rejected_quality {
            quality.push((slice.capability_id, interval));
        }
        epochs.push((
            slice.capability_id,
            slice.effective_from,
            load_epoch_boundaries(conn, slice.capability_id, span.start, span.end)?,
        ));
    }
    let periods: Vec<HomePeriodSlice> = slices
        .iter()
        .map(|slice| HomePeriodSlice {
            capability_id: slice.capability_id,
            effective_from: slice.effective_from,
            effective_until: slice.effective_until,
            provenance: slice.provenance,
            label: series_label(request.metric, slice.capability_id, &slice.component_path),
            meter_epoch_boundaries: epochs
                .iter()
                .find(|(id, from, _)| *id == slice.capability_id && *from == slice.effective_from)
                .map(|(_, _, bounds)| bounds.clone())
                .unwrap_or_default(),
        })
        .collect();
    let boundary_periods: Vec<HomePeriodSlice> = stored
        .iter()
        .map(|period| HomePeriodSlice {
            capability_id: period
                .capability_ids()
                .into_iter()
                .next()
                .unwrap_or(Uuid::nil()),
            effective_from: period.effective_from,
            effective_until: period.effective_until,
            provenance: Provenance::Measured,
            label: String::new(),
            meter_epoch_boundaries: Vec::new(),
        })
        .collect();
    let series = assemble_home_history(&HomeAssembly {
        metric: request.metric,
        range: Span {
            start: request.start,
            end: request.end,
        },
        resolution: plan.resolution,
        source_resolution: plan.source_resolution,
        buckets: &plan.buckets,
        recording_since,
        periods: &periods,
        boundary_periods: &boundary_periods,
        samples: &samples,
        quality: &quality,
        reveal_gap_reasons: true,
    });
    Ok(HomeLoad {
        series,
        buckets: plan.buckets,
    })
}

fn load_breakdown_input(
    conn: &mut PgConnection,
    request: &HistoryQueryBody,
    home: &HomeLoad,
) -> Result<Option<BreakdownInput>, QueryLoadError> {
    if !request.breakdown || !matches!(request.scope, HistoryScope::Home) {
        return Ok(None);
    }
    let Some(quantity) = breakdown_quantity(request.metric) else {
        return Ok(None);
    };
    if home.series.is_empty() {
        return Ok(None);
    }
    let periods = super::home_meter::load_all_periods(conn)?;
    let overlapping: Vec<_> = periods
        .iter()
        .filter(|period| {
            period.effective_from < request.end
                && period
                    .effective_until
                    .is_none_or(|until| until > request.start)
        })
        .collect();
    if overlapping.is_empty() {
        return Ok(None);
    }
    let scopes: Vec<HomeMeterScope> = overlapping
        .iter()
        .map(|period| home_meter_scope(period))
        .collect();
    let designation_boundary = home.series.len() > 1
        || home
            .series
            .iter()
            .any(|series| !series.designation_boundaries.is_empty())
        || scopes.windows(2).any(|pair| pair[0] != pair[1]);
    let home_scope = scopes.into_iter().next().unwrap_or(HomeMeterScope::Home);
    let buckets = home_bucket_spans(home);
    let home_ids: Vec<Uuid> = home
        .series
        .iter()
        .map(|series| series.capability_id)
        .collect();
    let mut contributors = Vec::new();
    for row in load_contributor_identities(conn)? {
        let Some(kind) = CapabilityKind::parse(&row.kind).ok() else {
            continue;
        };
        if !metric_reads_kind(request.metric, kind) || home_ids.contains(&row.id) {
            continue;
        }
        let component_path = contributor_component_path(&row);
        let (mut samples, observations) = load_points(
            conn,
            row.id,
            kind,
            request.metric,
            home.series[0].resolution,
            request.start,
            request.end,
            request.max_points.min(ABSOLUTE_POINT_CAP),
        )?;
        for observation in observations {
            samples.push(RollupSample {
                start: observation.at,
                end: observation.at,
                value: Some(observation.value),
                scale: observation.scale,
                covered_ns: 0,
                elapsed_ns: 0,
                provenance: Provenance::Measured,
                sum_values: false,
            });
        }
        let gaps = load_gaps(conn, row.id, request.start, request.end)?;
        let covered_ns = samples.iter().map(|sample| sample.covered_ns.max(0)).sum();
        let elapsed_ns = samples.iter().map(|sample| sample.elapsed_ns.max(0)).sum();
        contributors.push(BreakdownMeter {
            capability_id: row.id,
            label: series_label(request.metric, row.id, &component_path),
            scope: BreakdownScope {
                device_key: contributor_breakdown::device_key(
                    &row.protocol,
                    &row.device_external_id,
                ),
                component_path,
            },
            quantity,
            provenance: match series_provenance(request.metric, kind) {
                Provenance::Measured => SeriesProvenance::Measured,
                Provenance::Estimated => SeriesProvenance::Estimated,
            },
            covered_ns,
            elapsed_ns,
            history_gaps: !gaps.is_empty(),
            accuracy: None,
            buckets: samples_on_buckets(&samples, &buckets),
        });
    }
    Ok(Some(BreakdownInput {
        quantity,
        home_scope,
        designation_boundary,
        home_capability_ids: home_ids,
        home: home_breakdown_meter(home, &buckets, quantity),
        contributors,
        // No tested adapter profile is registered. Beta does not accept an
        // Owner topology, so cross-device meters stay rankings.
        disjoint_devices: None,
    }))
}

fn breakdown_quantity(metric: HistoryMetric) -> Option<BreakdownQuantity> {
    Some(match metric {
        HistoryMetric::Power => BreakdownQuantity::InstantaneousPower,
        HistoryMetric::ImportedEnergy => BreakdownQuantity::ImportedEnergy,
        HistoryMetric::ExportedEnergy => BreakdownQuantity::ExportedEnergy,
        HistoryMetric::Voltage | HistoryMetric::Current => return None,
    })
}

fn home_meter_scope(period: &super::home_meter::DesignationPeriod) -> HomeMeterScope {
    let device_key =
        contributor_breakdown::device_key(&period.protocol, &period.device_external_id);
    match period.physical_scope_kind.as_str() {
        "device" => HomeMeterScope::Device { device_key },
        "component" => {
            let component_path = if !period.component_path.is_empty() {
                period.component_path.clone()
            } else if period.physical_scope_component_id.is_empty() {
                Vec::new()
            } else {
                vec![period.physical_scope_component_id.clone()]
            };
            HomeMeterScope::Component {
                device_key,
                component_path,
            }
        }
        _ => HomeMeterScope::Home,
    }
}

fn home_bucket_spans(home: &HomeLoad) -> Vec<Span> {
    if !home.buckets.is_empty() {
        return home.buckets.clone();
    }
    let mut spans = Vec::new();
    for series in &home.series {
        for point in &series.points {
            let span = Span {
                start: point.start,
                end: point.end,
            };
            if !spans
                .iter()
                .any(|existing: &Span| existing.start == span.start && existing.end == span.end)
            {
                spans.push(span);
            }
        }
    }
    spans.sort_by_key(|span| span.start);
    spans
}

fn home_breakdown_meter(
    home: &HomeLoad,
    buckets: &[Span],
    quantity: BreakdownQuantity,
) -> BreakdownMeter {
    let first = &home.series[0];
    let provenance = if home
        .series
        .iter()
        .any(|series| series.provenance == Provenance::Estimated)
    {
        SeriesProvenance::Estimated
    } else {
        SeriesProvenance::Measured
    };
    let (covered_ns, elapsed_ns) = if home.series.len() == 1 {
        (first.coverage.covered_ns, first.coverage.elapsed_ns)
    } else {
        (
            home.series
                .iter()
                .map(|series| series.coverage.covered_ns)
                .sum(),
            first.coverage.elapsed_ns,
        )
    };
    BreakdownMeter {
        capability_id: first.capability_id,
        label: first.label.clone(),
        scope: BreakdownScope {
            device_key: "home".into(),
            component_path: Vec::new(),
        },
        quantity,
        provenance,
        covered_ns,
        elapsed_ns,
        history_gaps: home.series.iter().any(|series| !series.gaps.is_empty()),
        accuracy: None,
        buckets: buckets
            .iter()
            .map(|bucket| {
                let matches: Vec<_> = home
                    .series
                    .iter()
                    .flat_map(|series| series.points.iter())
                    .filter(|point| point.start == bucket.start && point.end == bucket.end)
                    .collect();
                let (value, scale) = if matches.len() == 1 {
                    (Some(matches[0].value), matches[0].scale)
                } else {
                    (None, matches.first().map(|point| point.scale).unwrap_or(0))
                };
                AlignedBucket {
                    start: bucket.start,
                    end: bucket.end,
                    value,
                    scale,
                }
            })
            .collect(),
    }
}

fn samples_on_buckets(samples: &[RollupSample], buckets: &[Span]) -> Vec<AlignedBucket> {
    buckets
        .iter()
        .map(|bucket| {
            let matched: Vec<_> = samples
                .iter()
                .filter(|sample| sample.start == bucket.start && sample.end == bucket.end)
                .collect();
            let scale = matched.first().map(|sample| sample.scale).unwrap_or(0);
            let value = if matched.is_empty() {
                None
            } else if matched.iter().any(|sample| sample.value.is_none()) {
                None
            } else if matched.len() == 1 || matched.iter().all(|sample| sample.sum_values) {
                let sum = matched.iter().fold(0i128, |total, sample| {
                    total + i128::from(sample.value.unwrap_or(0))
                });
                i64::try_from(sum).ok()
            } else {
                None
            };
            AlignedBucket {
                start: bucket.start,
                end: bucket.end,
                value,
                scale,
            }
        })
        .collect()
}

fn contributor_component_path(row: &ContributorIdentityRow) -> Vec<String> {
    if row.physical_scope_kind == "device" && row.component_path.is_empty() {
        return Vec::new();
    }
    if !row.component_path.is_empty() {
        return row.component_path.split('/').map(str::to_string).collect();
    }
    if row.physical_scope_component_id.is_empty() {
        vec!["component".into()]
    } else {
        vec![row.physical_scope_component_id.clone()]
    }
}

fn load_contributor_identities(
    conn: &mut PgConnection,
) -> Result<Vec<ContributorIdentityRow>, diesel::result::Error> {
    diesel::sql_query(
        "SELECT id, kind::text AS kind, protocol, device_external_id,
                physical_scope_kind::text AS physical_scope_kind,
                physical_scope_component_id,
                COALESCE(array_to_string(component_path, '/'), '')::text AS component_path
         FROM capability_identities
         WHERE tombstoned_at IS NULL",
    )
    .load(conn)
}

fn fill_breakdown_accuracy(
    input: &mut BreakdownInput,
    capabilities: &crate::capabilities::CapabilityService,
    start: DateTime<Utc>,
    end: DateTime<Utc>,
) {
    let home_ids = if input.home_capability_ids.is_empty() {
        vec![input.home.capability_id]
    } else {
        input.home_capability_ids.clone()
    };
    input.home.accuracy = merged_accuracy(capabilities, &home_ids, start, end);
    for meter in &mut input.contributors {
        meter.accuracy = merged_accuracy(capabilities, &[meter.capability_id], start, end);
    }
}

fn merged_accuracy(
    capabilities: &crate::capabilities::CapabilityService,
    ids: &[Uuid],
    start: DateTime<Utc>,
    end: DateTime<Utc>,
) -> Option<contributor_breakdown::MeterAccuracy> {
    let mut parts = Vec::new();
    for id in ids {
        let revisions =
            capabilities.constraint_revisions(crate::capabilities::CapabilityId::from_uuid(*id))?;
        parts.push(contributor_breakdown::accuracy_for_window(
            &revisions, start, end,
        )?);
    }
    contributor_breakdown::conservative_accuracy(&parts)
}

fn load_query(
    conn: &mut PgConnection,
    request: &HistoryQueryBody,
    freshness: Duration,
) -> Result<LoadedQuery, QueryLoadError> {
    conn.transaction(|conn| {
        // Repeatable read plus the snapshot id. The id is kept with the cursor;
        // later pages are served from the materialized capture, not a new read.
        let snapshot = capture_snapshot(conn)?;
        let as_of = Utc::now();
        let periods = load_periods(conn)?;
        if matches!(request.scope, HistoryScope::Home) {
            let home = load_home_series(conn, request, freshness, &periods)?;
            let breakdown_input = load_breakdown_input(conn, request, &home)?;
            return Ok(LoadedQuery {
                as_of,
                snapshot,
                query: request.clone(),
                series: Vec::new(),
                home_series: Some(home.series),
                home_buckets: home.buckets,
                breakdown_input,
            });
        }
        let identities = load_identities(conn, &request.scope)?;
        let mut pending = Vec::new();
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
            pending.push(PendingSeries {
                id: row.id,
                kind: row.kind,
                component_path: row.component_path,
                recording_since,
                available_since: load_available_since(conn, row.id)?,
                raw_points: load_raw_count(conn, row.id, request.start, request.end)?,
            });
        }
        let estimates: Vec<SeriesEstimate> = pending
            .iter()
            .map(|row| SeriesEstimate {
                kind: row.kind,
                raw_points: row.raw_points,
            })
            .collect();
        let plan = if estimates.is_empty() {
            None
        } else {
            Some(align_response(&AlignInput {
                requested: request.resolution,
                start: request.start,
                end: request.end,
                max_points: request.max_points,
                periods: &periods,
                series: &estimates,
            })?)
        };
        let mut series = Vec::new();
        if let Some(plan) = plan {
            for row in pending {
                let (samples, observations) = load_points(
                    conn,
                    row.id,
                    row.kind,
                    request.metric,
                    plan.resolution,
                    request.start,
                    request.end,
                    plan.point_limit,
                )?;
                let mut quality = load_gaps(conn, row.id, request.start, request.end)?;
                let rejected =
                    load_rejected_intervals(conn, row.id, request.start, request.end)?;
                append_rejected_intervals(&mut quality, &rejected);
                if plan.resolution != QueryResolution::Raw {
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
                    resolution: plan.resolution,
                    source_resolution: plan.source_resolution,
                    provenance: series_provenance(request.metric, row.kind),
                    recording_since: row.recording_since,
                    available_since: row.available_since,
                    range: Span {
                        start: request.start,
                        end: request.end,
                    },
                    buckets: plan.buckets.clone(),
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
                    point_limit: plan.point_limit,
                    periods: periods.clone(),
                });
            }
        }
        Ok(LoadedQuery {
            as_of,
            snapshot,
            query: request.clone(),
            series,
            home_series: None,
            home_buckets: Vec::new(),
            breakdown_input: None,
        })
    })
}

struct PendingSeries {
    id: Uuid,
    kind: CapabilityKind,
    component_path: Vec<String>,
    recording_since: DateTime<Utc>,
    available_since: Option<DateTime<Utc>>,
    raw_points: u32,
}

#[derive(QueryableByName)]
struct SnapshotRow {
    #[diesel(sql_type = Text)]
    snapshot: String,
}

fn capture_snapshot(conn: &mut PgConnection) -> Result<String, diesel::result::Error> {
    diesel::sql_query(history_query_isolation_sql()).execute(conn)?;
    diesel::sql_query(history_query_timeout_sql()).execute(conn)?;
    let row = diesel::sql_query(history_snapshot_id_sql()).get_result::<SnapshotRow>(conn)?;
    Ok(row.snapshot)
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
struct ContributorIdentityRow {
    #[diesel(sql_type = SqlUuid)]
    id: Uuid,
    #[diesel(sql_type = Text)]
    kind: String,
    #[diesel(sql_type = Text)]
    protocol: String,
    #[diesel(sql_type = Text)]
    device_external_id: String,
    #[diesel(sql_type = Text)]
    physical_scope_kind: String,
    #[diesel(sql_type = Text)]
    physical_scope_component_id: String,
    #[diesel(sql_type = Text)]
    component_path: String,
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
        HistoryScope::Home => Ok(Vec::new()),
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

fn append_rejected_intervals(
    quality: &mut Vec<InputInterval>,
    rejected: &[(DateTime<Utc>, DateTime<Utc>)],
) {
    for (start, end) in rejected {
        if end <= start {
            continue;
        }
        let already = quality.iter().any(|interval| {
            interval.start == *start
                && interval.end == *end
                && matches!(
                    interval.kind,
                    IntervalKind::Rejected
                        | IntervalKind::Unavailable
                        | IntervalKind::Stale
                        | IntervalKind::Missing
                )
        });
        if already {
            continue;
        }
        quality.push(InputInterval {
            kind: IntervalKind::Rejected,
            start: *start,
            end: *end,
            reason: None,
        });
    }
}

fn load_rejected_intervals(
    conn: &mut PgConnection,
    capability_id: Uuid,
    start: DateTime<Utc>,
    end: DateTime<Utc>,
) -> Result<Vec<(DateTime<Utc>, DateTime<Utc>)>, diesel::result::Error> {
    let rows = diesel::sql_query(
        "SELECT started_at, ended_at
         FROM history_missing_intervals
         WHERE capability_id = $1 AND started_at < $3 AND ended_at > $2
         ORDER BY started_at",
    )
    .bind::<SqlUuid, _>(capability_id)
    .bind::<Timestamptz, _>(start)
    .bind::<Timestamptz, _>(end)
    .load::<RejectedIntervalRow>(conn)?;
    Ok(rows
        .into_iter()
        .map(|row| (row.started_at, row.ended_at))
        .collect())
}

#[derive(QueryableByName)]
struct RejectedIntervalRow {
    #[diesel(sql_type = Timestamptz)]
    started_at: DateTime<Utc>,
    #[diesel(sql_type = Timestamptz)]
    ended_at: DateTime<Utc>,
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
         WHERE (capability_id = $1 OR capability_id IS NULL) AND onset < $3 AND (until IS NULL OR until > $2)
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

struct MaterializedHistory {
    role: HistoryRole,
    query: HistoryQueryBody,
    as_of: DateTime<Utc>,
    snapshot: String,
    buckets: Vec<Span>,
    series: Vec<HistorySeries>,
    reasons: Vec<String>,
    health: Option<HistoryHealth>,
    breakdown: Option<ContributorBreakdown>,
}

#[derive(Debug)]
struct StoredCursor {
    seq: u64,
    role: HistoryRole,
    query: HistoryQueryBody,
    as_of: DateTime<Utc>,
    snapshot: String,
    buckets: Vec<Span>,
    reasons: Vec<String>,
    health: Option<HistoryHealth>,
    breakdown: Option<ContributorBreakdown>,
    pages: VecDeque<Vec<HistorySeries>>,
    created_at: DateTime<Utc>,
}

struct PreservedCursor {
    query: HistoryQueryBody,
    as_of: DateTime<Utc>,
    snapshot: String,
    buckets: Vec<Span>,
}

/// In-memory cursors. The token is random. The store keeps the query, asOf,
/// snapshot id, and only the scope pages that have not been returned.
#[derive(Debug, Default)]
pub struct HistoryCursorStore {
    cursors: HashMap<String, StoredCursor>,
    next_seq: u64,
}

impl HistoryCursorStore {
    fn open_page(
        &mut self,
        now: DateTime<Utc>,
        mut materialized: MaterializedHistory,
    ) -> HistoryQueryResponse {
        materialized
            .series
            .sort_by(|left, right| left.capability_id.cmp(&right.capability_id));
        let mut pages: VecDeque<Vec<HistorySeries>> = materialized
            .series
            .chunks(SERIES_PAGE_LIMIT)
            .map(|chunk| chunk.to_vec())
            .collect();
        let first = pages.pop_front().unwrap_or_default();
        let incomplete = !pages.is_empty();
        let next_cursor = if incomplete {
            self.next_seq = self.next_seq.saturating_add(1);
            let stored = StoredCursor {
                seq: self.next_seq,
                role: materialized.role,
                query: materialized.query,
                as_of: materialized.as_of,
                snapshot: materialized.snapshot,
                buckets: materialized.buckets,
                reasons: materialized.reasons.clone(),
                health: materialized.health.clone(),
                breakdown: materialized.breakdown.clone(),
                pages,
                created_at: now,
            };
            Some(self.insert(now, stored))
        } else {
            None
        };
        HistoryQueryResponse {
            as_of: materialized.as_of,
            series: first,
            reasons: materialized.reasons,
            health: materialized.health,
            incomplete,
            next_cursor,
            breakdown: materialized.breakdown,
        }
    }

    fn continue_page(
        &mut self,
        now: DateTime<Utc>,
        cursor: &str,
        role: HistoryRole,
    ) -> HistoryQueryOutcome {
        let Some(entry) = self.cursors.get(cursor) else {
            return HistoryQueryOutcome::Restart(HistoryQueryRestart {
                reason: RestartReason::CursorUnknown,
            });
        };
        if role != entry.role {
            return HistoryQueryOutcome::Restart(HistoryQueryRestart {
                reason: RestartReason::CursorUnknown,
            });
        }
        if cursor_expired(entry.created_at, now) {
            self.cursors.remove(cursor);
            return HistoryQueryOutcome::Restart(HistoryQueryRestart {
                reason: RestartReason::CursorExpired,
            });
        }
        let entry = self
            .cursors
            .get_mut(cursor)
            .expect("cursor remains until it expires");
        let series = entry.pages.pop_front().unwrap_or_default();
        let incomplete = !entry.pages.is_empty();
        let response = HistoryQueryResponse {
            as_of: entry.as_of,
            series,
            reasons: entry.reasons.clone(),
            health: entry.health.clone(),
            incomplete,
            next_cursor: incomplete.then(|| cursor.to_string()),
            breakdown: entry.breakdown.clone(),
        };
        if !incomplete {
            self.cursors.remove(cursor);
        }
        HistoryQueryOutcome::Page(response)
    }

    fn preserved(&self, cursor: &str) -> Option<PreservedCursor> {
        self.cursors.get(cursor).map(|cursor| PreservedCursor {
            query: cursor.query.clone(),
            as_of: cursor.as_of,
            snapshot: cursor.snapshot.clone(),
            buckets: cursor.buckets.clone(),
        })
    }

    fn retained_capability_ids(&self, cursor: &str) -> Option<Vec<Uuid>> {
        self.cursors.get(cursor).map(|cursor| {
            cursor
                .pages
                .iter()
                .flat_map(|page| page.iter().map(|series| series.capability_id))
                .collect()
        })
    }

    fn live_count(&self) -> usize {
        self.cursors.len()
    }

    fn insert(&mut self, now: DateTime<Utc>, cursor: StoredCursor) -> String {
        self.evict(now);
        let token = format!("hqc_{}", Uuid::new_v4().simple());
        self.cursors.insert(token.clone(), cursor);
        token
    }

    fn evict(&mut self, now: DateTime<Utc>) {
        let expired: Vec<String> = self
            .cursors
            .iter()
            .filter(|(_, cursor)| cursor_expired(cursor.created_at, now))
            .map(|(id, _)| id.clone())
            .collect();
        for id in expired {
            self.cursors.remove(&id);
        }
        while self.cursors.len() >= MAX_LIVE_HISTORY_CURSORS {
            let oldest = self
                .cursors
                .iter()
                .min_by_key(|(_, cursor)| cursor.seq)
                .map(|(id, _)| id.clone());
            let Some(oldest) = oldest else {
                break;
            };
            self.cursors.remove(&oldest);
        }
    }
}

fn cursor_expired(created_at: DateTime<Utc>, now: DateTime<Utc>) -> bool {
    now.signed_duration_since(created_at).num_seconds() >= HISTORY_CURSOR_TTL_SECONDS
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
        ABSOLUTE_POINT_CAP, AlignInput, AssembleInput, CapabilityKind, CapabilityRef,
        HISTORY_QUERY_CONCURRENCY, HISTORY_QUERY_POOL_SIZE, HistoryCursorStore, HistoryInterval,
        HistoryMetric, HistoryPoint, HistoryQueryBody, HistoryQueryOutcome, HistoryQueryRequest,
        HistoryQueryResponse, HistoryRole, HistoryScope, HistorySeries, IntervalKind,
        MAX_LIVE_HISTORY_CURSORS, MaterializedHistory, ObservationSample, Provenance,
        QueryResolution, ResolutionInput, RestartReason, RollupSample, SERIES_PAGE_LIMIT,
        SeriesEstimate, Span, StoredEnergy, align_response, authorize_history_read, buckets_for,
        capability_in_scope, effective_point_limit, history_query_isolation_sql,
        history_query_timeout_sql, history_snapshot_id_sql, read_stored_energy, select_resolution,
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
    fn live_query_reports_persisted_rejected_intervals_without_duplicating_synthesized_gaps() {
        let migration = include_str!(
            "../../migrations/2026-10-19-000010-0000_history_missing_intervals/up.sql"
        );
        assert!(migration.contains("CREATE TABLE history_missing_intervals"));
        assert!(migration.contains("PRIMARY KEY (capability_id, started_at, ended_at)"));
        assert!(migration.contains("REFERENCES capability_identities"));
        assert!(!migration.to_lowercase().contains("jsonb"));
        assert!(!migration.to_lowercase().contains("kind"));
        let schema = include_str!("../db/schema.rs");
        assert!(schema.contains("history_missing_intervals ("));
        assert!(schema.contains("history_missing_intervals -> capability_identities (capability_id)"));
        assert!(schema.contains("history_missing_intervals,"));

        let start = utc(2026, 1, 1, 0, 0, 0);
        let mut input = empty_input();
        input.quality = vec![
            super::InputInterval {
                kind: IntervalKind::Stale,
                start,
                end: start + Duration::hours(1),
                reason: None,
            },
            super::InputInterval {
                kind: IntervalKind::Unavailable,
                start: start + Duration::hours(1),
                end: start + Duration::hours(2),
                reason: None,
            },
            super::InputInterval {
                kind: IntervalKind::Missing,
                start: start + Duration::hours(2),
                end: start + Duration::hours(3),
                reason: None,
            },
        ];
        let rejected = (
            start + Duration::minutes(30),
            start + Duration::minutes(30) + Duration::microseconds(1),
        );
        super::append_rejected_intervals(&mut input.quality, &[rejected]);
        super::append_rejected_intervals(&mut input.quality, &[rejected]);
        let series = super::assemble_series(input).unwrap();
        assert_eq!(
            series
                .missing
                .iter()
                .filter(|interval| interval.kind == IntervalKind::Rejected)
                .count(),
            1
        );
        assert_eq!(
            series
                .missing
                .iter()
                .filter(|interval| interval.kind == IntervalKind::Stale)
                .count(),
            1
        );
        assert_eq!(
            series
                .missing
                .iter()
                .filter(|interval| interval.kind == IntervalKind::Unavailable)
                .count(),
            1
        );
        assert_eq!(
            series
                .missing
                .iter()
                .filter(|interval| interval.kind == IntervalKind::Missing)
                .count(),
            1
        );
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
            incomplete: false,
            next_cursor: None,
            breakdown: None,
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
            incomplete: false,
            next_cursor: None,
            breakdown: None,
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
        let capability = serde_json::from_value::<HistoryQueryRequest>(serde_json::json!({
            "scope": { "type": "capability", "capabilityId": "00000000-0000-0000-0000-000000000001" },
            "metric": "importedEnergy",
            "start": "2026-10-01T00:00:00Z",
            "end": "2026-10-02T00:00:00Z",
            "resolution": "fifteen_minute",
            "freshnessLimitMs": 60000,
            "maxPoints": 1000
        }))
        .unwrap();
        let HistoryQueryRequest::Query(capability) = capability else {
            panic!("fresh query");
        };
        assert!(matches!(capability.scope, HistoryScope::Capability { .. }));
        assert_eq!(capability.metric, HistoryMetric::ImportedEnergy);
        assert_eq!(capability.resolution, QueryResolution::FifteenMinute);

        let device = serde_json::from_value::<HistoryQueryRequest>(serde_json::json!({
            "scope": { "type": "device", "deviceId": "00000000-0000-0000-0000-000000000002" },
            "metric": "power",
            "start": "2026-10-01T00:00:00Z",
            "end": "2026-10-01T01:00:00Z",
            "resolution": "hourly",
            "freshnessLimitMs": 1000,
            "maxPoints": 24
        }))
        .unwrap();
        let HistoryQueryRequest::Query(device) = device else {
            panic!("device query");
        };
        assert!(matches!(device.scope, HistoryScope::Device { .. }));

        let component = serde_json::from_value::<HistoryQueryRequest>(serde_json::json!({
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
        let HistoryQueryRequest::Query(component) = component else {
            panic!("component query");
        };
        assert!(matches!(component.scope, HistoryScope::Component { .. }));

        let home = serde_json::from_value::<HistoryQueryRequest>(serde_json::json!({
            "scope": { "type": "home" },
            "metric": "power",
            "start": "2026-10-01T00:00:00Z",
            "end": "2026-10-01T01:00:00Z",
            "resolution": "hourly",
            "freshnessLimitMs": 1000,
            "maxPoints": 24
        }))
        .unwrap();
        let HistoryQueryRequest::Query(home) = home else {
            panic!("home query");
        };
        assert!(matches!(home.scope, HistoryScope::Home));
        assert!(!home.breakdown);

        let flagged = serde_json::from_value::<HistoryQueryRequest>(serde_json::json!({
            "scope": { "type": "home" },
            "metric": "importedEnergy",
            "start": "2026-10-01T00:00:00Z",
            "end": "2026-10-01T01:00:00Z",
            "resolution": "hourly",
            "freshnessLimitMs": 1000,
            "maxPoints": 24,
            "breakdown": true
        }))
        .unwrap();
        let HistoryQueryRequest::Query(flagged) = flagged else {
            panic!("home breakdown query");
        };
        assert!(flagged.breakdown);
        assert!(matches!(flagged.scope, HistoryScope::Home));
    }

    #[test]
    fn home_queries_stop_at_designation_boundaries_and_leave_earlier_history_alone() {
        let start = utc(2026, 1, 1, 0, 0, 0);
        let hour = |hour| utc(2026, 1, 1, hour, 0, 0);
        let boundary = utc(2026, 1, 1, 2, 30, 0);
        let end = hour(4);
        let capability_a = Uuid::from_u128(1);
        let capability_b = Uuid::from_u128(2);
        let buckets = [0, 1, 2, 3]
            .into_iter()
            .map(|hour_index| Span {
                start: hour(hour_index),
                end: hour(hour_index + 1),
            })
            .collect::<Vec<_>>();
        let periods = vec![
            super::HomePeriodSlice {
                capability_id: capability_a,
                effective_from: hour(1),
                effective_until: Some(boundary),
                provenance: Provenance::Measured,
                label: format!("importedEnergy {capability_a}"),
                meter_epoch_boundaries: Vec::new(),
            },
            super::HomePeriodSlice {
                capability_id: capability_b,
                effective_from: boundary,
                effective_until: Some(end),
                provenance: Provenance::Measured,
                label: format!("importedEnergy {capability_b}"),
                meter_epoch_boundaries: Vec::new(),
            },
        ];
        let samples = vec![
            home_sample(capability_a, start, hour(1), 5, true),
            home_sample(capability_a, hour(1), hour(2), 10, true),
            home_sample(capability_a, hour(2), hour(3), 60, true),
            home_sample(capability_b, hour(2), hour(3), 40, true),
            home_sample(capability_b, hour(3), end, 8, true),
        ];
        let series = super::assemble_home_history(&super::HomeAssembly {
            metric: HistoryMetric::ImportedEnergy,
            range: Span { start, end },
            resolution: QueryResolution::Hourly,
            source_resolution: QueryResolution::Hourly,
            buckets: &buckets,
            recording_since: hour(1),
            periods: &periods,
            boundary_periods: &periods,
            samples: &samples,
            quality: &[],
            reveal_gap_reasons: false,
        });
        assert_eq!(series.len(), 2);
        assert!(series.iter().all(|row| row.recording_since == hour(1)));
        assert!(series.iter().all(|row| {
            row.designation_boundaries.contains(&hour(1))
                && row.designation_boundaries.contains(&boundary)
        }));
        let values = series
            .iter()
            .flat_map(|row| row.points.iter().map(|point| point.value))
            .collect::<Vec<_>>();
        assert_eq!(values, vec![10, 30, 20, 8]);
        assert!(!values.contains(&5));
        assert!(!values.contains(&0));
        assert!(!values.contains(&60));
        assert!(!values.contains(&100));
        let partial = series
            .iter()
            .flat_map(|row| row.points.iter())
            .filter(|point| point.partial)
            .map(|point| point.value)
            .collect::<Vec<_>>();
        assert_eq!(partial, vec![30, 20]);
        assert!(series.iter().any(|row| {
            row.missing.iter().any(|interval| {
                interval.kind == IntervalKind::Missing
                    && interval.start == start
                    && interval.end == hour(1)
            })
        }));

        let mut device = empty_input();
        device.recording_since = utc(2020, 1, 1, 0, 0, 0);
        device.range = Span {
            start,
            end: hour(1),
        };
        device.buckets = vec![Span {
            start,
            end: hour(1),
        }];
        device.samples = vec![sample(start, 5, 1, true)];
        let device_series = super::assemble_series(device).unwrap();
        assert_eq!(device_series.points[0].value, 5);
        assert!(device_series.designation_boundaries.is_empty());
        assert_eq!(device_series.recording_since, utc(2020, 1, 1, 0, 0, 0));
    }

    #[test]
    fn partial_power_buckets_do_not_add_both_sides_of_a_boundary() {
        let hour = |hour| utc(2026, 1, 1, hour, 0, 0);
        let boundary = utc(2026, 1, 1, 2, 30, 0);
        let capability_a = Uuid::from_u128(11);
        let capability_b = Uuid::from_u128(12);
        let periods = vec![
            super::HomePeriodSlice {
                capability_id: capability_a,
                effective_from: hour(2),
                effective_until: Some(boundary),
                provenance: Provenance::Measured,
                label: format!("power {capability_a}"),
                meter_epoch_boundaries: Vec::new(),
            },
            super::HomePeriodSlice {
                capability_id: capability_b,
                effective_from: boundary,
                effective_until: Some(hour(3)),
                provenance: Provenance::Measured,
                label: format!("power {capability_b}"),
                meter_epoch_boundaries: Vec::new(),
            },
        ];
        let buckets = vec![Span {
            start: hour(2),
            end: hour(3),
        }];
        let samples = vec![
            home_sample(capability_a, hour(2), hour(3), 100, false),
            home_sample(capability_b, hour(2), hour(3), 40, false),
        ];
        let series = super::assemble_home_history(&super::HomeAssembly {
            metric: HistoryMetric::Power,
            range: Span {
                start: hour(2),
                end: hour(3),
            },
            resolution: QueryResolution::Hourly,
            source_resolution: QueryResolution::Hourly,
            buckets: &buckets,
            recording_since: hour(2),
            periods: &periods,
            boundary_periods: &periods,
            samples: &samples,
            quality: &[],
            reveal_gap_reasons: false,
        });
        let values = series
            .iter()
            .flat_map(|row| row.points.iter().map(|point| (point.value, point.partial)))
            .collect::<Vec<_>>();
        assert_eq!(values, vec![(100, true), (40, true)]);
        assert!(!values.iter().any(|(value, _)| *value == 140));
    }

    fn home_sample(
        capability_id: Uuid,
        start: chrono::DateTime<Utc>,
        end: chrono::DateTime<Utc>,
        value: i64,
        sum_values: bool,
    ) -> super::HomeObservation {
        super::HomeObservation {
            capability_id,
            start,
            end,
            value,
            scale: 0,
            covered_ns: 1,
            elapsed_ns: 1,
            provenance: if sum_values {
                Provenance::Estimated
            } else {
                Provenance::Measured
            },
            sum_values,
        }
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

    fn sample_query() -> HistoryQueryBody {
        HistoryQueryBody {
            scope: HistoryScope::Device {
                device_id: Uuid::from_u128(9),
            },
            metric: HistoryMetric::Power,
            start: utc(2026, 1, 1, 0, 0, 0),
            end: utc(2026, 1, 2, 0, 0, 0),
            resolution: QueryResolution::Hourly,
            freshness_limit_ms: 60_000,
            max_points: 1_000,
            breakdown: false,
        }
    }

    fn series_on_buckets(id: u128, buckets: &[Span], value: i64) -> HistorySeries {
        HistorySeries {
            capability_id: Uuid::from_u128(id),
            label: format!("power {id}"),
            resolution: QueryResolution::Hourly,
            source_resolution: QueryResolution::Hourly,
            provenance: Provenance::Measured,
            coverage: super::Coverage {
                covered_ns: 1,
                elapsed_ns: 1,
            },
            recording_since: utc(2020, 1, 1, 0, 0, 0),
            available_since: Some(utc(2024, 6, 1, 0, 0, 0)),
            meter_epoch_boundaries: Vec::new(),
            designation_boundaries: Vec::new(),
            gaps: Vec::new(),
            missing: Vec::new(),
            points: buckets
                .iter()
                .map(|bucket| HistoryPoint {
                    start: bucket.start,
                    end: bucket.end,
                    value,
                    scale: 0,
                    provenance: Provenance::Measured,
                    coverage: super::Coverage {
                        covered_ns: 1,
                        elapsed_ns: 1,
                    },
                    partial: false,
                })
                .collect(),
        }
    }

    fn materialized(
        as_of: chrono::DateTime<Utc>,
        snapshot: &str,
        buckets: Vec<Span>,
        series: Vec<HistorySeries>,
    ) -> MaterializedHistory {
        MaterializedHistory {
            role: HistoryRole::Owner,
            query: sample_query(),
            as_of,
            snapshot: snapshot.to_string(),
            buckets,
            series,
            reasons: vec!["gap".into()],
            health: Some(degraded_health()),
            breakdown: None,
        }
    }

    #[test]
    fn aligned_plan_is_chosen_once_and_monthly_names_its_daily_source() {
        let periods = [TimezonePeriod {
            timezone: "America/Los_Angeles".into(),
            effective_from: utc(2019, 1, 1, 0, 0, 0),
            effective_until: None,
        }];
        let start = utc(2020, 1, 1, 8, 0, 0);
        let end = utc(2024, 1, 1, 8, 0, 0);
        let plan = align_response(&AlignInput {
            requested: QueryResolution::Daily,
            start,
            end,
            max_points: 1_000,
            periods: &periods,
            series: &[SeriesEstimate {
                kind: CapabilityKind::ImportedEnergy,
                raw_points: 0,
            }],
        })
        .unwrap();
        assert_eq!(plan.resolution, QueryResolution::Monthly);
        assert_eq!(plan.source_resolution, QueryResolution::Daily);
        assert!(plan.buckets.len() > 12);
        assert!(plan.buckets.len() <= ABSOLUTE_POINT_CAP as usize);
        assert_eq!(plan.buckets[0].start, utc(2020, 1, 1, 8, 0, 0));
        assert_eq!(plan.buckets[0].end, utc(2020, 2, 1, 8, 0, 0));
        assert_eq!(
            history_query_isolation_sql(),
            "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ"
        );
        assert_eq!(
            history_snapshot_id_sql(),
            "SELECT pg_current_snapshot()::text AS snapshot"
        );
    }

    #[test]
    fn mixed_series_share_one_bucket_set() {
        let start = utc(2026, 1, 1, 0, 0, 0);
        let end = utc(2026, 1, 9, 0, 0, 0);
        let plan = align_response(&AlignInput {
            requested: QueryResolution::OneMinute,
            start,
            end,
            max_points: 1_000,
            periods: &[],
            series: &[
                SeriesEstimate {
                    kind: CapabilityKind::Power,
                    raw_points: 0,
                },
                SeriesEstimate {
                    kind: CapabilityKind::Voltage,
                    raw_points: 0,
                },
            ],
        })
        .unwrap();
        assert_eq!(plan.resolution, QueryResolution::Hourly);
        assert_eq!(plan.buckets.len(), 8 * 24);
        let again = align_response(&AlignInput {
            requested: QueryResolution::OneMinute,
            start,
            end,
            max_points: 1_000,
            periods: &[],
            series: &[
                SeriesEstimate {
                    kind: CapabilityKind::Power,
                    raw_points: 0,
                },
                SeriesEstimate {
                    kind: CapabilityKind::Voltage,
                    raw_points: 0,
                },
            ],
        })
        .unwrap();
        assert_eq!(plan.buckets, again.buckets);
    }

    #[test]
    fn later_pages_reuse_as_of_buckets_and_snapshot_without_recomputing() {
        let as_of = utc(2026, 6, 1, 12, 0, 0);
        let start = utc(2026, 1, 1, 0, 0, 0);
        let buckets = buckets_for(
            QueryResolution::Hourly,
            start,
            start + Duration::hours(3),
            &[],
        )
        .unwrap();
        let snapshot = "10:20:10";
        let series = (1..=21)
            .map(|id| series_on_buckets(id, &buckets, 40 + i64::try_from(id).unwrap()))
            .collect();
        let mut store = HistoryCursorStore::default();
        let first = store.open_page(
            as_of,
            materialized(as_of, snapshot, buckets.clone(), series),
        );
        assert!(first.incomplete);
        assert_eq!(first.series.len(), SERIES_PAGE_LIMIT);
        assert!(first.series.iter().all(|series| series.points.len() == 3));
        let cursor = first.next_cursor.clone().expect("next page");
        assert!(!cursor.contains(snapshot));
        assert!(!cursor.contains("2026-"));
        assert!(!cursor.contains("power"));
        let preserved = store.preserved(&cursor).expect("cursor");
        assert_eq!(preserved.as_of, as_of);
        assert_eq!(preserved.snapshot, snapshot);
        assert_eq!(preserved.query, sample_query());
        assert_eq!(preserved.buckets, buckets);
        assert_eq!(store.retained_capability_ids(&cursor).unwrap().len(), 1);
        assert!(
            !store
                .retained_capability_ids(&cursor)
                .unwrap()
                .contains(&Uuid::from_u128(1))
        );

        let second =
            match store.continue_page(as_of + Duration::minutes(1), &cursor, HistoryRole::Owner) {
                HistoryQueryOutcome::Page(page) => page,
                HistoryQueryOutcome::Restart(_) => panic!("cursor was recomputed or dropped"),
            };
        assert_eq!(second.as_of, as_of);
        assert!(!second.incomplete);
        assert!(second.next_cursor.is_none());
        assert_eq!(second.series.len(), 1);
        assert_eq!(second.series[0].points.len(), buckets.len());
        assert_eq!(second.series[0].points[0].start, buckets[0].start);
        assert_eq!(second.series[0].points[0].end, buckets[0].end);
        assert_eq!(second.series[0].points[0].value, 61);
        assert_eq!(
            first.series[0].points[0].start,
            second.series[0].points[0].start
        );
        assert!(store.preserved(&cursor).is_none());
    }

    #[test]
    fn pages_do_not_split_a_series_and_mark_partial_pages_incomplete() {
        let as_of = utc(2026, 6, 1, 0, 0, 0);
        let start = utc(2026, 1, 1, 0, 0, 0);
        let buckets = vec![
            Span {
                start,
                end: start + Duration::hours(1),
            },
            Span {
                start: start + Duration::hours(1),
                end: start + Duration::hours(2),
            },
            Span {
                start: start + Duration::hours(2),
                end: start + Duration::hours(3),
            },
        ];
        let series = (1..=41)
            .map(|id| series_on_buckets(id, &buckets, i64::try_from(id).unwrap()))
            .collect();
        let mut store = HistoryCursorStore::default();
        let first = store.open_page(
            as_of,
            materialized(as_of, "snap-a", buckets.clone(), series),
        );
        let cursor = first.next_cursor.clone().unwrap();
        let second = match store.continue_page(as_of, &cursor, HistoryRole::Owner) {
            HistoryQueryOutcome::Page(page) => page,
            HistoryQueryOutcome::Restart(_) => panic!("missing second page"),
        };
        let third = match store.continue_page(
            as_of,
            second.next_cursor.as_deref().unwrap(),
            HistoryRole::Owner,
        ) {
            HistoryQueryOutcome::Page(page) => page,
            HistoryQueryOutcome::Restart(_) => panic!("missing third page"),
        };
        assert!(first.incomplete && second.incomplete);
        assert!(!third.incomplete);
        assert_eq!(first.series.len(), 20);
        assert_eq!(second.series.len(), 20);
        assert_eq!(third.series.len(), 1);
        let mut seen = std::collections::BTreeSet::new();
        for page in [&first, &second, &third] {
            for series in &page.series {
                assert_eq!(series.points.len(), 3);
                assert!(seen.insert(series.capability_id));
            }
        }
        assert_eq!(seen.len(), 41);
        let json = serde_json::to_value(&first).unwrap();
        assert_eq!(json["incomplete"], true);
        assert!(json.get("nextCursor").is_some());
        assert!(json.get("snapshot").is_none());
    }

    #[test]
    fn expired_or_unknown_cursors_restart_and_live_cursors_are_bounded() {
        let as_of = utc(2026, 6, 1, 0, 0, 0);
        let buckets = vec![Span {
            start: utc(2026, 1, 1, 0, 0, 0),
            end: utc(2026, 1, 1, 1, 0, 0),
        }];
        let mut store = HistoryCursorStore::default();
        let expired = store.open_page(
            as_of,
            materialized(
                as_of,
                "snap-old",
                buckets.clone(),
                (1..=21)
                    .map(|id| series_on_buckets(id, &buckets, 1))
                    .collect(),
            ),
        );
        let expired_cursor = expired.next_cursor.unwrap();
        match store.continue_page(
            as_of + Duration::minutes(5) + Duration::seconds(1),
            &expired_cursor,
            HistoryRole::Owner,
        ) {
            HistoryQueryOutcome::Restart(restart) => {
                assert_eq!(restart.reason, RestartReason::CursorExpired);
                let json = serde_json::to_value(HistoryQueryOutcome::Restart(restart)).unwrap();
                assert_eq!(json["type"], "historyQueryRestart");
                assert_eq!(json["reason"], "cursor_expired");
                assert!(json.get("series").is_none());
            }
            HistoryQueryOutcome::Page(_) => panic!("expired cursor recomputed a page"),
        }

        match store.continue_page(as_of, "missing-cursor", HistoryRole::Owner) {
            HistoryQueryOutcome::Restart(restart) => {
                assert_eq!(restart.reason, RestartReason::CursorUnknown);
            }
            HistoryQueryOutcome::Page(_) => panic!("unknown cursor recomputed a page"),
        }

        let mut first_cursor = None;
        for index in 0..MAX_LIVE_HISTORY_CURSORS + 1 {
            let page = store.open_page(
                as_of + Duration::seconds(index as i64),
                materialized(
                    as_of,
                    "snap-live",
                    buckets.clone(),
                    (1..=21)
                        .map(|id| series_on_buckets(id, &buckets, i64::try_from(index).unwrap()))
                        .collect(),
                ),
            );
            if index == 0 {
                first_cursor = page.next_cursor;
            }
        }
        assert!(store.live_count() <= MAX_LIVE_HISTORY_CURSORS);
        match store.continue_page(as_of, first_cursor.unwrap().as_str(), HistoryRole::Owner) {
            HistoryQueryOutcome::Restart(restart) => {
                assert_eq!(restart.reason, RestartReason::CursorUnknown);
            }
            HistoryQueryOutcome::Page(_) => panic!("evicted cursor recomputed a page"),
        }
    }

    #[test]
    fn cursor_continuation_does_not_require_a_second_query_shape() {
        let continued = serde_json::from_value::<HistoryQueryRequest>(serde_json::json!({
            "cursor": "hqc_example"
        }))
        .unwrap();
        assert!(matches!(
            continued,
            HistoryQueryRequest::Continuation { cursor } if cursor == "hqc_example"
        ));
        let ignored = serde_json::from_value::<HistoryQueryRequest>(serde_json::json!({
            "cursor": "hqc_example",
            "scope": { "type": "device", "deviceId": "00000000-0000-0000-0000-000000000009" },
            "metric": "power",
            "start": "2026-10-01T00:00:00Z",
            "end": "2026-10-02T00:00:00Z",
            "resolution": "hourly",
            "freshnessLimitMs": 1000,
            "maxPoints": 24
        }))
        .unwrap();
        assert!(matches!(ignored, HistoryQueryRequest::Continuation { .. }));
    }
}
