use std::collections::HashMap;

use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use crate::capabilities::{
    AdapterCapabilityManifest, AdapterObservation, AdapterObservationReport, CanonicalUnit,
    CapabilityDeclaration, CapabilityId, CapabilityIdentity, CapabilityKind, CapabilityReading,
    ConstraintRevision, DeviceIdentity, Directionality, FixedPointBounds, HistoryAdmissionRate,
    NumericValue, PhysicalScope, RegisteredCapability, TimeTrust,
};

const PROFILE_REVISION: &str = "zigbee-electrical-v1";
const PROFILE_EFFECTIVE_AT: &str = "2026-01-01T00:00:00Z";
const PROFILE_FRESHNESS_MS: u64 = 600_000;
const RETRY_WINDOW: Duration = Duration::seconds(2);
const MAX_SAFE_INTEGER: i64 = 9_007_199_254_740_991;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct MeterCursor {
    fingerprint: String,
    observation_id: String,
    observed_at: DateTime<Utc>,
    #[serde(default = "trustworthy_time")]
    time_trust: TimeTrust,
    #[serde(default)]
    imported_energy: Option<i64>,
}

fn trustworthy_time() -> TimeTrust {
    TimeTrust::Trustworthy
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ZigbeeMeter {
    pub manifest: AdapterCapabilityManifest,
    pub report: AdapterObservationReport,
    pub cursor: MeterCursor,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct ZigbeeJournal {
    #[serde(default)]
    cursors: HashMap<String, MeterCursor>,
    #[serde(default)]
    capability_ids: HashMap<String, HashMap<String, String>>,
}

impl ZigbeeJournal {
    pub fn parse(raw: &str) -> Self {
        serde_json::from_str(raw).unwrap_or_default()
    }

    pub fn export(&self) -> String {
        serde_json::to_string(self).unwrap_or_else(|_| "{}".to_string())
    }

    pub fn cursor(&self, external_id: &str) -> Option<&MeterCursor> {
        self.cursors.get(external_id)
    }

    pub fn assigned(&self, external_id: &str) -> HashMap<String, String> {
        self.capability_ids
            .get(external_id)
            .cloned()
            .unwrap_or_default()
    }

    pub fn remember_cursor(&mut self, external_id: &str, cursor: MeterCursor) {
        self.cursors.insert(external_id.to_string(), cursor);
    }

    pub fn remember_ids(&mut self, external_id: &str, registered: &[RegisteredCapability]) {
        let ids = registered
            .iter()
            .map(|capability| {
                (
                    capability.declaration.identity.kind.as_str().to_string(),
                    capability.id.into_uuid().to_string(),
                )
            })
            .collect();
        self.capability_ids.insert(external_id.to_string(), ids);
    }
}

pub fn translate_zigbee(
    external_id: &str,
    state: &Value,
    cursor: Option<&MeterCursor>,
    received_at: DateTime<Utc>,
    retained: bool,
    assigned: &HashMap<String, String>,
) -> Option<ZigbeeMeter> {
    let device = DeviceIdentity::new("zigbee", external_id).ok()?;
    let record = state.as_object()?;
    let mut readings = Vec::new();
    if let Some(watts) = finite_number(record.get("power")) {
        readings.push(reading(
            &device,
            CapabilityKind::Power,
            CanonicalUnit::Watts,
            Directionality::Bidirectional,
            1,
            scaled(watts, 1)?,
        ));
    }
    if let Some(volts) = finite_number(record.get("voltage")) {
        readings.push(reading(
            &device,
            CapabilityKind::Voltage,
            CanonicalUnit::Volts,
            Directionality::Nonnegative,
            1,
            scaled(volts, 1)?,
        ));
    }
    if let Some(amperes) = finite_number(record.get("current")) {
        readings.push(reading(
            &device,
            CapabilityKind::Current,
            CanonicalUnit::Amperes,
            Directionality::Nonnegative,
            3,
            scaled(amperes, 3)?,
        ));
    }
    if let Some(kilowatt_hours) = finite_number(record.get("energy")).filter(|value| *value >= 0.0)
    {
        readings.push(reading(
            &device,
            CapabilityKind::ImportedEnergy,
            CanonicalUnit::WattHours,
            Directionality::Nonnegative,
            0,
            scaled(kilowatt_hours * 1000.0, 0)?,
        ));
    }
    if readings.is_empty() {
        return None;
    }

    let imported = readings
        .iter()
        .find(|(declaration, _)| declaration.identity.kind == CapabilityKind::ImportedEnergy);
    let imported_energy = imported.map(|(_, value)| value.value());
    let resolution = imported
        .and_then(|(declaration, _)| declaration.constraint_revisions.first())
        .map(|revision| revision.resolution)
        .unwrap_or(1);
    let reset = cursor
        .and_then(|previous| previous.imported_energy)
        .zip(imported_energy)
        .is_some_and(|(previous, next)| previous.saturating_sub(next) > resolution);
    let fingerprint = readings
        .iter()
        .map(|(declaration, value)| {
            format!(
                "{}:{}:{}",
                declaration.identity.kind.as_str(),
                value.value(),
                value.scale()
            )
        })
        .collect::<Vec<_>>()
        .join(";");
    let (observation_id, observed_at, time_trust) =
        reused_identity(cursor, &fingerprint, received_at, retained);
    // Zigbee2MQTT does not publish a tested fixed-point encoding. Omit the
    // envelope version so Core keeps the reading as current state and does
    // not invent a History-eligible schema.
    let manifest = AdapterCapabilityManifest {
        schema_version: 1,
        supported_observation_envelope_versions: Vec::new(),
        device: device.clone(),
        capabilities: readings
            .iter()
            .map(|(declaration, _)| declaration.clone())
            .collect(),
    };
    let report = AdapterObservationReport {
        schema_version: None,
        // The cursor keeps a retry identity for the adapter journal. The
        // report itself stays untimed: this profile is not a History schema,
        // so Core must not be handed an invented observation id or observed_at.
        observation_id: None,
        observed_at: None,
        time_trust,
        observations: readings
            .into_iter()
            .map(|(declaration, value)| AdapterObservation {
                identity: declaration.identity.clone(),
                capability_id: assigned
                    .get(declaration.identity.kind.as_str())
                    .and_then(|raw| Uuid::parse_str(raw).ok())
                    .map(CapabilityId::from_uuid),
                reset: (reset && declaration.identity.kind == CapabilityKind::ImportedEnergy)
                    .then_some(true),
                reading: CapabilityReading::Value(value),
            })
            .collect(),
    };
    let cursor = MeterCursor {
        fingerprint,
        observation_id,
        observed_at,
        time_trust,
        imported_energy,
    };
    Some(ZigbeeMeter {
        manifest,
        report,
        cursor,
    })
}

fn reused_identity(
    cursor: Option<&MeterCursor>,
    fingerprint: &str,
    received_at: DateTime<Utc>,
    retained: bool,
) -> (String, DateTime<Utc>, TimeTrust) {
    if let Some(cursor) = cursor
        && cursor.fingerprint == fingerprint
        && received_at >= cursor.observed_at
        && (retained || received_at - cursor.observed_at < RETRY_WINDOW)
    {
        return (
            cursor.observation_id.clone(),
            cursor.observed_at,
            cursor.time_trust,
        );
    }
    let time_trust = if retained {
        TimeTrust::Untrustworthy
    } else {
        TimeTrust::Trustworthy
    };
    (Uuid::new_v4().to_string(), received_at, time_trust)
}

fn reading(
    device: &DeviceIdentity,
    kind: CapabilityKind,
    unit: CanonicalUnit,
    directionality: Directionality,
    scale: u8,
    value: i64,
) -> (CapabilityDeclaration, NumericValue) {
    let minimum = if directionality == Directionality::Bidirectional {
        -MAX_SAFE_INTEGER
    } else {
        0
    };
    let effective_at = DateTime::parse_from_rfc3339(PROFILE_EFFECTIVE_AT)
        .expect("profile time")
        .with_timezone(&Utc);
    let declaration = CapabilityDeclaration {
        identity: CapabilityIdentity {
            device: device.clone(),
            component_path: Vec::new(),
            kind,
            physical_scope: PhysicalScope::Device,
        },
        unit,
        directionality,
        constraint_revisions: vec![ConstraintRevision {
            revision_id: PROFILE_REVISION.into(),
            declared_at: effective_at,
            effective_at,
            scale,
            bounds: FixedPointBounds {
                minimum,
                maximum: MAX_SAFE_INTEGER,
            },
            resolution: 1,
            freshness_ms: PROFILE_FRESHNESS_MS,
            history_admission: HistoryAdmissionRate {
                maximum_observations: 60,
                interval_ms: 60_000,
            },
            accuracy: None,
        }],
    };
    (
        declaration,
        NumericValue::new(value, scale, PROFILE_REVISION),
    )
}

fn finite_number(value: Option<&Value>) -> Option<f64> {
    let number = value?.as_f64()?;
    number.is_finite().then_some(number)
}

fn scaled(value: f64, scale: u8) -> Option<i64> {
    let factor = 10_f64.powi(i32::from(scale));
    let scaled = (value * factor).round();
    if !scaled.is_finite() || scaled < i64::MIN as f64 || scaled > i64::MAX as f64 {
        return None;
    }
    let whole = scaled as i64;
    (whole.unsigned_abs() <= MAX_SAFE_INTEGER as u64).then_some(whole)
}

#[cfg(test)]
mod tests {
    use chrono::{TimeZone, Utc};

    use super::*;

    fn translate(
        external_id: &str,
        state: &Value,
        cursor: Option<&MeterCursor>,
        received_at: DateTime<Utc>,
        retained: bool,
    ) -> Option<ZigbeeMeter> {
        translate_zigbee(
            external_id,
            state,
            cursor,
            received_at,
            retained,
            &HashMap::new(),
        )
    }
    use crate::capabilities::{
        Availability, CapabilityId, CurrentState, RegisteredCapability, StateEpoch,
    };
    use crate::capabilities::{
        CurrentStateDisposition, HistoryAdmissionOutcome, HistoryRejection, UnavailableReason,
        resolve_adapter_report,
    };
    use serde_json::json;
    use uuid::Uuid;

    fn at(second: i64) -> DateTime<Utc> {
        Utc.timestamp_opt(1_700_000_000 + second, 0)
            .single()
            .unwrap()
    }

    fn plug() -> Value {
        json!({
            "state": "ON",
            "power": 42.5,
            "voltage": 120.1,
            "current": 0.354,
            "energy": 15.25,
            "linkquality": 120
        })
    }

    #[test]
    fn zigbee_readings_use_canonical_units_and_one_observation() {
        let meter = translate("ieee-1", &plug(), None, at(10), false).unwrap();
        assert_eq!(meter.report.observations.len(), 4);
        assert_eq!(meter.report.schema_version, None);
        assert_eq!(meter.report.observation_id, None);
        assert_eq!(meter.report.observed_at, None);
        let power = meter
            .report
            .observations
            .iter()
            .find(|observation| {
                observation.identity.kind == crate::capabilities::CapabilityKind::Power
            })
            .unwrap();
        match &power.reading {
            crate::capabilities::CapabilityReading::Value(value) => {
                assert_eq!(value.value(), 425);
                assert_eq!(value.scale(), 1);
            }
            crate::capabilities::CapabilityReading::Unavailable => panic!("missing power"),
        }
        let energy = meter
            .report
            .observations
            .iter()
            .find(|observation| {
                observation.identity.kind == crate::capabilities::CapabilityKind::ImportedEnergy
            })
            .unwrap();
        match &energy.reading {
            crate::capabilities::CapabilityReading::Value(value) => {
                assert_eq!(value.value(), 15_250);
                assert_eq!(value.scale(), 0);
            }
            crate::capabilities::CapabilityReading::Unavailable => panic!("missing energy"),
        }
    }

    #[test]
    fn missing_meter_keys_are_not_zero() {
        assert!(translate("ieee-1", &json!({ "state": "ON" }), None, at(1), false).is_none());
    }

    #[test]
    fn immediate_retry_keeps_the_observation_and_a_later_report_does_not() {
        let first = translate("ieee-1", &plug(), None, at(10), false).unwrap();
        let retry = translate("ieee-1", &plug(), Some(&first.cursor), at(11), false).unwrap();
        assert_eq!(retry.report.observation_id, None);
        assert_eq!(retry.cursor.observation_id, first.cursor.observation_id);
        assert_eq!(retry.cursor.observed_at, first.cursor.observed_at);
        let later = translate("ieee-1", &plug(), Some(&first.cursor), at(20), false).unwrap();
        assert_ne!(later.cursor.observation_id, first.cursor.observation_id);
        assert_eq!(later.cursor.observed_at, at(20));
    }

    #[test]
    fn retained_replay_keeps_the_original_envelope() {
        let first = translate("ieee-1", &plug(), None, at(10), true).unwrap();
        let replay = translate("ieee-1", &plug(), Some(&first.cursor), at(80), true).unwrap();
        assert_eq!(replay.report.observation_id, None);
        assert_eq!(replay.report.observed_at, None);
        assert_eq!(replay.cursor.observation_id, first.cursor.observation_id);
        assert_eq!(replay.cursor.observed_at, first.cursor.observed_at);
    }

    #[test]
    fn zigbee_profile_is_current_state_only_and_disconnects() {
        let meter = translate("ieee-1", &plug(), None, at(10), false).unwrap();
        let state = CurrentState::new(StateEpoch::new());
        let registered = meter
            .manifest
            .capabilities
            .iter()
            .map(|declaration| RegisteredCapability {
                id: CapabilityId::from_uuid(Uuid::new_v4()),
                declaration: declaration.clone(),
            })
            .collect::<Vec<_>>();
        state.reconcile_manifest(&meter.manifest.device, registered.clone(), at(1));
        let resolved = resolve_adapter_report(
            &registered,
            &meter.manifest.supported_observation_envelope_versions,
            &meter.report,
        )
        .unwrap();
        let ingested = state.ingest(resolved, at(10));
        assert!(ingested.outcomes.iter().all(|outcome| {
            outcome.current == CurrentStateDisposition::Changed
                && outcome.history
                    == HistoryAdmissionOutcome::Rejected(HistoryRejection::UnsupportedSchemaVersion)
        }));
        let retry = translate("ieee-1", &plug(), Some(&meter.cursor), at(11), false).unwrap();
        let replayed = resolve_adapter_report(
            &registered,
            &retry.manifest.supported_observation_envelope_versions,
            &retry.report,
        )
        .unwrap();
        let replay = state.ingest(replayed, at(11));
        assert!(
            replay
                .outcomes
                .iter()
                .all(|outcome| { outcome.current == CurrentStateDisposition::ExactReplay })
        );
        state.mark_device_unavailable(&meter.manifest.device, UnavailableReason::Explicit, at(12));
        assert!(state.snapshot().capabilities.iter().all(|capability| {
            matches!(capability.availability, Availability::Unavailable { .. })
        }));
    }

    #[test]
    fn returned_capability_id_is_stamped_on_the_next_report() {
        let id = Uuid::new_v4();
        let mut assigned = HashMap::new();
        assigned.insert("power".to_string(), id.to_string());
        let meter = translate_zigbee("ieee-1", &plug(), None, at(10), false, &assigned).unwrap();
        let power = meter
            .report
            .observations
            .iter()
            .find(|observation| observation.identity.kind == CapabilityKind::Power)
            .unwrap();
        assert_eq!(power.capability_id, Some(CapabilityId::from_uuid(id)));
    }

    #[test]
    fn retained_identity_survives_a_restart() {
        let first = translate("ieee-1", &plug(), None, at(10), true).unwrap();
        let mut journal = ZigbeeJournal::default();
        journal.remember_cursor("ieee-1", first.cursor.clone());
        let restored = ZigbeeJournal::parse(&journal.export());
        let replay = translate("ieee-1", &plug(), restored.cursor("ieee-1"), at(80), true).unwrap();
        assert_eq!(replay.cursor.observation_id, first.cursor.observation_id);
        assert_eq!(replay.cursor.observed_at, first.cursor.observed_at);
    }

    #[test]
    fn reset_marker_is_omitted_until_the_adapter_reports_one() {
        let meter = translate("ieee-1", &plug(), None, at(10), false).unwrap();
        let raw = serde_json::to_value(&meter.report).unwrap();
        assert!(raw["observations"][0].get("reset").is_none());
        let mut report = meter.report;
        report.observations[0].reset = Some(true);
        let parsed: AdapterObservationReport =
            serde_json::from_str(&serde_json::to_string(&report).unwrap()).unwrap();
        assert_eq!(parsed.observations[0].reset, Some(true));
    }

    #[test]
    fn legacy_retained_reading_without_identity_stays_out_of_history() {
        let live = translate("ieee-1", &plug(), None, at(10), false).unwrap();
        assert_eq!(live.report.time_trust, TimeTrust::Trustworthy);
        let replay = translate("ieee-1", &plug(), Some(&live.cursor), at(80), true).unwrap();
        assert_eq!(replay.report.time_trust, TimeTrust::Trustworthy);
        assert_eq!(replay.report.observation_id, None);
        assert_eq!(replay.cursor.observation_id, live.cursor.observation_id);

        let legacy = translate("ieee-1", &plug(), None, at(10), true).unwrap();
        assert_eq!(legacy.report.time_trust, TimeTrust::Untrustworthy);
        let state = CurrentState::new(StateEpoch::new());
        let registered = legacy
            .manifest
            .capabilities
            .iter()
            .map(|declaration| RegisteredCapability {
                id: CapabilityId::from_uuid(Uuid::new_v4()),
                declaration: declaration.clone(),
            })
            .collect::<Vec<_>>();
        state.reconcile_manifest(&legacy.manifest.device, registered.clone(), at(1));
        let resolved = resolve_adapter_report(
            &registered,
            &legacy.manifest.supported_observation_envelope_versions,
            &legacy.report,
        )
        .unwrap();
        assert_eq!(resolved.observation_id, None);
        assert_eq!(resolved.observed_at, None);
        let ingested = state.ingest(resolved, at(10));
        assert!(ingested.outcomes.iter().all(|outcome| {
            outcome.current == CurrentStateDisposition::Changed
                && outcome.history
                    == HistoryAdmissionOutcome::Rejected(HistoryRejection::UnsupportedSchemaVersion)
        }));
        let power = state
            .snapshot()
            .capabilities
            .into_iter()
            .find(|capability| capability.kind == CapabilityKind::Power)
            .unwrap();
        assert_eq!(
            power.value.as_ref().map(|value| value.value()),
            Some(power_value(&legacy))
        );
    }

    #[test]
    fn energy_drop_beyond_resolution_marks_a_reset() {
        let idle: Value =
            serde_json::from_str(include_str!("../../fixtures/zigbee-plug-idle.json")).unwrap();
        let first = translate("plug-1", &idle, None, at(1), false).unwrap();
        let mut noise = idle.clone();
        noise["energy"] = json!(15.249);
        let within = translate("plug-1", &noise, Some(&first.cursor), at(20), false).unwrap();
        assert_eq!(imported_reset(&within), None);

        let mut reset = idle.clone();
        reset["energy"] = json!(0.5);
        let dropped = translate("plug-1", &reset, Some(&first.cursor), at(30), false).unwrap();
        assert_eq!(imported_reset(&dropped), Some(true));
        assert!(
            dropped
                .report
                .observations
                .iter()
                .filter(|observation| observation.identity.kind != CapabilityKind::ImportedEnergy)
                .all(|observation| observation.reset.is_none())
        );
    }

    #[test]
    fn zigbee_fixture_load_changes_the_live_power() {
        let idle: Value =
            serde_json::from_str(include_str!("../../fixtures/zigbee-plug-idle.json")).unwrap();
        let load: Value =
            serde_json::from_str(include_str!("../../fixtures/zigbee-plug-load.json")).unwrap();
        let idle_meter = translate("plug-1", &idle, None, at(1), false).unwrap();
        let load_meter =
            translate("plug-1", &load, Some(&idle_meter.cursor), at(30), false).unwrap();
        let idle_power = power_value(&idle_meter);
        let load_power = power_value(&load_meter);
        assert_eq!(idle_power, 0);
        assert_eq!(load_power, 4_250);
        assert_eq!(reading_value(&load_meter, CapabilityKind::Voltage), 1_194);
        assert_eq!(reading_value(&load_meter, CapabilityKind::Current), 3_560);
        assert_eq!(
            reading_value(&load_meter, CapabilityKind::ImportedEnergy),
            15_260
        );
        assert_eq!(load_meter.report.observation_id, None);
        assert_ne!(
            load_meter.cursor.observation_id,
            idle_meter.cursor.observation_id
        );
        let replay = translate("plug-1", &load, Some(&load_meter.cursor), at(31), true).unwrap();
        assert_eq!(
            replay.cursor.observation_id,
            load_meter.cursor.observation_id
        );
        assert_eq!(replay.cursor.observed_at, load_meter.cursor.observed_at);

        let state = CurrentState::new(StateEpoch::new());
        let registered = load_meter
            .manifest
            .capabilities
            .iter()
            .map(|declaration| RegisteredCapability {
                id: CapabilityId::from_uuid(Uuid::new_v4()),
                declaration: declaration.clone(),
            })
            .collect::<Vec<_>>();
        state.reconcile_manifest(&load_meter.manifest.device, registered.clone(), at(1));
        let resolved = resolve_adapter_report(
            &registered,
            &load_meter.manifest.supported_observation_envelope_versions,
            &load_meter.report,
        )
        .unwrap();
        state.ingest(resolved, at(30));
        state.mark_device_unavailable(
            &load_meter.manifest.device,
            UnavailableReason::AdapterDisconnected,
            at(40),
        );
        assert!(state.snapshot().capabilities.iter().all(|capability| {
            matches!(
                capability.availability,
                Availability::Unavailable {
                    reason: UnavailableReason::AdapterDisconnected,
                    ..
                }
            )
        }));
    }

    fn imported_reset(meter: &ZigbeeMeter) -> Option<bool> {
        meter
            .report
            .observations
            .iter()
            .find(|observation| observation.identity.kind == CapabilityKind::ImportedEnergy)
            .and_then(|observation| observation.reset)
    }

    fn power_value(meter: &ZigbeeMeter) -> i64 {
        reading_value(meter, CapabilityKind::Power)
    }

    fn reading_value(meter: &ZigbeeMeter, kind: CapabilityKind) -> i64 {
        let observation = meter
            .report
            .observations
            .iter()
            .find(|observation| observation.identity.kind == kind)
            .unwrap();
        match &observation.reading {
            CapabilityReading::Value(value) => value.value(),
            CapabilityReading::Unavailable => panic!("missing {kind:?}"),
        }
    }
}
