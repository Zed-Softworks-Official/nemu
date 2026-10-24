//! Owner-designated Home meter periods.
//!
//! A designation names the Capabilities that define future Home results.
//! Periods are immutable: closing one sets `effective_until` and leaves the
//! capability ids in place. Readable designation rows and History stay on the
//! Controller. This module does not write them to Convex.

use chrono::{DateTime, Duration, Utc};
use diesel::prelude::*;
use diesel::sql_types::{Array, Bool, Nullable, Text, Timestamptz, Uuid as SqlUuid};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::api::auth::AuthenticatedClient;
use crate::api::members::require_owner;
use crate::audit::{self, AuditKind, AuditWrite};
use crate::capabilities::CapabilityKind;
use crate::pairing::members::find_member_by_user_id;
use crate::state::AppState;

/// Closing a period touches only this column.
pub fn close_period_sql() -> &'static str {
    "UPDATE home_meter_designation_periods \
     SET effective_until = $1 \
     WHERE id = $2 AND effective_until IS NULL"
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DesignationAccess {
    Read,
    Write,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DesignationReject {
    Empty,
    UnknownCapability,
    WrongKind,
    MixedDevice,
    MixedComponent,
    MixedPhysicalScope,
    Unauthenticated,
    Forbidden,
}

impl DesignationReject {
    pub fn code(self) -> &'static str {
        match self {
            Self::Unauthenticated => "unauthenticated",
            Self::Forbidden => "owner_required",
            Self::Empty
            | Self::UnknownCapability
            | Self::WrongKind
            | Self::MixedDevice
            | Self::MixedComponent
            | Self::MixedPhysicalScope => "invalid_designation",
        }
    }

    pub fn message(self) -> &'static str {
        match self {
            Self::Empty => "A Home meter designation selects at least one Capability",
            Self::UnknownCapability => "Designated Capability is not a trustworthy identity",
            Self::WrongKind => "Designated Capability does not measure the selected quantity",
            Self::MixedDevice => "Designated Capabilities must belong to one Device",
            Self::MixedComponent => "Designated Capabilities must belong to one Component",
            Self::MixedPhysicalScope => {
                "Designated Capabilities must measure the same physical scope"
            }
            Self::Unauthenticated => "Authentication required",
            Self::Forbidden => "Only the home owner can change the Home meter",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CapabilityCandidate {
    pub id: Uuid,
    pub kind: CapabilityKind,
    pub protocol: String,
    pub device_external_id: String,
    pub component_path: Vec<String>,
    pub physical_scope_kind: String,
    pub physical_scope_component_id: String,
    pub tombstoned: bool,
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DesignationSelection {
    #[serde(default)]
    pub power_capability_id: Option<Uuid>,
    #[serde(default)]
    pub imported_energy_capability_id: Option<Uuid>,
    #[serde(default)]
    pub exported_energy_capability_id: Option<Uuid>,
}

impl DesignationSelection {
    fn slots(&self) -> [(Option<Uuid>, CapabilityKind); 3] {
        [
            (self.power_capability_id, CapabilityKind::Power),
            (
                self.imported_energy_capability_id,
                CapabilityKind::ImportedEnergy,
            ),
            (
                self.exported_energy_capability_id,
                CapabilityKind::ExportedEnergy,
            ),
        ]
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesignationPeriod {
    pub id: Uuid,
    pub effective_from: DateTime<Utc>,
    pub effective_until: Option<DateTime<Utc>>,
    pub power_capability_id: Option<Uuid>,
    pub imported_energy_capability_id: Option<Uuid>,
    pub exported_energy_capability_id: Option<Uuid>,
    pub protocol: String,
    pub device_external_id: String,
    pub component_path: Vec<String>,
    pub physical_scope_kind: String,
    pub physical_scope_component_id: String,
}

impl DesignationPeriod {
    pub fn capability_ids(&self) -> Vec<Uuid> {
        [
            self.power_capability_id,
            self.imported_energy_capability_id,
            self.exported_energy_capability_id,
        ]
        .into_iter()
        .flatten()
        .collect()
    }

    fn same_meter(&self, other: &ValidatedDesignation) -> bool {
        self.power_capability_id == other.power_capability_id
            && self.imported_energy_capability_id == other.imported_energy_capability_id
            && self.exported_energy_capability_id == other.exported_energy_capability_id
            && self.protocol == other.protocol
            && self.device_external_id == other.device_external_id
            && self.component_path == other.component_path
            && self.physical_scope_kind == other.physical_scope_kind
            && self.physical_scope_component_id == other.physical_scope_component_id
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct ValidatedDesignation {
    power_capability_id: Option<Uuid>,
    imported_energy_capability_id: Option<Uuid>,
    exported_energy_capability_id: Option<Uuid>,
    protocol: String,
    device_external_id: String,
    component_path: Vec<String>,
    physical_scope_kind: String,
    physical_scope_component_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DesignationCommit {
    pub closed: Option<DesignationPeriod>,
    pub opened: DesignationPeriod,
    pub audit: AuditWrite,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DesignationOutcome {
    Unchanged,
    Changed(DesignationCommit),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RemovalClear {
    pub closed: DesignationPeriod,
    pub keeps_observations: bool,
    pub keeps_rollups: bool,
    pub keeps_closed_periods: bool,
    pub audit: AuditWrite,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IdentityRestore {
    pub opened: DesignationPeriod,
    pub audit: AuditWrite,
}

pub fn authorize(
    role: &str,
    status: &str,
    access: DesignationAccess,
) -> Result<(), DesignationReject> {
    if status != "active" {
        return Err(if role.is_empty() {
            DesignationReject::Unauthenticated
        } else {
            DesignationReject::Forbidden
        });
    }
    match (access, role) {
        (DesignationAccess::Read, "owner" | "member") => Ok(()),
        (DesignationAccess::Write, "owner") => Ok(()),
        (DesignationAccess::Read | DesignationAccess::Write, "") => {
            Err(DesignationReject::Unauthenticated)
        }
        _ => Err(DesignationReject::Forbidden),
    }
}

pub fn audit_if_changed(
    outcome: &Result<DesignationOutcome, DesignationReject>,
) -> Option<&AuditWrite> {
    match outcome {
        Ok(DesignationOutcome::Changed(commit)) => Some(&commit.audit),
        _ => None,
    }
}

pub fn decide_designation(
    role: &str,
    status: &str,
    selection: &DesignationSelection,
    candidates: &[CapabilityCandidate],
    open: Option<&DesignationPeriod>,
    at: DateTime<Utc>,
    actor_user_id: Option<String>,
) -> Result<DesignationOutcome, DesignationReject> {
    authorize(role, status, DesignationAccess::Write)?;
    let validated = validate_selection(selection, candidates)?;
    if open.is_some_and(|period| period.effective_until.is_none() && period.same_meter(&validated))
    {
        return Ok(DesignationOutcome::Unchanged);
    }
    let closed = open.map(|period| {
        let mut closed = period.clone();
        closed.effective_until = Some(at);
        closed
    });
    let opened = DesignationPeriod {
        id: Uuid::new_v4(),
        effective_from: at,
        effective_until: None,
        power_capability_id: validated.power_capability_id,
        imported_energy_capability_id: validated.imported_energy_capability_id,
        exported_energy_capability_id: validated.exported_energy_capability_id,
        protocol: validated.protocol.clone(),
        device_external_id: validated.device_external_id.clone(),
        component_path: validated.component_path.clone(),
        physical_scope_kind: validated.physical_scope_kind.clone(),
        physical_scope_component_id: validated.physical_scope_component_id.clone(),
    };
    let audit = designation_audit("designate", actor_user_id, "designated home meter", &opened);
    Ok(DesignationOutcome::Changed(DesignationCommit {
        closed,
        opened,
        audit,
    }))
}

fn validate_selection(
    selection: &DesignationSelection,
    candidates: &[CapabilityCandidate],
) -> Result<ValidatedDesignation, DesignationReject> {
    let chosen: Vec<(Uuid, CapabilityKind)> = selection
        .slots()
        .into_iter()
        .filter_map(|(id, kind)| id.map(|id| (id, kind)))
        .collect();
    if chosen.is_empty() {
        return Err(DesignationReject::Empty);
    }
    let mut matched = Vec::with_capacity(chosen.len());
    for (id, expected) in chosen {
        let Some(candidate) = candidates.iter().find(|candidate| candidate.id == id) else {
            return Err(DesignationReject::UnknownCapability);
        };
        if candidate.tombstoned {
            return Err(DesignationReject::UnknownCapability);
        }
        if candidate.kind != expected {
            return Err(DesignationReject::WrongKind);
        }
        matched.push(candidate);
    }
    let first = matched[0];
    for candidate in &matched {
        if candidate.protocol != first.protocol
            || candidate.device_external_id != first.device_external_id
        {
            return Err(DesignationReject::MixedDevice);
        }
        if candidate.component_path != first.component_path {
            return Err(DesignationReject::MixedComponent);
        }
        if candidate.physical_scope_kind != first.physical_scope_kind
            || candidate.physical_scope_component_id != first.physical_scope_component_id
        {
            return Err(DesignationReject::MixedPhysicalScope);
        }
    }
    Ok(ValidatedDesignation {
        power_capability_id: selection.power_capability_id,
        imported_energy_capability_id: selection.imported_energy_capability_id,
        exported_energy_capability_id: selection.exported_energy_capability_id,
        protocol: first.protocol.clone(),
        device_external_id: first.device_external_id.clone(),
        component_path: first.component_path.clone(),
        physical_scope_kind: first.physical_scope_kind.clone(),
        physical_scope_component_id: first.physical_scope_component_id.clone(),
    })
}

/// Device removal closes the active designation for that Device. Observations,
/// rollups, and already closed periods stay.
pub fn clear_active_designation(
    open: &DesignationPeriod,
    protocol: &str,
    external_id: &str,
    at: DateTime<Utc>,
) -> Option<RemovalClear> {
    if open.effective_until.is_some() {
        return None;
    }
    if open.protocol != protocol || open.device_external_id != external_id {
        return None;
    }
    let mut closed = open.clone();
    closed.effective_until = Some(at);
    let audit = designation_audit(
        "clear",
        None,
        "cleared home meter designation after device removal",
        &closed,
    );
    Some(RemovalClear {
        closed,
        keeps_observations: true,
        keeps_rollups: true,
        keeps_closed_periods: true,
        audit,
    })
}

/// The same returning Capability ids can open a new period. A different meter
/// stays undesignated. An open designation is left alone.
pub fn restore_returning_identity(
    periods: &[DesignationPeriod],
    protocol: &str,
    external_id: &str,
    returning_ids: &[Uuid],
    at: DateTime<Utc>,
) -> Option<IdentityRestore> {
    if periods
        .iter()
        .any(|period| period.effective_until.is_none())
    {
        return None;
    }
    let latest = periods.iter().max_by_key(|period| period.effective_from)?;
    if latest.protocol != protocol || latest.device_external_id != external_id {
        return None;
    }
    let required = latest.capability_ids();
    if required.is_empty() || !required.iter().all(|id| returning_ids.contains(id)) {
        return None;
    }
    let effective_from = match latest.effective_until {
        Some(until) if at <= until => until + Duration::microseconds(1),
        _ => at,
    };
    let mut opened = latest.clone();
    opened.id = Uuid::new_v4();
    opened.effective_from = effective_from;
    opened.effective_until = None;
    let audit = designation_audit(
        "restore",
        None,
        "restored home meter designation for returning capability identity",
        &opened,
    );
    Some(IdentityRestore { opened, audit })
}

fn designation_audit(
    action: &str,
    actor_user_id: Option<String>,
    summary: &str,
    period: &DesignationPeriod,
) -> AuditWrite {
    AuditWrite {
        kind: AuditKind::HomeMeterDesignation,
        actor_user_id,
        summary: summary.to_string(),
        detail: serde_json::json!({
            "action": action,
            "periodId": period.id,
            "effectiveFrom": period.effective_from,
            "effectiveUntil": period.effective_until,
            "powerCapabilityId": period.power_capability_id,
            "importedEnergyCapabilityId": period.imported_energy_capability_id,
            "exportedEnergyCapabilityId": period.exported_energy_capability_id,
            "protocol": period.protocol,
            "deviceExternalId": period.device_external_id,
            "componentPath": period.component_path,
            "physicalScopeKind": period.physical_scope_kind,
            "physicalScopeComponentId": period.physical_scope_component_id,
        }),
    }
}

#[derive(Debug)]
pub enum DesignationClientError {
    Reject(DesignationReject),
    Database(String),
}

impl DesignationClientError {
    pub fn code(&self) -> &'static str {
        match self {
            Self::Reject(reject) => reject.code(),
            Self::Database(_) => "history_unavailable",
        }
    }

    pub fn message(&self) -> String {
        match self {
            Self::Reject(reject) => reject.message().to_string(),
            Self::Database(_) => "Home meter designation failed".to_string(),
        }
    }
}

pub async fn read_designation_for_client(
    state: &AppState,
    auth: &AuthenticatedClient,
) -> Result<Option<DesignationPeriod>, DesignationClientError> {
    let (role, status, _) = caller(state, auth).await?;
    authorize(&role, &status, DesignationAccess::Read).map_err(DesignationClientError::Reject)?;
    let conn = state
        .db
        .get()
        .await
        .map_err(|error| DesignationClientError::Database(error.to_string()))?;
    conn.interact(load_open_period)
        .await
        .map_err(|error| DesignationClientError::Database(error.to_string()))?
        .map_err(|error| DesignationClientError::Database(error.to_string()))
}

pub async fn designate_for_client(
    state: &AppState,
    auth: &AuthenticatedClient,
    selection: DesignationSelection,
) -> Result<DesignationPeriod, DesignationClientError> {
    let member = require_owner(state, auth)
        .await
        .map_err(|_| DesignationClientError::Reject(DesignationReject::Forbidden))?;
    let actor = auth.user_id.clone();
    let role = member.role.clone();
    let status = member.status.clone();
    let conn = state
        .db
        .get()
        .await
        .map_err(|error| DesignationClientError::Database(error.to_string()))?;
    conn.interact(move |conn| {
        conn.transaction(|conn| {
            let candidates = load_candidates(conn, &selection)?;
            let open = load_open_period(conn)?;
            let at = Utc::now();
            let outcome = decide_designation(
                &role,
                &status,
                &selection,
                &candidates,
                open.as_ref(),
                at,
                actor.clone(),
            )
            .map_err(StoreError::Reject)?;
            match outcome {
                DesignationOutcome::Unchanged => open.ok_or_else(|| {
                    StoreError::Database(diesel::result::Error::RollbackTransaction)
                }),
                DesignationOutcome::Changed(commit) => {
                    if let Some(closed) = &commit.closed {
                        close_period(conn, closed)?;
                    }
                    insert_period(conn, &commit.opened)?;
                    audit::insert_on(conn, &commit.audit)?;
                    Ok(commit.opened)
                }
            }
        })
    })
    .await
    .map_err(|error| DesignationClientError::Database(error.to_string()))?
    .map_err(|error| match error {
        StoreError::Reject(reject) => DesignationClientError::Reject(reject),
        StoreError::Database(error) => DesignationClientError::Database(error.to_string()),
    })
}

enum StoreError {
    Reject(DesignationReject),
    Database(diesel::result::Error),
}

impl From<diesel::result::Error> for StoreError {
    fn from(error: diesel::result::Error) -> Self {
        Self::Database(error)
    }
}

impl From<DesignationReject> for StoreError {
    fn from(error: DesignationReject) -> Self {
        Self::Reject(error)
    }
}

async fn caller(
    state: &AppState,
    auth: &AuthenticatedClient,
) -> Result<(String, String, Option<String>), DesignationClientError> {
    let Some(user_id) = auth.user_id.clone() else {
        return Err(DesignationClientError::Reject(
            DesignationReject::Unauthenticated,
        ));
    };
    let member = find_member_by_user_id(&state.db, &user_id)
        .await
        .map_err(|error| DesignationClientError::Database(error.to_string()))?
        .ok_or(DesignationClientError::Reject(
            DesignationReject::Unauthenticated,
        ))?;
    Ok((member.role, member.status, Some(user_id)))
}

pub(crate) fn on_device_tombstoned(
    conn: &mut PgConnection,
    protocol: &str,
    external_id: &str,
    at: DateTime<Utc>,
) -> Result<(), diesel::result::Error> {
    let Some(open) = load_open_period(conn)? else {
        return Ok(());
    };
    let Some(cleared) = clear_active_designation(&open, protocol, external_id, at) else {
        return Ok(());
    };
    close_period(conn, &cleared.closed)?;
    audit::insert_on(conn, &cleared.audit)?;
    Ok(())
}

pub(crate) fn on_device_returned(
    conn: &mut PgConnection,
    protocol: &str,
    external_id: &str,
    returning_ids: &[Uuid],
    at: DateTime<Utc>,
) -> Result<(), diesel::result::Error> {
    let periods = load_all_periods(conn)?;
    let Some(restored) =
        restore_returning_identity(&periods, protocol, external_id, returning_ids, at)
    else {
        return Ok(());
    };
    insert_period(conn, &restored.opened)?;
    audit::insert_on(conn, &restored.audit)?;
    Ok(())
}

pub(crate) fn load_all_periods(
    conn: &mut PgConnection,
) -> Result<Vec<DesignationPeriod>, diesel::result::Error> {
    let rows = diesel::sql_query(
        "SELECT id, effective_from, effective_until,
                power_capability_id, imported_energy_capability_id, exported_energy_capability_id,
                protocol::text AS protocol, device_external_id::text AS device_external_id,
                component_path, physical_scope_kind::text AS physical_scope_kind,
                physical_scope_component_id::text AS physical_scope_component_id
         FROM home_meter_designation_periods
         ORDER BY effective_from",
    )
    .load::<PeriodRow>(conn)?;
    rows.into_iter().map(period_from_row).collect()
}

fn load_open_period(
    conn: &mut PgConnection,
) -> Result<Option<DesignationPeriod>, diesel::result::Error> {
    let row = diesel::sql_query(
        "SELECT id, effective_from, effective_until,
                power_capability_id, imported_energy_capability_id, exported_energy_capability_id,
                protocol::text AS protocol, device_external_id::text AS device_external_id,
                component_path, physical_scope_kind::text AS physical_scope_kind,
                physical_scope_component_id::text AS physical_scope_component_id
         FROM home_meter_designation_periods
         WHERE effective_until IS NULL",
    )
    .get_result::<PeriodRow>(conn)
    .optional()?;
    row.map(period_from_row).transpose()
}

fn load_candidates(
    conn: &mut PgConnection,
    selection: &DesignationSelection,
) -> Result<Vec<CapabilityCandidate>, StoreError> {
    let ids: Vec<Uuid> = selection
        .slots()
        .into_iter()
        .filter_map(|(id, _)| id)
        .collect();
    if ids.is_empty() {
        return Ok(Vec::new());
    }
    let rows = diesel::sql_query(
        "SELECT id, kind::text AS kind, protocol::text AS protocol,
                device_external_id::text AS device_external_id, component_path,
                physical_scope_kind::text AS physical_scope_kind,
                physical_scope_component_id::text AS physical_scope_component_id,
                (tombstoned_at IS NOT NULL) AS tombstoned
         FROM capability_identities
         WHERE id = ANY($1)",
    )
    .bind::<Array<SqlUuid>, _>(&ids)
    .load::<CandidateRow>(conn)?;
    rows.into_iter()
        .map(|row| {
            let kind = CapabilityKind::parse(&row.kind)
                .map_err(|_| StoreError::Database(diesel::result::Error::RollbackTransaction))?;
            Ok(CapabilityCandidate {
                id: row.id,
                kind,
                protocol: row.protocol,
                device_external_id: row.device_external_id,
                component_path: present_path(row.component_path),
                physical_scope_kind: row.physical_scope_kind,
                physical_scope_component_id: row.physical_scope_component_id,
                tombstoned: row.tombstoned,
            })
        })
        .collect()
}

fn close_period(
    conn: &mut PgConnection,
    closed: &DesignationPeriod,
) -> Result<(), diesel::result::Error> {
    let until = closed
        .effective_until
        .ok_or(diesel::result::Error::RollbackTransaction)?;
    diesel::sql_query(close_period_sql())
        .bind::<Timestamptz, _>(until)
        .bind::<SqlUuid, _>(closed.id)
        .execute(conn)?;
    Ok(())
}

fn insert_period(
    conn: &mut PgConnection,
    period: &DesignationPeriod,
) -> Result<(), diesel::result::Error> {
    diesel::sql_query(
        "INSERT INTO home_meter_designation_periods (
            id, effective_from, effective_until,
            power_capability_id, imported_energy_capability_id, exported_energy_capability_id,
            protocol, device_external_id, component_path,
            physical_scope_kind, physical_scope_component_id
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)",
    )
    .bind::<SqlUuid, _>(period.id)
    .bind::<Timestamptz, _>(period.effective_from)
    .bind::<Nullable<Timestamptz>, _>(period.effective_until)
    .bind::<Nullable<SqlUuid>, _>(period.power_capability_id)
    .bind::<Nullable<SqlUuid>, _>(period.imported_energy_capability_id)
    .bind::<Nullable<SqlUuid>, _>(period.exported_energy_capability_id)
    .bind::<Text, _>(&period.protocol)
    .bind::<Text, _>(&period.device_external_id)
    .bind::<Array<Text>, _>(&period.component_path)
    .bind::<Text, _>(&period.physical_scope_kind)
    .bind::<Text, _>(&period.physical_scope_component_id)
    .execute(conn)?;
    Ok(())
}

#[derive(QueryableByName)]
struct PeriodRow {
    #[diesel(sql_type = SqlUuid)]
    id: Uuid,
    #[diesel(sql_type = Timestamptz)]
    effective_from: DateTime<Utc>,
    #[diesel(sql_type = Nullable<Timestamptz>)]
    effective_until: Option<DateTime<Utc>>,
    #[diesel(sql_type = Nullable<SqlUuid>)]
    power_capability_id: Option<Uuid>,
    #[diesel(sql_type = Nullable<SqlUuid>)]
    imported_energy_capability_id: Option<Uuid>,
    #[diesel(sql_type = Nullable<SqlUuid>)]
    exported_energy_capability_id: Option<Uuid>,
    #[diesel(sql_type = Text)]
    protocol: String,
    #[diesel(sql_type = Text)]
    device_external_id: String,
    #[diesel(sql_type = Array<Text>)]
    component_path: Vec<String>,
    #[diesel(sql_type = Text)]
    physical_scope_kind: String,
    #[diesel(sql_type = Text)]
    physical_scope_component_id: String,
}

#[derive(QueryableByName)]
struct CandidateRow {
    #[diesel(sql_type = SqlUuid)]
    id: Uuid,
    #[diesel(sql_type = Text)]
    kind: String,
    #[diesel(sql_type = Text)]
    protocol: String,
    #[diesel(sql_type = Text)]
    device_external_id: String,
    #[diesel(sql_type = Array<Nullable<Text>>)]
    component_path: Vec<Option<String>>,
    #[diesel(sql_type = Text)]
    physical_scope_kind: String,
    #[diesel(sql_type = Text)]
    physical_scope_component_id: String,
    #[diesel(sql_type = Bool)]
    tombstoned: bool,
}

fn present_path(path: Vec<Option<String>>) -> Vec<String> {
    path.into_iter().flatten().collect()
}

fn period_from_row(row: PeriodRow) -> Result<DesignationPeriod, diesel::result::Error> {
    Ok(DesignationPeriod {
        id: row.id,
        effective_from: row.effective_from,
        effective_until: row.effective_until,
        power_capability_id: row.power_capability_id,
        imported_energy_capability_id: row.imported_energy_capability_id,
        exported_energy_capability_id: row.exported_energy_capability_id,
        protocol: row.protocol,
        device_external_id: row.device_external_id,
        component_path: row.component_path,
        physical_scope_kind: row.physical_scope_kind,
        physical_scope_component_id: row.physical_scope_component_id,
    })
}

#[cfg(test)]
mod tests {
    use chrono::{TimeZone, Utc};

    use super::*;

    fn at(hour: u32) -> DateTime<Utc> {
        Utc.with_ymd_and_hms(2026, 10, 19, hour, 0, 0)
            .single()
            .unwrap()
    }

    fn candidate(
        id: u128,
        kind: CapabilityKind,
        device: &str,
        path: &[&str],
        scope_kind: &str,
        scope_component: &str,
    ) -> CapabilityCandidate {
        CapabilityCandidate {
            id: Uuid::from_u128(id),
            kind,
            protocol: "matter".into(),
            device_external_id: device.into(),
            component_path: path.iter().map(|segment| (*segment).to_string()).collect(),
            physical_scope_kind: scope_kind.into(),
            physical_scope_component_id: scope_component.into(),
            tombstoned: false,
        }
    }

    fn meter_candidates() -> Vec<CapabilityCandidate> {
        vec![
            candidate(1, CapabilityKind::Power, "meter-a", &[], "device", ""),
            candidate(
                2,
                CapabilityKind::ImportedEnergy,
                "meter-a",
                &[],
                "device",
                "",
            ),
            candidate(
                3,
                CapabilityKind::ExportedEnergy,
                "meter-a",
                &[],
                "device",
                "",
            ),
        ]
    }

    fn selection(power: bool, imported: bool, exported: bool) -> DesignationSelection {
        DesignationSelection {
            power_capability_id: power.then(|| Uuid::from_u128(1)),
            imported_energy_capability_id: imported.then(|| Uuid::from_u128(2)),
            exported_energy_capability_id: exported.then(|| Uuid::from_u128(3)),
        }
    }

    fn open_from(
        validated_at: DateTime<Utc>,
        selection: &DesignationSelection,
    ) -> DesignationPeriod {
        let outcome = decide_designation(
            "owner",
            "active",
            selection,
            &meter_candidates(),
            None,
            validated_at,
            Some("owner-1".into()),
        )
        .unwrap();
        let DesignationOutcome::Changed(commit) = outcome else {
            panic!("expected a new designation");
        };
        commit.opened
    }

    #[test]
    fn empty_selection_is_rejected_without_audit() {
        let outcome = decide_designation(
            "owner",
            "active",
            &selection(false, false, false),
            &meter_candidates(),
            None,
            at(1),
            Some("owner-1".into()),
        );
        assert_eq!(outcome, Err(DesignationReject::Empty));
        assert!(audit_if_changed(&outcome).is_none());
    }

    #[test]
    fn one_capability_on_one_device_and_scope_is_saved() {
        let outcome = decide_designation(
            "owner",
            "active",
            &selection(true, false, false),
            &meter_candidates(),
            None,
            at(1),
            Some("owner-1".into()),
        )
        .unwrap();
        let DesignationOutcome::Changed(commit) = outcome else {
            panic!("create");
        };
        assert!(commit.closed.is_none());
        assert_eq!(commit.opened.power_capability_id, Some(Uuid::from_u128(1)));
        assert!(commit.opened.imported_energy_capability_id.is_none());
        assert!(commit.opened.effective_until.is_none());
        assert_eq!(commit.opened.effective_from, at(1));
        assert_eq!(commit.opened.device_external_id, "meter-a");
        assert!(commit.opened.component_path.is_empty());
        assert_eq!(commit.opened.physical_scope_kind, "device");
        assert_eq!(commit.audit.kind, AuditKind::HomeMeterDesignation);
        assert_eq!(commit.audit.kind.as_str(), "home_meter_designation");
        assert_eq!(commit.audit.actor_user_id.as_deref(), Some("owner-1"));
    }

    #[test]
    fn mixed_device_component_or_scope_is_rejected_without_audit() {
        let mut other_device = meter_candidates();
        other_device[1].device_external_id = "meter-b".into();
        let mixed_device = decide_designation(
            "owner",
            "active",
            &selection(true, true, false),
            &other_device,
            None,
            at(1),
            Some("owner-1".into()),
        );
        assert_eq!(mixed_device, Err(DesignationReject::MixedDevice));
        assert!(audit_if_changed(&mixed_device).is_none());

        let mut other_component = meter_candidates();
        other_component[2].component_path = vec!["outlet-1".into()];
        let mixed_component = decide_designation(
            "owner",
            "active",
            &selection(true, false, true),
            &other_component,
            None,
            at(1),
            Some("owner-1".into()),
        );
        assert_eq!(mixed_component, Err(DesignationReject::MixedComponent));
        assert!(audit_if_changed(&mixed_component).is_none());

        let mut other_scope = meter_candidates();
        other_scope[0].physical_scope_kind = "home".into();
        let mixed_scope = decide_designation(
            "owner",
            "active",
            &selection(true, true, false),
            &other_scope,
            None,
            at(1),
            Some("owner-1".into()),
        );
        assert_eq!(mixed_scope, Err(DesignationReject::MixedPhysicalScope));
        assert!(audit_if_changed(&mixed_scope).is_none());
    }

    #[test]
    fn shared_component_scope_is_accepted() {
        let mut candidates = meter_candidates();
        for candidate in &mut candidates {
            candidate.component_path = vec!["outlet-1".into()];
            candidate.physical_scope_kind = "component".into();
            candidate.physical_scope_component_id = "outlet-1".into();
        }
        let outcome = decide_designation(
            "owner",
            "active",
            &selection(true, true, true),
            &candidates,
            None,
            at(2),
            Some("owner-1".into()),
        )
        .unwrap();
        let DesignationOutcome::Changed(commit) = outcome else {
            panic!("component designation");
        };
        assert_eq!(commit.opened.component_path, vec!["outlet-1".to_string()]);
        assert_eq!(commit.opened.physical_scope_kind, "component");
        assert!(commit.opened.power_capability_id.is_some());
        assert!(commit.opened.imported_energy_capability_id.is_some());
        assert!(commit.opened.exported_energy_capability_id.is_some());
    }

    #[test]
    fn replacement_closes_the_period_without_rewriting_capability_ids() {
        let original = open_from(at(1), &selection(true, true, false));
        let outcome = decide_designation(
            "owner",
            "active",
            &selection(true, true, true),
            &meter_candidates(),
            Some(&original),
            at(4),
            Some("owner-1".into()),
        )
        .unwrap();
        let DesignationOutcome::Changed(commit) = outcome else {
            panic!("replace");
        };
        let closed = commit.closed.clone().expect("closed period");
        assert_eq!(closed.id, original.id);
        assert_eq!(closed.power_capability_id, original.power_capability_id);
        assert_eq!(
            closed.imported_energy_capability_id,
            original.imported_energy_capability_id
        );
        assert_eq!(
            closed.exported_energy_capability_id,
            original.exported_energy_capability_id
        );
        assert_eq!(closed.effective_from, original.effective_from);
        assert_eq!(closed.effective_until, Some(at(4)));
        assert_ne!(commit.opened.id, closed.id);
        assert_eq!(commit.opened.effective_from, at(4));
        assert!(commit.opened.effective_until.is_none());
        assert_eq!(
            commit.opened.exported_energy_capability_id,
            Some(Uuid::from_u128(3))
        );
        assert!(audit_if_changed(&Ok(DesignationOutcome::Changed(commit))).is_some());
    }

    #[test]
    fn identical_designation_does_not_write_audit() {
        let original = open_from(at(1), &selection(true, false, true));
        let outcome = decide_designation(
            "owner",
            "active",
            &selection(true, false, true),
            &meter_candidates(),
            Some(&original),
            at(3),
            Some("owner-1".into()),
        );
        assert_eq!(outcome, Ok(DesignationOutcome::Unchanged));
        assert!(audit_if_changed(&outcome).is_none());
    }

    #[test]
    fn members_can_read_and_only_owners_can_write() {
        assert!(authorize("owner", "active", DesignationAccess::Write).is_ok());
        assert!(authorize("owner", "active", DesignationAccess::Read).is_ok());
        assert!(authorize("member", "active", DesignationAccess::Read).is_ok());
        assert_eq!(
            authorize("member", "active", DesignationAccess::Write),
            Err(DesignationReject::Forbidden)
        );
        let member = decide_designation(
            "member",
            "active",
            &selection(true, false, false),
            &meter_candidates(),
            None,
            at(1),
            Some("member-1".into()),
        );
        assert_eq!(member, Err(DesignationReject::Forbidden));
        assert!(audit_if_changed(&member).is_none());
        assert!(authorize("owner", "pending", DesignationAccess::Read).is_err());
    }

    #[test]
    fn removal_clears_the_active_designation_and_keeps_history() {
        let original = open_from(at(1), &selection(false, true, false));
        assert!(
            clear_active_designation(&original, "matter", "meter-b", at(5)).is_none(),
            "a different device does not clear the designation"
        );
        let cleared = clear_active_designation(&original, "matter", "meter-a", at(5)).unwrap();
        assert_eq!(cleared.closed.id, original.id);
        assert_eq!(
            cleared.closed.imported_energy_capability_id,
            original.imported_energy_capability_id
        );
        assert_eq!(
            cleared.closed.power_capability_id,
            original.power_capability_id
        );
        assert_eq!(
            cleared.closed.exported_energy_capability_id,
            original.exported_energy_capability_id
        );
        assert_eq!(cleared.closed.effective_until, Some(at(5)));
        assert!(cleared.keeps_observations);
        assert!(cleared.keeps_rollups);
        assert!(cleared.keeps_closed_periods);
        assert_eq!(cleared.audit.kind, AuditKind::HomeMeterDesignation);
        assert_eq!(cleared.audit.detail["action"], "clear");
    }

    #[test]
    fn only_the_same_capability_identity_restores_a_new_period() {
        let original = open_from(at(1), &selection(true, true, false));
        let cleared = clear_active_designation(&original, "matter", "meter-a", at(5)).unwrap();
        let different = restore_returning_identity(
            &[cleared.closed.clone()],
            "matter",
            "meter-b",
            &[Uuid::from_u128(9)],
            at(6),
        );
        assert!(different.is_none());
        let partial = restore_returning_identity(
            &[cleared.closed.clone()],
            "matter",
            "meter-a",
            &[Uuid::from_u128(1)],
            at(6),
        );
        assert!(partial.is_none());
        let restored = restore_returning_identity(
            &[cleared.closed.clone()],
            "matter",
            "meter-a",
            &[Uuid::from_u128(1), Uuid::from_u128(2), Uuid::from_u128(8)],
            at(6),
        )
        .unwrap();
        assert_ne!(restored.opened.id, cleared.closed.id);
        assert_eq!(
            restored.opened.power_capability_id,
            cleared.closed.power_capability_id
        );
        assert_eq!(
            restored.opened.imported_energy_capability_id,
            cleared.closed.imported_energy_capability_id
        );
        assert!(restored.opened.effective_until.is_none());
        assert_eq!(restored.opened.effective_from, at(6));
        assert!(restored.opened.effective_from > cleared.closed.effective_until.unwrap());
        assert_eq!(restored.audit.detail["action"], "restore");

        let mut still_open = cleared.closed.clone();
        still_open.effective_until = None;
        assert!(
            restore_returning_identity(
                &[still_open],
                "matter",
                "meter-a",
                &[Uuid::from_u128(1), Uuid::from_u128(2)],
                at(7),
            )
            .is_none()
        );
    }

    #[test]
    fn wrong_or_tombstoned_capability_is_rejected_without_audit() {
        let mut candidates = meter_candidates();
        candidates[0].kind = CapabilityKind::Voltage;
        let wrong = decide_designation(
            "owner",
            "active",
            &selection(true, false, false),
            &candidates,
            None,
            at(1),
            Some("owner-1".into()),
        );
        assert_eq!(wrong, Err(DesignationReject::WrongKind));
        assert!(audit_if_changed(&wrong).is_none());

        candidates[0].kind = CapabilityKind::Power;
        candidates[0].tombstoned = true;
        let tombstoned = decide_designation(
            "owner",
            "active",
            &selection(true, false, false),
            &candidates,
            None,
            at(1),
            Some("owner-1".into()),
        );
        assert_eq!(tombstoned, Err(DesignationReject::UnknownCapability));
        assert!(audit_if_changed(&tombstoned).is_none());
    }

    #[test]
    fn migration_stores_relational_periods_and_extends_audit() {
        let sql =
            include_str!("../../migrations/2026-10-19-000007-0000_home_meter_designations/up.sql");
        assert!(sql.contains("CREATE TABLE home_meter_designation_periods"));
        assert!(sql.contains("power_capability_id"));
        assert!(sql.contains("imported_energy_capability_id"));
        assert!(sql.contains("exported_energy_capability_id"));
        assert!(sql.contains("effective_from"));
        assert!(sql.contains("effective_until"));
        assert!(sql.contains("device_external_id"));
        assert!(sql.contains("component_path"));
        assert!(sql.contains("physical_scope_kind"));
        assert!(sql.contains("home_meter_designation"));
        assert!(sql.contains("IS NOT NULL"));
        assert!(!sql.to_lowercase().contains("jsonb"));
        let close = close_period_sql();
        assert!(close.contains("SET effective_until"));
        assert!(!close.contains("power_capability_id"));
        assert!(!close.to_lowercase().contains("jsonb"));
    }
}
