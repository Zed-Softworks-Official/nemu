//! Access Client tombstones (ADR-0001, NEM-127).
//!
//! Removing an Access Client leaves a tombstone holding its ID and both
//! public keys. A database trigger writes it in the same transaction as the
//! delete, so every removal path (revocation, revoking the current Access
//! Client, Leaving a Home, removing a Member) leaves one. Another trigger
//! refuses to change or delete a tombstone, so they are kept forever.
//!
//! The Controller refuses a tombstoned ID or public key everywhere:
//! - Pairing never binds tombstoned keys to a new Access Client
//!   ([`keys_tombstoned`], and [`keys_tombstoned_on`] inside the insert).
//! - LAN: opening a Local session and every session-authenticated request
//!   ask [`access_client_status`].
//! - Relay: the sealed-envelope handler asks [`access_client_status`] for the
//!   header's `accessClientId` before `relay_crypto::envelope::open_request`,
//!   and passes the answer as the lookup.

use diesel::prelude::*;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::db::schema::{access_client_tombstones, access_clients};
use crate::relay_crypto::envelope::AccessClientStatus;
use crate::state::DbPool;

/// A tombstone as the Home backup carries it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Queryable, Selectable)]
#[diesel(table_name = access_client_tombstones)]
#[diesel(check_for_backend(diesel::pg::Pg))]
pub struct ArchivedAccessClientTombstone {
    pub access_client_id: Uuid,
    pub signing_key: Vec<u8>,
    pub encryption_key: Vec<u8>,
    pub revoked_at: chrono::DateTime<chrono::Utc>,
}

/// Whether an Access Client may be served, for LAN and Relay alike.
///
/// `Tombstoned` wins over a live row, so a tombstone restored from a backup
/// refuses the client even before the restore removes its row. An ID that
/// is not a UUID is `Unknown`.
pub fn access_client_status_on(
    conn: &mut PgConnection,
    access_client_id: &str,
) -> QueryResult<AccessClientStatus> {
    let Ok(id) = Uuid::parse_str(access_client_id) else {
        return Ok(AccessClientStatus::Unknown);
    };
    let tombstoned = diesel::select(diesel::dsl::exists(
        access_client_tombstones::table.find(id),
    ))
    .get_result::<bool>(conn)?;
    if tombstoned {
        return Ok(AccessClientStatus::Tombstoned);
    }
    let Some((signing_key, encryption_key)) = access_clients::table
        .find(id)
        .select((access_clients::signing_key, access_clients::encryption_key))
        .first::<(Vec<u8>, Vec<u8>)>(conn)
        .optional()?
    else {
        return Ok(AccessClientStatus::Unknown);
    };
    if keys_tombstoned_on(conn, &signing_key, &encryption_key)? {
        return Ok(AccessClientStatus::Tombstoned);
    }
    match <[u8; 32]>::try_from(signing_key.as_slice()) {
        Ok(signing_key) => Ok(AccessClientStatus::Active { signing_key }),
        Err(_) => Ok(AccessClientStatus::Unknown),
    }
}

/// [`access_client_status_on`] through the pool. This is the check the
/// Relay handler calls before opening a sealed request.
pub async fn access_client_status(
    pool: &DbPool,
    access_client_id: &str,
) -> Result<AccessClientStatus, String> {
    let access_client_id = access_client_id.to_string();
    let conn = pool
        .get()
        .await
        .map_err(|e| format!("db pool error: {e}"))?;
    conn.interact(move |conn| access_client_status_on(conn, &access_client_id))
        .await
        .map_err(|e| format!("db interact error: {e}"))?
        .map_err(|e| format!("access client status lookup failed: {e}"))
}

/// Whether either public key belongs to a tombstoned Access Client.
pub fn keys_tombstoned_on(
    conn: &mut PgConnection,
    signing_key: &[u8],
    encryption_key: &[u8],
) -> QueryResult<bool> {
    diesel::select(diesel::dsl::exists(
        access_client_tombstones::table.filter(
            access_client_tombstones::signing_key
                .eq(signing_key)
                .or(access_client_tombstones::encryption_key.eq(encryption_key)),
        ),
    ))
    .get_result(conn)
}

pub async fn keys_tombstoned(
    pool: &DbPool,
    signing_key: [u8; 32],
    encryption_key: [u8; 32],
) -> Result<bool, String> {
    let conn = pool
        .get()
        .await
        .map_err(|e| format!("db pool error: {e}"))?;
    conn.interact(move |conn| keys_tombstoned_on(conn, &signing_key, &encryption_key))
        .await
        .map_err(|e| format!("db interact error: {e}"))?
        .map_err(|e| format!("tombstone lookup failed: {e}"))
}

pub fn load_tombstones_on(
    conn: &mut PgConnection,
) -> QueryResult<Vec<ArchivedAccessClientTombstone>> {
    access_client_tombstones::table
        .order(access_client_tombstones::access_client_id)
        .select(ArchivedAccessClientTombstone::as_select())
        .load(conn)
}

/// Restores tombstones from a backup. Existing tombstones are kept as they
/// are. A live Access Client whose ID or key a restored tombstone names is
/// removed, so a restore never brings a revoked Access Client back.
pub fn restore_tombstones_on(
    conn: &mut PgConnection,
    tombstones: &[ArchivedAccessClientTombstone],
) -> QueryResult<()> {
    for tombstone in tombstones {
        if tombstone.signing_key.len() != 32 || tombstone.encryption_key.len() != 32 {
            return Err(diesel::result::Error::RollbackTransaction);
        }
        diesel::insert_into(access_client_tombstones::table)
            .values((
                access_client_tombstones::access_client_id.eq(tombstone.access_client_id),
                access_client_tombstones::signing_key.eq(&tombstone.signing_key),
                access_client_tombstones::encryption_key.eq(&tombstone.encryption_key),
                access_client_tombstones::revoked_at.eq(tombstone.revoked_at),
            ))
            .on_conflict_do_nothing()
            .execute(conn)?;
        diesel::delete(
            access_clients::table.filter(
                access_clients::id
                    .eq(tombstone.access_client_id)
                    .or(access_clients::signing_key.eq(&tombstone.signing_key))
                    .or(access_clients::encryption_key.eq(&tombstone.encryption_key)),
            ),
        )
        .execute(conn)?;
    }
    Ok(())
}
