use chrono::{DateTime, Duration, Utc};
use diesel::prelude::*;
use serde_json::Value as JsonValue;
use uuid::Uuid;

use crate::db::schema::command_outcomes;
use crate::state::DbPool;

pub fn dispatch_ttl() -> Duration {
    Duration::seconds(30)
}

pub fn confirmation_deadline() -> Duration {
    Duration::seconds(30)
}

pub fn outcome_retention() -> Duration {
    Duration::hours(24)
}

fn claim_ttl() -> Duration {
    Duration::seconds(10)
}

#[derive(Debug, Clone, Queryable, Selectable)]
#[diesel(table_name = command_outcomes)]
#[diesel(check_for_backend(diesel::pg::Pg))]
#[allow(dead_code)]
pub struct CommandRow {
    pub command_id: String,
    pub device_id: Option<Uuid>,
    pub payload: JsonValue,
    pub outcome: String,
    pub error_code: Option<String>,
    pub dispatch_expires_at: DateTime<Utc>,
    pub retain_until: DateTime<Utc>,
    pub claimed_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Insertable)]
#[diesel(table_name = command_outcomes)]
struct NewCommand {
    command_id: String,
    device_id: Option<Uuid>,
    payload: JsonValue,
    outcome: String,
    error_code: Option<String>,
    dispatch_expires_at: DateTime<Utc>,
    retain_until: DateTime<Utc>,
    claimed_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone)]
pub enum AdmitDecision {
    Dispatch(CommandRow),
    Stored(CommandRow),
}

pub fn valid_command_id(command_id: &str) -> bool {
    let command_id = command_id.trim();
    !command_id.is_empty() && command_id.chars().count() <= 255
}

/// A stored Command answers a retry. Only a new id is dispatched.
pub fn answers_retry(decision: &AdmitDecision) -> bool {
    matches!(decision, AdmitDecision::Stored(_))
}

pub async fn admit(
    pool: &DbPool,
    command_id: &str,
    device_id: Option<Uuid>,
    payload: JsonValue,
    available: bool,
    now: DateTime<Utc>,
) -> Result<AdmitDecision, String> {
    let command_id = command_id.trim().to_string();
    if !valid_command_id(&command_id) {
        return Err("command id is invalid".to_string());
    }
    let conn = pool.get().await.map_err(|error| error.to_string())?;
    conn.interact(move |conn| admit_sync(conn, command_id, device_id, payload, available, now))
        .await
        .map_err(|error| error.to_string())?
        .map_err(|error| error.to_string())
}

fn admit_sync(
    conn: &mut PgConnection,
    command_id: String,
    device_id: Option<Uuid>,
    payload: JsonValue,
    available: bool,
    now: DateTime<Utc>,
) -> Result<AdmitDecision, diesel::result::Error> {
    conn.transaction(|conn| {
        if let Some(existing) = command_outcomes::table
            .filter(command_outcomes::command_id.eq(&command_id))
            .select(CommandRow::as_select())
            .first(conn)
            .optional()?
        {
            return finish_existing(conn, existing, device_id, payload, available, now);
        }
        insert_new(conn, command_id, device_id, payload, available, now)
    })
}

fn finish_existing(
    conn: &mut PgConnection,
    existing: CommandRow,
    device_id: Option<Uuid>,
    payload: JsonValue,
    available: bool,
    now: DateTime<Utc>,
) -> Result<AdmitDecision, diesel::result::Error> {
    if existing.retain_until <= now {
        diesel::delete(
            command_outcomes::table.filter(command_outcomes::command_id.eq(&existing.command_id)),
        )
        .execute(conn)?;
        return insert_new(
            conn,
            existing.command_id,
            device_id,
            payload,
            available,
            now,
        );
    }
    if existing.outcome == "pending_dispatch" && existing.dispatch_expires_at <= now {
        let row = diesel::update(
            command_outcomes::table.filter(command_outcomes::command_id.eq(&existing.command_id)),
        )
        .set((
            command_outcomes::outcome.eq("failed"),
            command_outcomes::error_code.eq(Some("dispatch_expired")),
            command_outcomes::claimed_at.eq(None::<DateTime<Utc>>),
            command_outcomes::updated_at.eq(now),
        ))
        .returning(CommandRow::as_returning())
        .get_result(conn)?;
        return Ok(AdmitDecision::Stored(row));
    }
    Ok(AdmitDecision::Stored(existing))
}

fn insert_new(
    conn: &mut PgConnection,
    command_id: String,
    device_id: Option<Uuid>,
    payload: JsonValue,
    available: bool,
    now: DateTime<Utc>,
) -> Result<AdmitDecision, diesel::result::Error> {
    let dispatch = available && device_id.is_some();
    let outcome = if dispatch {
        "pending_dispatch"
    } else {
        "rejected"
    };
    let error_code = if device_id.is_none() {
        Some("device_not_found".to_string())
    } else if !available {
        Some("unavailable".to_string())
    } else {
        None
    };
    let inserted = diesel::insert_into(command_outcomes::table)
        .values(NewCommand {
            command_id: command_id.clone(),
            device_id,
            payload: payload.clone(),
            outcome: outcome.to_string(),
            error_code,
            dispatch_expires_at: now + dispatch_ttl(),
            retain_until: now + outcome_retention(),
            claimed_at: dispatch.then_some(now),
        })
        .on_conflict(command_outcomes::command_id)
        .do_nothing()
        .returning(CommandRow::as_returning())
        .get_result(conn)
        .optional()?;
    let Some(row) = inserted else {
        let existing = command_outcomes::table
            .filter(command_outcomes::command_id.eq(command_id))
            .select(CommandRow::as_select())
            .first(conn)?;
        return Ok(AdmitDecision::Stored(existing));
    };
    if row.outcome == "pending_dispatch" {
        Ok(AdmitDecision::Dispatch(row))
    } else {
        Ok(AdmitDecision::Stored(row))
    }
}

pub async fn mark_accepted(
    pool: &DbPool,
    command_id: &str,
    now: DateTime<Utc>,
) -> Result<(), String> {
    update_outcome(pool, command_id, "accepted", None, now).await
}

pub async fn mark_failed(
    pool: &DbPool,
    command_id: &str,
    error_code: &str,
    now: DateTime<Utc>,
) -> Result<(), String> {
    update_outcome(pool, command_id, "failed", Some(error_code), now).await
}

async fn update_outcome(
    pool: &DbPool,
    command_id: &str,
    outcome: &str,
    error_code: Option<&str>,
    now: DateTime<Utc>,
) -> Result<(), String> {
    let command_id = command_id.to_string();
    let outcome = outcome.to_string();
    let error_code = error_code.map(str::to_string);
    let conn = pool.get().await.map_err(|error| error.to_string())?;
    conn.interact(move |conn| {
        diesel::update(command_outcomes::table.filter(command_outcomes::command_id.eq(command_id)))
            .set((
                command_outcomes::outcome.eq(outcome),
                command_outcomes::error_code.eq(error_code),
                command_outcomes::claimed_at.eq(None::<DateTime<Utc>>),
                command_outcomes::updated_at.eq(now),
            ))
            .execute(conn)
    })
    .await
    .map_err(|error| error.to_string())?
    .map_err(|error| error.to_string())?;
    Ok(())
}

pub async fn confirm_accepted(
    pool: &DbPool,
    device_id: Uuid,
    now: DateTime<Utc>,
) -> Result<(), String> {
    let conn = pool.get().await.map_err(|error| error.to_string())?;
    conn.interact(move |conn| {
        diesel::update(
            command_outcomes::table.filter(
                command_outcomes::device_id
                    .eq(device_id)
                    .and(command_outcomes::outcome.eq("accepted")),
            ),
        )
        .set((
            command_outcomes::outcome.eq("confirmed"),
            command_outcomes::error_code.eq(None::<String>),
            command_outcomes::updated_at.eq(now),
        ))
        .execute(conn)
    })
    .await
    .map_err(|error| error.to_string())?
    .map_err(|error| error.to_string())?;
    Ok(())
}

pub async fn claim_pending(
    pool: &DbPool,
    device_id: Uuid,
    now: DateTime<Utc>,
) -> Result<Vec<CommandRow>, String> {
    let stale = now - claim_ttl();
    let conn = pool.get().await.map_err(|error| error.to_string())?;
    conn.interact(move |conn| {
        diesel::update(
            command_outcomes::table.filter(
                command_outcomes::device_id
                    .eq(device_id)
                    .and(command_outcomes::outcome.eq("pending_dispatch"))
                    .and(command_outcomes::dispatch_expires_at.gt(now))
                    .and(
                        command_outcomes::claimed_at
                            .is_null()
                            .or(command_outcomes::claimed_at.lt(stale)),
                    ),
            ),
        )
        .set((
            command_outcomes::claimed_at.eq(now),
            command_outcomes::updated_at.eq(now),
        ))
        .returning(CommandRow::as_returning())
        .get_results(conn)
    })
    .await
    .map_err(|error| error.to_string())?
    .map_err(|error| error.to_string())
}

pub async fn sweep(pool: &DbPool, now: DateTime<Utc>) -> Result<(), String> {
    let deadline = now - confirmation_deadline();
    let conn = pool.get().await.map_err(|error| error.to_string())?;
    conn.interact(move |conn| {
        diesel::update(
            command_outcomes::table.filter(
                command_outcomes::outcome
                    .eq("pending_dispatch")
                    .and(command_outcomes::dispatch_expires_at.le(now)),
            ),
        )
        .set((
            command_outcomes::outcome.eq("failed"),
            command_outcomes::error_code.eq(Some("dispatch_expired")),
            command_outcomes::claimed_at.eq(None::<DateTime<Utc>>),
            command_outcomes::updated_at.eq(now),
        ))
        .execute(conn)?;
        diesel::update(
            command_outcomes::table.filter(
                command_outcomes::outcome
                    .eq("accepted")
                    .and(command_outcomes::updated_at.le(deadline)),
            ),
        )
        .set((
            command_outcomes::outcome.eq("unconfirmed"),
            command_outcomes::error_code.eq(Some("unconfirmed")),
            command_outcomes::updated_at.eq(now),
        ))
        .execute(conn)?;
        diesel::delete(command_outcomes::table.filter(command_outcomes::retain_until.le(now)))
            .execute(conn)?;
        Ok::<(), diesel::result::Error>(())
    })
    .await
    .map_err(|error| error.to_string())?
    .map_err(|error| error.to_string())
}

#[cfg(test)]
pub async fn get(pool: &DbPool, command_id: &str) -> Result<Option<CommandRow>, String> {
    let command_id = command_id.to_string();
    let conn = pool.get().await.map_err(|error| error.to_string())?;
    conn.interact(move |conn| {
        command_outcomes::table
            .filter(command_outcomes::command_id.eq(command_id))
            .select(CommandRow::as_select())
            .first(conn)
            .optional()
    })
    .await
    .map_err(|error| error.to_string())?
    .map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stored_commands_answer_retries_without_dispatch() {
        let stored = AdmitDecision::Stored(sample("accepted"));
        let fresh = AdmitDecision::Dispatch(sample("pending_dispatch"));
        assert!(answers_retry(&stored));
        assert!(!answers_retry(&fresh));
    }

    fn sample(outcome: &str) -> CommandRow {
        let now = Utc::now();
        CommandRow {
            command_id: "cmd-1".into(),
            device_id: None,
            payload: JsonValue::Null,
            outcome: outcome.into(),
            error_code: None,
            dispatch_expires_at: now,
            retain_until: now,
            claimed_at: None,
            created_at: now,
            updated_at: now,
        }
    }

    fn pool() -> DbPool {
        use deadpool_diesel::postgres::{Manager, Pool, Runtime};

        let database_url = std::env::var("CAPABILITY_TEST_DATABASE_URL")
            .expect("CAPABILITY_TEST_DATABASE_URL must name the isolated test database");
        let manager = Manager::new(database_url, Runtime::Tokio1);
        Pool::builder(manager).max_size(2).build().unwrap()
    }

    async fn insert_device(pool: &DbPool) -> Uuid {
        use crate::db::models::NewDevice;
        use crate::db::schema::devices;

        let external_id = format!("ledger-{}", Uuid::new_v4());
        let conn = pool.get().await.unwrap();
        conn.interact(move |conn| {
            diesel::insert_into(devices::table)
                .values(NewDevice {
                    external_id: &external_id,
                    protocol: "zigbee",
                    friendly_name: "Ledger lamp",
                    device_type: "light",
                    model: None,
                    enabled: true,
                })
                .returning(devices::id)
                .get_result(conn)
        })
        .await
        .unwrap()
        .unwrap()
    }

    async fn table_count(pool: &DbPool, table: &str) -> i64 {
        #[derive(QueryableByName)]
        struct CountRow {
            #[diesel(sql_type = diesel::sql_types::BigInt)]
            count: i64,
        }

        let sql = format!("SELECT COUNT(*) AS count FROM {table}");
        let conn = pool.get().await.unwrap();
        conn.interact(move |conn| {
            diesel::sql_query(sql)
                .get_result::<CountRow>(conn)
                .map(|row| row.count)
        })
        .await
        .unwrap()
        .unwrap()
    }

    #[tokio::test]
    #[ignore = "requires the isolated PostgreSQL database created by the verification script"]
    async fn command_audit_diagnostic_ledger_survives_restart() {
        let pool = pool();
        let device_id = insert_device(&pool).await;
        let events_before = table_count(&pool, "device_events").await;
        let now = Utc::now();
        let command_id = format!("cmd-{}", Uuid::new_v4());
        let payload = serde_json::json!({ "state": "ON" });

        let first = admit(
            &pool,
            &command_id,
            Some(device_id),
            payload.clone(),
            true,
            now,
        )
        .await
        .unwrap();
        assert!(matches!(first, AdmitDecision::Dispatch(_)));

        let reloaded = get(&pool, &command_id).await.unwrap().unwrap();
        assert_eq!(reloaded.outcome, "pending_dispatch");
        assert!(reloaded.retain_until > now);

        let retry = admit(
            &pool,
            &command_id,
            Some(device_id),
            payload.clone(),
            true,
            now,
        )
        .await
        .unwrap();
        assert!(answers_retry(&retry));
        assert!(table_count(&pool, "command_outcomes").await >= 1);

        sweep(&pool, now + dispatch_ttl() + Duration::seconds(1))
            .await
            .unwrap();
        let expired = get(&pool, &command_id).await.unwrap().unwrap();
        assert_eq!(expired.outcome, "failed");
        assert_eq!(expired.error_code.as_deref(), Some("dispatch_expired"));
        let claimed = claim_pending(&pool, device_id, Utc::now()).await.unwrap();
        assert!(claimed.iter().all(|row| row.command_id != command_id));

        let accepted_id = format!("cmd-{}", Uuid::new_v4());
        let accepted_at = Utc::now();
        let accepted = admit(
            &pool,
            &accepted_id,
            Some(device_id),
            payload,
            true,
            accepted_at,
        )
        .await
        .unwrap();
        let AdmitDecision::Dispatch(row) = accepted else {
            panic!("expected a new dispatch");
        };
        mark_accepted(&pool, &row.command_id, accepted_at)
            .await
            .unwrap();
        sweep(
            &pool,
            accepted_at + confirmation_deadline() + Duration::seconds(1),
        )
        .await
        .unwrap();
        let unconfirmed = get(&pool, &accepted_id).await.unwrap().unwrap();
        assert_eq!(unconfirmed.outcome, "unconfirmed");

        let kept = get(&pool, &command_id).await.unwrap();
        assert!(kept.is_some());
        sweep(&pool, now + outcome_retention() + Duration::seconds(1))
            .await
            .unwrap();
        assert!(get(&pool, &command_id).await.unwrap().is_none());
        assert_eq!(table_count(&pool, "device_events").await, events_before);
    }
}
