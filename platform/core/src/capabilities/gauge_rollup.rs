//! Power and Gauge rollups from valid observations.
//!
//! Readable History stays on the Controller. These tables are not written to Convex.

use std::cmp::Ordering;

use chrono::{DateTime, Duration, Utc};
use diesel::prelude::*;
use diesel::upsert::excluded;
use thiserror::Error;
use uuid::Uuid;

use crate::db::schema::{gauge_rollups, power_rollups};

/// Closed UTC interval. Buckets use a positive duration. Breaks may be a single instant.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ClosedInterval {
    pub start: DateTime<Utc>,
    pub end: DateTime<Utc>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct GaugeObservation {
    pub observed_at: DateTime<Utc>,
    pub value: i64,
    pub scale: u8,
}

/// Caller-supplied observations, break intervals, freshness, and UTC buckets.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RollupInput {
    pub observations: Vec<GaugeObservation>,
    pub breaks: Vec<ClosedInterval>,
    pub freshness: Duration,
    pub buckets: Vec<ClosedInterval>,
}

/// Union of valid trapezoid time divided by the bucket's actual elapsed duration.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Coverage {
    pub covered_ns: i64,
    pub elapsed_ns: i64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PowerRollup {
    pub bucket: ClosedInterval,
    pub scale: u8,
    pub mean: Option<i64>,
    pub observed_min: Option<i64>,
    pub observed_max: Option<i64>,
    pub estimated_import: i64,
    pub estimated_export: i64,
    pub coverage: Coverage,
    pub gap_ns: i64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GaugeRollup {
    pub bucket: ClosedInterval,
    pub scale: u8,
    pub mean: Option<i64>,
    pub observed_min: Option<i64>,
    pub observed_max: Option<i64>,
    pub coverage: Coverage,
}

#[derive(Debug, Error, Clone, PartialEq, Eq)]
pub enum RollupError {
    #[error("rollup interval is empty or reversed")]
    InvalidInterval,
    #[error("fixed-point scale must be 0..=9")]
    InvalidScale(u8),
    #[error("freshness must be positive")]
    InvalidFreshness,
    #[error("rollup arithmetic overflowed")]
    Overflow,
}

/// Voltage or current. Power lives in `power_rollups` and has no gauge kind.
#[allow(dead_code)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GaugeKind {
    Voltage,
    Current,
}

impl GaugeKind {
    fn as_str(self) -> &'static str {
        match self {
            Self::Voltage => "voltage",
            Self::Current => "current",
        }
    }
}

const NS_PER_HOUR: i128 = 3_600_000_000_000;

pub fn rollup_power(input: &RollupInput) -> Result<Vec<PowerRollup>, RollupError> {
    let summaries = summarize(input, true)?;
    Ok(summaries
        .into_iter()
        .map(|summary| PowerRollup {
            bucket: summary.bucket,
            scale: summary.scale,
            mean: summary.mean,
            observed_min: summary.observed_min,
            observed_max: summary.observed_max,
            estimated_import: summary.estimated_import,
            estimated_export: summary.estimated_export,
            coverage: summary.coverage,
            gap_ns: summary.gap_ns,
        })
        .collect())
}

pub fn rollup_gauge(input: &RollupInput) -> Result<Vec<GaugeRollup>, RollupError> {
    let summaries = summarize(input, false)?;
    Ok(summaries
        .into_iter()
        .map(|summary| GaugeRollup {
            bucket: summary.bucket,
            scale: summary.scale,
            mean: summary.mean,
            observed_min: summary.observed_min,
            observed_max: summary.observed_max,
            coverage: summary.coverage,
        })
        .collect())
}

/// Idempotent upsert by Capability and bucket start. Later rows in `rollups` win.
#[allow(dead_code)]
pub fn upsert_power_rollups(
    conn: &mut PgConnection,
    capability_id: Uuid,
    rollups: &[PowerRollup],
) -> Result<usize, diesel::result::Error> {
    let rows = dedup_power(capability_id, rollups);
    if rows.is_empty() {
        return Ok(0);
    }
    diesel::insert_into(power_rollups::table)
        .values(&rows)
        .on_conflict((power_rollups::capability_id, power_rollups::bucket_start))
        .do_update()
        .set((
            power_rollups::bucket_end.eq(excluded(power_rollups::bucket_end)),
            power_rollups::scale.eq(excluded(power_rollups::scale)),
            power_rollups::mean_value.eq(excluded(power_rollups::mean_value)),
            power_rollups::observed_min.eq(excluded(power_rollups::observed_min)),
            power_rollups::observed_max.eq(excluded(power_rollups::observed_max)),
            power_rollups::estimated_import.eq(excluded(power_rollups::estimated_import)),
            power_rollups::estimated_export.eq(excluded(power_rollups::estimated_export)),
            power_rollups::coverage_ns.eq(excluded(power_rollups::coverage_ns)),
            power_rollups::gap_ns.eq(excluded(power_rollups::gap_ns)),
        ))
        .execute(conn)
}

/// Idempotent upsert by Capability and bucket start. Later rows in `rollups` win.
#[allow(dead_code)]
pub fn upsert_gauge_rollups(
    conn: &mut PgConnection,
    capability_id: Uuid,
    kind: GaugeKind,
    rollups: &[GaugeRollup],
) -> Result<usize, diesel::result::Error> {
    let rows = dedup_gauge(capability_id, kind, rollups);
    if rows.is_empty() {
        return Ok(0);
    }
    diesel::insert_into(gauge_rollups::table)
        .values(&rows)
        .on_conflict((gauge_rollups::capability_id, gauge_rollups::bucket_start))
        .do_update()
        .set((
            gauge_rollups::gauge_kind.eq(excluded(gauge_rollups::gauge_kind)),
            gauge_rollups::bucket_end.eq(excluded(gauge_rollups::bucket_end)),
            gauge_rollups::scale.eq(excluded(gauge_rollups::scale)),
            gauge_rollups::mean_value.eq(excluded(gauge_rollups::mean_value)),
            gauge_rollups::observed_min.eq(excluded(gauge_rollups::observed_min)),
            gauge_rollups::observed_max.eq(excluded(gauge_rollups::observed_max)),
            gauge_rollups::coverage_ns.eq(excluded(gauge_rollups::coverage_ns)),
        ))
        .execute(conn)
}

#[derive(Debug, Clone, Copy)]
struct Ratio {
    num: i128,
    den: i128,
}

struct Sample {
    t: i128,
    value: i64,
    scale: u8,
}

struct Segment {
    start: i128,
    end: i128,
    p0: i64,
    scale0: u8,
    p1: i64,
    scale1: u8,
}

struct Prepared {
    samples: Vec<Sample>,
    segments: Vec<Segment>,
    breaks: Vec<(i128, i128)>,
    freshness_gaps: Vec<(i128, i128)>,
    buckets: Vec<ClosedInterval>,
    bucket_ns: Vec<(i128, i128)>,
}

struct BucketCalc {
    start: i128,
    end: i128,
    scale: u8,
    import: i64,
    export: i64,
    area_ns: i128,
    covered: Vec<(i128, i128)>,
    observed_min: Option<i128>,
    observed_max: Option<i128>,
}

struct Summary {
    bucket: ClosedInterval,
    scale: u8,
    mean: Option<i64>,
    observed_min: Option<i64>,
    observed_max: Option<i64>,
    estimated_import: i64,
    estimated_export: i64,
    coverage: Coverage,
    gap_ns: i64,
}

#[derive(Insertable)]
#[diesel(table_name = power_rollups)]
struct NewPowerRollup {
    capability_id: Uuid,
    bucket_start: DateTime<Utc>,
    bucket_end: DateTime<Utc>,
    scale: i16,
    mean_value: Option<i64>,
    observed_min: Option<i64>,
    observed_max: Option<i64>,
    estimated_import: i64,
    estimated_export: i64,
    coverage_ns: i64,
    gap_ns: i64,
}

#[derive(Insertable)]
#[diesel(table_name = gauge_rollups)]
struct NewGaugeRollup {
    capability_id: Uuid,
    gauge_kind: &'static str,
    bucket_start: DateTime<Utc>,
    bucket_end: DateTime<Utc>,
    scale: i16,
    mean_value: Option<i64>,
    observed_min: Option<i64>,
    observed_max: Option<i64>,
    coverage_ns: i64,
}

fn validate(input: &RollupInput) -> Result<(), RollupError> {
    if input.freshness.num_nanoseconds().unwrap_or(0) <= 0 {
        return Err(RollupError::InvalidFreshness);
    }
    for interval in input.breaks.iter().chain(input.buckets.iter()) {
        if interval.end < interval.start {
            return Err(RollupError::InvalidInterval);
        }
    }
    for bucket in &input.buckets {
        if bucket.end <= bucket.start {
            return Err(RollupError::InvalidInterval);
        }
    }
    for observation in &input.observations {
        if observation.scale > 9 {
            return Err(RollupError::InvalidScale(observation.scale));
        }
    }
    Ok(())
}

fn summarize(input: &RollupInput, integrate_energy: bool) -> Result<Vec<Summary>, RollupError> {
    validate(input)?;
    let prepared = prepare(input)?;
    let mut buckets: Vec<BucketCalc> = prepared
        .bucket_ns
        .iter()
        .map(|(start, end)| BucketCalc {
            start: *start,
            end: *end,
            scale: 0,
            import: 0,
            export: 0,
            area_ns: 0,
            covered: Vec::new(),
            observed_min: None,
            observed_max: None,
        })
        .collect();
    assign_scales(&prepared, &mut buckets)?;
    if integrate_energy {
        for segment in &prepared.segments {
            distribute_energy(segment, &mut buckets)?;
        }
    }
    for segment in &prepared.segments {
        accumulate_segment(segment, &mut buckets)?;
    }
    accumulate_extrema(&prepared, &mut buckets)?;
    let gap_sources = prepared
        .breaks
        .iter()
        .copied()
        .chain(prepared.freshness_gaps.iter().copied())
        .collect::<Vec<_>>();
    finish(&prepared, &buckets, &gap_sources)
}

fn prepare(input: &RollupInput) -> Result<Prepared, RollupError> {
    let freshness_ns = i128::from(
        input
            .freshness
            .num_nanoseconds()
            .ok_or(RollupError::Overflow)?,
    );
    let breaks = input
        .breaks
        .iter()
        .map(|interval| Ok((instant_ns(interval.start), instant_ns(interval.end))))
        .collect::<Result<Vec<_>, RollupError>>()?;
    let mut samples: Vec<Sample> = input
        .observations
        .iter()
        .map(|observation| {
            Ok(Sample {
                t: instant_ns(observation.observed_at),
                value: observation.value,
                scale: observation.scale,
            })
        })
        .collect::<Result<Vec<_>, RollupError>>()?;
    samples.sort_by(|left, right| left.t.cmp(&right.t));
    samples.retain(|sample| !inside_break(sample.t, &breaks));

    let mut segments = Vec::new();
    let mut freshness_gaps = Vec::new();
    for pair in samples.windows(2) {
        let start = pair[0].t;
        let end = pair[1].t;
        if end <= start {
            continue;
        }
        if end - start > freshness_ns {
            freshness_gaps.push((start, end));
            continue;
        }
        if breaks
            .iter()
            .any(|(break_start, break_end)| *break_start < end && *break_end > start)
        {
            continue;
        }
        segments.push(Segment {
            start,
            end,
            p0: pair[0].value,
            scale0: pair[0].scale,
            p1: pair[1].value,
            scale1: pair[1].scale,
        });
    }

    let bucket_ns = input
        .buckets
        .iter()
        .map(|bucket| Ok((instant_ns(bucket.start), instant_ns(bucket.end))))
        .collect::<Result<Vec<_>, RollupError>>()?;
    Ok(Prepared {
        samples,
        segments,
        breaks,
        freshness_gaps,
        buckets: input.buckets.clone(),
        bucket_ns,
    })
}

fn assign_scales(prepared: &Prepared, buckets: &mut [BucketCalc]) -> Result<(), RollupError> {
    for bucket in buckets.iter_mut() {
        let mut scale = None;
        for sample in &prepared.samples {
            if sample.t >= bucket.start && sample.t <= bucket.end {
                note_scale(&mut scale, sample.scale);
            }
        }
        for segment in &prepared.segments {
            if segment.start < bucket.end && segment.end > bucket.start {
                note_scale(&mut scale, segment.scale0);
                note_scale(&mut scale, segment.scale1);
            }
        }
        bucket.scale = scale.unwrap_or(0);
    }
    Ok(())
}

fn distribute_energy(segment: &Segment, buckets: &mut [BucketCalc]) -> Result<(), RollupError> {
    let natural = segment.scale0.max(segment.scale1);
    let p0 = rescale(segment.p0, segment.scale0, natural)?;
    let p1 = rescale(segment.p1, segment.scale1, natural)?;
    if p0 >= 0 && p1 >= 0 {
        distribute_same_sign(segment.start, segment.end, p0, p1, natural, true, buckets)
    } else if p0 <= 0 && p1 <= 0 {
        distribute_same_sign(
            segment.start,
            segment.end,
            iabs(p0)?,
            iabs(p1)?,
            natural,
            false,
            buckets,
        )
    } else if p0 > 0 && p1 < 0 {
        distribute_crossing(segment.start, segment.end, p0, p1, natural, false, buckets)
    } else {
        // Negating swaps import and export and keeps the zero crossing in place.
        distribute_crossing(
            segment.start,
            segment.end,
            iabs(p0)?,
            -p1,
            natural,
            true,
            buckets,
        )
    }
}

fn distribute_same_sign(
    start: i128,
    end: i128,
    p0: i128,
    p1: i128,
    natural: u8,
    import: bool,
    buckets: &mut [BucketCalc],
) -> Result<(), RollupError> {
    let duration = end - start;
    let full = wh_ratio(p0, p1, duration, 0, duration)?;
    let mut ids = overlapping_ids(buckets, start, end);
    ids.sort_by(|&left, &right| bucket_order(buckets, left, right));
    let parts = ids
        .iter()
        .map(|&id| {
            let bucket = &buckets[id];
            let clip_start = bucket.start.max(start) - start;
            let clip_end = bucket.end.min(end) - start;
            wh_ratio(p0, p1, duration, clip_start, clip_end)
        })
        .collect::<Result<Vec<_>, _>>()?;
    let partition = is_partition(buckets, &ids, start, end);
    let shares = allocate(&full, &parts, partition)?;
    for (id, share) in ids.into_iter().zip(shares) {
        let (import_share, export_share) = if import { (share, 0) } else { (0, share) };
        credit(&mut buckets[id], natural, import_share, export_share)?;
    }
    Ok(())
}

fn distribute_crossing(
    start: i128,
    end: i128,
    p0: i128,
    p1: i128,
    natural: u8,
    swap_directions: bool,
    buckets: &mut [BucketCalc],
) -> Result<(), RollupError> {
    let duration = end - start;
    let z_den = sub(p0, p1)?;
    let z_num = mul(duration, p0)?;
    let mut import_ids = Vec::new();
    let mut export_ids = Vec::new();
    for (id, bucket) in buckets.iter().enumerate() {
        if overlaps_prefix(bucket, start, z_num, z_den)? {
            import_ids.push(id);
        }
        if overlaps_suffix(bucket, start, end, z_num, z_den)? {
            export_ids.push(id);
        }
    }
    import_ids.sort_by(|&left, &right| bucket_order(buckets, left, right));
    export_ids.sort_by(|&left, &right| bucket_order(buckets, left, right));

    let import_full = triangle_full_ratio(p0, iabs(p1)?, duration)?;
    let export_full = triangle_full_ratio(iabs(p1)?, p0, duration)?;
    let import_parts = import_ids
        .iter()
        .map(|&id| {
            let bucket = &buckets[id];
            positive_triangle_ratio(p0, p1, duration, bucket.start - start, bucket.end - start)
        })
        .collect::<Result<Vec<_>, _>>()?;
    let export_parts = export_ids
        .iter()
        .map(|&id| {
            let bucket = &buckets[id];
            let rel_start = bucket.start - start;
            let rel_end = bucket.end - start;
            positive_triangle_ratio(
                iabs(p1)?,
                -p0,
                duration,
                duration - rel_end,
                duration - rel_start,
            )
        })
        .collect::<Result<Vec<_>, _>>()?;
    let import_partition = is_partition_until(buckets, &import_ids, start, z_num, z_den)?;
    let export_partition = is_partition_from_until(buckets, &export_ids, start, end, z_num, z_den)?;
    let import_shares = allocate(&import_full, &import_parts, import_partition)?;
    let export_shares = allocate(&export_full, &export_parts, export_partition)?;
    for (id, share) in import_ids.into_iter().zip(import_shares) {
        let (import_share, export_share) = if swap_directions {
            (0, share)
        } else {
            (share, 0)
        };
        credit(&mut buckets[id], natural, import_share, export_share)?;
    }
    for (id, share) in export_ids.into_iter().zip(export_shares) {
        let (import_share, export_share) = if swap_directions {
            (share, 0)
        } else {
            (0, share)
        };
        credit(&mut buckets[id], natural, import_share, export_share)?;
    }
    Ok(())
}

fn accumulate_segment(segment: &Segment, buckets: &mut [BucketCalc]) -> Result<(), RollupError> {
    let duration = segment.end - segment.start;
    for bucket in buckets.iter_mut() {
        let clip_start = bucket.start.max(segment.start);
        let clip_end = bucket.end.min(segment.end);
        if clip_end <= clip_start {
            continue;
        }
        bucket.covered.push((clip_start, clip_end));
        let p0 = rescale(segment.p0, segment.scale0, bucket.scale)?;
        let p1 = rescale(segment.p1, segment.scale1, bucket.scale)?;
        let area = signed_area_ns(
            p0,
            p1,
            duration,
            clip_start - segment.start,
            clip_end - segment.start,
        )?;
        bucket.area_ns = add(bucket.area_ns, area)?;
    }
    Ok(())
}

fn accumulate_extrema(prepared: &Prepared, buckets: &mut [BucketCalc]) -> Result<(), RollupError> {
    for bucket in buckets.iter_mut() {
        for sample in &prepared.samples {
            if sample.t < bucket.start || sample.t > bucket.end {
                continue;
            }
            let value = rescale(sample.value, sample.scale, bucket.scale)?;
            bucket.observed_min = Some(bucket.observed_min.map_or(value, |min| min.min(value)));
            bucket.observed_max = Some(bucket.observed_max.map_or(value, |max| max.max(value)));
        }
    }
    Ok(())
}

fn finish(
    prepared: &Prepared,
    buckets: &[BucketCalc],
    gap_sources: &[(i128, i128)],
) -> Result<Vec<Summary>, RollupError> {
    prepared
        .buckets
        .iter()
        .zip(buckets)
        .map(|(bucket, calc)| {
            let elapsed = calc.end - calc.start;
            let covered = union_duration_ns(&calc.covered);
            let gaps = gap_sources
                .iter()
                .filter_map(|(start, end)| clip_span(*start, *end, calc.start, calc.end))
                .collect::<Vec<_>>();
            let gap_ns = union_duration_ns(&gaps);
            let mean = if covered == 0 {
                None
            } else {
                Some(fit_i64(div_round_half_away(calc.area_ns, covered)?)?)
            };
            Ok(Summary {
                bucket: *bucket,
                scale: calc.scale,
                mean,
                observed_min: calc.observed_min.map(fit_i64).transpose()?,
                observed_max: calc.observed_max.map(fit_i64).transpose()?,
                estimated_import: calc.import,
                estimated_export: calc.export,
                coverage: Coverage {
                    covered_ns: fit_i64(covered)?,
                    elapsed_ns: fit_i64(elapsed)?,
                },
                gap_ns: fit_i64(gap_ns)?,
            })
        })
        .collect()
}

fn overlapping_ids(buckets: &[BucketCalc], start: i128, end: i128) -> Vec<usize> {
    buckets
        .iter()
        .enumerate()
        .filter(|(_, bucket)| bucket.start < end && bucket.end > start)
        .map(|(id, _)| id)
        .collect()
}

fn bucket_order(buckets: &[BucketCalc], left: usize, right: usize) -> Ordering {
    buckets[left]
        .start
        .cmp(&buckets[right].start)
        .then(buckets[left].end.cmp(&buckets[right].end))
}

fn is_partition(buckets: &[BucketCalc], ids: &[usize], start: i128, end: i128) -> bool {
    if ids.is_empty() {
        return false;
    }
    if buckets[ids[0]].start > start || buckets[*ids.last().expect("nonempty")].end < end {
        return false;
    }
    ids.windows(2)
        .all(|pair| buckets[pair[0]].end == buckets[pair[1]].start)
}

fn is_partition_until(
    buckets: &[BucketCalc],
    ids: &[usize],
    origin: i128,
    end_num: i128,
    end_den: i128,
) -> Result<bool, RollupError> {
    if ids.is_empty() {
        return Ok(false);
    }
    let first = &buckets[ids[0]];
    let last = &buckets[*ids.last().expect("nonempty")];
    if first.start > origin {
        return Ok(false);
    }
    let last_rel = sub(last.end, origin)?;
    if mul(last_rel, end_den)? < end_num {
        return Ok(false);
    }
    Ok(ids
        .windows(2)
        .all(|pair| buckets[pair[0]].end == buckets[pair[1]].start))
}

fn is_partition_from_until(
    buckets: &[BucketCalc],
    ids: &[usize],
    origin: i128,
    end: i128,
    z_num: i128,
    z_den: i128,
) -> Result<bool, RollupError> {
    if ids.is_empty() {
        return Ok(false);
    }
    let first = &buckets[ids[0]];
    let last = &buckets[*ids.last().expect("nonempty")];
    if last.end < end {
        return Ok(false);
    }
    let first_rel = sub(first.start, origin)?;
    if first_rel > 0 && mul(first_rel, z_den)? > z_num {
        return Ok(false);
    }
    Ok(ids
        .windows(2)
        .all(|pair| buckets[pair[0]].end == buckets[pair[1]].start))
}

fn overlaps_prefix(
    bucket: &BucketCalc,
    origin: i128,
    z_num: i128,
    z_den: i128,
) -> Result<bool, RollupError> {
    if bucket.end <= origin {
        return Ok(false);
    }
    let rel_start = sub(bucket.start, origin)?;
    if rel_start <= 0 {
        return Ok(true);
    }
    Ok(mul(rel_start, z_den)? < z_num)
}

fn overlaps_suffix(
    bucket: &BucketCalc,
    origin: i128,
    end: i128,
    z_num: i128,
    z_den: i128,
) -> Result<bool, RollupError> {
    if bucket.start >= end || bucket.end <= origin {
        return Ok(false);
    }
    let rel_end = sub(bucket.end, origin)?;
    if rel_end <= 0 {
        return Ok(false);
    }
    Ok(mul(rel_end, z_den)? > z_num)
}

fn credit(
    bucket: &mut BucketCalc,
    natural: u8,
    import_share: i64,
    export_share: i64,
) -> Result<(), RollupError> {
    let import_share = scale_up(import_share, natural, bucket.scale)?;
    let export_share = scale_up(export_share, natural, bucket.scale)?;
    bucket.import = bucket
        .import
        .checked_add(import_share)
        .ok_or(RollupError::Overflow)?;
    bucket.export = bucket
        .export
        .checked_add(export_share)
        .ok_or(RollupError::Overflow)?;
    Ok(())
}

fn allocate(full: &Ratio, parts: &[Ratio], partition: bool) -> Result<Vec<i64>, RollupError> {
    if parts.is_empty() {
        return Ok(Vec::new());
    }
    if !partition {
        return parts.iter().copied().map(round_ratio).collect();
    }
    let rounded = round_ratio(*full)?;
    if rounded == 0 {
        return Ok(vec![0; parts.len()]);
    }
    let mut shares = Vec::with_capacity(parts.len());
    let mut consumed = 0i64;
    for (index, part) in parts.iter().enumerate() {
        if index + 1 == parts.len() {
            let rest = rounded.checked_sub(consumed).ok_or(RollupError::Overflow)?;
            if rest < 0 {
                return Err(RollupError::Overflow);
            }
            shares.push(rest);
        } else {
            let share = share_floor(*part, *full, rounded)?;
            consumed = consumed.checked_add(share).ok_or(RollupError::Overflow)?;
            shares.push(share);
        }
    }
    Ok(shares)
}

fn wh_ratio(
    p0: i128,
    p1: i128,
    duration: i128,
    start: i128,
    end: i128,
) -> Result<Ratio, RollupError> {
    let width = sub(end, start)?;
    if width <= 0 {
        return Ok(zero_ratio());
    }
    let inner = trapezoid_inner(p0, p1, duration, start, end)?;
    let den = mul(mul(2, duration)?, NS_PER_HOUR)?;
    ratio_mul_div(width, inner, den)
}

fn triangle_full_ratio(apex: i128, other: i128, duration: i128) -> Result<Ratio, RollupError> {
    let den = mul(mul(2, add(apex, other)?)?, NS_PER_HOUR)?;
    ratio_mul_div(mul(apex, apex)?, duration, den)
}

fn positive_triangle_ratio(
    p0: i128,
    p1: i128,
    duration: i128,
    rel_start: i128,
    rel_end: i128,
) -> Result<Ratio, RollupError> {
    let z_den = sub(p0, p1)?;
    let z_num = mul(duration, p0)?;
    if rel_end <= 0 {
        return Ok(zero_ratio());
    }
    let clip_start = rel_start.max(0);
    if clip_start > 0 && mul(clip_start, z_den)? >= z_num {
        return Ok(zero_ratio());
    }
    if mul(rel_end, z_den)? > z_num {
        triangle_to_zero_ratio(p0, p1, duration, clip_start)
    } else {
        if rel_end <= clip_start {
            return Ok(zero_ratio());
        }
        triangle_integer_clip_ratio(p0, p1, duration, clip_start, rel_end)
    }
}

fn triangle_to_zero_ratio(
    p0: i128,
    p1: i128,
    duration: i128,
    clip_start: i128,
) -> Result<Ratio, RollupError> {
    let z_den = sub(p0, p1)?;
    let term = sub(mul(duration, p0)?, mul(clip_start, z_den)?)?;
    if term <= 0 {
        return Ok(zero_ratio());
    }
    let den = mul(mul(mul(2, z_den)?, duration)?, NS_PER_HOUR)?;
    ratio_mul_div(term, term, den)
}

fn triangle_integer_clip_ratio(
    p0: i128,
    p1: i128,
    duration: i128,
    clip_start: i128,
    clip_end: i128,
) -> Result<Ratio, RollupError> {
    let width = sub(clip_end, clip_start)?;
    if width <= 0 {
        return Ok(zero_ratio());
    }
    let z_den = sub(p0, p1)?;
    let inner = sub(
        mul(mul(2, duration)?, p0)?,
        mul(add(clip_start, clip_end)?, z_den)?,
    )?;
    let den = mul(mul(2, duration)?, NS_PER_HOUR)?;
    ratio_mul_div(width, inner, den)
}

fn signed_area_ns(
    p0: i128,
    p1: i128,
    duration: i128,
    start: i128,
    end: i128,
) -> Result<i128, RollupError> {
    let width = sub(end, start)?;
    if width == 0 {
        return Ok(0);
    }
    let inner = trapezoid_inner(p0, p1, duration, start, end)?;
    mul_div_round(width, inner, mul(2, duration)?)
}

fn trapezoid_inner(
    p0: i128,
    p1: i128,
    duration: i128,
    start: i128,
    end: i128,
) -> Result<i128, RollupError> {
    let left = mul(mul(2, p0)?, duration)?;
    let right = mul(sub(p1, p0)?, add(start, end)?)?;
    add(left, right)
}

fn ratio_mul_div(numer_a: i128, numer_b: i128, den: i128) -> Result<Ratio, RollupError> {
    if den <= 0 {
        return Err(RollupError::Overflow);
    }
    let negative = (numer_a < 0) ^ (numer_b < 0);
    let mut left = iabs(numer_a)?;
    let mut right = iabs(numer_b)?;
    let mut den = den;
    let left_gcd = gcd(left, den);
    left /= left_gcd;
    den /= left_gcd;
    let right_gcd = gcd(right, den);
    right /= right_gcd;
    den /= right_gcd;
    let mut num = mul(left, right)?;
    if negative {
        num = -num;
    }
    Ok(Ratio { num, den })
}

fn round_ratio(ratio: Ratio) -> Result<i64, RollupError> {
    fit_i64(div_round_half_away(ratio.num, ratio.den)?)
}

fn share_floor(part: Ratio, full: Ratio, rounded: i64) -> Result<i64, RollupError> {
    if part.num <= 0 || full.num <= 0 || rounded == 0 {
        return Ok(0);
    }
    let den = mul(part.den, full.num)?;
    fit_i64(mul_div_floor3(
        part.num,
        full.den,
        i128::from(rounded),
        den,
    )?)
}

fn mul_div_round(numer_a: i128, numer_b: i128, den: i128) -> Result<i128, RollupError> {
    let ratio = ratio_mul_div(numer_a, numer_b, den)?;
    div_round_half_away(ratio.num, ratio.den)
}

fn mul_div_floor3(
    mut a: i128,
    mut b: i128,
    mut c: i128,
    mut den: i128,
) -> Result<i128, RollupError> {
    if den <= 0 || a < 0 || b < 0 || c < 0 {
        return Err(RollupError::Overflow);
    }
    reduce_pair(&mut a, &mut den);
    reduce_pair(&mut b, &mut den);
    reduce_pair(&mut c, &mut den);
    let mut product = mul(a, b)?;
    reduce_pair(&mut product, &mut den);
    Ok(mul(product, c)? / den)
}

fn div_round_half_away(numer: i128, denom: i128) -> Result<i128, RollupError> {
    if denom == 0 {
        return Err(RollupError::Overflow);
    }
    let negative = numer < 0;
    let numer = iabs(numer)?;
    let denom = iabs(denom)?;
    let mut quotient = numer / denom;
    let remainder = numer % denom;
    if remainder >= denom / 2 + denom % 2 {
        quotient = add(quotient, 1)?;
    }
    if negative {
        quotient = -quotient;
    }
    Ok(quotient)
}

fn union_duration_ns(spans: &[(i128, i128)]) -> i128 {
    let mut spans = spans
        .iter()
        .copied()
        .filter(|(start, end)| end > start)
        .collect::<Vec<_>>();
    spans.sort_unstable();
    let mut total = 0i128;
    let mut current: Option<(i128, i128)> = None;
    for (start, end) in spans {
        match current {
            Some((open, close)) if start <= close => current = Some((open, close.max(end))),
            Some((open, close)) => {
                total += close - open;
                current = Some((start, end));
            }
            None => current = Some((start, end)),
        }
    }
    if let Some((open, close)) = current {
        total += close - open;
    }
    total
}

fn clip_span(start: i128, end: i128, bucket_start: i128, bucket_end: i128) -> Option<(i128, i128)> {
    let start = start.max(bucket_start);
    let end = end.min(bucket_end);
    (end > start).then_some((start, end))
}

fn inside_break(time: i128, breaks: &[(i128, i128)]) -> bool {
    breaks
        .iter()
        .any(|(start, end)| time >= *start && time <= *end)
}

fn note_scale(scale: &mut Option<u8>, next: u8) {
    *scale = Some(scale.map_or(next, |current| current.max(next)));
}

fn rescale(value: i64, from: u8, to: u8) -> Result<i128, RollupError> {
    if from > 9 || to > 9 || to < from {
        return Err(RollupError::InvalidScale(from.max(to)));
    }
    let mut scaled = i128::from(value);
    let mut scale = from;
    while scale < to {
        scaled = mul(scaled, 10)?;
        scale += 1;
    }
    Ok(scaled)
}

fn scale_up(value: i64, from: u8, to: u8) -> Result<i64, RollupError> {
    fit_i64(rescale(value, from, to)?)
}

fn instant_ns(time: DateTime<Utc>) -> i128 {
    i128::from(time.timestamp()) * 1_000_000_000 + i128::from(time.timestamp_subsec_nanos())
}

fn zero_ratio() -> Ratio {
    Ratio { num: 0, den: 1 }
}

fn reduce_pair(numer: &mut i128, denom: &mut i128) {
    let divisor = gcd(iabs(*numer).unwrap_or(0), *denom);
    if divisor > 1 {
        *numer /= divisor;
        *denom /= divisor;
    }
}

fn gcd(mut left: i128, mut right: i128) -> i128 {
    while right != 0 {
        let remainder = left % right;
        left = right;
        right = remainder;
    }
    left.abs()
}

fn iabs(value: i128) -> Result<i128, RollupError> {
    value.checked_abs().ok_or(RollupError::Overflow)
}

fn add(left: i128, right: i128) -> Result<i128, RollupError> {
    left.checked_add(right).ok_or(RollupError::Overflow)
}

fn sub(left: i128, right: i128) -> Result<i128, RollupError> {
    left.checked_sub(right).ok_or(RollupError::Overflow)
}

fn mul(left: i128, right: i128) -> Result<i128, RollupError> {
    left.checked_mul(right).ok_or(RollupError::Overflow)
}

fn fit_i64(value: i128) -> Result<i64, RollupError> {
    i64::try_from(value).map_err(|_| RollupError::Overflow)
}

fn dedup_power(capability_id: Uuid, rollups: &[PowerRollup]) -> Vec<NewPowerRollup> {
    let mut rows = Vec::new();
    for rollup in rollups {
        rows.retain(|row: &NewPowerRollup| row.bucket_start != rollup.bucket.start);
        rows.push(NewPowerRollup {
            capability_id,
            bucket_start: rollup.bucket.start,
            bucket_end: rollup.bucket.end,
            scale: i16::from(rollup.scale),
            mean_value: rollup.mean,
            observed_min: rollup.observed_min,
            observed_max: rollup.observed_max,
            estimated_import: rollup.estimated_import,
            estimated_export: rollup.estimated_export,
            coverage_ns: rollup.coverage.covered_ns,
            gap_ns: rollup.gap_ns,
        });
    }
    rows
}

fn dedup_gauge(
    capability_id: Uuid,
    kind: GaugeKind,
    rollups: &[GaugeRollup],
) -> Vec<NewGaugeRollup> {
    let mut rows = Vec::new();
    for rollup in rollups {
        rows.retain(|row: &NewGaugeRollup| row.bucket_start != rollup.bucket.start);
        rows.push(NewGaugeRollup {
            capability_id,
            gauge_kind: kind.as_str(),
            bucket_start: rollup.bucket.start,
            bucket_end: rollup.bucket.end,
            scale: i16::from(rollup.scale),
            mean_value: rollup.mean,
            observed_min: rollup.observed_min,
            observed_max: rollup.observed_max,
            coverage_ns: rollup.coverage.covered_ns,
        });
    }
    rows
}

#[cfg(test)]
mod tests {
    use super::*;

    const HOUR: i64 = 3600;

    fn at(seconds: i64) -> DateTime<Utc> {
        DateTime::from_timestamp(seconds, 0).expect("timestamp")
    }

    fn ns(seconds: i64) -> i64 {
        seconds * 1_000_000_000
    }

    fn obs(seconds: i64, value: i64, scale: u8) -> GaugeObservation {
        GaugeObservation {
            observed_at: at(seconds),
            value,
            scale,
        }
    }

    fn span(start: i64, end: i64) -> ClosedInterval {
        ClosedInterval {
            start: at(start),
            end: at(end),
        }
    }

    fn input(
        observations: Vec<GaugeObservation>,
        breaks: Vec<ClosedInterval>,
        freshness: Duration,
        buckets: Vec<ClosedInterval>,
    ) -> RollupInput {
        RollupInput {
            observations,
            breaks,
            freshness,
            buckets,
        }
    }

    fn one_hour(observations: Vec<GaugeObservation>) -> RollupInput {
        input(
            observations,
            Vec::new(),
            Duration::hours(24),
            vec![span(0, HOUR)],
        )
    }

    #[test]
    fn odd_watt_sum_rounds_half_away_from_zero_into_import() {
        let rows = rollup_power(&one_hour(vec![obs(0, 1, 0), obs(HOUR, 0, 0)])).unwrap();
        let row = &rows[0];
        assert_eq!(row.estimated_import, 1);
        assert_eq!(row.estimated_export, 0);
        assert_eq!(row.mean, Some(1));
        assert_eq!(row.observed_min, Some(0));
        assert_eq!(row.observed_max, Some(1));
        assert_eq!(row.coverage.covered_ns, ns(HOUR));
        assert_eq!(row.coverage.elapsed_ns, ns(HOUR));
        assert_eq!(row.gap_ns, 0);
    }

    #[test]
    fn odd_negative_watt_sum_rounds_into_estimated_export() {
        let rows = rollup_power(&one_hour(vec![obs(0, -1, 0), obs(HOUR, 0, 0)])).unwrap();
        let row = &rows[0];
        assert_eq!(row.estimated_import, 0);
        assert_eq!(row.estimated_export, 1);
        assert_eq!(row.mean, Some(-1));
        assert_eq!(row.observed_min, Some(-1));
        assert_eq!(row.observed_max, Some(0));
    }

    #[test]
    fn signed_power_keeps_import_and_export_separate() {
        let rows = rollup_power(&one_hour(vec![obs(0, 1_000, 0), obs(HOUR, -1_000, 0)])).unwrap();
        let row = &rows[0];
        assert_eq!(row.estimated_import, 250);
        assert_eq!(row.estimated_export, 250);
        assert_eq!(row.mean, Some(0));
        assert_eq!(row.observed_min, Some(-1_000));
        assert_eq!(row.observed_max, Some(1_000));
    }

    #[test]
    fn export_then_import_stays_in_its_own_direction() {
        let rows = rollup_power(&one_hour(vec![obs(0, -1_000, 0), obs(HOUR, 500, 0)])).unwrap();
        let row = &rows[0];
        assert_eq!(row.estimated_export, 333);
        assert_eq!(row.estimated_import, 83);
        assert_eq!(row.observed_min, Some(-1_000));
        assert_eq!(row.observed_max, Some(500));
    }

    #[test]
    fn constant_power_integrates_each_trapezoid() {
        let rows = rollup_power(&one_hour(vec![
            obs(0, 1_000, 0),
            obs(HOUR / 2, 1_000, 0),
            obs(HOUR, 1_000, 0),
        ]))
        .unwrap();
        let row = &rows[0];
        assert_eq!(row.estimated_import, 1_000);
        assert_eq!(row.estimated_export, 0);
        assert_eq!(row.mean, Some(1_000));
        assert_eq!(row.observed_min, Some(1_000));
        assert_eq!(row.observed_max, Some(1_000));
        assert_eq!(row.coverage.covered_ns, row.coverage.elapsed_ns);
    }

    #[test]
    fn declining_power_splits_energy_by_area_and_keeps_the_rounded_total() {
        let rows = rollup_power(&input(
            vec![obs(0, 1_000, 0), obs(HOUR, 0, 0)],
            Vec::new(),
            Duration::hours(24),
            vec![span(0, HOUR / 2), span(HOUR / 2, HOUR)],
        ))
        .unwrap();
        assert_eq!(rows[0].estimated_import, 375);
        assert_eq!(rows[1].estimated_import, 125);
        assert_eq!(rows[0].estimated_import + rows[1].estimated_import, 500);
    }

    #[test]
    fn odd_trapezoid_leftover_lands_on_the_last_bucket() {
        let rows = rollup_power(&input(
            vec![obs(0, 1, 0), obs(HOUR, 0, 0)],
            Vec::new(),
            Duration::hours(24),
            vec![span(0, HOUR / 2), span(HOUR / 2, HOUR)],
        ))
        .unwrap();
        assert_eq!(rows[0].estimated_import, 0);
        assert_eq!(rows[1].estimated_import, 1);
    }

    #[test]
    fn history_gap_stops_integration_without_erasing_observations() {
        let rows = rollup_power(&input(
            vec![obs(0, 1_000, 0), obs(HOUR, 1_000, 0)],
            vec![span(20 * 60, 40 * 60)],
            Duration::hours(24),
            vec![span(0, HOUR)],
        ))
        .unwrap();
        let row = &rows[0];
        assert_eq!(row.estimated_import, 0);
        assert_eq!(row.estimated_export, 0);
        assert_eq!(row.mean, None);
        assert_eq!(row.observed_min, Some(1_000));
        assert_eq!(row.observed_max, Some(1_000));
        assert_eq!(row.coverage.covered_ns, 0);
        assert_eq!(row.gap_ns, ns(20 * 60));
    }

    #[test]
    fn unavailable_or_stale_period_stops_integration() {
        let rows = rollup_power(&input(
            vec![obs(0, 400, 0), obs(HOUR, 400, 0)],
            vec![span(0, HOUR)],
            Duration::hours(24),
            vec![span(0, HOUR)],
        ))
        .unwrap();
        let row = &rows[0];
        assert_eq!(row.estimated_import, 0);
        assert_eq!(row.coverage.covered_ns, 0);
        assert_eq!(row.observed_min, None);
        assert_eq!(row.gap_ns, ns(HOUR));
    }

    #[test]
    fn state_epoch_change_stops_integration() {
        let instant = span(HOUR / 2, HOUR / 2);
        let rows = rollup_power(&input(
            vec![obs(0, 100, 0), obs(HOUR, 100, 0)],
            vec![instant],
            Duration::hours(24),
            vec![span(0, HOUR)],
        ))
        .unwrap();
        let row = &rows[0];
        assert_eq!(row.estimated_import, 0);
        assert_eq!(row.coverage.covered_ns, 0);
        assert_eq!(row.gap_ns, 0);
        assert_eq!(row.observed_min, Some(100));
        assert_eq!(row.observed_max, Some(100));
    }

    #[test]
    fn freshness_limit_stops_integration_and_records_the_unbridged_gap() {
        let rows = rollup_power(&input(
            vec![obs(0, 100, 0), obs(2 * HOUR, 100, 0)],
            Vec::new(),
            Duration::hours(1),
            vec![span(0, 2 * HOUR)],
        ))
        .unwrap();
        let row = &rows[0];
        assert_eq!(row.estimated_import, 0);
        assert_eq!(row.coverage.covered_ns, 0);
        assert_eq!(row.gap_ns, ns(2 * HOUR));
        assert_eq!(row.observed_min, Some(100));
    }

    #[test]
    fn gap_equal_to_freshness_still_integrates() {
        let rows = rollup_power(&input(
            vec![obs(0, 100, 0), obs(HOUR, 100, 0)],
            Vec::new(),
            Duration::hours(1),
            vec![span(0, HOUR)],
        ))
        .unwrap();
        assert_eq!(rows[0].estimated_import, 100);
        assert_eq!(rows[0].gap_ns, 0);
        assert_eq!(rows[0].coverage.covered_ns, ns(HOUR));
    }

    #[test]
    fn extrema_ignore_interpolated_boundary_values() {
        let rows = rollup_power(&input(
            vec![obs(0, 100, 0), obs(2 * HOUR, 300, 0)],
            Vec::new(),
            Duration::hours(24),
            vec![span(HOUR / 2, HOUR + HOUR / 2)],
        ))
        .unwrap();
        let row = &rows[0];
        assert_eq!(row.estimated_import, 200);
        assert_eq!(row.mean, Some(200));
        assert_eq!(row.observed_min, None);
        assert_eq!(row.observed_max, None);
        assert_eq!(row.coverage.covered_ns, ns(HOUR));
        assert_eq!(row.coverage.elapsed_ns, ns(HOUR));
    }

    #[test]
    fn time_weighted_mean_uses_elapsed_coverage_not_the_sample_average() {
        let rows = rollup_power(&one_hour(vec![
            obs(0, 0, 0),
            obs(40 * 60, 0, 0),
            obs(HOUR, 120, 0),
        ]))
        .unwrap();
        let row = &rows[0];
        assert_eq!(row.mean, Some(20));
        assert_eq!(row.estimated_import, 20);
        assert_eq!(row.observed_min, Some(0));
        assert_eq!(row.observed_max, Some(120));
    }

    #[test]
    fn coverage_clips_to_the_bucket_and_uses_actual_elapsed_duration() {
        let rows = rollup_power(&input(
            vec![obs(0, 1_000, 0), obs(23 * HOUR, 1_000, 0)],
            Vec::new(),
            Duration::hours(48),
            vec![span(0, 23 * HOUR)],
        ))
        .unwrap();
        let row = &rows[0];
        assert_eq!(row.estimated_import, 23_000);
        assert_eq!(row.coverage.covered_ns, ns(23 * HOUR));
        assert_eq!(row.coverage.elapsed_ns, ns(23 * HOUR));
        assert_eq!(row.mean, Some(1_000));
    }

    #[test]
    fn partial_segment_coverage_is_the_clipped_fraction() {
        let rows = rollup_power(&input(
            vec![obs(0, 10, 0), obs(HOUR / 2, 10, 0)],
            Vec::new(),
            Duration::hours(24),
            vec![span(0, HOUR)],
        ))
        .unwrap();
        assert_eq!(rows[0].coverage.covered_ns, ns(HOUR / 2));
        assert_eq!(rows[0].coverage.elapsed_ns, ns(HOUR));
        assert_eq!(rows[0].estimated_import, 5);
    }

    #[test]
    fn overlapping_breaks_count_once_as_gaps() {
        let rows = rollup_power(&input(
            Vec::new(),
            vec![span(0, 40 * 60), span(20 * 60, HOUR)],
            Duration::hours(24),
            vec![span(0, HOUR)],
        ))
        .unwrap();
        assert_eq!(rows[0].gap_ns, ns(HOUR));
        assert_eq!(rows[0].coverage.covered_ns, 0);
        assert_eq!(rows[0].estimated_import, 0);
        assert_eq!(rows[0].mean, None);
    }

    #[test]
    fn coverage_does_not_double_count_overlapping_time() {
        let hour = 3_600_000_000_000_i128;
        let spans = [(0, hour), (hour / 2, hour + hour / 2)];
        assert_eq!(union_duration_ns(&spans), hour + hour / 2);
    }

    #[test]
    fn fixed_point_scale_is_preserved_in_the_integral() {
        let rows = rollup_power(&one_hour(vec![obs(0, 1_500, 3), obs(HOUR, 1_500, 3)])).unwrap();
        let row = &rows[0];
        assert_eq!(row.scale, 3);
        assert_eq!(row.estimated_import, 1_500);
        assert_eq!(row.mean, Some(1_500));
        assert_eq!(row.observed_min, Some(1_500));
        assert_eq!(row.observed_max, Some(1_500));
    }

    #[test]
    fn mixed_scales_rescale_before_integration() {
        let rows = rollup_power(&one_hour(vec![obs(0, 1, 0), obs(HOUR, 2_000, 3)])).unwrap();
        let row = &rows[0];
        assert_eq!(row.scale, 3);
        assert_eq!(row.estimated_import, 1_500);
        assert_eq!(row.mean, Some(1_500));
        assert_eq!(row.observed_min, Some(1_000));
        assert_eq!(row.observed_max, Some(2_000));
    }

    #[test]
    fn voltage_and_current_keep_mean_extrema_and_coverage_without_energy() {
        let observations = vec![obs(0, 230, 0), obs(HOUR, 210, 0)];
        let voltage = rollup_gauge(&one_hour(observations.clone())).unwrap();
        let current = rollup_gauge(&one_hour(vec![obs(0, 4, 0), obs(HOUR, 2, 0)])).unwrap();
        assert_eq!(voltage[0].mean, Some(220));
        assert_eq!(voltage[0].observed_min, Some(210));
        assert_eq!(voltage[0].observed_max, Some(230));
        assert_eq!(voltage[0].coverage.covered_ns, ns(HOUR));
        assert_eq!(current[0].mean, Some(3));
        assert_eq!(current[0].observed_min, Some(2));
        assert_eq!(current[0].observed_max, Some(4));
    }

    #[test]
    fn gauge_breaks_reduce_coverage_and_keep_outside_observations() {
        let rows = rollup_gauge(&input(
            vec![obs(0, 120, 0), obs(HOUR, 120, 0)],
            vec![span(15 * 60, 45 * 60)],
            Duration::hours(24),
            vec![span(0, HOUR)],
        ))
        .unwrap();
        assert_eq!(rows[0].coverage.covered_ns, 0);
        assert_eq!(rows[0].mean, None);
        assert_eq!(rows[0].observed_min, Some(120));
        assert_eq!(rows[0].observed_max, Some(120));
    }

    #[test]
    fn unsorted_observations_are_integrated_in_time_order() {
        let rows = rollup_power(&one_hour(vec![obs(HOUR, 0, 0), obs(0, 1_000, 0)])).unwrap();
        assert_eq!(rows[0].estimated_import, 500);
        assert_eq!(rows[0].observed_min, Some(0));
        assert_eq!(rows[0].observed_max, Some(1_000));
    }

    #[test]
    fn recomputing_a_rollup_is_deterministic() {
        let sample = one_hour(vec![obs(0, 1_000, 0), obs(HOUR, -250, 0)]);
        assert_eq!(
            rollup_power(&sample).unwrap(),
            rollup_power(&sample).unwrap()
        );
        assert_eq!(
            rollup_gauge(&sample).unwrap(),
            rollup_gauge(&sample).unwrap()
        );
    }

    #[test]
    fn overflow_is_rejected() {
        let input = input(
            vec![obs(0, i64::MAX, 0), obs(2 * HOUR, i64::MAX, 0)],
            Vec::new(),
            Duration::hours(48),
            vec![span(0, 2 * HOUR)],
        );
        assert_eq!(rollup_power(&input), Err(RollupError::Overflow));
    }

    #[test]
    fn one_hour_at_the_integer_limit_is_accepted() {
        let rows =
            rollup_power(&one_hour(vec![obs(0, i64::MAX, 0), obs(HOUR, i64::MAX, 0)])).unwrap();
        assert_eq!(rows[0].estimated_import, i64::MAX);
        assert_eq!(rows[0].mean, Some(i64::MAX));
    }

    #[test]
    fn invalid_scale_interval_and_freshness_are_rejected() {
        let mut bad_scale = one_hour(vec![obs(0, 1, 10)]);
        assert_eq!(rollup_power(&bad_scale), Err(RollupError::InvalidScale(10)));
        bad_scale.observations[0].scale = 0;
        bad_scale.buckets[0] = span(HOUR, HOUR);
        assert_eq!(rollup_power(&bad_scale), Err(RollupError::InvalidInterval));
        bad_scale.buckets[0] = span(0, HOUR);
        bad_scale.breaks = vec![span(10, 0)];
        assert_eq!(rollup_gauge(&bad_scale), Err(RollupError::InvalidInterval));
        bad_scale.breaks.clear();
        bad_scale.freshness = Duration::zero();
        assert_eq!(rollup_power(&bad_scale), Err(RollupError::InvalidFreshness));
    }

    #[test]
    fn migration_defines_power_and_gauge_rollup_tables() {
        let up = include_str!("../../migrations/2026-10-19-000004-0000_gauge_rollups/up.sql");
        assert!(up.contains("CREATE TABLE power_rollups"));
        assert!(up.contains("CREATE TABLE gauge_rollups"));
        assert!(up.contains("CHECK (gauge_kind IN ('voltage', 'current'))"));
        assert!(up.contains("PRIMARY KEY (capability_id, bucket_start)"));
        assert!(up.contains("estimated_import"));
        assert!(up.contains("estimated_export"));
        assert!(!up.to_lowercase().contains("jsonb"));
        assert!(!up.contains("net_consumption"));
        let down = include_str!("../../migrations/2026-10-19-000004-0000_gauge_rollups/down.sql");
        assert!(down.contains("DROP TABLE power_rollups"));
        assert!(down.contains("DROP TABLE gauge_rollups"));
    }
}
