//! Measured energy from absolute cumulative counters.
//!
//! A Meter epoch starts on a decrease larger than the declared resolution, an adapter reset,
//! or a caller-marked Capability identity change. Smaller backward movement is noise.
//! Deltas never cross Meter epochs, History gaps, unavailable intervals, or uncertain identity.
//! A Core State-epoch change is an ignored boundary.

use chrono::{DateTime, Utc};
use thiserror::Error;
use uuid::Uuid;

/// Caller-supplied closed time bound. `end` is exclusive of any later interval that merely touches it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ClosedInterval {
    pub start: DateTime<Utc>,
    pub end: DateTime<Utc>,
}

/// Absolute cumulative counter sample. Values are imported or exported energy, not consumption deltas.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CounterObservation {
    pub observed_at: DateTime<Utc>,
    pub value: i64,
    pub reset: bool,
    pub identity_changed: bool,
}

/// One Capability series. A different `capability_id` is a different series and starts its own epoch.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MeasuredEnergyQuery {
    pub capability_id: Uuid,
    pub resolution: i64,
    pub observations: Vec<CounterObservation>,
    pub history_gaps: Vec<ClosedInterval>,
    pub unavailable: Vec<ClosedInterval>,
    pub uncertain_identity: Vec<ClosedInterval>,
    /// Core State-epoch instants. They are ignored and never start a Meter epoch.
    pub state_epoch_changes: Vec<DateTime<Utc>>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MeterEpochReason {
    Initial,
    CounterDecrease,
    AdapterReset,
    IdentityChange,
}

impl MeterEpochReason {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Initial => "initial",
            Self::CounterDecrease => "counter_decrease",
            Self::AdapterReset => "adapter_reset",
            Self::IdentityChange => "identity_change",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct MeterEpoch {
    pub capability_id: Uuid,
    pub started_at: DateTime<Utc>,
    pub ended_at: Option<DateTime<Utc>>,
    pub reason: MeterEpochReason,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BoundaryAllocation {
    Exact,
    Interpolated,
}

impl BoundaryAllocation {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Exact => "exact",
            Self::Interpolated => "interpolated",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EnergyProvenance {
    MeasuredFromCounter,
}

impl EnergyProvenance {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::MeasuredFromCounter => "measured_from_counter",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ObservationEndpoint {
    pub observed_at: DateTime<Utc>,
    pub value: i64,
}

/// Endpoints of one within-epoch step. `measured` is the nonnegative fixed-point delta.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CounterSegment {
    pub start: ObservationEndpoint,
    pub end: ObservationEndpoint,
    pub measured: i64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EnergyCounterRollup {
    pub capability_id: Uuid,
    pub bucket: ClosedInterval,
    pub first: ObservationEndpoint,
    pub last: ObservationEndpoint,
    pub measured_energy: i64,
    pub coverage_numerator: i64,
    pub coverage_denominator: i64,
    pub allocation: BoundaryAllocation,
    pub provenance: EnergyProvenance,
    pub segments: Vec<CounterSegment>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MeasuredEnergy {
    pub epochs: Vec<MeterEpoch>,
    pub segments: Vec<CounterSegment>,
    pub rollups: Vec<EnergyCounterRollup>,
}

#[derive(Debug, Error, Clone, PartialEq, Eq)]
pub enum MeterEpochError {
    #[error("resolution must be nonnegative")]
    InvalidResolution,
    #[error("observations must be strictly increasing in time")]
    UnorderedObservations,
    #[error("interval end must be after its start")]
    InvalidInterval,
    #[error("fixed-point calculation overflowed")]
    Overflow,
}

pub fn measure_energy(
    query: &MeasuredEnergyQuery,
    buckets: &[ClosedInterval],
) -> Result<MeasuredEnergy, MeterEpochError> {
    if query.resolution < 0 {
        return Err(MeterEpochError::InvalidResolution);
    }
    // State-epoch changes are synchronization boundaries. They do not start a Meter epoch
    // and they do not interrupt a trustworthy counter delta.
    let _state_epoch_changes = &query.state_epoch_changes;
    validate_intervals(
        query
            .history_gaps
            .iter()
            .chain(query.unavailable.iter())
            .chain(query.uncertain_identity.iter())
            .chain(buckets.iter())
            .copied(),
    )?;
    for pair in query.observations.windows(2) {
        if pair[1].observed_at <= pair[0].observed_at {
            return Err(MeterEpochError::UnorderedObservations);
        }
    }
    if query.observations.is_empty() {
        return Ok(MeasuredEnergy {
            epochs: Vec::new(),
            segments: Vec::new(),
            rollups: Vec::new(),
        });
    }

    let mut epochs = vec![MeterEpoch {
        capability_id: query.capability_id,
        started_at: query.observations[0].observed_at,
        ended_at: None,
        reason: MeterEpochReason::Initial,
    }];
    let mut segments = Vec::new();
    for pair in query.observations.windows(2) {
        let previous = &pair[0];
        let next = &pair[1];
        if let Some(reason) = epoch_break(previous, next, query.resolution)? {
            epochs.last_mut().expect("epoch").ended_at = Some(next.observed_at);
            epochs.push(MeterEpoch {
                capability_id: query.capability_id,
                started_at: next.observed_at,
                ended_at: None,
                reason,
            });
            continue;
        }
        if blocks_delta(previous.observed_at, next.observed_at, query) {
            continue;
        }
        segments.push(CounterSegment {
            start: endpoint(previous),
            end: endpoint(next),
            measured: nonnegative_delta(previous.value, next.value)?,
        });
    }
    let rollups = allocate_rollups(query.capability_id, &segments, buckets)?;
    Ok(MeasuredEnergy {
        epochs,
        segments,
        rollups,
    })
}

/// Allocate preserved segment endpoints again. The stored `measured` field is ignored so the
/// fixed-point result depends only on the endpoint values, the resolution, and the buckets.
/// Retention recomputes from the original observations through `measure_energy`. This checks
/// that those endpoints reproduce the same rollup.
#[cfg(test)]
pub fn recompute_from_endpoints(
    capability_id: Uuid,
    resolution: i64,
    segments: &[CounterSegment],
    buckets: &[ClosedInterval],
) -> Result<Vec<EnergyCounterRollup>, MeterEpochError> {
    if resolution < 0 {
        return Err(MeterEpochError::InvalidResolution);
    }
    validate_intervals(buckets.iter().copied())?;
    let mut derived = Vec::with_capacity(segments.len());
    for segment in segments {
        if segment.end.observed_at <= segment.start.observed_at {
            return Err(MeterEpochError::InvalidInterval);
        }
        let decrease = i128::from(segment.start.value) - i128::from(segment.end.value);
        if decrease > i128::from(resolution) {
            return Err(MeterEpochError::InvalidInterval);
        }
        derived.push(CounterSegment {
            start: segment.start,
            end: segment.end,
            measured: nonnegative_delta(segment.start.value, segment.end.value)?,
        });
    }
    allocate_rollups(capability_id, &derived, buckets)
}

pub fn energy_counter_rollup_upsert_sql() -> &'static str {
    "INSERT INTO energy_counter_rollups (
    capability_id, bucket_start, bucket_end,
    first_observed_at, first_value, last_observed_at, last_value,
    measured_energy, coverage_numerator, coverage_denominator,
    allocation, provenance
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
ON CONFLICT (capability_id, bucket_start) DO UPDATE SET
    bucket_end = EXCLUDED.bucket_end,
    first_observed_at = EXCLUDED.first_observed_at,
    first_value = EXCLUDED.first_value,
    last_observed_at = EXCLUDED.last_observed_at,
    last_value = EXCLUDED.last_value,
    measured_energy = EXCLUDED.measured_energy,
    coverage_numerator = EXCLUDED.coverage_numerator,
    coverage_denominator = EXCLUDED.coverage_denominator,
    allocation = EXCLUDED.allocation,
    provenance = EXCLUDED.provenance"
}

pub fn meter_epoch_upsert_sql() -> &'static str {
    "INSERT INTO meter_epochs (capability_id, started_at, ended_at, reason)
VALUES ($1, $2, $3, $4)
ON CONFLICT (capability_id, started_at) DO UPDATE SET
    ended_at = EXCLUDED.ended_at,
    reason = EXCLUDED.reason"
}

pub(crate) fn coverage_fraction(
    covered: &[(DateTime<Utc>, DateTime<Utc>)],
    bucket: ClosedInterval,
) -> Result<(i64, i64), MeterEpochError> {
    let denominator = elapsed_nanos(bucket.start, bucket.end)?;
    let clipped = covered
        .iter()
        .filter_map(|(start, end)| intersection(*start, *end, bucket.start, bucket.end))
        .collect::<Vec<_>>();
    let numerator = union_nanos(&clipped)?;
    if numerator > denominator {
        return Err(MeterEpochError::Overflow);
    }
    Ok((
        i64::try_from(numerator).map_err(|_| MeterEpochError::Overflow)?,
        i64::try_from(denominator).map_err(|_| MeterEpochError::Overflow)?,
    ))
}

fn endpoint(observation: &CounterObservation) -> ObservationEndpoint {
    ObservationEndpoint {
        observed_at: observation.observed_at,
        value: observation.value,
    }
}

fn epoch_break(
    previous: &CounterObservation,
    next: &CounterObservation,
    resolution: i64,
) -> Result<Option<MeterEpochReason>, MeterEpochError> {
    if next.identity_changed {
        return Ok(Some(MeterEpochReason::IdentityChange));
    }
    if next.reset {
        return Ok(Some(MeterEpochReason::AdapterReset));
    }
    let decrease = i128::from(previous.value) - i128::from(next.value);
    if decrease > i128::from(resolution) {
        return Ok(Some(MeterEpochReason::CounterDecrease));
    }
    Ok(None)
}

fn nonnegative_delta(previous: i64, next: i64) -> Result<i64, MeterEpochError> {
    let delta = i128::from(next) - i128::from(previous);
    if delta <= 0 {
        return Ok(0);
    }
    i64::try_from(delta).map_err(|_| MeterEpochError::Overflow)
}

fn blocks_delta(start: DateTime<Utc>, end: DateTime<Utc>, query: &MeasuredEnergyQuery) -> bool {
    crosses(start, end, &query.history_gaps)
        || crosses(start, end, &query.unavailable)
        || crosses(start, end, &query.uncertain_identity)
}

fn crosses(start: DateTime<Utc>, end: DateTime<Utc>, intervals: &[ClosedInterval]) -> bool {
    intervals
        .iter()
        .any(|interval| interval.start < end && start < interval.end)
}

fn validate_intervals(
    intervals: impl IntoIterator<Item = ClosedInterval>,
) -> Result<(), MeterEpochError> {
    for interval in intervals {
        if interval.end <= interval.start {
            return Err(MeterEpochError::InvalidInterval);
        }
    }
    Ok(())
}

fn elapsed_nanos(start: DateTime<Utc>, end: DateTime<Utc>) -> Result<i128, MeterEpochError> {
    if end <= start {
        return Err(MeterEpochError::InvalidInterval);
    }
    (end - start)
        .num_nanoseconds()
        .map(i128::from)
        .ok_or(MeterEpochError::Overflow)
}

fn intersection(
    start: DateTime<Utc>,
    end: DateTime<Utc>,
    other_start: DateTime<Utc>,
    other_end: DateTime<Utc>,
) -> Option<(DateTime<Utc>, DateTime<Utc>)> {
    let overlap_start = start.max(other_start);
    let overlap_end = end.min(other_end);
    (overlap_start < overlap_end).then_some((overlap_start, overlap_end))
}

fn union_nanos(intervals: &[(DateTime<Utc>, DateTime<Utc>)]) -> Result<i128, MeterEpochError> {
    let mut ranges = intervals
        .iter()
        .copied()
        .filter(|(start, end)| end > start)
        .collect::<Vec<_>>();
    ranges.sort_by(|left, right| left.0.cmp(&right.0).then(left.1.cmp(&right.1)));
    let mut total = 0i128;
    let mut current: Option<(DateTime<Utc>, DateTime<Utc>)> = None;
    for (start, end) in ranges {
        if let Some((current_start, current_end)) = current {
            if start <= current_end {
                current = Some((current_start, current_end.max(end)));
            } else {
                total = total
                    .checked_add(elapsed_nanos(current_start, current_end)?)
                    .ok_or(MeterEpochError::Overflow)?;
                current = Some((start, end));
            }
        } else {
            current = Some((start, end));
        }
    }
    if let Some((start, end)) = current {
        total = total
            .checked_add(elapsed_nanos(start, end)?)
            .ok_or(MeterEpochError::Overflow)?;
    }
    Ok(total)
}

fn mul_div(value: i128, numerator: i128, denominator: i128) -> Result<i128, MeterEpochError> {
    if denominator <= 0 {
        return Err(MeterEpochError::InvalidInterval);
    }
    value
        .checked_mul(numerator)
        .map(|product| product / denominator)
        .ok_or(MeterEpochError::Overflow)
}

struct BucketShare {
    index: usize,
    energy: i64,
    overlap: (DateTime<Utc>, DateTime<Utc>),
    interpolated: bool,
}

fn segment_shares(
    segment: &CounterSegment,
    buckets: &[ClosedInterval],
) -> Result<Vec<BucketShare>, MeterEpochError> {
    let duration = elapsed_nanos(segment.start.observed_at, segment.end.observed_at)?;
    let mut overlapped = Vec::new();
    for (index, bucket) in buckets.iter().enumerate() {
        let Some(overlap) = intersection(
            segment.start.observed_at,
            segment.end.observed_at,
            bucket.start,
            bucket.end,
        ) else {
            continue;
        };
        let nanos = elapsed_nanos(overlap.0, overlap.1)?;
        let interpolated =
            overlap.0 != segment.start.observed_at || overlap.1 != segment.end.observed_at;
        overlapped.push((index, overlap, nanos, interpolated));
    }
    if overlapped.is_empty() {
        return Ok(Vec::new());
    }
    overlapped.sort_by(|left, right| {
        left.1
            .0
            .cmp(&right.1.0)
            .then(left.1.1.cmp(&right.1.1))
            .then(left.0.cmp(&right.0))
    });

    let union = union_nanos(
        &overlapped
            .iter()
            .map(|(_, overlap, _, _)| *overlap)
            .collect::<Vec<_>>(),
    )?;
    let delta = i128::from(segment.measured);
    let mut floors = Vec::with_capacity(overlapped.len());
    let mut floor_sum = 0i128;
    for (_, _, nanos, _) in &overlapped {
        let share = mul_div(delta, *nanos, duration)?;
        floor_sum += share;
        floors.push(share);
    }
    let target = mul_div(delta, union, duration)?;
    if floor_sum > target {
        let weight_sum: i128 = overlapped.iter().map(|(_, _, nanos, _)| *nanos).sum();
        let mut consumed = 0i128;
        for (index, (_, _, nanos, _)) in overlapped.iter().enumerate() {
            let share = if index + 1 == overlapped.len() {
                target - consumed
            } else {
                let share = mul_div(target, *nanos, weight_sum)?;
                consumed += share;
                share
            };
            floors[index] = share;
        }
    } else if let Some(last) = floors.last_mut() {
        *last += target - floor_sum;
    }

    overlapped
        .into_iter()
        .zip(floors)
        .map(|((index, overlap, _, interpolated), energy)| {
            let energy = i64::try_from(energy).map_err(|_| MeterEpochError::Overflow)?;
            if energy < 0 {
                return Err(MeterEpochError::Overflow);
            }
            Ok(BucketShare {
                index,
                energy,
                overlap,
                interpolated,
            })
        })
        .collect()
}

fn allocate_rollups(
    capability_id: Uuid,
    segments: &[CounterSegment],
    buckets: &[ClosedInterval],
) -> Result<Vec<EnergyCounterRollup>, MeterEpochError> {
    struct Accumulator {
        measured: i128,
        interpolated: bool,
        segments: Vec<CounterSegment>,
        covered: Vec<(DateTime<Utc>, DateTime<Utc>)>,
        first: ObservationEndpoint,
        last: ObservationEndpoint,
    }

    let mut accumulators = (0..buckets.len()).map(|_| None).collect::<Vec<_>>();
    for segment in segments {
        for share in segment_shares(segment, buckets)? {
            let accumulator = accumulators[share.index].get_or_insert_with(|| Accumulator {
                measured: 0,
                interpolated: false,
                segments: Vec::new(),
                covered: Vec::new(),
                first: segment.start,
                last: segment.end,
            });
            accumulator.measured = accumulator
                .measured
                .checked_add(i128::from(share.energy))
                .ok_or(MeterEpochError::Overflow)?;
            accumulator.interpolated |= share.interpolated;
            accumulator.segments.push(*segment);
            accumulator.covered.push(share.overlap);
            if segment.start.observed_at < accumulator.first.observed_at {
                accumulator.first = segment.start;
            }
            if segment.end.observed_at >= accumulator.last.observed_at {
                accumulator.last = segment.end;
            }
        }
    }

    let mut rollups = Vec::new();
    for (index, accumulator) in accumulators.into_iter().enumerate() {
        let Some(accumulator) = accumulator else {
            continue;
        };
        let (coverage_numerator, coverage_denominator) =
            coverage_fraction(&accumulator.covered, buckets[index])?;
        rollups.push(EnergyCounterRollup {
            capability_id,
            bucket: buckets[index],
            first: accumulator.first,
            last: accumulator.last,
            measured_energy: i64::try_from(accumulator.measured)
                .map_err(|_| MeterEpochError::Overflow)?,
            coverage_numerator,
            coverage_denominator,
            allocation: if accumulator.interpolated {
                BoundaryAllocation::Interpolated
            } else {
                BoundaryAllocation::Exact
            },
            provenance: EnergyProvenance::MeasuredFromCounter,
            segments: accumulator.segments,
        });
    }
    Ok(rollups)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ts(secs: i64) -> DateTime<Utc> {
        DateTime::from_timestamp(secs, 0).expect("timestamp")
    }

    fn interval(start: i64, end: i64) -> ClosedInterval {
        ClosedInterval {
            start: ts(start),
            end: ts(end),
        }
    }

    fn obs(secs: i64, value: i64) -> CounterObservation {
        CounterObservation {
            observed_at: ts(secs),
            value,
            reset: false,
            identity_changed: false,
        }
    }

    fn query(resolution: i64, observations: Vec<CounterObservation>) -> MeasuredEnergyQuery {
        MeasuredEnergyQuery {
            capability_id: Uuid::nil(),
            resolution,
            observations,
            history_gaps: Vec::new(),
            unavailable: Vec::new(),
            uncertain_identity: Vec::new(),
            state_epoch_changes: Vec::new(),
        }
    }

    #[test]
    fn decrease_larger_than_resolution_starts_meter_epoch() {
        let mut input = query(5, vec![obs(0, 100), obs(10, 90), obs(20, 104)]);
        input.capability_id = Uuid::from_u128(7);
        let measured = measure_energy(&input, &[interval(0, 30)]).unwrap();

        assert_eq!(measured.epochs.len(), 2);
        assert_eq!(measured.epochs[0].reason, MeterEpochReason::Initial);
        assert_eq!(measured.epochs[0].started_at, ts(0));
        assert_eq!(measured.epochs[0].ended_at, Some(ts(10)));
        assert_eq!(measured.epochs[0].capability_id, input.capability_id);
        assert_eq!(measured.epochs[1].reason, MeterEpochReason::CounterDecrease);
        assert_eq!(measured.epochs[1].started_at, ts(10));
        assert_eq!(measured.epochs[1].ended_at, None);
        assert!(
            measured
                .segments
                .iter()
                .all(|segment| segment.measured >= 0)
        );
        assert!(
            measured
                .segments
                .iter()
                .all(|segment| segment.start.observed_at >= ts(10))
        );
        let energy: i64 = measured.rollups.iter().map(|row| row.measured_energy).sum();
        assert_eq!(energy, 14);
    }

    #[test]
    fn decrease_equal_to_resolution_is_noise() {
        let measured = measure_energy(
            &query(5, vec![obs(0, 100), obs(10, 95)]),
            &[interval(0, 10)],
        )
        .unwrap();
        assert_eq!(measured.epochs.len(), 1);
        assert_eq!(measured.epochs[0].reason, MeterEpochReason::Initial);
        assert_eq!(measured.segments.len(), 1);
        assert_eq!(measured.segments[0].measured, 0);
        assert_eq!(measured.rollups[0].measured_energy, 0);
    }

    #[test]
    fn smaller_backward_movement_is_noise_without_a_negative_delta() {
        let measured = measure_energy(
            &query(5, vec![obs(0, 100), obs(10, 98), obs(20, 110)]),
            &[interval(0, 20)],
        )
        .unwrap();
        assert_eq!(measured.epochs.len(), 1);
        assert!(
            measured
                .segments
                .iter()
                .all(|segment| segment.measured >= 0)
        );
        assert_eq!(
            measured
                .segments
                .iter()
                .map(|segment| segment.measured)
                .collect::<Vec<_>>(),
            vec![0, 12]
        );
        assert_eq!(measured.rollups[0].measured_energy, 12);
    }

    #[test]
    fn adapter_reset_starts_meter_epoch() {
        let mut reset = obs(20, 3);
        reset.reset = true;
        let measured = measure_energy(
            &query(1, vec![obs(0, 0), obs(10, 20), reset, obs(30, 8)]),
            &[interval(0, 40)],
        )
        .unwrap();
        assert_eq!(measured.epochs.len(), 2);
        assert_eq!(measured.epochs[1].reason, MeterEpochReason::AdapterReset);
        assert_eq!(measured.epochs[1].started_at, ts(20));
        assert_eq!(measured.epochs[0].ended_at, Some(ts(20)));
        let energy: i64 = measured
            .segments
            .iter()
            .map(|segment| segment.measured)
            .sum();
        assert_eq!(energy, 25);
        assert!(measured.segments.iter().all(|segment| {
            segment.end.observed_at <= ts(10) || segment.start.observed_at >= ts(20)
        }));
    }

    #[test]
    fn identity_change_starts_meter_epoch() {
        let mut changed = obs(10, 1);
        changed.identity_changed = true;
        let measured = measure_energy(
            &query(1, vec![obs(0, 40), changed, obs(20, 6)]),
            &[interval(0, 20)],
        )
        .unwrap();
        assert_eq!(measured.epochs.len(), 2);
        assert_eq!(measured.epochs[1].reason, MeterEpochReason::IdentityChange);
        assert_eq!(measured.epochs[1].started_at, ts(10));
        let energy: i64 = measured
            .segments
            .iter()
            .map(|segment| segment.measured)
            .sum();
        assert_eq!(energy, 5);
    }

    #[test]
    fn a_new_capability_series_starts_its_own_first_epoch() {
        let mut first = query(1, vec![obs(0, 10), obs(5, 14)]);
        first.capability_id = Uuid::from_u128(1);
        let mut second = query(1, vec![obs(5, 0), obs(9, 4)]);
        second.capability_id = Uuid::from_u128(2);

        let first = measure_energy(&first, &[interval(0, 5)]).unwrap();
        let second = measure_energy(&second, &[interval(5, 9)]).unwrap();

        assert_eq!(first.epochs.len(), 1);
        assert_eq!(first.epochs[0].reason, MeterEpochReason::Initial);
        assert_eq!(first.epochs[0].capability_id, Uuid::from_u128(1));
        assert_eq!(first.rollups[0].measured_energy, 4);
        assert_eq!(second.epochs.len(), 1);
        assert_eq!(second.epochs[0].reason, MeterEpochReason::Initial);
        assert_eq!(second.epochs[0].capability_id, Uuid::from_u128(2));
        assert_eq!(second.rollups[0].measured_energy, 4);
    }

    #[test]
    fn state_epoch_change_does_not_start_meter_epoch() {
        let mut input = query(1, vec![obs(0, 10), obs(100, 25)]);
        input.state_epoch_changes = vec![ts(40), ts(70)];
        let measured = measure_energy(&input, &[interval(0, 100)]).unwrap();
        assert_eq!(measured.epochs.len(), 1);
        assert_eq!(measured.epochs[0].reason, MeterEpochReason::Initial);
        assert_eq!(measured.rollups[0].measured_energy, 15);
        assert_eq!(measured.rollups[0].allocation, BoundaryAllocation::Exact);
    }

    #[test]
    fn history_gap_blocks_delta_without_starting_epoch() {
        let mut input = query(1, vec![obs(0, 10), obs(100, 40)]);
        input.history_gaps = vec![interval(40, 60)];
        let blocked = measure_energy(&input, &[interval(0, 100)]).unwrap();
        assert_eq!(blocked.epochs.len(), 1);
        assert!(blocked.segments.is_empty());
        assert!(blocked.rollups.is_empty());

        let mut clear = query(1, vec![obs(0, 10), obs(30, 20)]);
        clear.history_gaps = vec![interval(40, 50)];
        let open = measure_energy(&clear, &[interval(0, 30)]).unwrap();
        assert_eq!(open.rollups[0].measured_energy, 10);
    }

    #[test]
    fn unavailable_interval_blocks_delta() {
        let mut input = query(1, vec![obs(0, 5), obs(50, 9)]);
        input.unavailable = vec![interval(10, 20)];
        let measured = measure_energy(&input, &[interval(0, 50)]).unwrap();
        assert_eq!(measured.epochs.len(), 1);
        assert!(measured.rollups.is_empty());
    }

    #[test]
    fn uncertain_identity_blocks_delta() {
        let mut input = query(1, vec![obs(0, 5), obs(50, 9)]);
        input.uncertain_identity = vec![interval(10, 12)];
        let measured = measure_energy(&input, &[interval(0, 50)]).unwrap();
        assert_eq!(measured.epochs.len(), 1);
        assert!(measured.segments.is_empty());
    }

    #[test]
    fn sparse_reporting_produces_a_valid_delta() {
        let measured = measure_energy(
            &query(1, vec![obs(0, 100), obs(3_600, 140)]),
            &[interval(0, 3_600)],
        )
        .unwrap();
        assert_eq!(measured.epochs.len(), 1);
        assert_eq!(measured.rollups.len(), 1);
        assert_eq!(measured.rollups[0].measured_energy, 40);
        assert_eq!(
            measured.rollups[0].provenance,
            EnergyProvenance::MeasuredFromCounter
        );
        assert_eq!(measured.rollups[0].allocation, BoundaryAllocation::Exact);
        assert_eq!(
            measured.rollups[0].first,
            ObservationEndpoint {
                observed_at: ts(0),
                value: 100,
            }
        );
        assert_eq!(
            measured.rollups[0].last,
            ObservationEndpoint {
                observed_at: ts(3_600),
                value: 140,
            }
        );
    }

    #[test]
    fn proportional_split_sums_to_the_delta_and_puts_leftover_on_the_last_bucket() {
        let buckets = [interval(0, 10), interval(10, 20), interval(20, 30)];
        let measured = measure_energy(&query(1, vec![obs(0, 0), obs(30, 10)]), &buckets).unwrap();
        let shares: Vec<i64> = measured
            .rollups
            .iter()
            .map(|row| row.measured_energy)
            .collect();
        assert_eq!(shares, vec![3, 3, 4]);
        assert_eq!(shares.iter().sum::<i64>(), 10);
        assert!(measured.rollups.iter().all(|row| {
            row.allocation == BoundaryAllocation::Interpolated
                && row.provenance == EnergyProvenance::MeasuredFromCounter
                && row.first.value == 0
                && row.last.value == 10
        }));
    }

    #[test]
    fn partial_bucket_receives_only_its_overlapped_share() {
        let measured =
            measure_energy(&query(1, vec![obs(0, 0), obs(10, 10)]), &[interval(0, 5)]).unwrap();
        assert_eq!(measured.rollups.len(), 1);
        assert_eq!(measured.rollups[0].measured_energy, 5);
        assert_eq!(
            measured.rollups[0].allocation,
            BoundaryAllocation::Interpolated
        );
    }

    #[test]
    fn recomputation_from_preserved_endpoints_matches() {
        let buckets = [interval(0, 10), interval(10, 20), interval(20, 30)];
        let input = query(1, vec![obs(0, 0), obs(30, 10)]);
        let measured = measure_energy(&input, &buckets).unwrap();
        let replay = recompute_from_endpoints(
            input.capability_id,
            input.resolution,
            &measured.segments,
            &buckets,
        )
        .unwrap();
        assert_eq!(replay, measured.rollups);
        assert_eq!(
            replay.iter().map(|row| row.measured_energy).sum::<i64>(),
            10
        );
    }

    #[test]
    fn coverage_is_the_union_of_valid_segments_over_bucket_duration() {
        let measured = measure_energy(
            &query(1, vec![obs(0, 0), obs(40, 10), obs(90, 16)]),
            &[interval(0, 100)],
        )
        .unwrap();
        assert_eq!(measured.rollups.len(), 1);
        assert_eq!(measured.rollups[0].measured_energy, 16);
        assert_eq!(measured.rollups[0].coverage_numerator, 90_000_000_000);
        assert_eq!(measured.rollups[0].coverage_denominator, 100_000_000_000);
        assert_eq!(measured.rollups[0].allocation, BoundaryAllocation::Exact);
    }

    #[test]
    fn coverage_does_not_double_count_overlapping_time() {
        let (numerator, denominator) =
            coverage_fraction(&[(ts(0), ts(60)), (ts(40), ts(90))], interval(0, 100)).unwrap();
        assert_eq!(numerator, 90_000_000_000);
        assert_eq!(denominator, 100_000_000_000);
    }

    #[test]
    fn touching_a_gap_endpoint_does_not_block_the_delta() {
        let mut input = query(1, vec![obs(0, 1), obs(10, 4)]);
        input.history_gaps = vec![interval(10, 20)];
        let measured = measure_energy(&input, &[interval(0, 10)]).unwrap();
        assert_eq!(measured.rollups[0].measured_energy, 3);
    }

    #[test]
    fn overflow_and_invalid_resolution_are_rejected() {
        let overflow = measure_energy(
            &query(1, vec![obs(0, i64::MIN), obs(10, i64::MAX)]),
            &[interval(0, 10)],
        );
        assert_eq!(overflow, Err(MeterEpochError::Overflow));

        let resolution = measure_energy(&query(-1, vec![obs(0, 0), obs(1, 1)]), &[interval(0, 1)]);
        assert_eq!(resolution, Err(MeterEpochError::InvalidResolution));

        let unordered = measure_energy(&query(1, vec![obs(5, 0), obs(5, 1)]), &[interval(0, 5)]);
        assert_eq!(unordered, Err(MeterEpochError::UnorderedObservations));
    }

    #[test]
    fn rollup_upsert_is_idempotent_on_capability_and_bucket_start() {
        let sql = energy_counter_rollup_upsert_sql();
        assert!(sql.contains("INSERT INTO energy_counter_rollups"));
        assert!(sql.contains("ON CONFLICT (capability_id, bucket_start)"));
        assert!(sql.contains("measured_energy = EXCLUDED.measured_energy"));
        assert!(!sql.to_lowercase().contains("jsonb"));

        let epochs = meter_epoch_upsert_sql();
        assert!(epochs.contains("INSERT INTO meter_epochs"));
        assert!(epochs.contains("ON CONFLICT (capability_id, started_at)"));
        assert!(!epochs.to_lowercase().contains("jsonb"));
    }

    #[test]
    fn meter_tables_are_relational_without_jsonb() {
        let migration = include_str!("../../migrations/2026-10-19-000003-0000_meter_epochs/up.sql");
        assert!(migration.contains("CREATE TABLE meter_epochs"));
        assert!(migration.contains("CREATE TABLE energy_counter_rollups"));
        assert!(migration.contains("REFERENCES capability_identities"));
        assert!(migration.contains("'measured_from_counter'"));
        assert!(migration.contains("'counter_decrease'"));
        assert!(migration.contains("'adapter_reset'"));
        assert!(migration.contains("'identity_change'"));
        assert!(migration.contains("'exact'"));
        assert!(migration.contains("'interpolated'"));
        assert!(!migration.to_lowercase().contains("jsonb"));

        let schema = include_str!("../db/schema.rs");
        assert!(schema.contains("meter_epochs (id)"));
        assert!(schema.contains("energy_counter_rollups (id)"));
        assert!(schema.contains("meter_epochs -> capability_identities"));
        assert!(schema.contains("energy_counter_rollups -> capability_identities"));
        assert_eq!(MeterEpochReason::Initial.as_str(), "initial");
        assert_eq!(
            MeterEpochReason::CounterDecrease.as_str(),
            "counter_decrease"
        );
        assert_eq!(MeterEpochReason::AdapterReset.as_str(), "adapter_reset");
        assert_eq!(MeterEpochReason::IdentityChange.as_str(), "identity_change");
        assert_eq!(BoundaryAllocation::Exact.as_str(), "exact");
        assert_eq!(BoundaryAllocation::Interpolated.as_str(), "interpolated");
        assert_eq!(
            EnergyProvenance::MeasuredFromCounter.as_str(),
            "measured_from_counter"
        );
    }
}
