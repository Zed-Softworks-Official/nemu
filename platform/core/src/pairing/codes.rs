use chrono::{Duration, Utc};
use diesel::prelude::*;
use tracing::info;

use crate::crypto::{generate_pairing_code, sha256_hex};
use crate::db::models::{NewPairingCode, PairingCode};
use crate::db::schema::pairing_codes;
use crate::state::DbPool;

const PAIRING_CODE_TTL_MINUTES: i64 = 5;
/// Guesses allowed against one Pairing code. Each CPace run is one online
/// guess (ADR-0037), and so is each wrong `POST /api/pair`. The code is
/// spent once they are used up.
pub const MAX_PAIRING_ATTEMPTS: i32 = 5;

/// A live Pairing code a CPace run may use.
#[derive(Debug, Clone)]
pub struct PairingAttempt {
    pub code_id: uuid::Uuid,
    pub code: String,
}

#[derive(Debug, Clone)]
pub struct IssuedPairingCode {
    pub code: String,
    pub expires_at: chrono::DateTime<Utc>,
}

pub async fn mint_pairing_code(pool: &DbPool) -> Result<IssuedPairingCode, String> {
    let conn = pool
        .get()
        .await
        .map_err(|e| format!("db pool error: {e}"))?;

    conn.interact(|conn| mint_pairing_code_sync(conn))
        .await
        .map_err(|e| format!("db interact error: {e}"))?
}

fn mint_pairing_code_sync(conn: &mut PgConnection) -> Result<IssuedPairingCode, String> {
    // Invalidate outstanding unconsumed codes so only one is active.
    diesel::update(pairing_codes::table.filter(pairing_codes::consumed.eq(false)))
        .set(pairing_codes::consumed.eq(true))
        .execute(conn)
        .map_err(|e| format!("failed to invalidate old codes: {e}"))?;

    let code = generate_pairing_code();
    let expires_at = Utc::now() + Duration::minutes(PAIRING_CODE_TTL_MINUTES);
    let code_hash = sha256_hex(&code);

    diesel::insert_into(pairing_codes::table)
        .values(NewPairingCode {
            code_hash: &code_hash,
            expires_at,
            code: Some(&code),
        })
        .execute(conn)
        .map_err(|e| format!("failed to insert pairing code: {e}"))?;

    info!(expires_at = %expires_at, "minted pairing code");
    Ok(IssuedPairingCode { code, expires_at })
}

/// Takes one guess from the live Pairing code for a CPace run. `None` when no
/// code is live or its guesses are used up.
pub async fn begin_pairing_attempt(pool: &DbPool) -> Result<Option<PairingAttempt>, String> {
    let conn = pool
        .get()
        .await
        .map_err(|e| format!("db pool error: {e}"))?;
    conn.interact(|conn| {
        conn.transaction(|conn| {
            let row: Option<PairingCode> = pairing_codes::table
                .filter(pairing_codes::consumed.eq(false))
                .filter(pairing_codes::expires_at.gt(Utc::now()))
                .filter(pairing_codes::attempts.lt(MAX_PAIRING_ATTEMPTS))
                .filter(pairing_codes::code.is_not_null())
                .order(pairing_codes::created_at.desc())
                .for_update()
                .first(conn)
                .optional()?;
            let Some(row) = row else {
                return Ok(None);
            };
            diesel::update(pairing_codes::table.find(row.id))
                .set(pairing_codes::attempts.eq(pairing_codes::attempts + 1))
                .execute(conn)?;
            Ok(row.code.map(|code| PairingAttempt {
                code_id: row.id,
                code,
            }))
        })
        .map_err(|e: diesel::result::Error| format!("pairing attempt failed: {e}"))
    })
    .await
    .map_err(|e| format!("db interact error: {e}"))?
}

/// Spends a Pairing code after a CPace run confirmed it. `false` when it was
/// spent, replaced or expired in the meantime.
pub async fn consume_pairing_code_by_id(pool: &DbPool, id: uuid::Uuid) -> Result<bool, String> {
    let conn = pool
        .get()
        .await
        .map_err(|e| format!("db pool error: {e}"))?;
    conn.interact(move |conn| {
        diesel::update(
            pairing_codes::table
                .find(id)
                .filter(pairing_codes::consumed.eq(false))
                .filter(pairing_codes::expires_at.gt(Utc::now())),
        )
        .set(pairing_codes::consumed.eq(true))
        .execute(conn)
        .map(|updated| updated > 0)
        .map_err(|e| format!("failed to consume pairing code: {e}"))
    })
    .await
    .map_err(|e| format!("db interact error: {e}"))?
}
