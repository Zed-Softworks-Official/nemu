use chrono::{DateTime, Duration, TimeZone, Timelike, Utc};
use diesel::prelude::*;
use serde_json::Value as JsonValue;
use tokio::sync::mpsc;
use uuid::Uuid;

use crate::db::schema::diagnostic_events;
use crate::state::DbPool;

pub const MAX_BYTES: u64 = 256 * 1024 * 1024;
/// Free space kept for Commands, updates, and Controller operation.
/// Diagnostic partitions are removed to restore it. History is not.
pub const FREE_SPACE_FLOOR: u64 = 1024 * 1024 * 1024;

pub fn max_age() -> Duration {
    Duration::hours(48)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DiagnosticKind {
    AdapterEvent,
    InvalidValue,
    IncompatibleReport,
    RateRejection,
    LateHistoryRejection,
}

impl DiagnosticKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::AdapterEvent => "adapter_event",
            Self::InvalidValue => "invalid_value",
            Self::IncompatibleReport => "incompatible_report",
            Self::RateRejection => "rate_rejection",
            Self::LateHistoryRejection => "late_history_rejection",
        }
    }
}

#[derive(Debug, Clone)]
pub struct DiagnosticWrite {
    pub kind: DiagnosticKind,
    pub device_id: Option<Uuid>,
    pub payload: JsonValue,
    pub received_at: DateTime<Utc>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DiagnosticPartition {
    pub name: String,
    pub range_end: DateTime<Utc>,
    pub bytes: u64,
}

#[derive(Insertable)]
#[diesel(table_name = diagnostic_events)]
struct NewDiagnostic {
    received_at: DateTime<Utc>,
    kind: String,
    device_id: Option<Uuid>,
    payload: JsonValue,
}

pub fn partition_name_allowed(name: &str) -> bool {
    let Some(stamp) = name.strip_prefix("diagnostic_events_") else {
        return false;
    };
    stamp.len() == 10 && stamp.chars().all(|character| character.is_ascii_digit())
}

/// Drops the oldest Diagnostic partitions that are past 48 hours or that push
/// the log over its byte cap. Callers prune these before product History.
pub fn partitions_to_drop(
    mut partitions: Vec<DiagnosticPartition>,
    oldest_end: DateTime<Utc>,
    max_bytes: u64,
) -> Vec<String> {
    partitions.retain(|partition| partition_name_allowed(&partition.name));
    partitions.sort_by_key(|partition| partition.range_end);
    let mut total: u64 = partitions.iter().map(|partition| partition.bytes).sum();
    let mut dropped = Vec::new();
    for partition in partitions {
        let expired = partition.range_end <= oldest_end;
        let over_budget = total > max_bytes;
        if !expired && !over_budget {
            break;
        }
        total = total.saturating_sub(partition.bytes);
        dropped.push(partition.name);
        if !expired && total <= max_bytes {
            break;
        }
    }
    dropped
}

/// Drops the oldest Diagnostic partitions until `bytes_needed` is covered.
/// The newest partition stays so the log can keep accepting rows. Product
/// History names are refused.
pub fn partitions_to_free(
    mut partitions: Vec<DiagnosticPartition>,
    bytes_needed: u64,
) -> Vec<String> {
    if bytes_needed == 0 {
        return Vec::new();
    }
    partitions.retain(|partition| partition_name_allowed(&partition.name));
    partitions.sort_by_key(|partition| partition.range_end);
    if partitions.len() <= 1 {
        return Vec::new();
    }
    let newest = partitions.len() - 1;
    let mut freed = 0u64;
    let mut dropped = Vec::new();
    for partition in partitions.into_iter().take(newest) {
        dropped.push(partition.name);
        freed = freed.saturating_add(partition.bytes);
        if freed >= bytes_needed {
            break;
        }
    }
    dropped
}

pub fn free_space_shortfall() -> u64 {
    match filesystem_free_bytes() {
        Ok(free) if free < FREE_SPACE_FLOOR => FREE_SPACE_FLOOR - free,
        _ => 0,
    }
}

fn filesystem_free_bytes() -> Result<u64, String> {
    let path = std::env::current_dir().map_err(|error| error.to_string())?;
    let path = std::ffi::CString::new(path.as_os_str().as_encoded_bytes())
        .map_err(|error| error.to_string())?;
    let mut stat = unsafe { std::mem::zeroed::<libc::statvfs>() };
    let rc = unsafe { libc::statvfs(path.as_ptr(), &mut stat) };
    if rc != 0 {
        return Err("failed to read free disk space".to_string());
    }
    Ok(u64::try_from(stat.f_bavail)
        .unwrap_or(0)
        .saturating_mul(u64::try_from(stat.f_frsize).unwrap_or(0)))
}

pub fn spawn_writer(pool: DbPool, mut incoming: mpsc::UnboundedReceiver<DiagnosticWrite>) {
    tokio::spawn(async move {
        while let Some(write) = incoming.recv().await {
            if let Err(error) = record(&pool, write).await {
                tracing::warn!(%error, "failed to record diagnostic");
            }
        }
    });
}

pub async fn record(pool: &DbPool, write: DiagnosticWrite) -> Result<(), String> {
    let conn = pool.get().await.map_err(|error| error.to_string())?;
    conn.interact(move |conn| insert_sync(conn, &write))
        .await
        .map_err(|error| error.to_string())?
        .map_err(|error| error.to_string())
}

fn insert_sync(
    conn: &mut PgConnection,
    write: &DiagnosticWrite,
) -> Result<(), diesel::result::Error> {
    ensure_partition(conn, write.received_at)?;
    diesel::insert_into(diagnostic_events::table)
        .values(NewDiagnostic {
            received_at: write.received_at,
            kind: write.kind.as_str().to_string(),
            device_id: write.device_id,
            payload: write.payload.clone(),
        })
        .execute(conn)?;
    Ok(())
}

fn ensure_partition(
    conn: &mut PgConnection,
    received_at: DateTime<Utc>,
) -> Result<(), diesel::result::Error> {
    let start = hour_start(received_at);
    let end = start + Duration::hours(1);
    let name = partition_name(start);
    if !partition_name_allowed(&name) {
        return Err(diesel::result::Error::RollbackTransaction);
    }
    let statement = format!(
        "CREATE TABLE IF NOT EXISTS {name} PARTITION OF diagnostic_events FOR VALUES FROM ('{}') TO ('{}')",
        start.format("%Y-%m-%d %H:%M:%S+00"),
        end.format("%Y-%m-%d %H:%M:%S+00")
    );
    diesel::sql_query(statement).execute(conn)?;
    Ok(())
}

fn hour_start(received_at: DateTime<Utc>) -> DateTime<Utc> {
    received_at
        .with_minute(0)
        .and_then(|value| value.with_second(0))
        .and_then(|value| value.with_nanosecond(0))
        .unwrap_or(received_at)
}

fn partition_name(start: DateTime<Utc>) -> String {
    format!("diagnostic_events_{}", start.format("%Y%m%d%H"))
}

fn range_end_from_name(name: &str) -> Option<DateTime<Utc>> {
    let stamp = name.strip_prefix("diagnostic_events_")?;
    if stamp.len() != 10 {
        return None;
    }
    let year: i32 = stamp[0..4].parse().ok()?;
    let month: u32 = stamp[4..6].parse().ok()?;
    let day: u32 = stamp[6..8].parse().ok()?;
    let hour: u32 = stamp[8..10].parse().ok()?;
    Utc.with_ymd_and_hms(year, month, day, hour, 0, 0)
        .single()
        .map(|start| start + Duration::hours(1))
}

pub async fn prune_before_history(
    pool: &DbPool,
    now: DateTime<Utc>,
) -> Result<Vec<String>, String> {
    prune_with_limit(pool, now, MAX_BYTES, free_space_shortfall()).await
}

async fn prune_with_limit(
    pool: &DbPool,
    now: DateTime<Utc>,
    max_bytes: u64,
    bytes_to_free: u64,
) -> Result<Vec<String>, String> {
    let conn = pool.get().await.map_err(|error| error.to_string())?;
    let oldest_end = now - max_age();
    conn.interact(move |conn| {
        diesel::delete(
            diagnostic_events::table.filter(diagnostic_events::received_at.le(oldest_end)),
        )
        .execute(conn)?;
        let partitions = list_partitions(conn)?;
        let mut names = partitions_to_drop(partitions.clone(), oldest_end, max_bytes);
        let kept = partitions
            .into_iter()
            .filter(|partition| !names.iter().any(|name| name == &partition.name))
            .collect();
        names.extend(partitions_to_free(kept, bytes_to_free));
        for name in &names {
            drop_partition(conn, name)?;
        }
        Ok::<Vec<String>, diesel::result::Error>(names)
    })
    .await
    .map_err(|error| error.to_string())?
    .map_err(|error| error.to_string())
}

#[derive(QueryableByName)]
struct PartitionSize {
    #[diesel(sql_type = diesel::sql_types::Text)]
    name: String,
    #[diesel(sql_type = diesel::sql_types::Int8)]
    bytes: i64,
}

fn list_partitions(
    conn: &mut PgConnection,
) -> Result<Vec<DiagnosticPartition>, diesel::result::Error> {
    let rows = diesel::sql_query(
        "SELECT c.relname AS name, pg_total_relation_size(c.oid)::bigint AS bytes
         FROM pg_inherits i
         JOIN pg_class c ON c.oid = i.inhrelid
         JOIN pg_class p ON p.oid = i.inhparent
         WHERE p.relname = 'diagnostic_events'",
    )
    .load::<PartitionSize>(conn)?;
    Ok(rows
        .into_iter()
        .filter_map(|row| {
            let range_end = range_end_from_name(&row.name)?;
            Some(DiagnosticPartition {
                name: row.name,
                range_end,
                bytes: u64::try_from(row.bytes).unwrap_or(0),
            })
        })
        .collect())
}

fn drop_partition(conn: &mut PgConnection, name: &str) -> Result<(), diesel::result::Error> {
    if !partition_name_allowed(name) {
        return Err(diesel::result::Error::RollbackTransaction);
    }
    diesel::sql_query(format!("DROP TABLE IF EXISTS {name}")).execute(conn)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use chrono::TimeZone;

    use super::*;

    fn at(hour: u32) -> DateTime<Utc> {
        Utc.with_ymd_and_hms(2026, 10, 18, hour, 0, 0).unwrap()
    }

    #[test]
    fn refuses_to_name_product_history_as_a_diagnostic_partition() {
        assert!(partition_name_allowed("diagnostic_events_2026101801"));
        assert!(!partition_name_allowed("capability_observations_y2026"));
        assert!(!partition_name_allowed("diagnostic_events_y2026"));
        assert!(!partition_name_allowed("device_events"));
    }

    #[test]
    fn expires_partitions_at_48_hours_and_drops_oldest_first_over_256_mib() {
        let now = at(12);
        let oldest_end = now - max_age();
        let recent = DiagnosticPartition {
            name: partition_name(at(11)),
            range_end: at(11) + Duration::hours(1),
            bytes: 100,
        };
        let old_start = now - Duration::hours(50);
        let old = DiagnosticPartition {
            name: partition_name(hour_start(old_start)),
            range_end: hour_start(old_start) + Duration::hours(1),
            bytes: 100,
        };
        let dropped = partitions_to_drop(vec![recent, old.clone()], oldest_end, MAX_BYTES);
        assert_eq!(dropped, vec![old.name]);

        let heavy_old = DiagnosticPartition {
            name: partition_name(hour_start(now - Duration::hours(2))),
            range_end: hour_start(now - Duration::hours(2)) + Duration::hours(1),
            bytes: 200 * 1024 * 1024,
        };
        let heavy_new = DiagnosticPartition {
            name: partition_name(hour_start(now - Duration::hours(1))),
            range_end: hour_start(now - Duration::hours(1)) + Duration::hours(1),
            bytes: 100 * 1024 * 1024,
        };
        let dropped = partitions_to_drop(vec![heavy_new, heavy_old.clone()], oldest_end, MAX_BYTES);
        assert_eq!(dropped, vec![heavy_old.name]);

        let history = DiagnosticPartition {
            name: "capability_observations_y2026".into(),
            range_end: at(1),
            bytes: 500,
        };
        let oldest = DiagnosticPartition {
            name: partition_name(at(1)),
            range_end: at(2),
            bytes: 40,
        };
        let middle = DiagnosticPartition {
            name: partition_name(at(2)),
            range_end: at(3),
            bytes: 40,
        };
        let newest = DiagnosticPartition {
            name: partition_name(at(3)),
            range_end: at(4),
            bytes: 40,
        };
        let middle_name = middle.name.clone();
        let dropped = partitions_to_free(vec![newest.clone(), history, oldest.clone(), middle], 50);
        assert_eq!(dropped, vec![oldest.name, middle_name]);
        assert!(partitions_to_free(vec![newest], 50).is_empty());
    }

    fn pool() -> DbPool {
        crate::db::test_pool()
    }

    async fn count_matching(pool: &DbPool, marker: &str, table: &str, column: &str) -> i64 {
        #[derive(QueryableByName)]
        struct CountRow {
            #[diesel(sql_type = diesel::sql_types::BigInt)]
            count: i64,
        }

        let marker = marker.to_string();
        let sql = format!("SELECT COUNT(*) AS count FROM {table} WHERE {column} = $1");
        let conn = pool.get().await.unwrap();
        let count = conn
            .interact(move |conn| {
                diesel::sql_query(sql)
                    .bind::<diesel::sql_types::Text, _>(marker)
                    .get_result::<CountRow>(conn)
                    .map(|row| row.count)
            })
            .await
            .unwrap()
            .unwrap();
        drop(conn);
        count
    }

    #[tokio::test]
    #[ignore = "requires the isolated PostgreSQL database created by the verification script"]
    async fn command_audit_diagnostic_diagnostics_stay_bounded() {
        let pool = pool();
        let now = Utc::now();
        let marker = Uuid::new_v4().to_string();
        for kind in [
            DiagnosticKind::AdapterEvent,
            DiagnosticKind::InvalidValue,
            DiagnosticKind::IncompatibleReport,
            DiagnosticKind::RateRejection,
            DiagnosticKind::LateHistoryRejection,
        ] {
            record(
                &pool,
                DiagnosticWrite {
                    kind,
                    device_id: None,
                    payload: serde_json::json!({ "marker": marker, "kind": kind.as_str() }),
                    received_at: now,
                },
            )
            .await
            .unwrap();
        }
        record(
            &pool,
            DiagnosticWrite {
                kind: DiagnosticKind::AdapterEvent,
                device_id: None,
                payload: serde_json::json!({ "marker": marker, "age": "old" }),
                received_at: now - max_age() - Duration::hours(2),
            },
        )
        .await
        .unwrap();

        let dropped = prune_before_history(&pool, now).await.unwrap();
        assert!(!dropped.is_empty());
        assert!(dropped.iter().all(|name| partition_name_allowed(name)));

        let remaining =
            count_matching(&pool, &marker, "diagnostic_events", "payload->>'marker'").await;
        assert_eq!(remaining, 5);
        let copied_into_history =
            count_matching(&pool, &marker, "capability_observations", "observation_id").await;
        assert_eq!(copied_into_history, 0);
        let legacy_events =
            count_matching(&pool, &marker, "device_events", "payload->>'marker'").await;
        assert_eq!(legacy_events, 0);
    }
}
