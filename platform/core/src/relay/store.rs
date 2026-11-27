//! What the Controller keeps per Access Client for sealed Relay requests:
//! the replay window (ADR-0001) and the stored outcome of every write
//! (ADR-0015), kept for 24 hours.

use chrono::{DateTime, Duration, Utc};
use diesel::prelude::*;
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::db::schema::{relay_outcomes, relay_replay_windows};
use crate::relay_crypto::replay::ReplayWindow;
use crate::state::DbPool;

/// How long a write's outcome answers a retry.
pub fn outcome_retention() -> Duration {
    Duration::hours(24)
}

async fn interact<T: Send + 'static>(
    pool: &DbPool,
    run: impl FnOnce(&mut PgConnection) -> Result<T, diesel::result::Error> + Send + 'static,
) -> Result<T, String> {
    let conn = pool
        .get()
        .await
        .map_err(|e| format!("db pool error: {e}"))?;
    conn.interact(run)
        .await
        .map_err(|e| format!("db interact error: {e}"))?
        .map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// Replay windows

/// The Access Client's replay window, or an empty one before its first
/// sealed request.
pub async fn load_window(pool: &DbPool, access_client_id: Uuid) -> Result<ReplayWindow, String> {
    let row = interact(pool, move |conn| {
        relay_replay_windows::table
            .find(access_client_id)
            .select((relay_replay_windows::highest, relay_replay_windows::seen))
            .first::<(i64, i64)>(conn)
            .optional()
    })
    .await?;
    Ok(
        row.map_or_else(ReplayWindow::default, |(highest, seen)| ReplayWindow {
            highest: highest as u64,
            seen: seen as u64,
        }),
    )
}

/// Replaces `previous` with `next`. Returns `false`, changing nothing, when
/// another request moved the window since `previous` was read; the caller
/// then treats its request as a duplicate.
pub async fn advance_window(
    pool: &DbPool,
    access_client_id: Uuid,
    previous: ReplayWindow,
    next: ReplayWindow,
) -> Result<bool, String> {
    interact(pool, move |conn| {
        let now = Utc::now();
        if previous == ReplayWindow::default() {
            let inserted = diesel::insert_into(relay_replay_windows::table)
                .values((
                    relay_replay_windows::access_client_id.eq(access_client_id),
                    relay_replay_windows::highest.eq(next.highest as i64),
                    relay_replay_windows::seen.eq(next.seen as i64),
                    relay_replay_windows::updated_at.eq(now),
                ))
                .on_conflict_do_nothing()
                .execute(conn)?;
            if inserted == 1 {
                return Ok(true);
            }
        }
        let updated = diesel::update(
            relay_replay_windows::table.filter(
                relay_replay_windows::access_client_id
                    .eq(access_client_id)
                    .and(relay_replay_windows::highest.eq(previous.highest as i64))
                    .and(relay_replay_windows::seen.eq(previous.seen as i64)),
            ),
        )
        .set((
            relay_replay_windows::highest.eq(next.highest as i64),
            relay_replay_windows::seen.eq(next.seen as i64),
            relay_replay_windows::updated_at.eq(now),
        ))
        .execute(conn)?;
        Ok(updated == 1)
    })
    .await
}

// ---------------------------------------------------------------------------
// Stored outcomes

pub fn body_hash(plaintext: &[u8]) -> [u8; 32] {
    Sha256::digest(plaintext).into()
}

/// What a write's `(accessClientId, requestId)` already holds.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Claim {
    /// First time: the write runs, and its outcome is saved with
    /// [`save_outcome`].
    New,
    /// A retry of the same body. Holds the stored reply, or `None` for a
    /// Command (its outcome is in the Command ledger) or a write that never
    /// finished.
    Retry(Option<String>),
    /// The same requestId with a different body.
    Mismatch,
}

pub async fn claim(
    pool: &DbPool,
    access_client_id: Uuid,
    request_id: &str,
    body_sha256: [u8; 32],
    now: DateTime<Utc>,
) -> Result<Claim, String> {
    let request_id = request_id.to_string();
    interact(pool, move |conn| {
        conn.transaction(|conn| {
            let key = relay_outcomes::table
                .filter(relay_outcomes::access_client_id.eq(access_client_id))
                .filter(relay_outcomes::request_id.eq(&request_id));
            // An outcome past its retention no longer answers a retry.
            diesel::delete(key.filter(relay_outcomes::retain_until.le(now))).execute(conn)?;
            let inserted = diesel::insert_into(relay_outcomes::table)
                .values((
                    relay_outcomes::access_client_id.eq(access_client_id),
                    relay_outcomes::request_id.eq(&request_id),
                    relay_outcomes::body_sha256.eq(body_sha256.as_slice()),
                    relay_outcomes::created_at.eq(now),
                    relay_outcomes::retain_until.eq(now + outcome_retention()),
                ))
                .on_conflict_do_nothing()
                .execute(conn)?;
            if inserted == 1 {
                return Ok(Claim::New);
            }
            let (stored_hash, response) = key
                .select((relay_outcomes::body_sha256, relay_outcomes::response))
                .first::<(Vec<u8>, Option<String>)>(conn)?;
            if stored_hash != body_sha256 {
                return Ok(Claim::Mismatch);
            }
            Ok(Claim::Retry(response))
        })
    })
    .await
}

pub async fn save_outcome(
    pool: &DbPool,
    access_client_id: Uuid,
    request_id: &str,
    response: String,
) -> Result<(), String> {
    let request_id = request_id.to_string();
    interact(pool, move |conn| {
        diesel::update(
            relay_outcomes::table
                .filter(relay_outcomes::access_client_id.eq(access_client_id))
                .filter(relay_outcomes::request_id.eq(&request_id)),
        )
        .set(relay_outcomes::response.eq(Some(response)))
        .execute(conn)
        .map(|_| ())
    })
    .await
}

/// Deletes outcomes past their retention. Runs with the other retention
/// sweeps.
pub async fn sweep(pool: &DbPool, now: DateTime<Utc>) -> Result<(), String> {
    interact(pool, move |conn| {
        diesel::delete(relay_outcomes::table.filter(relay_outcomes::retain_until.le(now)))
            .execute(conn)
            .map(|_| ())
    })
    .await
}

/// The Command ledger ID of a Command sent over Relay. Scoped to the Access
/// Client, so two clients' requestIds never meet, and short enough for the
/// ledger whatever the requestId's length.
pub fn command_ledger_id(access_client_id: Uuid, request_id: &str) -> String {
    format!(
        "relay:{access_client_id}:{}",
        hex::encode(Sha256::digest(request_id.as_bytes()))
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn command_ledger_ids_are_scoped_and_bounded() {
        let a = Uuid::from_u128(1);
        let b = Uuid::from_u128(2);
        assert_ne!(command_ledger_id(a, "r1"), command_ledger_id(b, "r1"));
        assert_ne!(command_ledger_id(a, "r1"), command_ledger_id(a, "r2"));
        let long = "x".repeat(256);
        assert!(crate::ledger::valid_command_id(&command_ledger_id(
            a, &long
        )));
    }
}
