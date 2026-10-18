use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use thiserror::Error;

use super::{
    CapabilityId, CapabilityObservation, CapabilityReading, CapabilityReport,
    CompleteCapabilityManifest, CurrentStateDisposition, DeviceIdentity, HistoryAdmissionOutcome,
    HistoryRejection, IngestResult, RegisteredCapability, TimeTrust,
};

const CORE_OBSERVATION_SCHEMA: u16 = 1;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AdapterCapabilityManifest {
    pub schema_version: u16,
    pub supported_observation_envelope_versions: Vec<u16>,
    pub device: DeviceIdentity,
    pub capabilities: Vec<super::CapabilityDeclaration>,
}

impl AdapterCapabilityManifest {
    pub fn complete(&self) -> Result<CompleteCapabilityManifest, AdapterEnvelopeError> {
        if self.schema_version != 1 {
            return Err(AdapterEnvelopeError::UnsupportedManifest);
        }
        Ok(CompleteCapabilityManifest {
            device: self.device.clone(),
            capabilities: self.capabilities.clone(),
        })
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AdapterObservationReport {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub schema_version: Option<u16>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub observation_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub observed_at: Option<DateTime<Utc>>,
    pub time_trust: TimeTrust,
    pub observations: Vec<AdapterObservation>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AdapterObservation {
    pub identity: super::CapabilityIdentity,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub capability_id: Option<CapabilityId>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reset: Option<bool>,
    pub reading: CapabilityReading,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Admission {
    pub registered: Vec<RegisteredCapability>,
    pub ingest: IngestResult,
}

pub fn negotiate_observation_schema(supported: &[u16], reported: Option<u16>) -> Option<u16> {
    let negotiated = supported
        .iter()
        .copied()
        .rev()
        .find(|version| *version == CORE_OBSERVATION_SCHEMA)?;
    reported.filter(|version| *version == negotiated)
}

pub fn resolve_adapter_report(
    registered: &[RegisteredCapability],
    supported_versions: &[u16],
    report: &AdapterObservationReport,
) -> Result<CapabilityReport, AdapterEnvelopeError> {
    if report.observations.is_empty() {
        return Err(AdapterEnvelopeError::EmptyReport);
    }
    let schema_version = negotiate_observation_schema(supported_versions, report.schema_version);
    let (observation_id, observed_at) = if schema_version.is_some() {
        let observation_id = report
            .observation_id
            .as_deref()
            .filter(|observation_id| valid_observation_id(observation_id))
            .map(str::to_string);
        let Some(observation_id) = observation_id else {
            return Err(AdapterEnvelopeError::InvalidObservationId);
        };
        let Some(observed_at) = report.observed_at else {
            return Err(AdapterEnvelopeError::MissingObservedAt);
        };
        (Some(observation_id), Some(observed_at))
    } else {
        (None, None)
    };

    let mut seen = std::collections::HashSet::new();
    let mut observations = Vec::new();
    for observation in &report.observations {
        if !seen.insert(&observation.identity) {
            return Err(AdapterEnvelopeError::DuplicateCapability);
        }
        let Some(capability) = registered
            .iter()
            .find(|capability| capability.declaration.identity == observation.identity)
        else {
            continue;
        };
        if observation
            .capability_id
            .is_some_and(|capability_id| capability_id != capability.id)
        {
            continue;
        }
        observations.push(CapabilityObservation {
            capability_id: capability.id,
            kind: observation.identity.kind,
            reading: observation.reading.clone(),
            reset: observation.reset,
        });
    }
    if observations.is_empty() {
        return Err(AdapterEnvelopeError::UnresolvedCapabilities);
    }

    Ok(CapabilityReport {
        schema_version,
        observation_id,
        observed_at,
        time_trust: report.time_trust,
        observations,
    })
}

pub fn registration_message(device: &DeviceIdentity, registered: &[RegisteredCapability]) -> Value {
    json!({
        "device": device,
        "capabilities": registered.iter().map(|capability| json!({
            "identity": capability.declaration.identity,
            "capabilityId": capability.id,
        })).collect::<Vec<_>>()
    })
}

fn valid_observation_id(value: &str) -> bool {
    !value.is_empty() && value.trim() == value && value.chars().count() <= 255
}

#[derive(Debug, Error, Clone, PartialEq, Eq)]
pub enum AdapterEnvelopeError {
    #[error("Capability manifest schema is not supported")]
    UnsupportedManifest,
    #[error("observation ID is invalid")]
    InvalidObservationId,
    #[error("compatible observation report has no observedAt")]
    MissingObservedAt,
    #[error("observation report is empty")]
    EmptyReport,
    #[error("observation report does not match a reconciled Capability")]
    UnresolvedCapabilities,
    #[error("observation report repeats a Capability")]
    DuplicateCapability,
}

#[cfg(test)]
mod tests {
    use chrono::{TimeZone, Utc};
    use uuid::Uuid;

    use super::*;
    use crate::capabilities::{
        Availability, CapabilityKind, CurrentState, PhysicalScope, UnavailableReason,
    };

    fn at(second: i64) -> DateTime<Utc> {
        Utc.timestamp_opt(second, 0).single().unwrap()
    }

    fn matter_power_manifest() -> AdapterCapabilityManifest {
        serde_json::from_value(serde_json::json!({
            "schemaVersion": 1,
            "supportedObservationEnvelopeVersions": [1],
            "device": { "protocol": "matter", "externalId": "plug-1" },
            "capabilities": [{
                "identity": {
                    "device": { "protocol": "matter", "externalId": "plug-1" },
                    "componentPath": [],
                    "kind": "power",
                    "physicalScope": { "kind": "device" }
                },
                "unit": "W",
                "directionality": "bidirectional",
                "constraintRevisions": [{
                    "revisionId": "matter-electrical-v1",
                    "declaredAt": "2026-01-01T00:00:00Z",
                    "effectiveAt": "2026-01-01T00:00:00Z",
                    "scale": 3,
                    "bounds": { "minimum": -1000000000, "maximum": 1000000000 },
                    "resolution": 1,
                    "freshnessMs": 90000,
                    "historyAdmission": { "maximumObservations": 60, "intervalMs": 60000 }
                }]
            }]
        }))
        .unwrap()
    }

    fn power_report(value: i64, capability_id: Option<&str>) -> AdapterObservationReport {
        let mut observation = serde_json::json!({
            "identity": {
                "device": { "protocol": "matter", "externalId": "plug-1" },
                "componentPath": [],
                "kind": "power",
                "physicalScope": { "kind": "device" }
            },
            "reading": {
                "status": "value",
                "value": {
                    "value": value,
                    "scale": 3,
                    "constraintRevisionId": "matter-electrical-v1"
                }
            }
        });
        if let Some(capability_id) = capability_id {
            observation["capabilityId"] = serde_json::json!(capability_id);
        }
        serde_json::from_value(serde_json::json!({
            "schemaVersion": 1,
            "observationId": "obs-1",
            "observedAt": "2026-10-09T12:00:00Z",
            "timeTrust": "trustworthy",
            "observations": [observation]
        }))
        .unwrap()
    }

    fn register(manifest: &AdapterCapabilityManifest) -> (CurrentState, Vec<RegisteredCapability>) {
        let state = CurrentState::new(crate::capabilities::StateEpoch::new());
        let registered = manifest
            .capabilities
            .iter()
            .map(|declaration| RegisteredCapability {
                id: CapabilityId::from_uuid(Uuid::new_v4()),
                declaration: declaration.clone(),
            })
            .collect::<Vec<_>>();
        state.reconcile_manifest(&manifest.device, registered.clone(), at(1));
        (state, registered)
    }

    #[test]
    fn rms_load_updates_live_power_and_replays_once() {
        let manifest = matter_power_manifest();
        let (state, registered) = register(&manifest);
        let report = resolve_adapter_report(
            &registered,
            &manifest.supported_observation_envelope_versions,
            &power_report(60_000, None),
        )
        .unwrap();
        let first = state.ingest(report.clone(), at(2));
        assert_eq!(first.outcomes[0].current, CurrentStateDisposition::Changed);
        assert_eq!(first.outcomes[0].history, HistoryAdmissionOutcome::Eligible);
        let current = &state.snapshot().capabilities[0];
        assert_eq!(current.value.as_ref().unwrap().value(), 60_000);
        assert_eq!(current.value.as_ref().unwrap().scale(), 3);
        assert_eq!(current.availability, Availability::Available);

        let replay = state.ingest(report, at(3));
        assert_eq!(
            replay.outcomes[0].current,
            CurrentStateDisposition::ExactReplay
        );
        assert_eq!(
            replay.outcomes[0].history,
            HistoryAdmissionOutcome::Rejected(HistoryRejection::ExactReplay)
        );
    }

    #[test]
    fn incompatible_schema_stays_current_state_only() {
        let mut manifest = matter_power_manifest();
        manifest.supported_observation_envelope_versions = vec![2];
        let (state, registered) = register(&manifest);
        let mut report = power_report(60_000, None);
        report.schema_version = Some(2);
        let resolved = resolve_adapter_report(
            &registered,
            &manifest.supported_observation_envelope_versions,
            &report,
        )
        .unwrap();
        assert_eq!(resolved.schema_version, None);
        assert_eq!(resolved.observation_id, None);
        assert_eq!(resolved.observed_at, None);
        let ingested = state.ingest(resolved, at(2));
        assert_eq!(
            ingested.outcomes[0].current,
            CurrentStateDisposition::Changed
        );
        assert_eq!(
            ingested.outcomes[0].history,
            HistoryAdmissionOutcome::Rejected(HistoryRejection::UnsupportedSchemaVersion)
        );
    }

    #[test]
    fn legacy_report_without_identity_updates_current_state_only() {
        let mut manifest = matter_power_manifest();
        manifest.supported_observation_envelope_versions.clear();
        let (state, registered) = register(&manifest);
        let mut report = power_report(60_000, None);
        report.schema_version = None;
        report.observation_id = None;
        report.observed_at = None;
        let resolved = resolve_adapter_report(
            &registered,
            &manifest.supported_observation_envelope_versions,
            &report,
        )
        .unwrap();
        assert_eq!(resolved.observation_id, None);
        assert_eq!(resolved.observed_at, None);
        let ingested = state.ingest(resolved, at(2));
        assert_eq!(
            ingested.outcomes[0].current,
            CurrentStateDisposition::Changed
        );
        assert_eq!(
            ingested.outcomes[0].history,
            HistoryAdmissionOutcome::Rejected(HistoryRejection::UnsupportedSchemaVersion)
        );
        let current = &state.snapshot().capabilities[0];
        assert_eq!(current.value.as_ref().unwrap().value(), 60_000);
        assert_eq!(current.observed_at, None);
    }

    #[test]
    fn disconnect_ends_availability() {
        let manifest = matter_power_manifest();
        let (state, registered) = register(&manifest);
        let report = resolve_adapter_report(
            &registered,
            &manifest.supported_observation_envelope_versions,
            &power_report(60_000, None),
        )
        .unwrap();
        state.ingest(report, at(2));
        state.mark_device_unavailable(&manifest.device, UnavailableReason::Explicit, at(4));
        match &state.snapshot().capabilities[0].availability {
            Availability::Unavailable { reason, .. } => {
                assert_eq!(*reason, UnavailableReason::Explicit);
            }
            Availability::Available => panic!("power stayed available after disconnect"),
        }
    }

    #[test]
    fn conflicting_capability_id_does_not_apply() {
        let manifest = matter_power_manifest();
        let (state, registered) = register(&manifest);
        let wrong = "22222222-2222-2222-2222-222222222222";
        let report = power_report(60_000, Some(wrong));
        assert!(
            resolve_adapter_report(
                &registered,
                &manifest.supported_observation_envelope_versions,
                &report,
            )
            .is_err()
        );
        assert!(state.snapshot().capabilities[0].value.is_none());
        assert_ne!(
            registered[0].id,
            CapabilityId::from_uuid(Uuid::parse_str(wrong).unwrap())
        );
    }

    #[test]
    fn registration_message_returns_core_ids() {
        let manifest = matter_power_manifest();
        let (_, registered) = register(&manifest);
        let message = registration_message(&manifest.device, &registered);
        assert_eq!(message["device"]["externalId"], "plug-1");
        assert_eq!(
            message["capabilities"][0]["capabilityId"],
            serde_json::to_value(&registered[0].id).unwrap()
        );
        assert_eq!(message["capabilities"][0]["identity"]["kind"], "power");
    }

    #[test]
    fn one_observation_carries_several_capabilities() {
        let manifest = matter_power_manifest();
        let mut energy = manifest.capabilities[0].clone();
        energy.identity.kind = CapabilityKind::ImportedEnergy;
        energy.unit = crate::capabilities::CanonicalUnit::WattHours;
        energy.directionality = crate::capabilities::Directionality::Nonnegative;
        energy.constraint_revisions[0].bounds.minimum = 0;
        let mut manifest = manifest;
        manifest.capabilities.push(energy);
        let (_, registered) = register(&manifest);
        let mut report = power_report(60_000, None);
        let mut energy_observation = report.observations[0].clone();
        energy_observation.identity.kind = CapabilityKind::ImportedEnergy;
        energy_observation.identity.physical_scope = PhysicalScope::Device;
        if let CapabilityReading::Value(value) = &mut energy_observation.reading {
            *value = crate::capabilities::NumericValue::new(1_500_000, 3, "matter-electrical-v1");
        }
        report.observations.push(energy_observation);
        let resolved = resolve_adapter_report(
            &registered,
            &manifest.supported_observation_envelope_versions,
            &report,
        )
        .unwrap();
        assert_eq!(resolved.observations.len(), 2);
        assert_eq!(resolved.observation_id.as_deref(), Some("obs-1"));
    }

    #[test]
    fn reset_marker_survives_resolution() {
        let manifest = matter_power_manifest();
        let (_, registered) = register(&manifest);
        let mut report = power_report(60_000, None);
        report.observations[0].reset = Some(true);
        let resolved = resolve_adapter_report(
            &registered,
            &manifest.supported_observation_envelope_versions,
            &report,
        )
        .unwrap();
        assert_eq!(resolved.observations[0].reset, Some(true));
    }
}
