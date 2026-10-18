use std::collections::{BTreeMap, HashMap, HashSet};
use std::sync::RwLock;
use std::sync::atomic::{AtomicU64, Ordering};

use chrono::{DateTime, Utc};
use tokio::sync::broadcast;

use super::types::{
    Availability, CapabilityChange, CapabilityId, CapabilityKind, CapabilityObservation,
    CapabilityReading, CapabilityReport, CapabilitySnapshot, CapabilityState,
    CurrentStateDisposition, DeviceIdentity, HistoryAdmissionOutcome, HistoryRejection,
    IngestResult, ObservationOutcome, RegisteredCapability, StateEpoch, TimeTrust,
    UnavailableReason,
};

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
struct ObservationFingerprint {
    schema_version: Option<u16>,
    observation_id: Option<String>,
    observed_at: Option<DateTime<Utc>>,
    time_trust: TimeTrust,
    kind: CapabilityKind,
    reading: CapabilityReading,
}

#[derive(Debug)]
struct ReplayWindow {
    observed_at: Option<DateTime<Utc>>,
    fingerprints: HashSet<ObservationFingerprint>,
}

#[derive(Debug, Default)]
struct InnerState {
    revision: u64,
    definitions: BTreeMap<CapabilityId, RegisteredCapability>,
    active: HashSet<CapabilityId>,
    states: BTreeMap<CapabilityId, CapabilityState>,
    receipt_orders: HashMap<CapabilityId, u64>,
    replay_windows: HashMap<CapabilityId, ReplayWindow>,
}

#[derive(Debug)]
pub struct CurrentState {
    epoch: StateEpoch,
    next_receipt_order: AtomicU64,
    inner: RwLock<InnerState>,
    events: broadcast::Sender<CapabilityChange>,
}

impl CurrentState {
    pub fn new(epoch: StateEpoch) -> Self {
        let (events, _) = broadcast::channel(512);
        Self {
            epoch,
            next_receipt_order: AtomicU64::new(0),
            inner: RwLock::new(InnerState::default()),
            events,
        }
    }

    pub fn reconcile_manifest(
        &self,
        device: &DeviceIdentity,
        capabilities: Vec<RegisteredCapability>,
        reconciled_at: DateTime<Utc>,
    ) -> Vec<CapabilityChange> {
        let mut inner = self.inner.write().expect("Capability state lock poisoned");
        let mut changes = Vec::new();
        let retained = capabilities
            .iter()
            .map(|capability| capability.id)
            .collect::<HashSet<_>>();
        for capability in capabilities {
            let id = capability.id;
            let kind = capability.declaration.identity.kind;
            if !inner.states.contains_key(&id) {
                inner.revision = next_revision(inner.revision);
                let state = CapabilityState {
                    capability_id: id,
                    device: capability.declaration.identity.device.clone(),
                    physical_scope: capability.declaration.identity.physical_scope.clone(),
                    kind,
                    value: None,
                    availability: Availability::Unavailable {
                        reason: UnavailableReason::NeverObserved,
                        since: reconciled_at,
                    },
                    observed_at: None,
                    received_at: Some(reconciled_at),
                    revision: inner.revision,
                };
                inner.states.insert(id, state.clone());
                changes.push(CapabilityChange {
                    epoch: self.epoch,
                    revision: inner.revision,
                    state,
                });
            }
            inner.definitions.insert(id, capability);
            inner.active.insert(id);
        }
        let ids = inner
            .definitions
            .iter()
            .filter(|(id, capability)| {
                let capability_device = &capability.declaration.identity.device;
                inner.active.contains(id) && capability_device == device && !retained.contains(id)
            })
            .map(|(id, _)| *id)
            .collect::<Vec<_>>();
        for id in &ids {
            inner.active.remove(id);
        }
        changes.extend(transition_unavailable(
            self.epoch,
            &mut inner,
            ids,
            UnavailableReason::ManifestRemoved,
            reconciled_at,
        ));
        self.publish(&changes);
        drop(inner);
        changes
    }

    pub fn ingest(&self, report: CapabilityReport, received_at: DateTime<Utc>) -> IngestResult {
        let previous = self
            .next_receipt_order
            .fetch_update(Ordering::Relaxed, Ordering::Relaxed, |current| {
                current.checked_add(1)
            })
            .expect("Capability receipt order exhausted");
        self.ingest_with_receipt_order(report, received_at, previous + 1)
    }

    fn ingest_with_receipt_order(
        &self,
        report: CapabilityReport,
        received_at: DateTime<Utc>,
        receipt_order: u64,
    ) -> IngestResult {
        let mut inner = self.inner.write().expect("Capability state lock poisoned");
        let mut outcomes = Vec::with_capacity(report.observations.len());
        let mut changes = Vec::new();

        for observation in &report.observations {
            let id = observation.capability_id;
            let Some(definition) = inner.definitions.get(&id).cloned() else {
                outcomes.push(invalid_outcome(
                    id,
                    CurrentStateDisposition::UnknownCapability,
                ));
                continue;
            };
            if !inner.active.contains(&id) {
                outcomes.push(invalid_outcome(
                    id,
                    CurrentStateDisposition::InactiveCapability,
                ));
                continue;
            }
            if definition.declaration.identity.kind != observation.kind {
                outcomes.push(invalid_outcome(id, CurrentStateDisposition::KindMismatch));
                continue;
            }
            if let CapabilityReading::Value(value) = &observation.reading
                && definition.declaration.validate_value(value).is_err()
            {
                outcomes.push(invalid_outcome(id, CurrentStateDisposition::InvalidValue));
                continue;
            }

            let fingerprint = ObservationFingerprint {
                schema_version: report.schema_version,
                observation_id: report.observation_id.clone(),
                observed_at: report.observed_at,
                time_trust: report.time_trust,
                kind: observation.kind,
                reading: observation.reading.clone(),
            };
            if inner.replay_windows.get(&id).is_some_and(|window| {
                window.observed_at == report.observed_at
                    && window.fingerprints.contains(&fingerprint)
            }) {
                outcomes.push(ObservationOutcome {
                    capability_id: id,
                    current: CurrentStateDisposition::ExactReplay,
                    history: HistoryAdmissionOutcome::Rejected(HistoryRejection::ExactReplay),
                });
                continue;
            }

            let history = history_outcome(&report, observation);
            let current = inner
                .states
                .get(&id)
                .cloned()
                .expect("registered state missing");
            let current_receipt_order = inner.receipt_orders.get(&id).copied().unwrap_or(0);
            let disposition = match (current.observed_at, report.observed_at) {
                (Some(current_observed_at), Some(observed_at))
                    if observed_at < current_observed_at =>
                {
                    CurrentStateDisposition::Older
                }
                (Some(current_observed_at), Some(observed_at))
                    if observed_at == current_observed_at
                        && receipt_order < current_receipt_order =>
                {
                    CurrentStateDisposition::Older
                }
                _ => apply_observation(
                    self.epoch,
                    &mut inner,
                    &definition,
                    observation,
                    report.observed_at,
                    received_at,
                    &mut changes,
                ),
            };
            if matches!(
                disposition,
                CurrentStateDisposition::Changed
                    | CurrentStateDisposition::Unchanged
                    | CurrentStateDisposition::Older
            ) {
                if disposition != CurrentStateDisposition::Older {
                    inner.receipt_orders.insert(id, receipt_order);
                }
                record_fingerprint(&mut inner, id, report.observed_at, fingerprint);
            }
            outcomes.push(ObservationOutcome {
                capability_id: id,
                current: disposition,
                history,
            });
        }

        self.publish(&changes);
        drop(inner);
        IngestResult { outcomes, changes }
    }

    pub fn mark_device_unavailable(
        &self,
        device: &DeviceIdentity,
        reason: UnavailableReason,
        changed_at: DateTime<Utc>,
    ) -> Vec<CapabilityChange> {
        let mut inner = self.inner.write().expect("Capability state lock poisoned");
        let ids = matching_capabilities(&inner, |capability| {
            capability.declaration.identity.device == *device
        });
        let changes = transition_unavailable(self.epoch, &mut inner, ids, reason, changed_at);
        self.publish(&changes);
        drop(inner);
        changes
    }

    pub fn mark_protocol_unavailable(
        &self,
        protocol: &str,
        reason: UnavailableReason,
        changed_at: DateTime<Utc>,
    ) -> Vec<CapabilityChange> {
        let mut inner = self.inner.write().expect("Capability state lock poisoned");
        let ids = matching_capabilities(&inner, |capability| {
            capability.declaration.identity.device.protocol == protocol
        });
        let changes = transition_unavailable(self.epoch, &mut inner, ids, reason, changed_at);
        self.publish(&changes);
        drop(inner);
        changes
    }

    pub fn mark_all_unavailable(
        &self,
        reason: UnavailableReason,
        changed_at: DateTime<Utc>,
    ) -> Vec<CapabilityChange> {
        let mut inner = self.inner.write().expect("Capability state lock poisoned");
        let ids = inner.active.iter().copied().collect();
        let changes = transition_unavailable(self.epoch, &mut inner, ids, reason, changed_at);
        self.publish(&changes);
        drop(inner);
        changes
    }

    pub fn expire_freshness(&self, now: DateTime<Utc>) -> Vec<CapabilityChange> {
        let mut inner = self.inner.write().expect("Capability state lock poisoned");
        let ids = inner
            .states
            .iter()
            .filter_map(|(id, state)| {
                if !inner.active.contains(id) {
                    return None;
                }
                if state.availability != Availability::Available {
                    return None;
                }
                let observed_at = state.observed_at?;
                let value = state.value.as_ref()?;
                let definition = inner.definitions.get(id)?;
                let constraint = definition
                    .declaration
                    .constraint(value.constraint_revision_id())?;
                (now >= constraint.freshness_deadline(observed_at)).then_some(*id)
            })
            .collect();
        let changes = transition_unavailable(
            self.epoch,
            &mut inner,
            ids,
            UnavailableReason::FreshnessExpired,
            now,
        );
        self.publish(&changes);
        drop(inner);
        changes
    }

    pub fn registered(&self, id: CapabilityId) -> Option<RegisteredCapability> {
        self.inner
            .read()
            .expect("Capability state lock poisoned")
            .definitions
            .get(&id)
            .cloned()
    }

    pub fn snapshot(&self) -> CapabilitySnapshot {
        let inner = self.inner.read().expect("Capability state lock poisoned");
        CapabilitySnapshot {
            epoch: self.epoch,
            revision: inner.revision,
            capabilities: inner.states.values().cloned().collect(),
        }
    }

    pub fn subscribe(&self) -> broadcast::Receiver<CapabilityChange> {
        self.events.subscribe()
    }

    fn publish(&self, changes: &[CapabilityChange]) {
        for change in changes {
            let _ = self.events.send(change.clone());
        }
    }
}

fn apply_observation(
    epoch: StateEpoch,
    inner: &mut InnerState,
    definition: &RegisteredCapability,
    observation: &CapabilityObservation,
    observed_at: Option<DateTime<Utc>>,
    received_at: DateTime<Utc>,
    changes: &mut Vec<CapabilityChange>,
) -> CurrentStateDisposition {
    let id = observation.capability_id;
    let current = inner
        .states
        .get(&id)
        .cloned()
        .expect("registered state missing");
    let (value, availability) = match &observation.reading {
        CapabilityReading::Value(value) => (Some(value.clone()), Availability::Available),
        CapabilityReading::Unavailable => {
            let since = match current.availability {
                Availability::Unavailable { since, .. } => since,
                _ => received_at,
            };
            (
                current.value.clone(),
                Availability::Unavailable {
                    reason: UnavailableReason::Explicit,
                    since,
                },
            )
        }
    };
    let no_visible_change = current.value == value
        && current.availability == availability
        && current.observed_at == observed_at;
    if no_visible_change {
        return CurrentStateDisposition::Unchanged;
    }

    inner.revision = next_revision(inner.revision);
    let state = CapabilityState {
        capability_id: id,
        device: definition.declaration.identity.device.clone(),
        physical_scope: definition.declaration.identity.physical_scope.clone(),
        kind: observation.kind,
        value,
        availability,
        observed_at,
        received_at: Some(received_at),
        revision: inner.revision,
    };
    inner.states.insert(id, state.clone());
    changes.push(CapabilityChange {
        epoch,
        revision: inner.revision,
        state,
    });
    CurrentStateDisposition::Changed
}

fn history_outcome(
    report: &CapabilityReport,
    observation: &CapabilityObservation,
) -> HistoryAdmissionOutcome {
    if report.schema_version != Some(1) {
        return HistoryAdmissionOutcome::Rejected(HistoryRejection::UnsupportedSchemaVersion);
    }
    if report.observation_id.is_none() {
        return HistoryAdmissionOutcome::Rejected(HistoryRejection::MissingObservationId);
    }
    if report.observed_at.is_none() {
        return HistoryAdmissionOutcome::Rejected(HistoryRejection::MissingObservedAt);
    }
    if report.time_trust != TimeTrust::Trustworthy {
        return HistoryAdmissionOutcome::Rejected(HistoryRejection::UntrustworthyTime);
    }
    if observation.reading == CapabilityReading::Unavailable {
        return HistoryAdmissionOutcome::Rejected(HistoryRejection::Unavailable);
    }
    HistoryAdmissionOutcome::Eligible
}

fn invalid_outcome(id: CapabilityId, current: CurrentStateDisposition) -> ObservationOutcome {
    ObservationOutcome {
        capability_id: id,
        current,
        history: HistoryAdmissionOutcome::Rejected(HistoryRejection::InvalidCapability),
    }
}

fn matching_capabilities(
    inner: &InnerState,
    predicate: impl Fn(&RegisteredCapability) -> bool,
) -> Vec<CapabilityId> {
    inner
        .definitions
        .iter()
        .filter_map(|(id, capability)| {
            (inner.active.contains(id) && predicate(capability)).then_some(*id)
        })
        .collect()
}

fn record_fingerprint(
    inner: &mut InnerState,
    id: CapabilityId,
    observed_at: Option<DateTime<Utc>>,
    fingerprint: ObservationFingerprint,
) {
    match inner.replay_windows.entry(id) {
        std::collections::hash_map::Entry::Occupied(mut entry)
            if entry.get().observed_at == observed_at =>
        {
            entry.get_mut().fingerprints.insert(fingerprint);
        }
        std::collections::hash_map::Entry::Occupied(mut entry)
            if entry.get().observed_at < observed_at =>
        {
            entry.insert(ReplayWindow {
                observed_at,
                fingerprints: HashSet::from([fingerprint]),
            });
        }
        std::collections::hash_map::Entry::Occupied(_) => {}
        std::collections::hash_map::Entry::Vacant(entry) => {
            entry.insert(ReplayWindow {
                observed_at,
                fingerprints: HashSet::from([fingerprint]),
            });
        }
    }
}

fn transition_unavailable(
    epoch: StateEpoch,
    inner: &mut InnerState,
    ids: Vec<CapabilityId>,
    reason: UnavailableReason,
    changed_at: DateTime<Utc>,
) -> Vec<CapabilityChange> {
    let mut changes = Vec::new();
    for id in ids {
        let Some(current) = inner.states.get(&id).cloned() else {
            continue;
        };
        let availability = Availability::Unavailable {
            reason: reason.clone(),
            since: match &current.availability {
                Availability::Available => changed_at,
                Availability::Unavailable { since, .. } => *since,
            },
        };
        if let Availability::Unavailable {
            reason: current_reason,
            ..
        } = &current.availability
            && (current_reason == &reason || reason != UnavailableReason::ManifestRemoved)
        {
            continue;
        }
        inner.revision = next_revision(inner.revision);
        let state = CapabilityState {
            availability,
            received_at: Some(changed_at),
            revision: inner.revision,
            ..current
        };
        inner.states.insert(id, state.clone());
        changes.push(CapabilityChange {
            epoch,
            revision: inner.revision,
            state,
        });
    }
    changes
}

fn next_revision(current: u64) -> u64 {
    current
        .checked_add(1)
        .expect("Capability state revision exhausted")
}

#[cfg(test)]
mod tests {
    use chrono::{TimeZone, Utc};
    use uuid::Uuid;

    use crate::capabilities::{
        Availability, CapabilityChange, CapabilityId, CapabilityKind, CapabilityObservation,
        CapabilityReading, CapabilityReport, CapabilityState, CurrentState,
        CurrentStateDisposition, DeviceIdentity, HistoryAdmissionOutcome, HistoryRejection,
        NumericValue, PhysicalScope, RegisteredCapability, StateEpoch, TimeTrust,
        UnavailableReason,
    };

    fn at(second: i64) -> chrono::DateTime<Utc> {
        Utc.timestamp_opt(second, 0).single().unwrap()
    }

    fn id(value: u128) -> CapabilityId {
        CapabilityId::from_uuid(Uuid::from_u128(value))
    }

    fn capability(
        capability_id: CapabilityId,
        protocol: &str,
        external_id: &str,
        freshness_ms: u64,
    ) -> RegisteredCapability {
        RegisteredCapability::for_test(
            capability_id,
            protocol,
            external_id,
            CapabilityKind::Power,
            PhysicalScope::Device,
            freshness_ms,
        )
    }

    fn device(protocol: &str, external_id: &str) -> DeviceIdentity {
        DeviceIdentity::new(protocol, external_id).unwrap()
    }

    fn value(raw: i64) -> NumericValue {
        NumericValue::for_test(raw, 0, "limits-1")
    }

    fn observation(capability_id: CapabilityId, raw: i64) -> CapabilityObservation {
        CapabilityObservation {
            capability_id,
            kind: CapabilityKind::Power,
            reading: CapabilityReading::Value(value(raw)),
            reset: None,
        }
    }

    fn report(
        observation_id: Option<&str>,
        observed_at: i64,
        time_trust: TimeTrust,
        observations: Vec<CapabilityObservation>,
    ) -> CapabilityReport {
        CapabilityReport {
            schema_version: Some(1),
            observation_id: observation_id.map(str::to_string),
            observed_at: Some(at(observed_at)),
            time_trust,
            observations,
        }
    }

    fn changed(outcome: &[CapabilityChange]) -> &CapabilityState {
        assert_eq!(outcome.len(), 1);
        &outcome[0].state
    }

    #[test]
    fn increments_revision_and_exact_replay_has_no_effect() {
        let capability_id = id(1);
        let state = CurrentState::new(StateEpoch::from_uuid(Uuid::from_u128(99)));
        state.reconcile_manifest(
            &device("zigbee", "plug-1"),
            vec![capability(capability_id, "zigbee", "plug-1", 60_000)],
            at(0),
        );
        let input = report(
            Some("observation-1"),
            10,
            TimeTrust::Trustworthy,
            vec![observation(capability_id, 120)],
        );

        let first = state.ingest(input.clone(), at(11));
        let first_state = changed(&first.changes);
        assert_eq!(first_state.revision, 2);
        assert_eq!(first_state.availability, Availability::Available);
        assert_eq!(first.outcomes[0].current, CurrentStateDisposition::Changed);
        assert_eq!(first.outcomes[0].history, HistoryAdmissionOutcome::Eligible);

        let replay = state.ingest(input, at(12));
        assert!(replay.changes.is_empty());
        assert_eq!(
            replay.outcomes[0].current,
            CurrentStateDisposition::ExactReplay
        );
        assert_eq!(
            replay.outcomes[0].history,
            HistoryAdmissionOutcome::Rejected(HistoryRejection::ExactReplay)
        );
        assert_eq!(state.snapshot().revision, 2);
    }

    #[test]
    fn manifest_reconciliation_versions_every_snapshot_visible_change() {
        let capability_id = id(12);
        let capability = capability(capability_id, "zigbee", "plug-1", 60_000);
        let device = device("zigbee", "plug-1");
        let state = CurrentState::new(StateEpoch::from_uuid(Uuid::from_u128(99)));
        let mut events = state.subscribe();

        let added = state.reconcile_manifest(&device, vec![capability.clone()], at(5));
        assert_eq!(changed(&added).revision, 1);
        assert_eq!(events.try_recv().unwrap(), added[0]);
        assert!(
            state
                .reconcile_manifest(&device, vec![capability], at(6))
                .is_empty()
        );
        assert_eq!(state.snapshot().revision, 1);

        let removed = state.reconcile_manifest(&device, Vec::new(), at(7));
        assert_eq!(changed(&removed).revision, 2);
        assert_eq!(
            removed[0].state.availability,
            Availability::Unavailable {
                reason: UnavailableReason::ManifestRemoved,
                since: at(5),
            }
        );
        assert_eq!(state.snapshot().revision, 2);
    }

    #[test]
    fn exact_replay_cannot_roll_back_an_intervening_equal_time_report() {
        let capability_id = id(10);
        let state = CurrentState::new(StateEpoch::from_uuid(Uuid::from_u128(99)));
        state.reconcile_manifest(
            &device("zigbee", "plug-1"),
            vec![capability(capability_id, "zigbee", "plug-1", 60_000)],
            at(0),
        );
        let first = report(
            Some("observation-1"),
            10,
            TimeTrust::Trustworthy,
            vec![observation(capability_id, 100)],
        );
        state.ingest(first.clone(), at(11));
        state.ingest(
            report(
                Some("observation-2"),
                10,
                TimeTrust::Trustworthy,
                vec![observation(capability_id, 101)],
            ),
            at(12),
        );
        state.ingest(
            report(
                Some("observation-older"),
                9,
                TimeTrust::Trustworthy,
                vec![observation(capability_id, 90)],
            ),
            at(12),
        );

        let replay = state.ingest(first, at(13));

        assert!(replay.changes.is_empty());
        assert_eq!(
            replay.outcomes[0].current,
            CurrentStateDisposition::ExactReplay
        );
        let snapshot = state.snapshot();
        assert_eq!(snapshot.revision, 3);
        assert_eq!(
            snapshot.capabilities[0].value.as_ref().unwrap().value(),
            101
        );
    }

    #[test]
    fn newer_observed_at_wins_and_receipt_order_breaks_ties() {
        let capability_id = id(2);
        let state = CurrentState::new(StateEpoch::from_uuid(Uuid::from_u128(99)));
        state.reconcile_manifest(
            &device("zigbee", "plug-1"),
            vec![capability(capability_id, "zigbee", "plug-1", 60_000)],
            at(0),
        );

        state.ingest(
            report(
                Some("observation-1"),
                10,
                TimeTrust::Trustworthy,
                vec![observation(capability_id, 100)],
            ),
            at(11),
        );
        let older = state.ingest(
            report(
                Some("observation-old"),
                9,
                TimeTrust::Trustworthy,
                vec![observation(capability_id, 90)],
            ),
            at(12),
        );
        assert!(older.changes.is_empty());
        assert_eq!(older.outcomes[0].current, CurrentStateDisposition::Older);
        assert_eq!(older.outcomes[0].history, HistoryAdmissionOutcome::Eligible);

        let equal_time = state.ingest(
            report(
                Some("observation-2"),
                10,
                TimeTrust::Trustworthy,
                vec![observation(capability_id, 101)],
            ),
            at(13),
        );
        let current = changed(&equal_time.changes);
        assert_eq!(current.value.as_ref().unwrap().value(), 101);
        assert_eq!(current.revision, 3);

        let received_earlier = state.ingest_with_receipt_order(
            report(
                Some("observation-reordered"),
                10,
                TimeTrust::Trustworthy,
                vec![observation(capability_id, 99)],
            ),
            at(14),
            1,
        );
        assert!(received_earlier.changes.is_empty());
        assert_eq!(
            received_earlier.outcomes[0].current,
            CurrentStateDisposition::Older
        );
        let replayed_earlier = state.ingest(
            report(
                Some("observation-reordered"),
                10,
                TimeTrust::Trustworthy,
                vec![observation(capability_id, 99)],
            ),
            at(15),
        );
        assert!(replayed_earlier.changes.is_empty());
        assert_eq!(
            replayed_earlier.outcomes[0].current,
            CurrentStateDisposition::ExactReplay
        );
    }

    #[test]
    fn missing_history_metadata_does_not_block_current_state() {
        let capability_id = id(3);
        let state = CurrentState::new(StateEpoch::from_uuid(Uuid::from_u128(99)));
        state.reconcile_manifest(
            &device("zigbee", "plug-1"),
            vec![capability(capability_id, "zigbee", "plug-1", 60_000)],
            at(0),
        );

        let outcome = state.ingest(
            report(
                None,
                10,
                TimeTrust::Untrustworthy,
                vec![observation(capability_id, 100)],
            ),
            at(11),
        );

        assert_eq!(changed(&outcome.changes).revision, 2);
        assert_eq!(
            outcome.outcomes[0].current,
            CurrentStateDisposition::Changed
        );
        assert_eq!(
            outcome.outcomes[0].history,
            HistoryAdmissionOutcome::Rejected(HistoryRejection::MissingObservationId)
        );
    }

    #[test]
    fn unavailable_keeps_the_value_and_only_a_new_observation_recovers() {
        let capability_id = id(4);
        let state = CurrentState::new(StateEpoch::from_uuid(Uuid::from_u128(99)));
        state.reconcile_manifest(
            &device("zigbee", "plug-1"),
            vec![capability(capability_id, "zigbee", "plug-1", 60_000)],
            at(0),
        );
        let original = report(
            Some("observation-1"),
            10,
            TimeTrust::Trustworthy,
            vec![observation(capability_id, 100)],
        );
        state.ingest(original.clone(), at(11));

        let unavailable = state.mark_device_unavailable(
            &device("zigbee", "plug-1"),
            UnavailableReason::Explicit,
            at(12),
        );
        let unavailable_state = changed(&unavailable);
        assert_eq!(
            unavailable_state.availability,
            Availability::Unavailable {
                reason: UnavailableReason::Explicit,
                since: at(12),
            }
        );
        assert_eq!(unavailable_state.value.as_ref().unwrap().value(), 100);

        assert!(state.ingest(original, at(13)).changes.is_empty());
        let recovered = state.ingest(
            report(
                Some("observation-2"),
                11,
                TimeTrust::Trustworthy,
                vec![observation(capability_id, 100)],
            ),
            at(14),
        );
        assert_eq!(
            changed(&recovered.changes).availability,
            Availability::Available
        );
    }

    #[test]
    fn disconnect_and_freshness_expiry_change_only_applicable_capabilities() {
        let zigbee_id = id(5);
        let matter_id = id(6);
        let state = CurrentState::new(StateEpoch::from_uuid(Uuid::from_u128(99)));
        state.reconcile_manifest(
            &device("zigbee", "plug-1"),
            vec![capability(zigbee_id, "zigbee", "plug-1", 1_000)],
            at(0),
        );
        state.reconcile_manifest(
            &device("matter", "node-1"),
            vec![capability(matter_id, "matter", "node-1", 1_000)],
            at(0),
        );
        state.ingest(
            report(
                Some("zigbee-observation"),
                10,
                TimeTrust::Trustworthy,
                vec![observation(zigbee_id, 100)],
            ),
            at(10),
        );
        state.ingest(
            report(
                Some("matter-observation"),
                10,
                TimeTrust::Trustworthy,
                vec![observation(matter_id, 200)],
            ),
            at(10),
        );

        let disconnected = state.mark_protocol_unavailable(
            "zigbee",
            UnavailableReason::AdapterDisconnected,
            at(10),
        );
        assert_eq!(disconnected.len(), 1);
        assert_eq!(disconnected[0].state.capability_id, zigbee_id);
        assert!(state.expire_freshness(at(10)).is_empty());

        let expired = state.expire_freshness(at(11));
        assert_eq!(expired.len(), 1);
        assert_eq!(expired[0].state.capability_id, matter_id);
        assert_eq!(
            expired[0].state.availability,
            Availability::Unavailable {
                reason: UnavailableReason::FreshnessExpired,
                since: at(11),
            }
        );
        assert!(state.expire_freshness(at(12)).is_empty());
    }

    #[test]
    fn snapshot_is_coherent_and_batch_emits_only_changed_capabilities() {
        let first_id = id(7);
        let second_id = id(8);
        let epoch = StateEpoch::from_uuid(Uuid::from_u128(99));
        let state = CurrentState::new(epoch);
        state.reconcile_manifest(
            &device("zigbee", "plug-1"),
            vec![
                capability(first_id, "zigbee", "plug-1", 60_000),
                capability(second_id, "zigbee", "plug-1", 60_000),
            ],
            at(0),
        );
        state.ingest(
            report(
                Some("observation-1"),
                10,
                TimeTrust::Trustworthy,
                vec![observation(first_id, 100)],
            ),
            at(10),
        );
        let mut events = state.subscribe();

        let batch = state.ingest(
            report(
                Some("observation-2"),
                10,
                TimeTrust::Trustworthy,
                vec![observation(first_id, 100), observation(second_id, 200)],
            ),
            at(11),
        );
        assert_eq!(batch.changes.len(), 1);
        assert_eq!(batch.changes[0].state.capability_id, second_id);
        assert_eq!(events.try_recv().unwrap().state.capability_id, second_id);
        assert!(matches!(
            events.try_recv(),
            Err(tokio::sync::broadcast::error::TryRecvError::Empty)
        ));

        let snapshot = state.snapshot();
        assert_eq!(snapshot.epoch, epoch);
        assert_eq!(snapshot.revision, 4);
        assert_eq!(snapshot.capabilities.len(), 2);
        assert!(
            snapshot
                .capabilities
                .iter()
                .all(|entry| entry.revision <= 4)
        );
    }

    #[test]
    fn repeated_explicit_unavailable_keeps_the_original_interval_start() {
        let capability_id = id(9);
        let state = CurrentState::new(StateEpoch::from_uuid(Uuid::from_u128(99)));
        state.reconcile_manifest(
            &device("zigbee", "plug-1"),
            vec![capability(capability_id, "zigbee", "plug-1", 60_000)],
            at(0),
        );
        state.ingest(
            report(
                Some("observation-1"),
                10,
                TimeTrust::Trustworthy,
                vec![observation(capability_id, 100)],
            ),
            at(10),
        );

        let unavailable = || CapabilityObservation {
            capability_id,
            kind: CapabilityKind::Power,
            reading: CapabilityReading::Unavailable,
            reset: None,
        };
        state.ingest(
            report(
                Some("unavailable-1"),
                11,
                TimeTrust::Trustworthy,
                vec![unavailable()],
            ),
            at(12),
        );
        let repeated = state.ingest(
            report(
                Some("unavailable-2"),
                13,
                TimeTrust::Trustworthy,
                vec![unavailable()],
            ),
            at(14),
        );

        assert_eq!(
            changed(&repeated.changes).availability,
            Availability::Unavailable {
                reason: UnavailableReason::Explicit,
                since: at(12),
            }
        );
        assert!(state
            .mark_protocol_unavailable(
                "zigbee",
                UnavailableReason::AdapterDisconnected,
                at(15),
            )
            .is_empty());
        assert_eq!(
            state.snapshot().capabilities[0].availability,
            Availability::Unavailable {
                reason: UnavailableReason::Explicit,
                since: at(12),
            }
        );
    }

    #[test]
    fn tombstoned_capability_rejects_reports_until_identity_reconciliation() {
        let capability_id = id(11);
        let state = CurrentState::new(StateEpoch::from_uuid(Uuid::from_u128(99)));
        let registered = capability(capability_id, "zigbee", "plug-1", 60_000);
        state.reconcile_manifest(&device("zigbee", "plug-1"), vec![registered.clone()], at(0));
        state.ingest(
            report(
                Some("observation-1"),
                10,
                TimeTrust::Trustworthy,
                vec![observation(capability_id, 100)],
            ),
            at(10),
        );
        state.reconcile_manifest(&device("zigbee", "plug-1"), Vec::new(), at(11));

        let stale = state.ingest(
            report(
                Some("observation-stale"),
                12,
                TimeTrust::Trustworthy,
                vec![observation(capability_id, 200)],
            ),
            at(12),
        );

        assert!(stale.changes.is_empty());
        assert_eq!(
            stale.outcomes[0].current,
            CurrentStateDisposition::InactiveCapability
        );
        assert_eq!(
            state.snapshot().capabilities[0].availability,
            Availability::Unavailable {
                reason: UnavailableReason::ManifestRemoved,
                since: at(11),
            }
        );

        state.reconcile_manifest(&device("zigbee", "plug-1"), vec![registered], at(13));
        let reconciled = state.ingest(
            report(
                Some("observation-reconciled"),
                13,
                TimeTrust::Trustworthy,
                vec![observation(capability_id, 200)],
            ),
            at(13),
        );
        assert_eq!(
            reconciled.outcomes[0].current,
            CurrentStateDisposition::Changed
        );
    }
}
