use axum::http::StatusCode;
use diesel::prelude::*;
use serde::Serialize;
use uuid::Uuid;

use crate::api::auth::AuthenticatedClient;
use crate::api::error::ApiError;
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

/// The role an active Membership holds.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum MembershipRole {
    Owner,
    Member,
}

/// Why a caller does not act as an active Membership.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MembershipRefusal {
    /// The Access Client has no Membership.
    Unauthenticated,
    /// The Membership is inactive, or its role is unknown.
    Inactive,
    Internal(String),
}

impl From<MembershipRefusal> for ApiError {
    fn from(refusal: MembershipRefusal) -> Self {
        match refusal {
            MembershipRefusal::Unauthenticated => ApiError::new(
                StatusCode::UNAUTHORIZED,
                "unauthorized",
                "Pair this Access Client with a Membership first",
            ),
            MembershipRefusal::Inactive => {
                ApiError::forbidden("inactive_membership", "This Membership is not active")
            }
            MembershipRefusal::Internal(message) => ApiError::internal(message),
        }
    }
}

/// The active role behind a stored role and status. Everything every active
/// Owner and Member may do is authorized by this succeeding.
pub fn active_role(role: &str, status: &str) -> Result<MembershipRole, MembershipRefusal> {
    match (role, status) {
        ("", _) => Err(MembershipRefusal::Unauthenticated),
        ("owner", "active") => Ok(MembershipRole::Owner),
        ("member", "active") => Ok(MembershipRole::Member),
        _ => Err(MembershipRefusal::Inactive),
    }
}

/// The calling Access Client's Membership and role, when it is active.
pub async fn active_membership(
    pool: &DbPool,
    auth: &AuthenticatedClient,
) -> Result<(Member, MembershipRole), MembershipRefusal> {
    let Some(user_id) = auth.user_id.as_deref() else {
        return Err(MembershipRefusal::Unauthenticated);
    };
    let member = find_member_by_user_id(pool, user_id)
        .await
        .map_err(MembershipRefusal::Internal)?
        .ok_or(MembershipRefusal::Unauthenticated)?;
    let role = active_role(&member.role, &member.status)?;
    Ok((member, role))
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn active_owners_and_members_have_their_role() {
        assert_eq!(active_role("owner", "active"), Ok(MembershipRole::Owner));
        assert_eq!(active_role("member", "active"), Ok(MembershipRole::Member));
    }

    #[test]
    fn inactive_memberships_have_no_active_role() {
        for role in ["owner", "member"] {
            for status in ["pending", "revoked", "removed", "left", "inactive", ""] {
                assert_eq!(
                    active_role(role, status),
                    Err(MembershipRefusal::Inactive),
                    "{role}/{status}"
                );
            }
        }
    }

    #[test]
    fn callers_without_a_membership_are_unauthenticated() {
        for status in ["", "active"] {
            assert_eq!(
                active_role("", status),
                Err(MembershipRefusal::Unauthenticated)
            );
        }
    }

    #[test]
    fn unknown_roles_are_refused() {
        for role in ["admin", "guest"] {
            assert_eq!(
                active_role(role, "active"),
                Err(MembershipRefusal::Inactive)
            );
        }
    }

    #[test]
    fn refusals_keep_their_wire_codes() {
        let unauthenticated = ApiError::from(MembershipRefusal::Unauthenticated);
        assert_eq!(unauthenticated.status, StatusCode::UNAUTHORIZED);
        assert_eq!(unauthenticated.code, "unauthorized");
        let inactive = ApiError::from(MembershipRefusal::Inactive);
        assert_eq!(inactive.status, StatusCode::FORBIDDEN);
        assert_eq!(inactive.code, "inactive_membership");
    }
}
