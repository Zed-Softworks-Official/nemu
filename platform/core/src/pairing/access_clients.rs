//! Access Clients paired with CPace (ADR-0037). Each row binds one Access
//! Client's public keys to one Membership; deleting the Membership deletes
//! its rows. Every deleted row leaves a tombstone (`pairing::tombstones`). Bearer-token Access Clients stay in `client_tokens` until
//! NEM-131 removes them.

use chrono::Utc;
use diesel::prelude::*;
use uuid::Uuid;

use crate::audit::{self, AuditWrite};
use crate::db::models::{AccessClient, Member, NewAccessClient};
use crate::db::schema::{access_clients, members};
use crate::pairing::tombstones::keys_tombstoned_on;
use crate::state::DbPool;

#[derive(Debug, Clone)]
pub struct AccessClientInput {
    pub id: Uuid,
    pub member_id: Uuid,
    pub label: String,
    pub signing_key: [u8; 32],
    pub encryption_key: [u8; 32],
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AccessClientInsertError {
    /// Another Access Client already holds one of these public keys.
    KeysInUse,
    /// A tombstoned Access Client held one of these public keys.
    Tombstoned,
    Internal(String),
}

pub async fn insert_access_client(
    pool: &DbPool,
    input: AccessClientInput,
    audit: Option<AuditWrite>,
) -> Result<AccessClient, AccessClientInsertError> {
    let conn = pool
        .get()
        .await
        .map_err(|e| AccessClientInsertError::Internal(format!("db pool error: {e}")))?;
    conn.interact(move |conn| {
        conn.transaction(|conn| -> Result<AccessClient, diesel::result::Error> {
            let row = diesel::insert_into(access_clients::table)
                .values(NewAccessClient {
                    id: input.id,
                    member_id: input.member_id,
                    label: &input.label,
                    signing_key: &input.signing_key,
                    encryption_key: &input.encryption_key,
                })
                .get_result::<AccessClient>(conn)?;
            // Checked after the insert: if a revocation of the same keys was
            // in flight, the insert waited on the unique index for it to
            // commit, and this read now sees its tombstone.
            if keys_tombstoned_on(conn, &input.signing_key, &input.encryption_key)? {
                return Err(diesel::result::Error::RollbackTransaction);
            }
            if let Some(audit) = &audit {
                audit::insert_on(conn, audit)?;
            }
            Ok(row)
        })
        .map_err(|error| match error {
            diesel::result::Error::DatabaseError(
                diesel::result::DatabaseErrorKind::UniqueViolation,
                _,
            ) => AccessClientInsertError::KeysInUse,
            diesel::result::Error::RollbackTransaction => AccessClientInsertError::Tombstoned,
            other => AccessClientInsertError::Internal(other.to_string()),
        })
    })
    .await
    .map_err(|e| AccessClientInsertError::Internal(format!("db interact error: {e}")))?
}

/// The Access Client and the Membership it belongs to.
pub async fn find_access_client(
    pool: &DbPool,
    id: Uuid,
) -> Result<Option<(AccessClient, Member)>, String> {
    let conn = pool
        .get()
        .await
        .map_err(|e| format!("db pool error: {e}"))?;
    conn.interact(move |conn| {
        access_clients::table
            .inner_join(members::table)
            .filter(access_clients::id.eq(id))
            .select((AccessClient::as_select(), Member::as_select()))
            .first(conn)
            .optional()
            .map_err(|e| format!("access client lookup failed: {e}"))
    })
    .await
    .map_err(|e| format!("db interact error: {e}"))?
}

pub async fn touch_access_client(pool: &DbPool, id: Uuid) -> Result<(), String> {
    let conn = pool
        .get()
        .await
        .map_err(|e| format!("db pool error: {e}"))?;
    conn.interact(move |conn| {
        diesel::update(access_clients::table.find(id))
            .set(access_clients::last_seen_at.eq(Some(Utc::now())))
            .execute(conn)
            .map(|_| ())
            .map_err(|e| format!("access client touch failed: {e}"))
    })
    .await
    .map_err(|e| format!("db interact error: {e}"))?
}

pub async fn list_access_clients(pool: &DbPool) -> Result<Vec<(AccessClient, Member)>, String> {
    let conn = pool
        .get()
        .await
        .map_err(|e| format!("db pool error: {e}"))?;
    conn.interact(|conn| {
        access_clients::table
            .inner_join(members::table)
            .order(access_clients::created_at.desc())
            .select((AccessClient::as_select(), Member::as_select()))
            .load(conn)
            .map_err(|e| format!("access client list failed: {e}"))
    })
    .await
    .map_err(|e| format!("db interact error: {e}"))?
}

pub async fn delete_access_client(
    pool: &DbPool,
    id: Uuid,
    audit: Option<AuditWrite>,
) -> Result<bool, String> {
    let conn = pool
        .get()
        .await
        .map_err(|e| format!("db pool error: {e}"))?;
    conn.interact(move |conn| {
        conn.transaction(|conn| -> Result<bool, anyhow::Error> {
            let deleted = diesel::delete(access_clients::table.find(id)).execute(conn)?;
            if deleted > 0
                && let Some(audit) = &audit
            {
                audit::insert_on(conn, audit)?;
            }
            Ok(deleted > 0)
        })
        .map_err(|error| error.to_string())
    })
    .await
    .map_err(|e| format!("db interact error: {e}"))?
}

pub async fn count_access_clients(pool: &DbPool) -> Result<i64, String> {
    let conn = pool
        .get()
        .await
        .map_err(|e| format!("db pool error: {e}"))?;
    conn.interact(|conn| {
        access_clients::table
            .count()
            .get_result::<i64>(conn)
            .map_err(|e| format!("access client count failed: {e}"))
    })
    .await
    .map_err(|e| format!("db interact error: {e}"))?
}
