use std::sync::Arc;
use std::time::Duration;

use chrono::{DateTime, Utc};
use serde_json::json;
use thiserror::Error;
use tokio::sync::{broadcast, mpsc};

use crate::diagnostics::{self, DiagnosticKind, DiagnosticWrite};
use crate::state::DbPool;

use std::collections::HashMap;
use std::sync::Mutex;

use super::{
    AdapterCapabilityManifest, AdapterEnvelopeError, AdapterObservationReport, Admission,
    CapabilityChange, CapabilityReport, CapabilityReportValidationError, CapabilityRepository,
    CapabilitySnapshot, CapabilityStoreError, CompleteCapabilityManifest, CurrentState,
    CurrentStateDisposition, DeviceIdentity, HistoryAdmissionOutcome, HistoryRejection,
    IngestResult, ObservationDiagnostic, ObservationOutcome, RegisteredCapability, StateEpoch,
    UnavailableReason, resolve_adapter_report,
};

#[derive(Clone)]
struct CachedManifest {
    supported_versions: Vec<u16>,
    declarations: Vec<super::CapabilityDeclaration>,
    registered: Vec<RegisteredCapability>,
}

pub struct CapabilityService {
    repository: CapabilityRepository,
    current: Arc<CurrentState>,
    manifests: Mutex<HashMap<DeviceIdentity, CachedManifest>>,
    history: Arc<Mutex<super::history::HistoryGate>>,
    history_store: super::history::HistoryRepository,
    diagnostic_tx: mpsc::UnboundedSender<DiagnosticWrite>,
}

impl CapabilityService {
    pub fn new(pool: DbPool, history_pool: DbPool) -> Self {
        let (diagnostic_tx, diagnostic_rx) = mpsc::unbounded_channel();
        diagnostics::spawn_writer(pool.clone(), diagnostic_rx);
        Self {
            repository: CapabilityRepository::new(pool),
            current: Arc::new(CurrentState::new(StateEpoch::new())),
            manifests: Mutex::new(HashMap::new()),
            history: Arc::new(Mutex::new(super::history::HistoryGate::new(
                super::history::HISTORY_QUEUE_CAPACITY,
            ))),
            history_store: super::history::HistoryRepository::new(history_pool),
            diagnostic_tx,
        }
    }

    pub async fn register_adapter_manifest(
        &self,
        manifest: AdapterCapabilityManifest,
        received_at: DateTime<Utc>,
    ) -> Result<Vec<RegisteredCapability>, CapabilityServiceError> {
        self.reconcile_cached(manifest, received_at).await
    }

    pub fn ingest_registered_report(
        &self,
        device: &DeviceIdentity,
        report: &AdapterObservationReport,
        received_at: DateTime<Utc>,
    ) -> Result<IngestResult, CapabilityServiceError> {
        let cached = self
            .manifests
            .lock()
            .expect("capability manifest cache poisoned")
            .get(device)
            .cloned()
            .ok_or(CapabilityServiceError::UnregisteredManifest)?;
        let resolved =
            resolve_adapter_report(&cached.registered, &cached.supported_versions, report)?;
        self.ingest_report(resolved, received_at)
    }

    pub async fn admit_adapter(
        &self,
        manifest: AdapterCapabilityManifest,
        report: AdapterObservationReport,
        received_at: DateTime<Utc>,
    ) -> Result<Admission, CapabilityServiceError> {
        let supported_versions = manifest.supported_observation_envelope_versions.clone();
        let registered = self.reconcile_cached(manifest, received_at).await?;
        let resolved = resolve_adapter_report(&registered, &supported_versions, &report)?;
        let ingest = self.ingest_report(resolved, received_at)?;
        Ok(Admission { registered, ingest })
    }

    async fn reconcile_cached(
        &self,
        manifest: AdapterCapabilityManifest,
        received_at: DateTime<Utc>,
    ) -> Result<Vec<RegisteredCapability>, CapabilityServiceError> {
        if let Some(cached) = self
            .manifests
            .lock()
            .expect("capability manifest cache poisoned")
            .get(&manifest.device)
            && cached.declarations == manifest.capabilities
            && cached.supported_versions == manifest.supported_observation_envelope_versions
        {
            return Ok(cached.registered.clone());
        }

        let device = manifest.device.clone();
        let supported_versions = manifest.supported_observation_envelope_versions.clone();
        let declarations = manifest.capabilities.clone();
        let complete = manifest.complete()?;
        let registered = self.reconcile_manifest(complete, received_at).await?;
        self.manifests
            .lock()
            .expect("capability manifest cache poisoned")
            .insert(
                device,
                CachedManifest {
                    supported_versions,
                    declarations,
                    registered: registered.clone(),
                },
            );
        Ok(registered)
    }

    pub async fn reconcile_manifest(
        &self,
        manifest: CompleteCapabilityManifest,
        received_at: DateTime<Utc>,
    ) -> Result<Vec<RegisteredCapability>, CapabilityServiceError> {
        let device = manifest.device.clone();
        let registered = self
            .repository
            .reconcile_complete_manifest(manifest, received_at)
            .await?;
        self.current
            .reconcile_manifest(&device, registered.clone(), received_at);
        Ok(registered)
    }

    pub async fn tombstone_device(
        &self,
        device: &DeviceIdentity,
        removed_at: DateTime<Utc>,
    ) -> Result<(), CapabilityServiceError> {
        self.repository
            .tombstone_device(device.clone(), removed_at)
            .await?;
        self.current
            .reconcile_manifest(device, Vec::new(), removed_at);
        self.manifests
            .lock()
            .expect("capability manifest cache poisoned")
            .remove(device);
        Ok(())
    }

    /// Deserializes a report directly into the boundary type. Callers never
    /// pass observations through an untyped JSON value inside Core.
    pub fn ingest_json(
        &self,
        payload: &str,
        received_at: DateTime<Utc>,
    ) -> Result<IngestResult, CapabilityServiceError> {
        let report = serde_json::from_str::<CapabilityReport>(payload)?;
        self.ingest_report(report, received_at)
    }

    pub fn constraint_revisions(
        &self,
        id: super::CapabilityId,
    ) -> Option<Vec<super::ConstraintRevision>> {
        self.current
            .registered(id)
            .map(|registered| registered.declaration.constraint_revisions)
    }

    pub fn ingest_report(
        &self,
        report: CapabilityReport,
        received_at: DateTime<Utc>,
    ) -> Result<IngestResult, CapabilityServiceError> {
        report.validate()?;
        let mut result = self.current.ingest(report.clone(), received_at);
        self.history.lock().expect("history gate poisoned").admit(
            &mut result,
            &report,
            received_at,
            |id| self.current.registered(id),
        );
        for write in diagnostic_writes(&result.outcomes, received_at) {
            let _ = self.diagnostic_tx.send(write);
        }
        Ok(result)
    }

    pub fn mark_device_unavailable(
        &self,
        device: &DeviceIdentity,
        reason: UnavailableReason,
        changed_at: DateTime<Utc>,
    ) -> Vec<CapabilityChange> {
        self.current
            .mark_device_unavailable(device, reason, changed_at)
    }

    pub fn mark_protocol_unavailable(
        &self,
        protocol: &str,
        reason: UnavailableReason,
        changed_at: DateTime<Utc>,
    ) -> Vec<CapabilityChange> {
        self.current
            .mark_protocol_unavailable(protocol, reason, changed_at)
    }

    pub fn mark_all_unavailable(
        &self,
        reason: UnavailableReason,
        changed_at: DateTime<Utc>,
    ) -> Vec<CapabilityChange> {
        self.current.mark_all_unavailable(reason, changed_at)
    }

    pub fn snapshot(&self) -> CapabilitySnapshot {
        self.current.snapshot()
    }

    pub fn subscribe(&self) -> broadcast::Receiver<CapabilityChange> {
        self.current.subscribe()
    }

    pub fn spawn_history_loop(&self) {
        super::history::spawn_loop(Arc::clone(&self.history), self.history_store.clone());
    }

    pub fn spawn_freshness_loop(&self) {
        let current = Arc::clone(&self.current);
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(Duration::from_secs(1));
            loop {
                interval.tick().await;
                current.expire_freshness(Utc::now());
            }
        });
    }
}

pub(crate) fn diagnostic_writes(
    outcomes: &[ObservationOutcome],
    received_at: DateTime<Utc>,
) -> Vec<DiagnosticWrite> {
    let mut writes = Vec::new();
    for outcome in outcomes {
        for reason in outcome.diagnostics() {
            let kind = match reason {
                ObservationDiagnostic::InvalidValue => DiagnosticKind::InvalidValue,
                ObservationDiagnostic::IncompatibleReport => DiagnosticKind::IncompatibleReport,
                ObservationDiagnostic::RateRejection => DiagnosticKind::RateRejection,
                ObservationDiagnostic::LateHistoryRejection => DiagnosticKind::LateHistoryRejection,
            };
            writes.push(DiagnosticWrite {
                kind,
                device_id: None,
                payload: json!({
                    "capabilityId": outcome.capability_id,
                    "current": outcome.current,
                    "history": outcome.history,
                }),
                received_at,
            });
        }
    }
    writes
}

#[derive(Debug, Error)]
pub enum CapabilityServiceError {
    #[error(transparent)]
    Store(#[from] CapabilityStoreError),
    #[error("invalid Capability report JSON: {0}")]
    InvalidJson(#[from] serde_json::Error),
    #[error(transparent)]
    InvalidReport(#[from] CapabilityReportValidationError),
    #[error(transparent)]
    Adapter(#[from] AdapterEnvelopeError),
    #[error("Capability manifest is not registered")]
    UnregisteredManifest,
}

#[cfg(test)]
mod tests {
    use chrono::Utc;
    use uuid::Uuid;

    use super::*;
    use crate::capabilities::CapabilityId;

    #[test]
    fn diagnostics_cover_invalid_incompatible_rate_and_late_history() {
        let id = CapabilityId::from_uuid(Uuid::nil());
        let outcomes = vec![
            note(
                id,
                CurrentStateDisposition::InvalidValue,
                HistoryAdmissionOutcome::Rejected(HistoryRejection::InvalidCapability),
            ),
            note(
                id,
                CurrentStateDisposition::Changed,
                HistoryAdmissionOutcome::Rejected(HistoryRejection::UnsupportedSchemaVersion),
            ),
            note(
                id,
                CurrentStateDisposition::Changed,
                HistoryAdmissionOutcome::Rejected(HistoryRejection::AdmissionRate),
            ),
            note(
                id,
                CurrentStateDisposition::Changed,
                HistoryAdmissionOutcome::Rejected(HistoryRejection::Late),
            ),
            note(
                id,
                CurrentStateDisposition::Changed,
                HistoryAdmissionOutcome::Eligible,
            ),
        ];
        let writes = diagnostic_writes(&outcomes, Utc::now());
        let kinds: Vec<_> = writes.iter().map(|write| write.kind).collect();
        assert_eq!(
            kinds,
            vec![
                DiagnosticKind::InvalidValue,
                DiagnosticKind::IncompatibleReport,
                DiagnosticKind::RateRejection,
                DiagnosticKind::LateHistoryRejection,
            ]
        );
    }

    fn note(
        capability_id: CapabilityId,
        current: CurrentStateDisposition,
        history: HistoryAdmissionOutcome,
    ) -> ObservationOutcome {
        ObservationOutcome {
            capability_id,
            current,
            history,
        }
    }
}
