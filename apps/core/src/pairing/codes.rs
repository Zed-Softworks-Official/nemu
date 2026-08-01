use chrono::{Duration, Utc};
use diesel::prelude::*;
use tracing::info;

use crate::crypto::{generate_pairing_code, sha256_hex};
use crate::db::models::{NewPairingCode, PairingCode};
use crate::db::schema::pairing_codes;
use crate::state::DbPool;

const PAIRING_CODE_TTL_MINUTES: i64 = 5;

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
        })
        .execute(conn)
        .map_err(|e| format!("failed to insert pairing code: {e}"))?;

    info!(expires_at = %expires_at, "minted pairing code");
    Ok(IssuedPairingCode { code, expires_at })
}

pub async fn consume_pairing_code(pool: &DbPool, code: &str) -> Result<bool, String> {
    let conn = pool
        .get()
        .await
        .map_err(|e| format!("db pool error: {e}"))?;
    let code = code.to_string();
    conn.interact(move |conn| consume_pairing_code_sync(conn, &code))
        .await
        .map_err(|e| format!("db interact error: {e}"))?
}

fn consume_pairing_code_sync(conn: &mut PgConnection, code: &str) -> Result<bool, String> {
    let code_hash = sha256_hex(code);
    let now = Utc::now();

    let row: Option<PairingCode> = pairing_codes::table
        .filter(pairing_codes::code_hash.eq(&code_hash))
        .filter(pairing_codes::consumed.eq(false))
        .filter(pairing_codes::expires_at.gt(now))
        .order(pairing_codes::created_at.desc())
        .first(conn)
        .optional()
        .map_err(|e| format!("pairing code lookup failed: {e}"))?;

    let Some(row) = row else {
        return Ok(false);
    };

    let updated = diesel::update(pairing_codes::table.find(row.id))
        .set(pairing_codes::consumed.eq(true))
        .execute(conn)
        .map_err(|e| format!("failed to consume pairing code: {e}"))?;

    Ok(updated > 0)
}
