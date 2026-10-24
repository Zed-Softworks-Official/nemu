//! Downstream contributor rankings for one Home History result.
//!
//! The calculation is pure and is not stored. Percentages and Unattributed are
//! returned only when aligned History proves them. Rankings stay signed and
//! separate so generation does not cancel consumption.

use chrono::{DateTime, Utc};
use serde::Serialize;
use uuid::Uuid;

use super::{CapabilityAccuracy, ConstraintRevision};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BreakdownQuantity {
    InstantaneousPower,
    ImportedEnergy,
    ExportedEnergy,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SeriesProvenance {
    Measured,
    Estimated,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BreakdownScope {
    pub device_key: String,
    /// Empty for a Device meter. A non-empty path is that Device's Component.
    pub component_path: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct MeterAccuracy {
    pub absolute_error: i64,
    pub relative_error_ppm: u32,
    pub resolution: i64,
    pub scale: u8,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AlignedBucket {
    pub start: DateTime<Utc>,
    pub end: DateTime<Utc>,
    /// Unknown stays absent. Callers must not substitute zero.
    pub value: Option<i64>,
    pub scale: u8,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BreakdownMeter {
    pub capability_id: Uuid,
    pub label: String,
    pub scope: BreakdownScope,
    pub quantity: BreakdownQuantity,
    pub provenance: SeriesProvenance,
    pub covered_ns: i64,
    pub elapsed_ns: i64,
    pub history_gaps: bool,
    pub accuracy: Option<MeterAccuracy>,
    pub buckets: Vec<AlignedBucket>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum HomeMeterScope {
    Home,
    Device {
        device_key: String,
    },
    Component {
        device_key: String,
        component_path: Vec<String>,
    },
}

/// Device keys a tested adapter profile has proved are disjoint.
/// Beta does not accept an Owner-authored topology in place of this profile.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DisjointDeviceProfile {
    pub device_keys: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BreakdownInput {
    pub quantity: BreakdownQuantity,
    pub home_scope: HomeMeterScope,
    pub designation_boundary: bool,
    /// Every Home-meter Capability that supplied the denominator.
    pub home_capability_ids: Vec<Uuid>,
    pub home: BreakdownMeter,
    pub contributors: Vec<BreakdownMeter>,
    pub disjoint_devices: Option<DisjointDeviceProfile>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum BreakdownStatus {
    RankingsOnly,
    Attributed,
    WithinMeterTolerance,
    Inconsistent,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RankedContributor {
    pub capability_id: Uuid,
    pub label: String,
    pub rank: Option<u32>,
    pub value: Option<i64>,
    pub scale: u8,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub percentage_basis_points: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UnattributedShare {
    pub value: i64,
    pub scale: u8,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub percentage_basis_points: Option<i64>,
    pub within_meter_tolerance: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContributorBreakdown {
    pub consuming: Vec<RankedContributor>,
    pub producing: Vec<RankedContributor>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub unattributed: Option<UnattributedShare>,
    pub status: BreakdownStatus,
}

pub fn device_key(protocol: &str, external_id: &str) -> String {
    format!("{protocol}\u{1}{external_id}")
}

/// Accuracy from every constraint revision that overlaps the window.
/// One revision without accuracy makes the meter unusable for percentages.
pub fn accuracy_for_window(
    revisions: &[ConstraintRevision],
    start: DateTime<Utc>,
    end: DateTime<Utc>,
) -> Option<MeterAccuracy> {
    if end <= start || revisions.is_empty() {
        return None;
    }
    let mut ordered = revisions.to_vec();
    ordered.sort_by_key(|revision| revision.effective_at);
    let mut parts = Vec::new();
    for (index, revision) in ordered.iter().enumerate() {
        let next = ordered.get(index + 1).map(|revision| revision.effective_at);
        let overlaps = revision.effective_at < end && next.is_none_or(|next| next > start);
        if !overlaps {
            continue;
        }
        parts.push(accuracy_from_revision(revision)?);
    }
    conservative_accuracy(&parts)
}

/// The largest absolute error, relative error, and resolution among meters
/// that must share one tolerance. Scales are normalized upward.
pub fn conservative_accuracy(parts: &[MeterAccuracy]) -> Option<MeterAccuracy> {
    if parts.is_empty() {
        return None;
    }
    let scale = parts.iter().map(|part| part.scale).max().unwrap_or(0);
    let mut absolute = 0i64;
    let mut relative = 0u32;
    let mut resolution = 0i64;
    for part in parts {
        let abs = fit_i64(to_scale(
            i128::from(part.absolute_error),
            part.scale,
            scale,
        )?)?;
        let res = fit_i64(to_scale(i128::from(part.resolution), part.scale, scale)?)?;
        absolute = absolute.max(abs);
        relative = relative.max(part.relative_error_ppm);
        resolution = resolution.max(res);
    }
    Some(MeterAccuracy {
        absolute_error: absolute,
        relative_error_ppm: relative,
        resolution,
        scale,
    })
}

pub fn calculate_contributor_breakdown(input: &BreakdownInput) -> ContributorBreakdown {
    let selected = select_contributors(input);
    let additive = selected.additive && input.quantity != BreakdownQuantity::InstantaneousPower;
    let proved =
        additive && !input.designation_boundary && shares_are_proved(&input.home, &selected.meters);
    if !proved {
        return rankings_only(&selected.meters, input.quantity);
    }
    attribute(&input.home, &selected.meters, input.quantity)
}

struct Selection {
    meters: Vec<BreakdownMeter>,
    additive: bool,
}

fn select_contributors(input: &BreakdownInput) -> Selection {
    let candidates = input
        .contributors
        .iter()
        .filter(|meter| {
            meter.capability_id != input.home.capability_id
                && meter.quantity == input.quantity
                && is_downstream(&input.home_scope, &meter.scope)
        })
        .cloned()
        .collect();
    choose_set(prefer_measured(candidates), input.disjoint_devices.as_ref())
}

fn is_downstream(home: &HomeMeterScope, scope: &BreakdownScope) -> bool {
    match home {
        HomeMeterScope::Home => true,
        HomeMeterScope::Device { device_key } => {
            scope.device_key == *device_key && !scope.component_path.is_empty()
        }
        HomeMeterScope::Component {
            device_key,
            component_path,
        } => {
            scope.device_key == *device_key
                && scope.component_path.starts_with(component_path)
                && scope.component_path.len() > component_path.len()
        }
    }
}

fn prefer_measured(meters: Vec<BreakdownMeter>) -> Vec<BreakdownMeter> {
    use std::collections::BTreeMap;
    let mut groups: BTreeMap<(String, Vec<String>), Vec<BreakdownMeter>> = BTreeMap::new();
    for meter in meters {
        groups
            .entry((
                meter.scope.device_key.clone(),
                meter.scope.component_path.clone(),
            ))
            .or_default()
            .push(meter);
    }
    let mut kept = Vec::new();
    for (_, group) in groups {
        let has_measured = group
            .iter()
            .any(|meter| meter.provenance == SeriesProvenance::Measured);
        if has_measured {
            kept.extend(
                group
                    .into_iter()
                    .filter(|meter| meter.provenance == SeriesProvenance::Measured),
            );
        } else {
            kept.extend(group);
        }
    }
    kept
}

fn choose_set(meters: Vec<BreakdownMeter>, profile: Option<&DisjointDeviceProfile>) -> Selection {
    use std::collections::BTreeMap;
    let mut by_device: BTreeMap<String, Vec<BreakdownMeter>> = BTreeMap::new();
    for meter in meters {
        by_device
            .entry(meter.scope.device_key.clone())
            .or_default()
            .push(meter);
    }
    let mut selected = Vec::new();
    let mut internally_additive = true;
    for (_, group) in by_device {
        let chosen = choose_device_set(group);
        if chosen
            .iter()
            .filter(|meter| meter.scope.component_path.is_empty())
            .count()
            > 1
        {
            internally_additive = false;
        }
        selected.extend(chosen);
    }
    let mut devices = Vec::new();
    for meter in &selected {
        if !devices.contains(&meter.scope.device_key) {
            devices.push(meter.scope.device_key.clone());
        }
    }
    let cross_device_ok = devices.len() <= 1
        || profile.is_some_and(|profile| {
            devices
                .iter()
                .all(|key| profile.device_keys.iter().any(|proved| proved == key))
        });
    Selection {
        meters: selected,
        additive: internally_additive && cross_device_ok,
    }
}

fn choose_device_set(group: Vec<BreakdownMeter>) -> Vec<BreakdownMeter> {
    let measured_parents: Vec<_> = group
        .iter()
        .filter(|meter| {
            meter.scope.component_path.is_empty() && meter.provenance == SeriesProvenance::Measured
        })
        .cloned()
        .collect();
    if !measured_parents.is_empty() {
        return measured_parents;
    }
    let measured_children: Vec<_> = group
        .iter()
        .filter(|meter| {
            !meter.scope.component_path.is_empty() && meter.provenance == SeriesProvenance::Measured
        })
        .cloned()
        .collect();
    if !measured_children.is_empty() {
        return measured_children;
    }
    let estimated_parents: Vec<_> = group
        .iter()
        .filter(|meter| meter.scope.component_path.is_empty())
        .cloned()
        .collect();
    if !estimated_parents.is_empty() {
        return estimated_parents;
    }
    group
        .into_iter()
        .filter(|meter| !meter.scope.component_path.is_empty())
        .collect()
}

fn rankings_only(meters: &[BreakdownMeter], quantity: BreakdownQuantity) -> ContributorBreakdown {
    let (consuming, producing) = rank_sides(meters, quantity, None, 0);
    ContributorBreakdown {
        consuming,
        producing,
        unattributed: None,
        status: BreakdownStatus::RankingsOnly,
    }
}

fn shares_are_proved(home: &BreakdownMeter, selected: &[BreakdownMeter]) -> bool {
    let mut participants = Vec::with_capacity(selected.len() + 1);
    participants.push(home);
    participants.extend(selected);
    if participants
        .iter()
        .any(|meter| meter.history_gaps || !coverage_allows_share(meter) || !accuracy_usable(meter))
    {
        return false;
    }
    if selected
        .iter()
        .any(|meter| !same_buckets(&home.buckets, &meter.buckets))
    {
        return false;
    }
    display_total(known_total(home)).is_some()
        && selected
            .iter()
            .all(|meter| display_total(known_total(meter)).is_some())
}

fn coverage_allows_share(meter: &BreakdownMeter) -> bool {
    if meter.provenance != SeriesProvenance::Estimated {
        return true;
    }
    if meter.elapsed_ns <= 0 {
        return false;
    }
    i128::from(meter.covered_ns) * 100 >= i128::from(meter.elapsed_ns) * 95
}

fn accuracy_usable(meter: &BreakdownMeter) -> bool {
    meter.accuracy.as_ref().is_some_and(|accuracy| {
        accuracy.resolution > 0
            && accuracy.absolute_error >= 0
            && accuracy.relative_error_ppm <= 1_000_000
    })
}

fn same_buckets(left: &[AlignedBucket], right: &[AlignedBucket]) -> bool {
    left.len() == right.len()
        && left
            .iter()
            .zip(right)
            .all(|(left, right)| left.start == right.start && left.end == right.end)
}

fn attribute(
    home: &BreakdownMeter,
    selected: &[BreakdownMeter],
    quantity: BreakdownQuantity,
) -> ContributorBreakdown {
    let Some((home_value, home_scale)) = display_total(known_total(home)) else {
        return rankings_only(selected, quantity);
    };
    let home_accuracy = match &home.accuracy {
        Some(accuracy) => accuracy,
        None => return rankings_only(selected, quantity),
    };
    let summed = summed_side(quantity);
    let mut target = home_scale.max(home_accuracy.scale);
    for meter in selected {
        if let Some((_, scale)) = display_total(known_total(meter)) {
            target = target.max(scale);
        }
        if let Some(accuracy) = &meter.accuracy {
            target = target.max(accuracy.scale);
        }
    }
    let Some(home_units) = to_scale(i128::from(home_value), home_scale, target) else {
        return rankings_only(selected, quantity);
    };
    if home_units < 0 {
        return rankings_only(selected, quantity);
    }
    let mut contributor_units = 0i128;
    let mut tolerance =
        match result_bound(i128::from(home_value), home_scale, home_accuracy, target) {
            Some(bound) => bound,
            None => return rankings_only(selected, quantity),
        };
    for meter in selected {
        let Some((value, scale)) = display_total(known_total(meter)) else {
            return rankings_only(selected, quantity);
        };
        let Some(accuracy) = meter.accuracy.as_ref() else {
            return rankings_only(selected, quantity);
        };
        let Some(bound) = result_bound(i128::from(value), scale, accuracy, target) else {
            return rankings_only(selected, quantity);
        };
        tolerance = tolerance.saturating_add(bound);
        if side_for(quantity, Some(i128::from(value))) == Some(summed) {
            let Some(units) = to_scale(i128::from(value), scale, target) else {
                return rankings_only(selected, quantity);
            };
            contributor_units = contributor_units.saturating_add(units);
        }
    }
    let excess = contributor_units - home_units;
    let (status, unattributed_units, within) = if excess <= 0 {
        (
            BreakdownStatus::Attributed,
            home_units - contributor_units,
            false,
        )
    } else if excess <= tolerance {
        (BreakdownStatus::WithinMeterTolerance, 0, true)
    } else {
        (BreakdownStatus::Inconsistent, 0, false)
    };
    let percentage_home = (home_units > 0).then_some(home_units);
    let (consuming, producing) = rank_sides(selected, quantity, percentage_home, target);
    let unattributed = if status == BreakdownStatus::Inconsistent {
        None
    } else {
        let Some(value) = fit_i64(unattributed_units) else {
            return rankings_only(selected, quantity);
        };
        Some(UnattributedShare {
            value,
            scale: target,
            percentage_basis_points: percentage_home
                .and_then(|home_units| percentage_basis_points(unattributed_units, home_units)),
            within_meter_tolerance: within,
        })
    };
    ContributorBreakdown {
        consuming,
        producing,
        unattributed,
        status,
    }
}

fn result_bound(
    value: i128,
    value_scale: u8,
    accuracy: &MeterAccuracy,
    target: u8,
) -> Option<i128> {
    let magnitude = to_scale(value.abs(), value_scale, target)?;
    let absolute = to_scale(i128::from(accuracy.absolute_error), accuracy.scale, target)?;
    let resolution = to_scale(i128::from(accuracy.resolution), accuracy.scale, target)?;
    let half = div_ceil_pos(resolution, 2);
    let relative = div_ceil_pos(
        magnitude.saturating_mul(i128::from(accuracy.relative_error_ppm)),
        1_000_000,
    );
    Some(absolute.saturating_add(half).saturating_add(relative))
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Side {
    Consuming,
    Producing,
}

fn summed_side(quantity: BreakdownQuantity) -> Side {
    match quantity {
        BreakdownQuantity::ExportedEnergy => Side::Producing,
        BreakdownQuantity::ImportedEnergy | BreakdownQuantity::InstantaneousPower => {
            Side::Consuming
        }
    }
}

fn side_for(quantity: BreakdownQuantity, value: Option<i128>) -> Option<Side> {
    let Some(value) = value else {
        return match quantity {
            BreakdownQuantity::InstantaneousPower => None,
            BreakdownQuantity::ImportedEnergy => Some(Side::Consuming),
            BreakdownQuantity::ExportedEnergy => Some(Side::Producing),
        };
    };
    match quantity {
        BreakdownQuantity::InstantaneousPower => match value.cmp(&0) {
            std::cmp::Ordering::Greater => Some(Side::Consuming),
            std::cmp::Ordering::Less => Some(Side::Producing),
            std::cmp::Ordering::Equal => None,
        },
        BreakdownQuantity::ImportedEnergy => Some(if value < 0 {
            Side::Producing
        } else {
            Side::Consuming
        }),
        BreakdownQuantity::ExportedEnergy => Some(if value < 0 {
            Side::Consuming
        } else {
            Side::Producing
        }),
    }
}

struct Prepared {
    capability_id: Uuid,
    label: String,
    value: Option<i64>,
    scale: u8,
    units: Option<i128>,
}

fn rank_sides(
    meters: &[BreakdownMeter],
    quantity: BreakdownQuantity,
    percentage_home: Option<i128>,
    target: u8,
) -> (Vec<RankedContributor>, Vec<RankedContributor>) {
    let summed = summed_side(quantity);
    let mut consuming = Vec::new();
    let mut producing = Vec::new();
    for meter in meters {
        let displayed = display_total(known_total(meter));
        let side = side_for(quantity, displayed.map(|(value, _)| i128::from(value)));
        let prepared = Prepared {
            capability_id: meter.capability_id,
            label: meter.label.clone(),
            value: displayed.map(|(value, _)| value),
            scale: displayed.map(|(_, scale)| scale).unwrap_or(0),
            units: displayed.and_then(|(value, scale)| to_scale(i128::from(value), scale, target)),
        };
        match side {
            Some(Side::Consuming) => consuming.push(prepared),
            Some(Side::Producing) => producing.push(prepared),
            None => {}
        }
    }
    (
        finish_ranks(consuming, percentage_home, summed == Side::Consuming),
        finish_ranks(producing, percentage_home, summed == Side::Producing),
    )
}

fn finish_ranks(
    mut rows: Vec<Prepared>,
    percentage_home: Option<i128>,
    percentages: bool,
) -> Vec<RankedContributor> {
    rows.sort_by(|left, right| match (left.value, right.value) {
        (Some(left_value), Some(right_value)) => right_value
            .abs()
            .cmp(&left_value.abs())
            .then(left.capability_id.cmp(&right.capability_id)),
        (Some(_), None) => std::cmp::Ordering::Less,
        (None, Some(_)) => std::cmp::Ordering::Greater,
        (None, None) => left
            .label
            .cmp(&right.label)
            .then(left.capability_id.cmp(&right.capability_id)),
    });
    let mut rank = 0u32;
    rows.into_iter()
        .map(|row| {
            let rank = if row.value.is_some() {
                rank += 1;
                Some(rank)
            } else {
                None
            };
            RankedContributor {
                capability_id: row.capability_id,
                label: row.label,
                rank,
                value: row.value,
                scale: row.scale,
                percentage_basis_points: if percentages {
                    percentage_home.and_then(|home| {
                        row.units
                            .and_then(|units| percentage_basis_points(units, home))
                    })
                } else {
                    None
                },
            }
        })
        .collect()
}

fn known_total(meter: &BreakdownMeter) -> Option<(i128, u8)> {
    match meter.quantity {
        BreakdownQuantity::InstantaneousPower => {
            let last = meter.buckets.last()?;
            Some((i128::from(last.value?), last.scale))
        }
        BreakdownQuantity::ImportedEnergy | BreakdownQuantity::ExportedEnergy => {
            sum_buckets(&meter.buckets)
        }
    }
}

fn sum_buckets(buckets: &[AlignedBucket]) -> Option<(i128, u8)> {
    if buckets.is_empty() || buckets.iter().any(|bucket| bucket.value.is_none()) {
        return None;
    }
    let scale = buckets.iter().map(|bucket| bucket.scale).max().unwrap_or(0);
    let mut total = 0i128;
    for bucket in buckets {
        let value = i128::from(bucket.value?);
        total = total.checked_add(to_scale(value, bucket.scale, scale)?)?;
    }
    Some((total, scale))
}

fn display_total(total: Option<(i128, u8)>) -> Option<(i64, u8)> {
    let (value, scale) = total?;
    Some((fit_i64(value)?, scale))
}

fn percentage_basis_points(part: i128, whole: i128) -> Option<i64> {
    if whole == 0 {
        return None;
    }
    fit_i64(div_round_half_away(part.saturating_mul(10_000), whole)?)
}

fn accuracy_from_revision(revision: &ConstraintRevision) -> Option<MeterAccuracy> {
    if revision.resolution <= 0 {
        return None;
    }
    let (absolute_error, relative_error_ppm) = match revision.accuracy.as_ref()? {
        CapabilityAccuracy::Absolute { maximum_error } => (*maximum_error, 0),
        CapabilityAccuracy::Relative { maximum_error_ppm } => (0, *maximum_error_ppm),
        CapabilityAccuracy::AbsoluteAndRelative {
            absolute_maximum_error,
            relative_maximum_error_ppm,
        } => (*absolute_maximum_error, *relative_maximum_error_ppm),
    };
    Some(MeterAccuracy {
        absolute_error,
        relative_error_ppm,
        resolution: revision.resolution,
        scale: revision.scale,
    })
}

fn to_scale(value: i128, from: u8, to: u8) -> Option<i128> {
    if to < from {
        return None;
    }
    value.checked_mul(pow10(u32::from(to - from))?)
}

fn pow10(exp: u32) -> Option<i128> {
    let mut value = 1i128;
    for _ in 0..exp {
        value = value.checked_mul(10)?;
    }
    Some(value)
}

fn div_ceil_pos(numer: i128, denom: i128) -> i128 {
    if numer <= 0 || denom <= 0 {
        return 0;
    }
    (numer + denom - 1) / denom
}

fn div_round_half_away(numer: i128, denom: i128) -> Option<i128> {
    if denom == 0 {
        return None;
    }
    let negative = (numer < 0) ^ (denom < 0);
    let numer = numer.abs();
    let denom = denom.abs();
    let mut quotient = numer / denom;
    let remainder = numer % denom;
    if remainder * 2 >= denom {
        quotient += 1;
    }
    Some(if negative { -quotient } else { quotient })
}

fn fit_i64(value: i128) -> Option<i64> {
    i64::try_from(value).ok()
}

#[cfg(test)]
mod tests {
    use chrono::{TimeZone, Utc};

    use super::*;
    use crate::capabilities::{
        CapabilityAccuracy, ConstraintRevision, FixedPointBounds, HistoryAdmissionRate,
    };

    fn at(hour: u32) -> DateTime<Utc> {
        Utc.with_ymd_and_hms(2026, 10, 1, hour, 0, 0).unwrap()
    }

    fn buckets(values: &[Option<i64>]) -> Vec<AlignedBucket> {
        values
            .iter()
            .enumerate()
            .map(|(index, value)| AlignedBucket {
                start: at(index as u32),
                end: at(index as u32 + 1),
                value: *value,
                scale: 0,
            })
            .collect()
    }

    fn accuracy(absolute: i64, relative_ppm: u32, resolution: i64) -> MeterAccuracy {
        MeterAccuracy {
            absolute_error: absolute,
            relative_error_ppm: relative_ppm,
            resolution,
            scale: 0,
        }
    }

    fn meter(
        id: u128,
        device: &str,
        path: &[&str],
        quantity: BreakdownQuantity,
        provenance: SeriesProvenance,
        values: &[Option<i64>],
    ) -> BreakdownMeter {
        BreakdownMeter {
            capability_id: Uuid::from_u128(id),
            label: format!("meter-{id}"),
            scope: BreakdownScope {
                device_key: device.into(),
                component_path: path.iter().map(|segment| (*segment).to_string()).collect(),
            },
            quantity,
            provenance,
            covered_ns: 100,
            elapsed_ns: 100,
            history_gaps: false,
            accuracy: Some(accuracy(1, 0, 1)),
            buckets: buckets(values),
        }
    }

    fn input(home: BreakdownMeter, contributors: Vec<BreakdownMeter>) -> BreakdownInput {
        let home_capability_ids = vec![home.capability_id];
        BreakdownInput {
            quantity: home.quantity,
            home_scope: HomeMeterScope::Home,
            designation_boundary: false,
            home_capability_ids,
            home,
            contributors,
            disjoint_devices: None,
        }
    }

    fn ranked<'a>(rows: &'a [RankedContributor], id: u128) -> &'a RankedContributor {
        rows.iter()
            .find(|row| row.capability_id == Uuid::from_u128(id))
            .unwrap_or_else(|| panic!("missing contributor {id}"))
    }

    #[test]
    fn power_rankings_stay_signed_and_never_become_percentages() {
        let home = meter(
            1,
            "home",
            &[],
            BreakdownQuantity::InstantaneousPower,
            SeriesProvenance::Measured,
            &[Some(500)],
        );
        let load = meter(
            2,
            "load",
            &[],
            BreakdownQuantity::InstantaneousPower,
            SeriesProvenance::Measured,
            &[Some(700)],
        );
        let solar = meter(
            3,
            "solar",
            &[],
            BreakdownQuantity::InstantaneousPower,
            SeriesProvenance::Measured,
            &[Some(-200)],
        );
        let result = calculate_contributor_breakdown(&input(home, vec![load, solar]));

        assert_eq!(ranked(&result.consuming, 2).value, Some(700));
        assert_eq!(ranked(&result.producing, 3).value, Some(-200));
        assert_eq!(ranked(&result.consuming, 2).rank, Some(1));
        assert_eq!(ranked(&result.producing, 3).rank, Some(1));
        assert!(
            ranked(&result.consuming, 2)
                .percentage_basis_points
                .is_none()
        );
        assert!(result.unattributed.is_none());
        assert_eq!(result.status, BreakdownStatus::RankingsOnly);
        assert!(result.consuming.iter().all(|row| row.value != Some(500)));
    }

    #[test]
    fn imported_and_exported_energy_are_not_compared() {
        let home = meter(
            1,
            "home",
            &[],
            BreakdownQuantity::ImportedEnergy,
            SeriesProvenance::Measured,
            &[Some(100)],
        );
        let imported = meter(
            2,
            "oven",
            &["outlet"],
            BreakdownQuantity::ImportedEnergy,
            SeriesProvenance::Measured,
            &[Some(40)],
        );
        let exported = meter(
            3,
            "solar",
            &["inverter"],
            BreakdownQuantity::ExportedEnergy,
            SeriesProvenance::Measured,
            &[Some(40)],
        );
        let result = calculate_contributor_breakdown(&input(home, vec![imported, exported]));

        assert!(
            result
                .consuming
                .iter()
                .any(|row| row.capability_id == Uuid::from_u128(2))
        );
        assert!(
            result
                .consuming
                .iter()
                .all(|row| row.capability_id != Uuid::from_u128(3))
        );
        assert!(
            result
                .producing
                .iter()
                .all(|row| row.capability_id != Uuid::from_u128(3))
        );
        assert_eq!(
            ranked(&result.consuming, 2).percentage_basis_points,
            Some(4_000)
        );
        assert_eq!(
            result.unattributed.as_ref().map(|share| share.value),
            Some(60)
        );
    }

    #[test]
    fn negative_import_does_not_cancel_consumption() {
        let home = meter(
            1,
            "home",
            &[],
            BreakdownQuantity::ImportedEnergy,
            SeriesProvenance::Measured,
            &[Some(100)],
        );
        let load = meter(
            2,
            "oven",
            &["outlet"],
            BreakdownQuantity::ImportedEnergy,
            SeriesProvenance::Measured,
            &[Some(40)],
        );
        let mut backwards = meter(
            3,
            "oven",
            &["other"],
            BreakdownQuantity::ImportedEnergy,
            SeriesProvenance::Measured,
            &[Some(-20)],
        );
        backwards.label = "backwards".into();
        let result = calculate_contributor_breakdown(&input(home, vec![load, backwards]));

        assert_eq!(ranked(&result.consuming, 2).value, Some(40));
        assert_eq!(ranked(&result.producing, 3).value, Some(-20));
        assert_eq!(
            result.unattributed.as_ref().map(|share| share.value),
            Some(60)
        );
    }

    #[test]
    fn parent_device_meter_excludes_its_child_components() {
        let home = meter(
            1,
            "home",
            &[],
            BreakdownQuantity::ImportedEnergy,
            SeriesProvenance::Measured,
            &[Some(10)],
        );
        let parent = meter(
            2,
            "plug",
            &[],
            BreakdownQuantity::ImportedEnergy,
            SeriesProvenance::Measured,
            &[Some(10)],
        );
        let child = meter(
            3,
            "plug",
            &["outlet"],
            BreakdownQuantity::ImportedEnergy,
            SeriesProvenance::Measured,
            &[Some(10)],
        );
        let result = calculate_contributor_breakdown(&input(home, vec![parent, child]));

        assert_eq!(ranked(&result.consuming, 2).value, Some(10));
        assert!(
            result
                .consuming
                .iter()
                .all(|row| row.capability_id != Uuid::from_u128(3))
        );
        assert!(
            result
                .producing
                .iter()
                .all(|row| row.capability_id != Uuid::from_u128(3))
        );
        assert_eq!(result.status, BreakdownStatus::Attributed);
        assert_eq!(
            result.unattributed.as_ref().map(|share| share.value),
            Some(0)
        );
    }

    #[test]
    fn child_components_are_used_when_the_device_has_no_meter() {
        let home = meter(
            1,
            "home",
            &[],
            BreakdownQuantity::ImportedEnergy,
            SeriesProvenance::Measured,
            &[Some(10)],
        );
        let first = meter(
            2,
            "plug",
            &["outlet-a"],
            BreakdownQuantity::ImportedEnergy,
            SeriesProvenance::Measured,
            &[Some(6)],
        );
        let nested = meter(
            3,
            "plug",
            &["outlet-a", "plug"],
            BreakdownQuantity::ImportedEnergy,
            SeriesProvenance::Measured,
            &[Some(4)],
        );
        let result = calculate_contributor_breakdown(&input(home, vec![first, nested]));

        assert_eq!(
            ranked(&result.consuming, 2).percentage_basis_points,
            Some(6_000)
        );
        assert_eq!(
            ranked(&result.consuming, 3).percentage_basis_points,
            Some(4_000)
        );
        assert_eq!(
            result.unattributed.as_ref().map(|share| share.value),
            Some(0)
        );
    }

    #[test]
    fn measured_children_win_over_an_estimated_device_meter() {
        let home = meter(
            1,
            "home",
            &[],
            BreakdownQuantity::ImportedEnergy,
            SeriesProvenance::Measured,
            &[Some(10)],
        );
        let mut estimated_parent = meter(
            2,
            "plug",
            &[],
            BreakdownQuantity::ImportedEnergy,
            SeriesProvenance::Estimated,
            &[Some(10)],
        );
        estimated_parent.covered_ns = 100;
        let child = meter(
            3,
            "plug",
            &["outlet"],
            BreakdownQuantity::ImportedEnergy,
            SeriesProvenance::Measured,
            &[Some(4)],
        );
        let result = calculate_contributor_breakdown(&input(home, vec![estimated_parent, child]));

        assert!(
            result
                .consuming
                .iter()
                .all(|row| row.capability_id != Uuid::from_u128(2))
        );
        assert_eq!(ranked(&result.consuming, 3).value, Some(4));
        assert_eq!(
            result.unattributed.as_ref().map(|share| share.value),
            Some(6)
        );
    }

    #[test]
    fn cross_device_meters_stay_rankings_without_a_disjoint_profile() {
        let home = meter(
            1,
            "home",
            &[],
            BreakdownQuantity::ImportedEnergy,
            SeriesProvenance::Measured,
            &[Some(100)],
        );
        let oven = meter(
            2,
            "oven",
            &[],
            BreakdownQuantity::ImportedEnergy,
            SeriesProvenance::Measured,
            &[Some(40)],
        );
        let kettle = meter(
            3,
            "kettle",
            &[],
            BreakdownQuantity::ImportedEnergy,
            SeriesProvenance::Measured,
            &[Some(25)],
        );
        let result = calculate_contributor_breakdown(&input(home, vec![oven, kettle]));

        assert_eq!(ranked(&result.consuming, 2).value, Some(40));
        assert_eq!(ranked(&result.consuming, 3).value, Some(25));
        assert!(
            ranked(&result.consuming, 2)
                .percentage_basis_points
                .is_none()
        );
        assert!(result.unattributed.is_none());
        assert_eq!(result.status, BreakdownStatus::RankingsOnly);
    }

    #[test]
    fn a_tested_profile_may_add_only_the_devices_it_proves_disjoint() {
        let home = meter(
            1,
            "home",
            &[],
            BreakdownQuantity::ImportedEnergy,
            SeriesProvenance::Measured,
            &[Some(100)],
        );
        let oven = meter(
            2,
            "oven",
            &[],
            BreakdownQuantity::ImportedEnergy,
            SeriesProvenance::Measured,
            &[Some(40)],
        );
        let kettle = meter(
            3,
            "kettle",
            &[],
            BreakdownQuantity::ImportedEnergy,
            SeriesProvenance::Measured,
            &[Some(25)],
        );
        let mut proved = input(home.clone(), vec![oven.clone(), kettle.clone()]);
        proved.disjoint_devices = Some(DisjointDeviceProfile {
            device_keys: vec!["oven".into(), "kettle".into(), "spare".into()],
        });
        let proved = calculate_contributor_breakdown(&proved);
        assert_eq!(
            ranked(&proved.consuming, 2).percentage_basis_points,
            Some(4_000)
        );
        assert_eq!(
            ranked(&proved.consuming, 3).percentage_basis_points,
            Some(2_500)
        );
        assert_eq!(
            proved.unattributed.as_ref().map(|share| share.value),
            Some(35)
        );

        let mut partial = input(home, vec![oven, kettle]);
        partial.disjoint_devices = Some(DisjointDeviceProfile {
            device_keys: vec!["oven".into()],
        });
        let partial = calculate_contributor_breakdown(&partial);
        assert!(partial.unattributed.is_none());
        assert!(
            ranked(&partial.consuming, 2)
                .percentage_basis_points
                .is_none()
        );
        assert_eq!(partial.status, BreakdownStatus::RankingsOnly);
    }

    #[test]
    fn duplicate_device_meters_are_ranked_and_not_added() {
        let home = meter(
            1,
            "home",
            &[],
            BreakdownQuantity::ImportedEnergy,
            SeriesProvenance::Measured,
            &[Some(10)],
        );
        let first = meter(
            2,
            "plug",
            &[],
            BreakdownQuantity::ImportedEnergy,
            SeriesProvenance::Measured,
            &[Some(6)],
        );
        let second = meter(
            3,
            "plug",
            &[],
            BreakdownQuantity::ImportedEnergy,
            SeriesProvenance::Measured,
            &[Some(4)],
        );
        let result = calculate_contributor_breakdown(&input(home, vec![first, second]));
        assert_eq!(ranked(&result.consuming, 2).value, Some(6));
        assert_eq!(ranked(&result.consuming, 3).value, Some(4));
        assert!(result.unattributed.is_none());
        assert_eq!(result.status, BreakdownStatus::RankingsOnly);
    }

    #[test]
    fn percentages_require_accuracy_alignment_gaps_and_estimated_coverage() {
        let mut home = meter(
            1,
            "home",
            &[],
            BreakdownQuantity::ImportedEnergy,
            SeriesProvenance::Estimated,
            &[Some(100)],
        );
        home.covered_ns = 95;
        home.elapsed_ns = 100;
        let contributor = meter(
            2,
            "plug",
            &["outlet"],
            BreakdownQuantity::ImportedEnergy,
            SeriesProvenance::Measured,
            &[Some(40)],
        );
        let ok = calculate_contributor_breakdown(&input(home.clone(), vec![contributor.clone()]));
        assert_eq!(
            ranked(&ok.consuming, 2).percentage_basis_points,
            Some(4_000)
        );

        home.covered_ns = 94;
        let low_coverage =
            calculate_contributor_breakdown(&input(home.clone(), vec![contributor.clone()]));
        assert!(low_coverage.unattributed.is_none());
        assert!(
            ranked(&low_coverage.consuming, 2)
                .percentage_basis_points
                .is_none()
        );

        home.covered_ns = 100;
        home.provenance = SeriesProvenance::Measured;
        home.accuracy = None;
        let mut no_accuracy_contributor = contributor.clone();
        no_accuracy_contributor.accuracy = None;
        no_accuracy_contributor.covered_ns = 50;
        no_accuracy_contributor.elapsed_ns = 100;
        let missing_accuracy =
            calculate_contributor_breakdown(&input(home.clone(), vec![no_accuracy_contributor]));
        assert_eq!(missing_accuracy.status, BreakdownStatus::RankingsOnly);
        assert!(
            ranked(&missing_accuracy.consuming, 2)
                .percentage_basis_points
                .is_none()
        );

        home.accuracy = Some(accuracy(1, 0, 1));
        let mut gapped = contributor.clone();
        gapped.history_gaps = true;
        gapped.covered_ns = 50;
        let gapped = calculate_contributor_breakdown(&input(home.clone(), vec![gapped]));
        assert!(gapped.unattributed.is_none());
        assert_eq!(gapped.status, BreakdownStatus::RankingsOnly);

        let mut shifted = contributor.clone();
        shifted.buckets[0].start = at(5);
        shifted.buckets[0].end = at(6);
        let shifted = calculate_contributor_breakdown(&input(home.clone(), vec![shifted]));
        assert!(shifted.unattributed.is_none());

        let mut unknown = contributor;
        unknown.buckets[0].value = None;
        let unknown = calculate_contributor_breakdown(&input(home, vec![unknown]));
        assert_eq!(ranked(&unknown.consuming, 2).value, None);
        assert!(unknown.unattributed.is_none());
        assert_ne!(ranked(&unknown.consuming, 2).value, Some(0));
    }

    #[test]
    fn measured_coverage_does_not_replace_missing_accuracy() {
        let mut home = meter(
            1,
            "home",
            &[],
            BreakdownQuantity::ImportedEnergy,
            SeriesProvenance::Measured,
            &[Some(100)],
        );
        home.covered_ns = 100;
        let mut contributor = meter(
            2,
            "plug",
            &["outlet"],
            BreakdownQuantity::ImportedEnergy,
            SeriesProvenance::Measured,
            &[Some(40)],
        );
        contributor.covered_ns = 10;
        contributor.elapsed_ns = 100;
        let with_accuracy =
            calculate_contributor_breakdown(&input(home.clone(), vec![contributor.clone()]));
        assert_eq!(
            ranked(&with_accuracy.consuming, 2).percentage_basis_points,
            Some(4_000)
        );

        contributor.accuracy = None;
        home.accuracy = None;
        let missing = calculate_contributor_breakdown(&input(home, vec![contributor]));
        assert!(
            ranked(&missing.consuming, 2)
                .percentage_basis_points
                .is_none()
        );
        assert!(missing.unattributed.is_none());
    }

    #[test]
    fn tolerance_clamps_within_bounds_and_omits_unattributed_beyond_them() {
        // Home bound = 5 absolute + ceil(200 * 10000 / 1_000_000) + ceil(4 / 2) = 5 + 2 + 2.
        let mut home = meter(
            1,
            "home",
            &[],
            BreakdownQuantity::ImportedEnergy,
            SeriesProvenance::Measured,
            &[Some(200)],
        );
        home.accuracy = Some(accuracy(5, 10_000, 4));
        let mut contributor = meter(
            2,
            "plug",
            &["outlet"],
            BreakdownQuantity::ImportedEnergy,
            SeriesProvenance::Measured,
            &[Some(210)],
        );
        contributor.accuracy = Some(accuracy(1, 0, 2));
        let within =
            calculate_contributor_breakdown(&input(home.clone(), vec![contributor.clone()]));
        let share = within.unattributed.expect("clamped unattributed");
        assert_eq!(share.value, 0);
        assert!(share.within_meter_tolerance);
        assert_eq!(within.status, BreakdownStatus::WithinMeterTolerance);
        assert_eq!(
            ranked(&within.consuming, 2).percentage_basis_points,
            Some(10_500)
        );

        contributor.buckets[0].value = Some(212);
        let beyond = calculate_contributor_breakdown(&input(home, vec![contributor]));
        assert!(beyond.unattributed.is_none());
        assert_eq!(beyond.status, BreakdownStatus::Inconsistent);
        assert_eq!(
            ranked(&beyond.consuming, 2).percentage_basis_points,
            Some(10_600)
        );
    }

    #[test]
    fn fixed_point_scales_compare_without_treating_a_finer_scale_as_larger() {
        let mut home = meter(
            1,
            "home",
            &[],
            BreakdownQuantity::ImportedEnergy,
            SeriesProvenance::Measured,
            &[Some(10)],
        );
        home.buckets[0].scale = 0;
        let mut contributor = meter(
            2,
            "plug",
            &["outlet"],
            BreakdownQuantity::ImportedEnergy,
            SeriesProvenance::Measured,
            &[Some(2_500)],
        );
        contributor.buckets[0].scale = 3;
        let result = calculate_contributor_breakdown(&input(home, vec![contributor]));
        assert_eq!(ranked(&result.consuming, 2).value, Some(2_500));
        assert_eq!(ranked(&result.consuming, 2).scale, 3);
        assert_eq!(
            ranked(&result.consuming, 2).percentage_basis_points,
            Some(2_500)
        );
        let share = result.unattributed.expect("remainder");
        assert_eq!(share.value, 7_500);
        assert_eq!(share.scale, 3);
        assert_eq!(share.percentage_basis_points, Some(7_500));
    }

    #[test]
    fn downstream_scope_keeps_only_contained_meters() {
        let home = meter(
            1,
            "panel",
            &[],
            BreakdownQuantity::ImportedEnergy,
            SeriesProvenance::Measured,
            &[Some(10)],
        );
        let child = meter(
            2,
            "panel",
            &["outlet"],
            BreakdownQuantity::ImportedEnergy,
            SeriesProvenance::Measured,
            &[Some(4)],
        );
        let other_device = meter(
            3,
            "kettle",
            &["outlet"],
            BreakdownQuantity::ImportedEnergy,
            SeriesProvenance::Measured,
            &[Some(4)],
        );
        let mut scoped = input(home, vec![child, other_device]);
        scoped.home_scope = HomeMeterScope::Device {
            device_key: "panel".into(),
        };
        let result = calculate_contributor_breakdown(&scoped);
        assert_eq!(ranked(&result.consuming, 2).value, Some(4));
        assert!(
            result
                .consuming
                .iter()
                .all(|row| row.capability_id != Uuid::from_u128(3))
        );
    }

    #[test]
    fn a_designation_boundary_blocks_percentages() {
        let home = meter(
            1,
            "home",
            &[],
            BreakdownQuantity::ImportedEnergy,
            SeriesProvenance::Measured,
            &[Some(10)],
        );
        let contributor = meter(
            2,
            "plug",
            &["outlet"],
            BreakdownQuantity::ImportedEnergy,
            SeriesProvenance::Measured,
            &[Some(4)],
        );
        let mut crossed = input(home, vec![contributor]);
        crossed.designation_boundary = true;
        let result = calculate_contributor_breakdown(&crossed);
        assert_eq!(ranked(&result.consuming, 2).value, Some(4));
        assert!(
            ranked(&result.consuming, 2)
                .percentage_basis_points
                .is_none()
        );
        assert!(result.unattributed.is_none());
    }

    #[test]
    fn rankings_only_json_omits_percentages_and_unattributed() {
        let mut home = meter(
            1,
            "home",
            &[],
            BreakdownQuantity::ImportedEnergy,
            SeriesProvenance::Measured,
            &[Some(10)],
        );
        home.accuracy = None;
        let contributor = meter(
            2,
            "plug",
            &["outlet"],
            BreakdownQuantity::ImportedEnergy,
            SeriesProvenance::Measured,
            &[Some(4)],
        );
        let result = calculate_contributor_breakdown(&input(home, vec![contributor]));
        let json = serde_json::to_value(&result).unwrap();
        assert!(json.get("unattributed").is_none());
        assert!(json["consuming"][0].get("percentageBasisPoints").is_none());
        assert_eq!(json["status"], "rankingsOnly");
        assert_eq!(json["consuming"][0]["value"], 4);
    }

    #[test]
    fn accuracy_uses_only_revisions_that_overlap_the_window() {
        let start = at(0);
        let end = at(2);
        let with_accuracy = revision(
            at(0),
            Some(CapabilityAccuracy::Absolute { maximum_error: 5 }),
            2,
        );
        let without = revision(at(1), None, 1);
        assert!(accuracy_for_window(&[with_accuracy.clone(), without], start, end).is_none());

        let later = revision(
            at(3),
            Some(CapabilityAccuracy::Relative {
                maximum_error_ppm: 50_000,
            }),
            9,
        );
        let usable = accuracy_for_window(&[with_accuracy, later], start, end).unwrap();
        assert_eq!(usable.absolute_error, 5);
        assert_eq!(usable.relative_error_ppm, 0);
        assert_eq!(usable.resolution, 2);
    }

    fn revision(
        effective_at: DateTime<Utc>,
        accuracy: Option<CapabilityAccuracy>,
        resolution: i64,
    ) -> ConstraintRevision {
        ConstraintRevision {
            revision_id: format!("rev-{resolution}"),
            declared_at: effective_at,
            effective_at,
            scale: 0,
            bounds: FixedPointBounds {
                minimum: -1_000_000,
                maximum: 1_000_000,
            },
            resolution,
            freshness_ms: 60_000,
            history_admission: HistoryAdmissionRate {
                maximum_observations: 60,
                interval_ms: 60_000,
            },
            accuracy,
        }
    }
}
