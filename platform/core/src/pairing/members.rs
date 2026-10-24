use diesel::prelude::*;
use uuid::Uuid;

use crate::audit::{self, AuditWrite};
use crate::db::models::{Member, NewMember};
use crate::db::schema::members;
use crate::state::DbPool;

pub fn normalize_email(email: &str) -> Result<String, String> {
    let email = email.trim().to_lowercase();
    if !email.contains('@') || email.len() < 3 || email.starts_with('@') || email.ends_with('@') {
        return Err("email is invalid".to_string());
    }
    Ok(email)
}

pub async fn count_members(pool: &DbPool) -> Result<i64, String> {
    let conn = pool
        .get()
        .await
        .map_err(|e| format!("db pool error: {e}"))?;
    conn.interact(|conn| {
        members::table
            .count()
            .get_result::<i64>(conn)
            .map_err(|e| format!("member count failed: {e}"))
    })
    .await
    .map_err(|e| format!("db interact error: {e}"))?
}

pub async fn list_members(pool: &DbPool) -> Result<Vec<Member>, String> {
    let conn = pool
        .get()
        .await
        .map_err(|e| format!("db pool error: {e}"))?;
    conn.interact(|conn| {
        members::table
            .order(members::created_at.asc())
            .load::<Member>(conn)
            .map_err(|e| format!("member list failed: {e}"))
    })
    .await
    .map_err(|e| format!("db interact error: {e}"))?
}

pub async fn get_member(pool: &DbPool, id: Uuid) -> Result<Option<Member>, String> {
    let conn = pool
        .get()
        .await
        .map_err(|e| format!("db pool error: {e}"))?;
    conn.interact(move |conn| {
        members::table
            .find(id)
            .first(conn)
            .optional()
            .map_err(|e| format!("member lookup failed: {e}"))
    })
    .await
    .map_err(|e| format!("db interact error: {e}"))?
}

pub async fn find_member_by_user_id(
    pool: &DbPool,
    user_id: &str,
) -> Result<Option<Member>, String> {
    let conn = pool
        .get()
        .await
        .map_err(|e| format!("db pool error: {e}"))?;
    let user_id = user_id.to_string();
    conn.interact(move |conn| {
        members::table
            .filter(members::user_id.eq(user_id))
            .first(conn)
            .optional()
            .map_err(|e| format!("member lookup failed: {e}"))
    })
    .await
    .map_err(|e| format!("db interact error: {e}"))?
}

pub async fn find_member_by_email(pool: &DbPool, email: &str) -> Result<Option<Member>, String> {
    let conn = pool
        .get()
        .await
        .map_err(|e| format!("db pool error: {e}"))?;
    let email = email.to_string();
    conn.interact(move |conn| {
        members::table
            .filter(members::email.eq(email))
            .first(conn)
            .optional()
            .map_err(|e| format!("member lookup failed: {e}"))
    })
    .await
    .map_err(|e| format!("db interact error: {e}"))?
}

pub async fn insert_member(
    pool: &DbPool,
    user_id: Option<&str>,
    email: &str,
    display_name: Option<&str>,
    role: &str,
    status: &str,
    audit: Option<AuditWrite>,
) -> Result<Member, String> {
    let conn = pool
        .get()
        .await
        .map_err(|e| format!("db pool error: {e}"))?;
    let user_id = user_id.map(str::to_string);
    let email = email.to_string();
    let display_name = display_name.map(str::to_string);
    let role = role.to_string();
    let status = status.to_string();
    conn.interact(move |conn| {
        conn.transaction(|conn| -> Result<Member, anyhow::Error> {
            let member = diesel::insert_into(members::table)
                .values(NewMember {
                    user_id: user_id.as_deref(),
                    email: &email,
                    display_name: display_name.as_deref(),
                    role: &role,
                    status: &status,
                })
                .get_result::<Member>(conn)?;
            if let Some(audit) = &audit {
                audit::insert_on(conn, audit)?;
            }
            Ok(member)
        })
        .map_err(|error| error.to_string())
    })
    .await
    .map_err(|e| format!("db interact error: {e}"))?
}

pub async fn activate_member(
    pool: &DbPool,
    id: Uuid,
    user_id: &str,
    display_name: Option<&str>,
    audit: Option<AuditWrite>,
) -> Result<Member, String> {
    let conn = pool
        .get()
        .await
        .map_err(|e| format!("db pool error: {e}"))?;
    let user_id = user_id.to_string();
    let display_name = display_name.map(str::to_string);
    conn.interact(move |conn| {
        conn.transaction(|conn| -> Result<Member, anyhow::Error> {
            let member = diesel::update(members::table.find(id))
                .set((
                    members::user_id.eq(Some(user_id)),
                    members::status.eq("active"),
                    members::display_name.eq(display_name),
                ))
                .get_result::<Member>(conn)?;
            if let Some(audit) = &audit {
                audit::insert_on(conn, audit)?;
            }
            Ok(member)
        })
        .map_err(|error| error.to_string())
    })
    .await
    .map_err(|e| format!("db interact error: {e}"))?
}

pub async fn delete_member(
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
            let deleted = diesel::delete(members::table.find(id)).execute(conn)?;
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
