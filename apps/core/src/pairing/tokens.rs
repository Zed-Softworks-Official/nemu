use chrono::Utc;
use diesel::prelude::*;
use uuid::Uuid;

use crate::crypto::{random_token, sha256_hex};
use crate::db::models::{ClientToken, NewClientToken};
use crate::db::schema::client_tokens;
use crate::state::DbPool;

#[derive(Debug, Clone)]
pub struct IssuedClientToken {
    pub token: String,
    #[allow(dead_code)]
    pub id: Uuid,
    #[allow(dead_code)]
    pub label: String,
}

pub async fn mint_client_token(
    pool: &DbPool,
    label: &str,
    user_id: Option<&str>,
) -> Result<IssuedClientToken, String> {
    let conn = pool
        .get()
        .await
        .map_err(|e| format!("db pool error: {e}"))?;
    let label = label.to_string();
    let user_id = user_id.map(str::to_string);
    conn.interact(move |conn| mint_client_token_sync(conn, &label, user_id.as_deref()))
        .await
        .map_err(|e| format!("db interact error: {e}"))?
}

fn mint_client_token_sync(
    conn: &mut PgConnection,
    label: &str,
    user_id: Option<&str>,
) -> Result<IssuedClientToken, String> {
    let token = random_token();
    let token_hash = sha256_hex(&token);

    let id: Uuid = diesel::insert_into(client_tokens::table)
        .values(NewClientToken {
            token_hash: &token_hash,
            label,
            user_id,
        })
        .returning(client_tokens::id)
        .get_result(conn)
        .map_err(|e| format!("failed to insert client token: {e}"))?;

    Ok(IssuedClientToken {
        token,
        id,
        label: label.to_string(),
    })
}

pub async fn verify_client_token(
    pool: &DbPool,
    token: &str,
) -> Result<Option<ClientToken>, String> {
    let conn = pool
        .get()
        .await
        .map_err(|e| format!("db pool error: {e}"))?;
    let token = token.to_string();
    conn.interact(move |conn| verify_client_token_sync(conn, &token))
        .await
        .map_err(|e| format!("db interact error: {e}"))?
}

fn verify_client_token_sync(
    conn: &mut PgConnection,
    token: &str,
) -> Result<Option<ClientToken>, String> {
    let token_hash = sha256_hex(token);
    let row: Option<ClientToken> = client_tokens::table
        .filter(client_tokens::token_hash.eq(token_hash))
        .first(conn)
        .optional()
        .map_err(|e| format!("token lookup failed: {e}"))?;

    if let Some(ref row) = row {
        let _ = diesel::update(client_tokens::table.find(row.id))
            .set(client_tokens::last_seen_at.eq(Some(Utc::now())))
            .execute(conn);
    }

    Ok(row)
}

pub async fn list_client_tokens(pool: &DbPool) -> Result<Vec<ClientToken>, String> {
    let conn = pool
        .get()
        .await
        .map_err(|e| format!("db pool error: {e}"))?;
    conn.interact(|conn| {
        client_tokens::table
            .order(client_tokens::created_at.desc())
            .load::<ClientToken>(conn)
            .map_err(|e| format!("token list failed: {e}"))
    })
    .await
    .map_err(|e| format!("db interact error: {e}"))?
}

pub async fn revoke_client_token(pool: &DbPool, id: Uuid) -> Result<bool, String> {
    let conn = pool
        .get()
        .await
        .map_err(|e| format!("db pool error: {e}"))?;
    conn.interact(move |conn| {
        let deleted = diesel::delete(client_tokens::table.find(id))
            .execute(conn)
            .map_err(|e| format!("token delete failed: {e}"))?;
        Ok(deleted > 0)
    })
    .await
    .map_err(|e| format!("db interact error: {e}"))?
}

pub async fn revoke_tokens_for_user(pool: &DbPool, user_id: &str) -> Result<usize, String> {
    let conn = pool
        .get()
        .await
        .map_err(|e| format!("db pool error: {e}"))?;
    let user_id = user_id.to_string();
    conn.interact(move |conn| {
        diesel::delete(client_tokens::table.filter(client_tokens::user_id.eq(user_id)))
            .execute(conn)
            .map_err(|e| format!("token delete failed: {e}"))
    })
    .await
    .map_err(|e| format!("db interact error: {e}"))?
}

pub async fn count_client_tokens(pool: &DbPool) -> Result<i64, String> {
    let conn = pool
        .get()
        .await
        .map_err(|e| format!("db pool error: {e}"))?;
    conn.interact(|conn| {
        client_tokens::table
            .count()
            .get_result::<i64>(conn)
            .map_err(|e| format!("token count failed: {e}"))
    })
    .await
    .map_err(|e| format!("db interact error: {e}"))?
}
