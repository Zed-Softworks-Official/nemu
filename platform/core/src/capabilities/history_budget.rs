//! History budget, physical usage, and the hard free-space floor.
//!
//! Readable History stays on the Controller. These figures are not written to Convex.

use chrono::{DateTime, Utc};
use diesel::prelude::*;
use diesel::sql_types::{Array, BigInt, Text};
use serde::Serialize;

use crate::db::schema::history_budget as budget_settings;
use crate::state::DbPool;

pub const GIB: u64 = 1024 * 1024 * 1024;

/// Relations whose `pg_total_relation_size` counts as History. Absent names are ignored.
/// Indexes and partitions are included by `pg_total_relation_size` on each parent.
/// Future rollup, Meter-epoch, and designation tables are queried when present.
pub const HISTORY_RELATIONS: &[&str] = &[
    "capability_observations",
    "capability_observation_keys",
    "capability_recording_bounds",
    "history_gaps",
    "meter_epochs",
    "home_meter_designation_periods",
    "power_rollups",
    "gauge_rollups",
    "energy_counter_rollups",
];

pub const HISTORY_USAGE_SQL: &str =
    "SELECT c.relname AS name, pg_total_relation_size(c.oid)::bigint AS bytes
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = ANY($1)";

const DIAGNOSTIC_BYTES_SQL: &str =
    "SELECT COALESCE(SUM(pg_total_relation_size(c.oid)), 0)::bigint AS bytes
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'diagnostic_events'";

const DATA_DIRECTORY_SQL: &str = "SELECT setting FROM pg_settings WHERE name = 'data_directory'";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ResolutionTier {
    DiagnosticPartitions,
    Raw,
    OneMinute,
    FiveMinute,
    FifteenMinute,
    Hourly,
    Daily,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TierBytes {
    pub tier: ResolutionTier,
    pub bytes: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryBudgetView {
    pub usage_bytes: u64,
    pub budget_bytes: u64,
    pub default_budget_bytes: u64,
    pub floor_bytes: u64,
    pub free_bytes: u64,
    pub floor_breached: bool,
    pub proposed_deletion: bool,
    pub likely_resolution_loss: Vec<ResolutionTier>,
    pub restores_deleted_history: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AcceptedBudgetChange {
    pub write_audit: bool,
    pub view_fields: BudgetChangeFields,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BudgetChangeFields {
    pub proposed_deletion: bool,
    pub likely_resolution_loss: Vec<ResolutionTier>,
    pub restores_deleted_history: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ConfirmationRequired {
    pub likely_resolution_loss: Vec<ResolutionTier>,
}

const RETENTION_ORDER: [ResolutionTier; 7] = [
    ResolutionTier::DiagnosticPartitions,
    ResolutionTier::Raw,
    ResolutionTier::OneMinute,
    ResolutionTier::FiveMinute,
    ResolutionTier::FifteenMinute,
    ResolutionTier::Hourly,
    ResolutionTier::Daily,
];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct FilesystemStats {
    pub total_bytes: u64,
    pub free_bytes: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BudgetSnapshot {
    pub usage_bytes: u64,
    pub tier_bytes: Vec<TierBytes>,
    pub filesystem_total_bytes: u64,
    pub free_bytes: u64,
    pub configured_budget_bytes: Option<u64>,
}

impl BudgetSnapshot {
    pub fn view(&self) -> HistoryBudgetView {
        history_budget_view(
            self.filesystem_total_bytes,
            self.free_bytes,
            self.usage_bytes,
            self.configured_budget_bytes,
            0,
            &self.tier_bytes,
        )
    }

    pub fn effective_budget_bytes(&self) -> u64 {
        self.configured_budget_bytes
            .unwrap_or_else(|| default_budget_bytes(self.filesystem_total_bytes))
    }
}

pub fn counts_toward_history_usage(name: &str) -> bool {
    HISTORY_RELATIONS.contains(&name)
}

pub fn default_budget_bytes(filesystem_total_bytes: u64) -> u64 {
    filesystem_total_bytes.saturating_div(10).min(2 * GIB)
}

/// Hard free-space floor. `updater_required_bytes` defaults to 0 until an updater reports a requirement.
pub fn free_space_floor(filesystem_total_bytes: u64, updater_required_bytes: u64) -> u64 {
    let fifteen_percent = filesystem_total_bytes.saturating_mul(15) / 100;
    fifteen_percent.max(8 * GIB).max(updater_required_bytes)
}

pub fn admission_blocked(free_bytes: u64, floor_bytes: u64) -> bool {
    free_bytes <= floor_bytes
}

pub fn history_usage_bytes(relations: &[(&str, u64)]) -> u64 {
    relations
        .iter()
        .filter(|(name, _)| counts_toward_history_usage(name))
        .fold(0, |total, (_, bytes)| total.saturating_add(*bytes))
}

pub fn sum_present_relation_sizes(
    names: &[&str],
    mut size_of: impl FnMut(&str) -> Result<Option<u64>, String>,
) -> Result<u64, String> {
    let mut total = 0u64;
    for name in names {
        if !counts_toward_history_usage(name) {
            continue;
        }
        if let Some(bytes) = size_of(name)? {
            total = total.saturating_add(bytes);
        }
    }
    Ok(total)
}

pub fn project_resolution_loss(bytes_to_free: u64, tiers: &[TierBytes]) -> Vec<ResolutionTier> {
    if bytes_to_free == 0 {
        return Vec::new();
    }
    let mut remaining = bytes_to_free;
    let mut loss = Vec::new();
    for tier in RETENTION_ORDER {
        if remaining == 0 {
            break;
        }
        match tiers
            .iter()
            .find(|row| row.tier == tier)
            .map(|row| row.bytes)
        {
            Some(0) => continue,
            Some(bytes) => {
                loss.push(tier);
                remaining = remaining.saturating_sub(bytes);
            }
            None => loss.push(tier),
        }
    }
    loss
}

pub fn confirmation_required(current_budget: u64, proposed_budget: u64, usage_bytes: u64) -> bool {
    proposed_budget < current_budget && proposed_budget < usage_bytes
}

pub fn evaluate_budget_change(
    current_budget: u64,
    proposed_budget: u64,
    usage_bytes: u64,
    confirm_deletion: bool,
    tier_bytes: &[TierBytes],
) -> Result<AcceptedBudgetChange, ConfirmationRequired> {
    let likely_resolution_loss =
        project_resolution_loss(usage_bytes.saturating_sub(proposed_budget), tier_bytes);
    if confirmation_required(current_budget, proposed_budget, usage_bytes) && !confirm_deletion {
        return Err(ConfirmationRequired {
            likely_resolution_loss,
        });
    }
    Ok(AcceptedBudgetChange {
        write_audit: proposed_budget != current_budget,
        view_fields: BudgetChangeFields {
            proposed_deletion: proposed_budget < usage_bytes,
            likely_resolution_loss,
            restores_deleted_history: false,
        },
    })
}

pub fn history_budget_view(
    filesystem_total_bytes: u64,
    free_bytes: u64,
    usage_bytes: u64,
    configured_budget_bytes: Option<u64>,
    updater_required_bytes: u64,
    tier_bytes: &[TierBytes],
) -> HistoryBudgetView {
    let default_budget = default_budget_bytes(filesystem_total_bytes);
    let budget_bytes = configured_budget_bytes.unwrap_or(default_budget);
    let floor_bytes = free_space_floor(filesystem_total_bytes, updater_required_bytes);
    HistoryBudgetView {
        usage_bytes,
        budget_bytes,
        default_budget_bytes: default_budget,
        floor_bytes,
        free_bytes,
        floor_breached: admission_blocked(free_bytes, floor_bytes),
        proposed_deletion: budget_bytes < usage_bytes,
        likely_resolution_loss: project_resolution_loss(
            usage_bytes.saturating_sub(budget_bytes),
            tier_bytes,
        ),
        restores_deleted_history: false,
    }
}

pub fn read_filesystem_stats(path: &std::path::Path) -> Result<FilesystemStats, String> {
    let path = std::ffi::CString::new(path.as_os_str().as_encoded_bytes())
        .map_err(|error| error.to_string())?;
    let mut stat = unsafe { std::mem::zeroed::<libc::statvfs>() };
    let rc = unsafe { libc::statvfs(path.as_ptr(), &mut stat) };
    if rc != 0 {
        return Err("failed to read filesystem space".to_string());
    }
    let unit = u64::try_from(stat.f_frsize).unwrap_or(0);
    Ok(FilesystemStats {
        total_bytes: u64::try_from(stat.f_blocks)
            .unwrap_or(0)
            .saturating_mul(unit),
        free_bytes: u64::try_from(stat.f_bavail)
            .unwrap_or(0)
            .saturating_mul(unit),
    })
}

pub fn filesystem_path(postgres_data_directory: Option<&str>) -> std::path::PathBuf {
    if let Some(configured) =
        std::env::var_os("NEMU_POSTGRES_DATA_DIR").filter(|value| !value.is_empty())
    {
        return std::path::PathBuf::from(configured);
    }
    if let Some(directory) = postgres_data_directory
        .map(std::path::PathBuf::from)
        .filter(|path| path.is_dir())
    {
        return directory;
    }
    std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."))
}

pub fn live_disk_floor_breached() -> bool {
    match read_filesystem_stats(&filesystem_path(None)) {
        Ok(stats) => admission_blocked(stats.free_bytes, free_space_floor(stats.total_bytes, 0)),
        Err(error) => {
            tracing::warn!(%error, "history disk floor could not be measured");
            false
        }
    }
}

pub async fn load_snapshot(pool: &DbPool) -> Result<BudgetSnapshot, String> {
    let conn = pool.get().await.map_err(|error| error.to_string())?;
    conn.interact(load_snapshot_sync)
        .await
        .map_err(|error| error.to_string())?
}

pub async fn store_budget(
    pool: &DbPool,
    budget_bytes: i64,
    updated_at: DateTime<Utc>,
    audit: Option<crate::audit::AuditWrite>,
) -> Result<(), String> {
    let conn = pool.get().await.map_err(|error| error.to_string())?;
    conn.interact(move |conn| {
        conn.transaction(|conn| {
            persist_budget(conn, budget_bytes, updated_at)?;
            if let Some(event) = audit.as_ref() {
                crate::audit::insert_on(conn, event)?;
            }
            Ok::<(), diesel::result::Error>(())
        })
    })
    .await
    .map_err(|error| error.to_string())?
    .map_err(|error| error.to_string())
}

fn load_snapshot_sync(conn: &mut PgConnection) -> Result<BudgetSnapshot, String> {
    let configured_budget_bytes = configured_budget(conn)?;
    let usage_rows = relation_sizes(conn, HISTORY_RELATIONS)?;
    let reported: Vec<(&str, u64)> = usage_rows
        .iter()
        .map(|(name, bytes)| (name.as_str(), *bytes))
        .collect();
    let diagnostic_bytes = diagnostic_relation_bytes(conn)?;
    let filesystem = postgres_filesystem(conn)?;
    Ok(BudgetSnapshot {
        usage_bytes: history_usage_bytes(&reported),
        tier_bytes: vec![TierBytes {
            tier: ResolutionTier::DiagnosticPartitions,
            bytes: diagnostic_bytes,
        }],
        filesystem_total_bytes: filesystem.total_bytes,
        free_bytes: filesystem.free_bytes,
        configured_budget_bytes,
    })
}

fn configured_budget(conn: &mut PgConnection) -> Result<Option<u64>, String> {
    let stored = budget_settings::table
        .select(budget_settings::budget_bytes)
        .first::<i64>(conn)
        .optional()
        .map_err(|error| error.to_string())?;
    stored
        .map(|bytes| u64::try_from(bytes).map_err(|error| error.to_string()))
        .transpose()
}

fn persist_budget(
    conn: &mut PgConnection,
    budget_bytes: i64,
    updated_at: DateTime<Utc>,
) -> Result<(), diesel::result::Error> {
    diesel::insert_into(budget_settings::table)
        .values((
            budget_settings::id.eq(1_i16),
            budget_settings::budget_bytes.eq(budget_bytes),
            budget_settings::updated_at.eq(updated_at),
        ))
        .on_conflict(budget_settings::id)
        .do_update()
        .set((
            budget_settings::budget_bytes.eq(budget_bytes),
            budget_settings::updated_at.eq(updated_at),
        ))
        .execute(conn)?;
    Ok(())
}

fn relation_sizes(conn: &mut PgConnection, names: &[&str]) -> Result<Vec<(String, u64)>, String> {
    let names: Vec<String> = names.iter().map(|name| (*name).to_string()).collect();
    let rows = diesel::sql_query(HISTORY_USAGE_SQL)
        .bind::<Array<Text>, _>(names)
        .load::<RelationSize>(conn)
        .map_err(|error| error.to_string())?;
    Ok(rows
        .into_iter()
        .filter_map(|row| u64::try_from(row.bytes).ok().map(|bytes| (row.name, bytes)))
        .collect())
}

fn diagnostic_relation_bytes(conn: &mut PgConnection) -> Result<u64, String> {
    let row = diesel::sql_query(DIAGNOSTIC_BYTES_SQL)
        .get_result::<ByteTotal>(conn)
        .map_err(|error| error.to_string())?;
    Ok(u64::try_from(row.bytes).unwrap_or(0))
}

fn postgres_filesystem(conn: &mut PgConnection) -> Result<FilesystemStats, String> {
    let directory = diesel::sql_query(DATA_DIRECTORY_SQL)
        .get_result::<SettingRow>(conn)
        .ok()
        .map(|row| row.setting);
    let preferred = filesystem_path(directory.as_deref());
    if let Ok(stats) = read_filesystem_stats(&preferred) {
        return Ok(stats);
    }
    read_filesystem_stats(&filesystem_path(None))
}

#[derive(QueryableByName)]
struct RelationSize {
    #[diesel(sql_type = Text)]
    name: String,
    #[diesel(sql_type = BigInt)]
    bytes: i64,
}

#[derive(QueryableByName)]
struct ByteTotal {
    #[diesel(sql_type = BigInt)]
    bytes: i64,
}

#[derive(QueryableByName)]
struct SettingRow {
    #[diesel(sql_type = Text)]
    setting: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    const TWO_GIB: u64 = 2 * GIB;
    const EIGHT_GIB: u64 = 8 * GIB;

    #[test]
    fn default_budget_is_the_smaller_of_two_gib_and_ten_percent() {
        assert_eq!(default_budget_bytes(100 * GIB), TWO_GIB);
        assert_eq!(default_budget_bytes(20 * GIB), TWO_GIB);
        assert_eq!(default_budget_bytes(19 * GIB), 19 * GIB / 10);
        assert_eq!(default_budget_bytes(10 * GIB), GIB);
        assert_eq!(default_budget_bytes(0), 0);
    }

    #[test]
    fn floor_is_the_largest_of_eight_gib_fifteen_percent_or_updater_bytes() {
        assert_eq!(free_space_floor(10 * GIB, 0), EIGHT_GIB);
        assert_eq!(free_space_floor(100 * GIB, 0), 15 * GIB);
        assert_eq!(free_space_floor(10 * GIB, 20 * GIB), 20 * GIB);
        assert_ne!(
            free_space_floor(10 * GIB, 0),
            crate::diagnostics::FREE_SPACE_FLOOR
        );
    }

    #[test]
    fn admission_stops_before_free_space_crosses_the_floor() {
        let floor = 15 * GIB;
        assert!(!admission_blocked(floor + 1, floor));
        assert!(admission_blocked(floor, floor));
        assert!(admission_blocked(0, floor));
    }

    #[test]
    fn usage_includes_present_history_relations_and_ignores_absent_ones() {
        let usage = sum_present_relation_sizes(HISTORY_RELATIONS, |name| {
            Ok(match name {
                "capability_observations" => Some(100),
                "capability_observation_keys" => Some(20),
                "capability_recording_bounds" => Some(5),
                "history_gaps" => Some(7),
                "meter_epochs" => Some(3),
                "home_meter_designation_periods" => Some(2),
                "power_rollups" => Some(11),
                "gauge_rollups" => Some(13),
                "energy_counter_rollups" => Some(17),
                _ => None,
            })
        })
        .unwrap();
        assert_eq!(usage, 178);
    }

    #[test]
    fn usage_excludes_diagnostics_and_the_admission_journal() {
        assert!(!HISTORY_RELATIONS.contains(&"diagnostic_events"));
        assert!(
            HISTORY_RELATIONS
                .iter()
                .all(|name| !name.contains("journal"))
        );
        assert!(HISTORY_USAGE_SQL.contains("pg_total_relation_size"));
        assert!(!HISTORY_USAGE_SQL.contains("diagnostic_events"));
        let usage = history_usage_bytes(&[
            ("capability_observations", 100),
            ("capability_observation_keys", 4),
            ("history_gaps", 1),
            ("diagnostic_events", 999),
            ("history-admission.journal", 50),
        ]);
        assert_eq!(usage, 105);
    }

    #[test]
    fn resolution_loss_follows_retention_order_and_stops_when_the_deficit_is_covered() {
        assert!(project_resolution_loss(0, &[]).is_empty());

        let only_diagnostics = project_resolution_loss(
            40,
            &[TierBytes {
                tier: ResolutionTier::DiagnosticPartitions,
                bytes: 40,
            }],
        );
        assert_eq!(only_diagnostics, vec![ResolutionTier::DiagnosticPartitions]);

        let through_raw = project_resolution_loss(
            80,
            &[
                TierBytes {
                    tier: ResolutionTier::DiagnosticPartitions,
                    bytes: 30,
                },
                TierBytes {
                    tier: ResolutionTier::Raw,
                    bytes: 50,
                },
                TierBytes {
                    tier: ResolutionTier::Daily,
                    bytes: 1_000,
                },
            ],
        );
        assert_eq!(
            through_raw,
            vec![ResolutionTier::DiagnosticPartitions, ResolutionTier::Raw]
        );

        let unknown = project_resolution_loss(
            10,
            &[TierBytes {
                tier: ResolutionTier::DiagnosticPartitions,
                bytes: 0,
            }],
        );
        assert_eq!(
            unknown,
            vec![
                ResolutionTier::Raw,
                ResolutionTier::OneMinute,
                ResolutionTier::FiveMinute,
                ResolutionTier::FifteenMinute,
                ResolutionTier::Hourly,
                ResolutionTier::Daily,
            ]
        );
        assert_eq!(*unknown.last().unwrap(), ResolutionTier::Daily);
    }

    #[test]
    fn lowering_below_usage_requires_confirmation_and_does_not_audit_until_accepted() {
        assert!(confirmation_required(1_000, 100, 400));
        assert!(!confirmation_required(1_000, 900, 400));
        assert!(!confirmation_required(100, 900, 400));
        assert!(!confirmation_required(1_000, 400, 400));

        let rejected = evaluate_budget_change(1_000, 100, 400, false, &[]).unwrap_err();
        assert!(!rejected.likely_resolution_loss.is_empty());
        assert_eq!(
            rejected.likely_resolution_loss.last().copied(),
            Some(ResolutionTier::Daily)
        );

        let accepted = evaluate_budget_change(1_000, 100, 400, true, &[]).unwrap();
        assert!(accepted.write_audit);
        assert!(accepted.view_fields.proposed_deletion);
        assert!(!accepted.view_fields.restores_deleted_history);
        assert_eq!(
            accepted.view_fields.likely_resolution_loss.last().copied(),
            Some(ResolutionTier::Daily)
        );
    }

    #[test]
    fn raising_a_budget_persists_retention_without_claiming_history_was_restored() {
        let raised = evaluate_budget_change(100, 1_000, 400, false, &[]).unwrap();
        assert!(raised.write_audit);
        assert!(!raised.view_fields.proposed_deletion);
        assert!(raised.view_fields.likely_resolution_loss.is_empty());
        assert!(!raised.view_fields.restores_deleted_history);

        let unchanged = evaluate_budget_change(400, 400, 100, false, &[]).unwrap();
        assert!(!unchanged.write_audit);
    }

    #[test]
    fn budget_view_reports_usage_floor_and_proposed_deletion() {
        let open = history_budget_view(100 * GIB, 50 * GIB, 10, None, 0, &[]);
        assert_eq!(open.usage_bytes, 10);
        assert_eq!(open.budget_bytes, TWO_GIB);
        assert_eq!(open.default_budget_bytes, TWO_GIB);
        assert_eq!(open.floor_bytes, 15 * GIB);
        assert_eq!(open.free_bytes, 50 * GIB);
        assert!(!open.floor_breached);
        assert!(!open.proposed_deletion);
        assert!(open.likely_resolution_loss.is_empty());
        assert!(!open.restores_deleted_history);

        let tight = history_budget_view(
            100 * GIB,
            10 * GIB,
            500,
            Some(100),
            0,
            &[TierBytes {
                tier: ResolutionTier::DiagnosticPartitions,
                bytes: 50,
            }],
        );
        assert_eq!(tight.budget_bytes, 100);
        assert!(tight.floor_breached);
        assert!(tight.proposed_deletion);
        assert_eq!(
            tight.likely_resolution_loss.first().copied(),
            Some(ResolutionTier::DiagnosticPartitions)
        );
        assert_eq!(
            tight.likely_resolution_loss.last().copied(),
            Some(ResolutionTier::Daily)
        );
        assert!(!tight.restores_deleted_history);
    }
}
