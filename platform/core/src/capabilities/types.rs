use std::collections::HashSet;

use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};
use thiserror::Error;
use uuid::Uuid;

const MAX_ID_LENGTH: usize = 255;
const MAX_COMPONENT_DEPTH: usize = 32;
const MAX_FIXED_POINT_SCALE: u8 = 9;
const MAX_RELATIVE_ERROR_PPM: u32 = 1_000_000;
const MAX_SAFE_INTEGER: i64 = 9_007_199_254_740_991;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct CapabilityId(Uuid);

impl CapabilityId {
    pub fn from_uuid(value: Uuid) -> Self {
        Self(value)
    }

    pub fn into_uuid(self) -> Uuid {
        self.0
    }
}

impl From<Uuid> for CapabilityId {
    fn from(value: Uuid) -> Self {
        Self(value)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(transparent)]
pub struct StateEpoch(Uuid);

impl StateEpoch {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn from_uuid(value: Uuid) -> Self {
        Self(value)
    }
}

impl Default for StateEpoch {
    fn default() -> Self {
        Self(Uuid::new_v4())
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum CapabilityKind {
    Power,
    ImportedEnergy,
    ExportedEnergy,
    Voltage,
    Current,
}

impl CapabilityKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Power => "power",
            Self::ImportedEnergy => "importedEnergy",
            Self::ExportedEnergy => "exportedEnergy",
            Self::Voltage => "voltage",
            Self::Current => "current",
        }
    }

    pub fn parse(value: &str) -> Result<Self, CapabilityValidationError> {
        match value {
            "power" => Ok(Self::Power),
            "importedEnergy" => Ok(Self::ImportedEnergy),
            "exportedEnergy" => Ok(Self::ExportedEnergy),
            "voltage" => Ok(Self::Voltage),
            "current" => Ok(Self::Current),
            _ => Err(CapabilityValidationError::InvalidKind(value.to_string())),
        }
    }

    pub fn canonical_unit(self) -> CanonicalUnit {
        match self {
            Self::Power => CanonicalUnit::Watts,
            Self::ImportedEnergy | Self::ExportedEnergy => CanonicalUnit::WattHours,
            Self::Voltage => CanonicalUnit::Volts,
            Self::Current => CanonicalUnit::Amperes,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum CanonicalUnit {
    #[serde(rename = "W")]
    Watts,
    #[serde(rename = "Wh")]
    WattHours,
    #[serde(rename = "V")]
    Volts,
    #[serde(rename = "A")]
    Amperes,
}

impl CanonicalUnit {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Watts => "W",
            Self::WattHours => "Wh",
            Self::Volts => "V",
            Self::Amperes => "A",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Directionality {
    Nonnegative,
    Bidirectional,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum PhysicalScope {
    Home,
    Device,
    Component {
        #[serde(rename = "componentId")]
        component_id: String,
    },
}

impl PhysicalScope {
    pub(crate) fn storage_parts(&self) -> (&'static str, &str) {
        match self {
            Self::Home => ("home", ""),
            Self::Device => ("device", ""),
            Self::Component { component_id } => ("component", component_id),
        }
    }

    fn validate(&self) -> Result<(), CapabilityValidationError> {
        if let Self::Component { component_id } = self {
            validate_identifier("physical scope component ID", component_id)?;
        }
        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceIdentity {
    pub protocol: String,
    pub external_id: String,
}

impl DeviceIdentity {
    pub fn new(
        protocol: impl Into<String>,
        external_id: impl Into<String>,
    ) -> Result<Self, CapabilityValidationError> {
        let identity = Self {
            protocol: protocol.into(),
            external_id: external_id.into(),
        };
        identity.validate()?;
        Ok(identity)
    }

    pub fn validate(&self) -> Result<(), CapabilityValidationError> {
        validate_identifier_with_limit("protocol", &self.protocol, 16)?;
        validate_identifier("Device external ID", &self.external_id)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CapabilityIdentity {
    pub device: DeviceIdentity,
    #[serde(default)]
    pub component_path: Vec<String>,
    pub kind: CapabilityKind,
    pub physical_scope: PhysicalScope,
}

impl CapabilityIdentity {
    pub fn validate(&self) -> Result<(), CapabilityValidationError> {
        self.device.validate()?;
        if self.component_path.len() > MAX_COMPONENT_DEPTH {
            return Err(CapabilityValidationError::ComponentPathTooDeep);
        }
        for segment in &self.component_path {
            validate_identifier("Component path segment", segment)?;
        }
        self.physical_scope.validate()
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum CapabilityAccuracy {
    Absolute {
        maximum_error: i64,
    },
    Relative {
        maximum_error_ppm: u32,
    },
    AbsoluteAndRelative {
        absolute_maximum_error: i64,
        relative_maximum_error_ppm: u32,
    },
}

impl CapabilityAccuracy {
    fn validate(&self) -> Result<(), CapabilityValidationError> {
        let (absolute, relative) = match self {
            Self::Absolute { maximum_error } => (Some(*maximum_error), None),
            Self::Relative { maximum_error_ppm } => (None, Some(*maximum_error_ppm)),
            Self::AbsoluteAndRelative {
                absolute_maximum_error,
                relative_maximum_error_ppm,
            } => (
                Some(*absolute_maximum_error),
                Some(*relative_maximum_error_ppm),
            ),
        };
        if absolute.is_some_and(|value| !(0..=MAX_SAFE_INTEGER).contains(&value)) {
            return Err(CapabilityValidationError::InvalidAccuracy);
        }
        if relative.is_some_and(|value| value > MAX_RELATIVE_ERROR_PPM) {
            return Err(CapabilityValidationError::InvalidAccuracy);
        }
        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryAdmissionRate {
    pub maximum_observations: u32,
    pub interval_ms: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FixedPointBounds {
    pub minimum: i64,
    pub maximum: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConstraintRevision {
    pub revision_id: String,
    pub declared_at: DateTime<Utc>,
    pub effective_at: DateTime<Utc>,
    pub scale: u8,
    pub bounds: FixedPointBounds,
    pub resolution: i64,
    pub freshness_ms: u64,
    pub history_admission: HistoryAdmissionRate,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub accuracy: Option<CapabilityAccuracy>,
}

impl ConstraintRevision {
    fn validate(&self) -> Result<(), CapabilityValidationError> {
        validate_identifier("constraint revision ID", &self.revision_id)?;
        if self.effective_at < self.declared_at {
            return Err(CapabilityValidationError::RetroactiveConstraintRevision);
        }
        if self.scale > MAX_FIXED_POINT_SCALE {
            return Err(CapabilityValidationError::InvalidScale(self.scale));
        }
        if !safe_integer(self.bounds.minimum)
            || !safe_integer(self.bounds.maximum)
            || self.bounds.minimum >= self.bounds.maximum
        {
            return Err(CapabilityValidationError::InvalidBounds);
        }
        let span = i128::from(self.bounds.maximum) - i128::from(self.bounds.minimum);
        if self.resolution <= 0
            || !safe_integer(self.resolution)
            || i128::from(self.resolution) > span
        {
            return Err(CapabilityValidationError::InvalidResolution);
        }
        if self.freshness_ms == 0 || self.freshness_ms > i64::MAX as u64 {
            return Err(CapabilityValidationError::InvalidFreshness);
        }
        if self.history_admission.maximum_observations == 0
            || self.history_admission.interval_ms == 0
        {
            return Err(CapabilityValidationError::InvalidHistoryAdmissionRate);
        }
        if let Some(accuracy) = &self.accuracy {
            accuracy.validate()?;
        }
        Ok(())
    }

    pub fn freshness_deadline(&self, observed_at: DateTime<Utc>) -> DateTime<Utc> {
        observed_at + Duration::milliseconds(self.freshness_ms as i64)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CapabilityDeclaration {
    pub identity: CapabilityIdentity,
    pub unit: CanonicalUnit,
    pub directionality: Directionality,
    pub constraint_revisions: Vec<ConstraintRevision>,
}

impl CapabilityDeclaration {
    pub fn validate(&self) -> Result<(), CapabilityValidationError> {
        self.identity.validate()?;
        if self.unit != self.identity.kind.canonical_unit() {
            return Err(CapabilityValidationError::UnitDoesNotMatchKind);
        }
        if self.identity.kind != CapabilityKind::Power
            && self.directionality != Directionality::Nonnegative
        {
            return Err(CapabilityValidationError::InvalidDirectionality);
        }
        if self.constraint_revisions.is_empty() {
            return Err(CapabilityValidationError::MissingConstraintRevision);
        }
        let mut revision_ids = HashSet::new();
        let mut previous_effective_at = None;
        for revision in &self.constraint_revisions {
            revision.validate()?;
            if !revision_ids.insert(&revision.revision_id) {
                return Err(CapabilityValidationError::DuplicateConstraintRevision);
            }
            if previous_effective_at.is_some_and(|previous| revision.effective_at <= previous) {
                return Err(CapabilityValidationError::UnorderedConstraintRevisions);
            }
            previous_effective_at = Some(revision.effective_at);
            match self.directionality {
                Directionality::Nonnegative if revision.bounds.minimum < 0 => {
                    return Err(CapabilityValidationError::InvalidDirectionality);
                }
                Directionality::Bidirectional
                    if revision.bounds.minimum >= 0 || revision.bounds.maximum <= 0 =>
                {
                    return Err(CapabilityValidationError::InvalidDirectionality);
                }
                _ => {}
            }
        }
        Ok(())
    }

    pub fn validate_value(&self, value: &NumericValue) -> Result<(), CapabilityValidationError> {
        let revision = self
            .constraint_revisions
            .iter()
            .find(|revision| revision.revision_id == value.constraint_revision_id)
            .ok_or(CapabilityValidationError::UnknownConstraintRevision)?;
        if value.scale != revision.scale {
            return Err(CapabilityValidationError::ValueScaleDoesNotMatchRevision);
        }
        if !safe_integer(value.value)
            || value.value < revision.bounds.minimum
            || value.value > revision.bounds.maximum
        {
            return Err(CapabilityValidationError::ValueOutsideBounds);
        }
        let offset = i128::from(value.value) - i128::from(revision.bounds.minimum);
        if offset % i128::from(revision.resolution) != 0 {
            return Err(CapabilityValidationError::ValueDoesNotMatchResolution);
        }
        Ok(())
    }

    pub fn constraint(&self, revision_id: &str) -> Option<&ConstraintRevision> {
        self.constraint_revisions
            .iter()
            .find(|revision| revision.revision_id == revision_id)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegisteredCapability {
    pub id: CapabilityId,
    pub declaration: CapabilityDeclaration,
}

impl RegisteredCapability {
    #[cfg(test)]
    pub fn for_test(
        id: CapabilityId,
        protocol: &str,
        external_id: &str,
        kind: CapabilityKind,
        physical_scope: PhysicalScope,
        freshness_ms: u64,
    ) -> Self {
        let now = DateTime::<Utc>::UNIX_EPOCH;
        Self {
            id,
            declaration: CapabilityDeclaration {
                identity: CapabilityIdentity {
                    device: DeviceIdentity::new(protocol, external_id).unwrap(),
                    component_path: Vec::new(),
                    kind,
                    physical_scope,
                },
                unit: kind.canonical_unit(),
                directionality: Directionality::Nonnegative,
                constraint_revisions: vec![ConstraintRevision {
                    revision_id: "limits-1".into(),
                    declared_at: now,
                    effective_at: now,
                    scale: 0,
                    bounds: FixedPointBounds {
                        minimum: 0,
                        maximum: 1_000_000,
                    },
                    resolution: 1,
                    freshness_ms,
                    history_admission: HistoryAdmissionRate {
                        maximum_observations: 60,
                        interval_ms: 60_000,
                    },
                    accuracy: None,
                }],
            },
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompleteCapabilityManifest {
    pub device: DeviceIdentity,
    pub capabilities: Vec<CapabilityDeclaration>,
}

impl CompleteCapabilityManifest {
    pub fn validate(&self) -> Result<(), CapabilityValidationError> {
        self.device.validate()?;
        let mut identities = HashSet::new();
        for capability in &self.capabilities {
            capability.validate()?;
            if capability.identity.device != self.device {
                return Err(CapabilityValidationError::ManifestDeviceMismatch);
            }
            if !identities.insert(&capability.identity) {
                return Err(CapabilityValidationError::DuplicateCapabilityIdentity);
            }
        }
        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NumericValue {
    value: i64,
    scale: u8,
    constraint_revision_id: String,
}

impl NumericValue {
    pub fn value(&self) -> i64 {
        self.value
    }

    pub fn scale(&self) -> u8 {
        self.scale
    }

    pub fn constraint_revision_id(&self) -> &str {
        &self.constraint_revision_id
    }

    pub fn new(value: i64, scale: u8, constraint_revision_id: impl Into<String>) -> Self {
        Self {
            value,
            scale,
            constraint_revision_id: constraint_revision_id.into(),
        }
    }

    #[cfg(test)]
    pub fn for_test(value: i64, scale: u8, constraint_revision_id: &str) -> Self {
        Self {
            value,
            scale,
            constraint_revision_id: constraint_revision_id.into(),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum TimeTrust {
    Trustworthy,
    Untrustworthy,
}

impl TimeTrust {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Trustworthy => "trustworthy",
            Self::Untrustworthy => "untrustworthy",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(tag = "status", content = "value", rename_all = "camelCase")]
pub enum CapabilityReading {
    Value(NumericValue),
    Unavailable,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CapabilityObservation {
    pub capability_id: CapabilityId,
    pub kind: CapabilityKind,
    pub reading: CapabilityReading,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reset: Option<bool>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CapabilityReport {
    #[serde(default)]
    pub schema_version: Option<u16>,
    #[serde(default)]
    pub observation_id: Option<String>,
    #[serde(default)]
    pub observed_at: Option<DateTime<Utc>>,
    pub time_trust: TimeTrust,
    pub observations: Vec<CapabilityObservation>,
}

impl CapabilityReport {
    pub fn validate(&self) -> Result<(), CapabilityReportValidationError> {
        if let Some(observation_id) = &self.observation_id {
            validate_identifier("observation ID", observation_id)
                .map_err(|_| CapabilityReportValidationError::InvalidObservationId)?;
        }
        if self.observations.is_empty() {
            return Err(CapabilityReportValidationError::EmptyReport);
        }
        let mut capability_ids = HashSet::new();
        for observation in &self.observations {
            if !capability_ids.insert(observation.capability_id) {
                return Err(CapabilityReportValidationError::DuplicateCapability);
            }
        }
        Ok(())
    }
}

#[derive(Debug, Error, Clone, PartialEq, Eq)]
pub enum CapabilityReportValidationError {
    #[error("Capability report observation ID is invalid")]
    InvalidObservationId,
    #[error("Capability report must include at least one observation")]
    EmptyReport,
    #[error("Capability report contains the same Capability more than once")]
    DuplicateCapability,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum UnavailableReason {
    NeverObserved,
    Explicit,
    AdapterDisconnected,
    MissingInventory,
    FreshnessExpired,
    ManifestRemoved,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum Availability {
    Available,
    Unavailable {
        reason: UnavailableReason,
        since: DateTime<Utc>,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CapabilityState {
    pub capability_id: CapabilityId,
    pub device: DeviceIdentity,
    pub physical_scope: PhysicalScope,
    pub kind: CapabilityKind,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value: Option<NumericValue>,
    pub availability: Availability,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub observed_at: Option<DateTime<Utc>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub received_at: Option<DateTime<Utc>>,
    pub revision: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CapabilityChange {
    pub epoch: StateEpoch,
    pub revision: u64,
    pub state: CapabilityState,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CapabilitySnapshot {
    pub epoch: StateEpoch,
    pub revision: u64,
    pub capabilities: Vec<CapabilityState>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum CurrentStateDisposition {
    Changed,
    Unchanged,
    ExactReplay,
    Older,
    UnknownCapability,
    InactiveCapability,
    KindMismatch,
    InvalidValue,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum HistoryRejection {
    MissingObservationId,
    MissingObservedAt,
    UntrustworthyTime,
    UnsupportedSchemaVersion,
    ExactReplay,
    Unavailable,
    InvalidCapability,
    AdmissionRate,
    QueueFull,
    /// Observation time is older than that Capability kind's correction window.
    Late,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "status", content = "reason", rename_all = "camelCase")]
pub enum HistoryAdmissionOutcome {
    Eligible,
    Rejected(HistoryRejection),
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ObservationOutcome {
    pub capability_id: CapabilityId,
    pub current: CurrentStateDisposition,
    pub history: HistoryAdmissionOutcome,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IngestResult {
    pub outcomes: Vec<ObservationOutcome>,
    pub changes: Vec<CapabilityChange>,
}

#[derive(Debug, Error, Clone, PartialEq, Eq)]
pub enum CapabilityValidationError {
    #[error("{name} must be a nonempty string of at most {maximum_length} characters")]
    InvalidIdentifier {
        name: &'static str,
        maximum_length: usize,
    },
    #[error("Component path cannot contain more than 32 segments")]
    ComponentPathTooDeep,
    #[error("invalid physical scope")]
    InvalidPhysicalScope,
    #[error("invalid Capability kind: {0}")]
    InvalidKind(String),
    #[error("Capability unit does not match its kind")]
    UnitDoesNotMatchKind,
    #[error("Capability directionality does not match its kind or bounds")]
    InvalidDirectionality,
    #[error("Capability must declare at least one constraint revision")]
    MissingConstraintRevision,
    #[error("constraint revision cannot take effect before it was declared")]
    RetroactiveConstraintRevision,
    #[error("invalid fixed-point scale {0}")]
    InvalidScale(u8),
    #[error("invalid fixed-point bounds")]
    InvalidBounds,
    #[error("invalid fixed-point resolution")]
    InvalidResolution,
    #[error("invalid freshness limit")]
    InvalidFreshness,
    #[error("invalid History admission rate")]
    InvalidHistoryAdmissionRate,
    #[error("invalid accuracy")]
    InvalidAccuracy,
    #[error("constraint revision identities must be unique")]
    DuplicateConstraintRevision,
    #[error("constraint revisions must have increasing effective times")]
    UnorderedConstraintRevisions,
    #[error("value names an unknown constraint revision")]
    UnknownConstraintRevision,
    #[error("value scale does not match its constraint revision")]
    ValueScaleDoesNotMatchRevision,
    #[error("value is outside its Capability bounds")]
    ValueOutsideBounds,
    #[error("value does not align with Capability resolution")]
    ValueDoesNotMatchResolution,
    #[error("Capability manifest contains a different Device identity")]
    ManifestDeviceMismatch,
    #[error("Capability manifest contains a duplicate identity")]
    DuplicateCapabilityIdentity,
}

fn validate_identifier(name: &'static str, value: &str) -> Result<(), CapabilityValidationError> {
    validate_identifier_with_limit(name, value, MAX_ID_LENGTH)
}

fn validate_identifier_with_limit(
    name: &'static str,
    value: &str,
    maximum_length: usize,
) -> Result<(), CapabilityValidationError> {
    if value.trim() != value || value.is_empty() || value.chars().count() > maximum_length {
        return Err(CapabilityValidationError::InvalidIdentifier {
            name,
            maximum_length,
        });
    }
    Ok(())
}

fn safe_integer(value: i64) -> bool {
    value.unsigned_abs() <= MAX_SAFE_INTEGER as u64
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn deserializes_the_protocol_fixed_point_shape() {
        let declaration = serde_json::from_value::<CapabilityDeclaration>(json!({
            "identity": {
                "device": { "protocol": "zigbee", "externalId": "plug-1" },
                "componentPath": ["endpoint-1"],
                "kind": "power",
                "physicalScope": { "kind": "device" }
            },
            "unit": "W",
            "directionality": "nonnegative",
            "constraintRevisions": [{
                "revisionId": "limits-1",
                "declaredAt": "2026-09-13T12:00:00Z",
                "effectiveAt": "2026-09-13T12:00:00Z",
                "scale": 3,
                "bounds": { "minimum": 0, "maximum": 1000000 },
                "resolution": 1,
                "freshnessMs": 30000,
                "historyAdmission": {
                    "maximumObservations": 60,
                    "intervalMs": 60000
                },
                "accuracy": {
                    "kind": "absoluteAndRelative",
                    "absoluteMaximumError": 5,
                    "relativeMaximumErrorPpm": 10000
                }
            }]
        }))
        .unwrap();

        assert_eq!(declaration.identity.kind, CapabilityKind::Power);
        assert_eq!(declaration.constraint_revisions[0].bounds.minimum, 0);
        declaration.validate().unwrap();
    }

    #[test]
    fn deserializes_a_typed_observation_without_an_intermediate_json_value() {
        let capability_id = Uuid::from_u128(42);
        let report = serde_json::from_value::<CapabilityReport>(json!({
            "schemaVersion": 1,
            "observationId": "observation-1",
            "observedAt": "2026-09-13T12:00:00Z",
            "timeTrust": "trustworthy",
            "observations": [{
                "capabilityId": capability_id,
                "kind": "power",
                "reading": {
                    "status": "value",
                    "value": {
                        "value": 12345,
                        "scale": 3,
                        "constraintRevisionId": "limits-1"
                    }
                }
            }]
        }))
        .unwrap();

        report.validate().unwrap();
        assert_eq!(
            report.observations[0].capability_id.into_uuid(),
            capability_id
        );
    }

    #[test]
    fn rejects_duplicate_capabilities_at_the_report_boundary() {
        let capability_id = CapabilityId::from_uuid(Uuid::new_v4());
        let observation = CapabilityObservation {
            capability_id,
            kind: CapabilityKind::Power,
            reading: CapabilityReading::Unavailable,
            reset: None,
        };
        let report = CapabilityReport {
            schema_version: Some(1),
            observation_id: Some("observation-1".into()),
            observed_at: Some(DateTime::<Utc>::UNIX_EPOCH),
            time_trust: TimeTrust::Trustworthy,
            observations: vec![observation.clone(), observation],
        };

        assert_eq!(
            report.validate(),
            Err(CapabilityReportValidationError::DuplicateCapability)
        );
    }
}
