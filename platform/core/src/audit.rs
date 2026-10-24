use chrono::{DateTime, Duration, Utc};
use diesel::prelude::*;
use serde_json::Value as JsonValue;

use crate::db::schema::audit_records;
use crate::state::DbPool;

pub fn retention() -> Duration {
    Duration::days(365)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AuditKind {
    MembershipChange,
    AccessClientPaired,
    AccessClientRevoked,
    Update,
    /// Restore is not implemented yet. The store accepts the record when it is.
    #[allow(dead_code)]
    Restore,
    DeviceRemoval,
    /// Automations are not implemented yet. The store accepts the record when they are.
    #[allow(dead_code)]
    AutomationChange,
    HistoryBudgetChange,
    HomeMeterDesignation,
}

impl AuditKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::MembershipChange => "membership_change",
            Self::AccessClientPaired => "access_client_paired",
            Self::AccessClientRevoked => "access_client_revoked",
            Self::Update => "update",
            Self::Restore => "restore",
            Self::DeviceRemoval => "device_removal",
            Self::AutomationChange => "automation_change",
            Self::HistoryBudgetChange => "history_budget_change",
            Self::HomeMeterDesignation => "home_meter_designation",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AuditWrite {
    pub kind: AuditKind,
    pub actor_user_id: Option<String>,
    pub summary: String,
    pub detail: JsonValue,
}

#[derive(Debug, Clone, Queryable, Selectable)]
#[diesel(table_name = audit_records)]
#[diesel(check_for_backend(diesel::pg::Pg))]
pub struct AuditRow {
    pub id: i64,
    pub kind: String,
    pub actor_user_id: Option<String>,
    pub summary: String,
    pub detail: JsonValue,
    pub created_at: DateTime<Utc>,
}

#[derive(Insertable)]
#[diesel(table_name = audit_records)]
struct NewAudit<'a> {
    kind: &'a str,
    actor_user_id: Option<&'a str>,
    summary: &'a str,
    detail: &'a JsonValue,
}

pub fn authorize_read(role: &str, status: &str) -> Result<(), &'static str> {
    if role == "owner" && status == "active" {
        Ok(())
    } else {
        Err("owner_required")
    }
}

pub fn insert_on(
    conn: &mut PgConnection,
    event: &AuditWrite,
) -> Result<AuditRow, diesel::result::Error> {
    diesel::insert_into(audit_records::table)
        .values(NewAudit {
            kind: event.kind.as_str(),
            actor_user_id: event.actor_user_id.as_deref(),
            summary: &event.summary,
            detail: &event.detail,
        })
        .returning(AuditRow::as_returning())
        .get_result(conn)
}

pub async fn record(pool: &DbPool, event: AuditWrite) -> Result<AuditRow, String> {
    let conn = pool.get().await.map_err(|error| error.to_string())?;
    let kind = event.kind.as_str().to_string();
    conn.interact(move |conn| {
        diesel::insert_into(audit_records::table)
            .values(NewAudit {
                kind: &kind,
                actor_user_id: event.actor_user_id.as_deref(),
                summary: &event.summary,
                detail: &event.detail,
            })
            .returning(AuditRow::as_returning())
            .get_result(conn)
    })
    .await
    .map_err(|error| error.to_string())?
    .map_err(|error| error.to_string())
}

pub async fn list_recent(pool: &DbPool, limit: i64) -> Result<Vec<AuditRow>, String> {
    let conn = pool.get().await.map_err(|error| error.to_string())?;
    conn.interact(move |conn| {
        audit_records::table
            .order(audit_records::created_at.desc())
            .limit(limit)
            .select(AuditRow::as_select())
            .load(conn)
    })
    .await
    .map_err(|error| error.to_string())?
    .map_err(|error| error.to_string())
}

pub async fn sweep(pool: &DbPool, now: DateTime<Utc>) -> Result<(), String> {
    let cutoff = now - retention();
    let conn = pool.get().await.map_err(|error| error.to_string())?;
    conn.interact(move |conn| {
        diesel::delete(audit_records::table.filter(audit_records::created_at.le(cutoff)))
            .execute(conn)
    })
    .await
    .map_err(|error| error.to_string())?
    .map_err(|error| error.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn members_cannot_read_the_audit_log() {
        assert!(authorize_read("owner", "active").is_ok());
        assert!(authorize_read("member", "active").is_err());
        assert!(authorize_read("owner", "pending").is_err());
    }

    fn pool() -> DbPool {
        crate::db::test_pool()
    }

    #[tokio::test]
    #[ignore = "requires the isolated PostgreSQL database created by the verification script"]
    async fn command_audit_diagnostic_audit_survives_restart() {
        let pool = pool();
        let marker = uuid::Uuid::new_v4().to_string();
        let kinds = [
            AuditKind::MembershipChange,
            AuditKind::AccessClientPaired,
            AuditKind::AccessClientRevoked,
            AuditKind::Update,
            AuditKind::DeviceRemoval,
        ];
        for kind in kinds {
            record(
                &pool,
                AuditWrite {
                    kind,
                    actor_user_id: Some("owner-1".into()),
                    summary: format!("{marker} {}", kind.as_str()),
                    detail: serde_json::json!({ "marker": marker, "kind": kind.as_str() }),
                },
            )
            .await
            .unwrap();
        }

        let listed = list_recent(&pool, 50).await.unwrap();
        let mine: Vec<_> = listed
            .iter()
            .filter(|row| row.summary.starts_with(&marker))
            .map(|row| row.kind.as_str())
            .collect();
        assert_eq!(mine.len(), kinds.len());

        let expired = record(
            &pool,
            AuditWrite {
                kind: AuditKind::Restore,
                actor_user_id: Some("owner-1".into()),
                summary: format!("{marker} expired"),
                detail: serde_json::json!({ "marker": marker }),
            },
        )
        .await
        .unwrap();
        let expired_id = expired.id;
        let conn = pool.get().await.unwrap();
        conn.interact(move |conn| {
            diesel::update(audit_records::table.filter(audit_records::id.eq(expired_id)))
                .set(audit_records::created_at.eq(Utc::now() - retention() - Duration::days(1)))
                .execute(conn)
        })
        .await
        .unwrap()
        .unwrap();

        sweep(&pool, Utc::now()).await.unwrap();
        let after = list_recent(&pool, 100).await.unwrap();
        assert!(after.iter().all(|row| row.id != expired_id));
        assert!(
            after
                .iter()
                .any(|row| row.summary.starts_with(&marker) && row.kind == "membership_change")
        );

        #[derive(QueryableByName)]
        struct CountRow {
            #[diesel(sql_type = diesel::sql_types::BigInt)]
            count: i64,
        }
        let conn = pool.get().await.unwrap();
        let events = conn
            .interact(|conn| {
                diesel::sql_query("SELECT COUNT(*) AS count FROM device_events WHERE kind IN ('command', 'audit')")
                    .get_result::<CountRow>(conn)
                    .map(|row| row.count)
            })
            .await
            .unwrap()
            .unwrap();
        assert_eq!(events, 0);
    }
}
