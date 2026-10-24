mod adapter;
pub mod admission_journal;
pub mod contributor_breakdown;
mod current_state;
mod gauge_rollup;
mod history;
pub mod history_backup;
pub mod history_budget;
pub mod history_query;
mod history_retention;
mod home_calendar;
pub mod home_meter;
mod meter_epoch;
mod persistence;
mod service;
mod types;

pub use adapter::{
    AdapterCapabilityManifest, AdapterEnvelopeError, AdapterObservation, AdapterObservationReport,
    Admission, negotiate_observation_schema, registration_message, resolve_adapter_report,
};

pub use current_state::CurrentState;
pub use persistence::{CapabilityRepository, CapabilityStoreError};
pub use service::{CapabilityService, CapabilityServiceError};
pub use types::*;

pub(crate) async fn sweep_history_budget(
    pool: &crate::state::DbPool,
    now: chrono::DateTime<chrono::Utc>,
    already_running: bool,
) -> Result<bool, String> {
    history_retention::sweep_budget(pool, now, already_running).await
}
