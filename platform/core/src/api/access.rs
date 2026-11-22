//! Leaving a Home and Access Client revocation.
//!
//! `leave_home` and `revoke_current` are the only implementations of these
//! operations. The LAN HTTP handlers and the Relay handler both call them, so
//! authorization cannot differ between paths.

use axum::http::StatusCode;

use diesel::prelude::*;
use uuid::Uuid;

use crate::api::auth::AuthenticatedClient;
use crate::api::error::{ApiError, ApiResult};
use crate::audit::{self, AuditKind, AuditWrite};
use crate::db::models::Member;
use crate::db::schema::{client_tokens, members};
use crate::pairing::members::find_member_by_user_id;
use crate::pairing::tokens::revoke_client_token;
use crate::state::DbPool;

/// The caller's Membership as the Controller sees it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CallerMembership<'a> {
    pub role: &'a str,
    pub status: &'a str,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AccessExitError {
    /// The Access Client is not linked to any Membership.
    Unauthenticated,
    /// The Membership exists but is not active.
    Inactive,
    /// The caller is the only Owner, so the Home would be left without one.
    LastOwner,
}

impl AccessExitError {
    pub fn into_api_error(self) -> ApiError {
        match self {
            Self::Unauthenticated => ApiError::new(
                StatusCode::UNAUTHORIZED,
                "unauthorized",
                "This Access Client is not linked to a Membership",
            ),
            Self::Inactive => {
                ApiError::forbidden("inactive_membership", "This Membership is not active")
            }
            Self::LastOwner => {
                ApiError::forbidden("last_owner", "The last Owner cannot leave the Home")
            }
        }
    }
}

/// Any active Membership may leave, except the last Owner.
pub fn authorize_leave_home(
    caller: Option<CallerMembership<'_>>,
    owner_count: usize,
) -> Result<(), AccessExitError> {
    let caller = require_active(caller)?;
    if caller.role == "owner" && owner_count <= 1 {
        return Err(AccessExitError::LastOwner);
    }
    Ok(())
}

/// Any active Membership may revoke its own Access Client.
pub fn authorize_revoke_current(
    caller: Option<CallerMembership<'_>>,
) -> Result<(), AccessExitError> {
    require_active(caller).map(|_| ())
}

fn require_active(
    caller: Option<CallerMembership<'_>>,
) -> Result<CallerMembership<'_>, AccessExitError> {
    let caller = caller.ok_or(AccessExitError::Unauthenticated)?;
    if caller.status != "active" {
        return Err(AccessExitError::Inactive);
    }
    Ok(caller)
}

/// Ends the caller's Membership and revokes every Access Client it holds.
///
/// The caller's Membership is resolved from the Access Client. The Owner rows
/// are locked so two Owners leaving at once cannot both pass the last-Owner
/// check.
pub async fn leave_home(pool: &DbPool, caller: &AuthenticatedClient) -> ApiResult<()> {
    let user_id = caller.user_id.clone();
    let conn = pool
        .get()
        .await
        .map_err(|e| ApiError::internal(format!("db pool error: {e}")))?;
    let outcome = conn
        .interact(move |conn| {
            conn.transaction(
                |conn| -> Result<Result<(), AccessExitError>, diesel::result::Error> {
                    let owner_count = members::table
                        .filter(members::role.eq("owner"))
                        .filter(members::status.eq("active"))
                        .select(members::id)
                        .for_update()
                        .load::<Uuid>(conn)?
                        .len();
                    let member = match user_id.as_deref() {
                        Some(user_id) => members::table
                            .filter(members::user_id.eq(user_id))
                            .for_update()
                            .first::<Member>(conn)
                            .optional()?,
                        None => None,
                    };
                    let view = member.as_ref().map(|member| CallerMembership {
                        role: &member.role,
                        status: &member.status,
                    });
                    if let Err(error) = authorize_leave_home(view, owner_count) {
                        return Ok(Err(error));
                    }
                    let Some(member) = member else {
                        return Ok(Err(AccessExitError::Unauthenticated));
                    };

                    let revoked = diesel::delete(
                        client_tokens::table
                            .filter(client_tokens::user_id.eq(member.user_id.clone())),
                    )
                    .execute(conn)?;
                    diesel::delete(members::table.find(member.id)).execute(conn)?;
                    audit::insert_on(
                        conn,
                        &AuditWrite {
                            kind: AuditKind::MembershipChange,
                            actor_user_id: member.user_id.clone(),
                            summary: format!("left the Home {}", member.email),
                            detail: serde_json::json!({
                                "action": "leave",
                                "memberId": member.id,
                                "email": member.email,
                                "role": member.role,
                                "revokedAccessClients": revoked,
                            }),
                        },
                    )?;
                    Ok(Ok(()))
                },
            )
        })
        .await
        .map_err(|e| ApiError::internal(format!("db interact error: {e}")))?
        .map_err(|e| ApiError::internal(format!("leave failed: {e}")))?;
    outcome.map_err(AccessExitError::into_api_error)
}

/// Revokes only the caller's own Access Client. The Membership and its other
/// Access Clients are unaffected.
pub async fn revoke_current(pool: &DbPool, caller: &AuthenticatedClient) -> ApiResult<()> {
    let member = match caller.user_id.as_deref() {
        Some(user_id) => find_member_by_user_id(pool, user_id)
            .await
            .map_err(ApiError::internal)?,
        None => None,
    };
    let view = member.as_ref().map(|member| CallerMembership {
        role: &member.role,
        status: &member.status,
    });
    authorize_revoke_current(view).map_err(AccessExitError::into_api_error)?;

    let deleted = revoke_client_token(
        pool,
        caller.token_id,
        Some(AuditWrite {
            kind: AuditKind::AccessClientRevoked,
            actor_user_id: caller.user_id.clone(),
            summary: format!("revoked access client {}", caller.label),
            detail: serde_json::json!({
                "action": "revoke",
                "tokenId": caller.token_id,
                "label": caller.label,
            }),
        }),
    )
    .await
    .map_err(ApiError::internal)?;
    if deleted {
        Ok(())
    } else {
        Err(ApiError::not_found("not_found", "Token not found"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn caller<'a>(role: &'a str, status: &'a str) -> Option<CallerMembership<'a>> {
        Some(CallerMembership { role, status })
    }

    #[test]
    fn owner_with_another_owner_and_members_may_leave() {
        assert_eq!(authorize_leave_home(caller("owner", "active"), 2), Ok(()));
        assert_eq!(authorize_leave_home(caller("member", "active"), 1), Ok(()));
    }

    #[test]
    fn the_last_owner_cannot_leave() {
        assert_eq!(
            authorize_leave_home(caller("owner", "active"), 1),
            Err(AccessExitError::LastOwner)
        );
    }

    #[test]
    fn inactive_and_unauthenticated_callers_cannot_leave() {
        assert_eq!(
            authorize_leave_home(caller("member", "pending"), 1),
            Err(AccessExitError::Inactive)
        );
        assert_eq!(
            authorize_leave_home(caller("owner", "pending"), 2),
            Err(AccessExitError::Inactive)
        );
        assert_eq!(
            authorize_leave_home(None, 1),
            Err(AccessExitError::Unauthenticated)
        );
    }

    #[test]
    fn owners_and_members_may_revoke_their_own_access_client() {
        assert_eq!(authorize_revoke_current(caller("owner", "active")), Ok(()));
        assert_eq!(authorize_revoke_current(caller("member", "active")), Ok(()));
    }

    #[test]
    fn inactive_and_unauthenticated_callers_cannot_revoke() {
        assert_eq!(
            authorize_revoke_current(caller("member", "pending")),
            Err(AccessExitError::Inactive)
        );
        assert_eq!(
            authorize_revoke_current(None),
            Err(AccessExitError::Unauthenticated)
        );
    }

    #[test]
    fn last_owner_error_keeps_the_last_owner_code() {
        let error = AccessExitError::LastOwner.into_api_error();
        assert_eq!(error.code, "last_owner");
        assert_eq!(error.status, axum::http::StatusCode::FORBIDDEN);
        assert_eq!(
            AccessExitError::Unauthenticated.into_api_error().status,
            axum::http::StatusCode::UNAUTHORIZED
        );
    }

    // Behaviour against the isolated test PostgreSQL. Each test owns the
    // members and client_tokens tables while it runs, because the last-Owner
    // rule counts every Owner in the Home.
    static HOME: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

    use crate::audit::{self as audit_log, AuditRow};
    use crate::pairing::members::{get_member, insert_member};
    use crate::pairing::tokens::{list_client_tokens, mint_client_token, verify_client_token};

    async fn empty_home() -> DbPool {
        let pool = crate::db::test_pool();
        let conn = pool.get().await.unwrap();
        conn.interact(|conn| {
            diesel::delete(client_tokens::table).execute(conn)?;
            diesel::delete(members::table).execute(conn)
        })
        .await
        .unwrap()
        .unwrap();
        pool
    }

    async fn membership(pool: &DbPool, user_id: &str, role: &str, status: &str) -> uuid::Uuid {
        insert_member(
            pool,
            Some(user_id),
            &format!("{user_id}@example.com"),
            None,
            role,
            status,
            None,
        )
        .await
        .unwrap()
        .id
    }

    async fn access_client(
        pool: &DbPool,
        user_id: Option<&str>,
        label: &str,
    ) -> AuthenticatedClient {
        let issued = mint_client_token(pool, label, user_id, None).await.unwrap();
        let row = verify_client_token(pool, &issued.token)
            .await
            .unwrap()
            .unwrap();
        AuthenticatedClient::from_row(row)
    }

    async fn token_ids(pool: &DbPool) -> Vec<uuid::Uuid> {
        let mut ids: Vec<_> = list_client_tokens(pool)
            .await
            .unwrap()
            .into_iter()
            .map(|token| token.id)
            .collect();
        ids.sort();
        ids
    }

    async fn audit_for(pool: &DbPool, user_id: &str) -> Vec<AuditRow> {
        audit_log::list_recent(pool, 200)
            .await
            .unwrap()
            .into_iter()
            .filter(|row| row.actor_user_id.as_deref() == Some(user_id))
            .collect()
    }

    #[tokio::test]
    #[ignore = "requires the isolated PostgreSQL database created by the verification script"]
    async fn leave_home_ends_the_membership_and_every_access_client() {
        let _home = HOME.lock().await;
        let pool = empty_home().await;
        let leaver_id = format!("leaver-{}", uuid::Uuid::new_v4());
        membership(&pool, "owner-1", "owner", "active").await;
        let member = membership(&pool, &leaver_id, "member", "active").await;
        let phone = access_client(&pool, Some(&leaver_id), "phone").await;
        access_client(&pool, Some(&leaver_id), "dashboard browser").await;
        let owner_phone = access_client(&pool, Some("owner-1"), "owner phone").await;

        leave_home(&pool, &phone).await.unwrap();

        assert!(get_member(&pool, member).await.unwrap().is_none());
        assert_eq!(token_ids(&pool).await, vec![owner_phone.token_id]);
        let audit = audit_for(&pool, &leaver_id).await;
        assert!(audit.iter().any(|row| row.kind == "membership_change"
            && row.detail["action"] == "leave"
            && row.summary.starts_with("left")));
    }

    #[tokio::test]
    #[ignore = "requires the isolated PostgreSQL database created by the verification script"]
    async fn leave_home_role_matrix() {
        let _home = HOME.lock().await;

        // An Owner may leave while another Owner remains.
        let pool = empty_home().await;
        membership(&pool, "owner-1", "owner", "active").await;
        let second = membership(&pool, "owner-2", "owner", "active").await;
        let phone = access_client(&pool, Some("owner-2"), "phone").await;
        leave_home(&pool, &phone).await.unwrap();
        assert!(get_member(&pool, second).await.unwrap().is_none());

        // The last Owner may not, and nothing changes.
        let pool = empty_home().await;
        let owner = membership(&pool, "owner-1", "owner", "active").await;
        membership(&pool, "member-1", "member", "active").await;
        let phone = access_client(&pool, Some("owner-1"), "phone").await;
        let error = leave_home(&pool, &phone).await.unwrap_err();
        assert_eq!(error.code, "last_owner");
        assert!(get_member(&pool, owner).await.unwrap().is_some());
        assert_eq!(token_ids(&pool).await, vec![phone.token_id]);

        // An inactive Membership may not.
        let pool = empty_home().await;
        membership(&pool, "owner-1", "owner", "active").await;
        let pending = membership(&pool, "member-1", "member", "pending").await;
        let phone = access_client(&pool, Some("member-1"), "phone").await;
        let error = leave_home(&pool, &phone).await.unwrap_err();
        assert_eq!(error.code, "inactive_membership");
        assert!(get_member(&pool, pending).await.unwrap().is_some());

        // An Access Client without a Membership may not.
        let pool = empty_home().await;
        membership(&pool, "owner-1", "owner", "active").await;
        let orphan = access_client(&pool, None, "orphan").await;
        let error = leave_home(&pool, &orphan).await.unwrap_err();
        assert_eq!(error.code, "unauthorized");
        assert_eq!(token_ids(&pool).await, vec![orphan.token_id]);
    }

    #[tokio::test]
    #[ignore = "requires the isolated PostgreSQL database created by the verification script"]
    async fn revoke_current_affects_only_the_callers_access_client() {
        let _home = HOME.lock().await;
        let pool = empty_home().await;
        let owner = membership(&pool, "owner-1", "owner", "active").await;
        let member = membership(&pool, "member-1", "member", "active").await;
        let phone = access_client(&pool, Some("member-1"), "phone").await;
        let browser = access_client(&pool, Some("member-1"), "browser").await;
        let owner_phone = access_client(&pool, Some("owner-1"), "owner phone").await;

        revoke_current(&pool, &phone).await.unwrap();

        let mut expected = vec![browser.token_id, owner_phone.token_id];
        expected.sort();
        assert_eq!(token_ids(&pool).await, expected);
        assert!(get_member(&pool, member).await.unwrap().is_some());
        assert!(
            audit_for(&pool, "member-1")
                .await
                .iter()
                .any(|row| row.kind == "access_client_revoked"
                    && row.detail["tokenId"] == serde_json::json!(phone.token_id))
        );

        // The last Owner may revoke their own Access Client; the Membership stays.
        revoke_current(&pool, &owner_phone).await.unwrap();
        assert_eq!(token_ids(&pool).await, vec![browser.token_id]);
        assert!(get_member(&pool, owner).await.unwrap().is_some());
    }

    #[tokio::test]
    #[ignore = "requires the isolated PostgreSQL database created by the verification script"]
    async fn revoke_current_rejects_inactive_and_unlinked_callers() {
        let _home = HOME.lock().await;
        let pool = empty_home().await;
        membership(&pool, "member-1", "member", "pending").await;
        let pending = access_client(&pool, Some("member-1"), "phone").await;
        let orphan = access_client(&pool, None, "orphan").await;

        assert_eq!(
            revoke_current(&pool, &pending).await.unwrap_err().code,
            "inactive_membership"
        );
        assert_eq!(
            revoke_current(&pool, &orphan).await.unwrap_err().code,
            "unauthorized"
        );
        let mut expected = vec![pending.token_id, orphan.token_id];
        expected.sort();
        assert_eq!(token_ids(&pool).await, expected);
    }
}
