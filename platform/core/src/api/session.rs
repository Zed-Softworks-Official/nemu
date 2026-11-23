//! The caller's Membership role for the current session (NEM-86).
//!
//! Clients use the role only to decide what to show. Every operation still
//! checks its own permission in Core (ADR-0005). LAN and Relay both call
//! [`read_session`], so the answer cannot differ between them (ADR-0023).

use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use serde::Serialize;

use crate::api::auth::AuthenticatedClient;
use crate::api::error::{ApiError, ApiResult};
use crate::pairing::members::find_member_by_user_id;
use crate::state::AppState;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum SessionRole {
    Owner,
    Member,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionResource {
    pub role: SessionRole,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SessionError {
    Unauthenticated,
    Forbidden,
}

impl From<SessionError> for ApiError {
    fn from(error: SessionError) -> Self {
        match error {
            SessionError::Unauthenticated => ApiError::new(
                StatusCode::UNAUTHORIZED,
                "unauthorized",
                "Pair this Access Client with a Membership first",
            ),
            SessionError::Forbidden => {
                ApiError::forbidden("inactive_membership", "This Membership is not active")
            }
        }
    }
}

/// The role an active Membership holds. A caller without a Membership is
/// unauthenticated; an inactive or unknown one is forbidden.
pub fn session_role(role: &str, status: &str) -> Result<SessionRole, SessionError> {
    if role.is_empty() {
        return Err(SessionError::Unauthenticated);
    }
    if status != "active" {
        return Err(SessionError::Forbidden);
    }
    match role {
        "owner" => Ok(SessionRole::Owner),
        "member" => Ok(SessionRole::Member),
        _ => Err(SessionError::Forbidden),
    }
}

/// Reports the calling Access Client's Membership role.
pub async fn read_session(
    state: &AppState,
    auth: &AuthenticatedClient,
) -> ApiResult<SessionResource> {
    let Some(user_id) = auth.user_id.as_deref() else {
        return Err(SessionError::Unauthenticated.into());
    };
    let member = find_member_by_user_id(&state.db, user_id)
        .await
        .map_err(ApiError::internal)?
        .ok_or(SessionError::Unauthenticated)?;
    let role = session_role(&member.role, &member.status)?;
    Ok(SessionResource { role })
}

/// `GET /api/session`
pub async fn show(
    State(state): State<AppState>,
    auth: AuthenticatedClient,
) -> ApiResult<Json<SessionResource>> {
    Ok(Json(read_session(&state, &auth).await?))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn active_owners_and_members_get_their_role() {
        assert_eq!(session_role("owner", "active"), Ok(SessionRole::Owner));
        assert_eq!(session_role("member", "active"), Ok(SessionRole::Member));
    }

    #[test]
    fn inactive_memberships_are_forbidden() {
        for role in ["owner", "member"] {
            for status in ["pending", "revoked", ""] {
                assert_eq!(
                    session_role(role, status),
                    Err(SessionError::Forbidden),
                    "{role}/{status}"
                );
            }
        }
    }

    #[test]
    fn callers_without_a_membership_are_unauthenticated() {
        assert_eq!(session_role("", ""), Err(SessionError::Unauthenticated));
        assert_eq!(
            session_role("", "active"),
            Err(SessionError::Unauthenticated)
        );
    }

    #[test]
    fn unknown_roles_are_forbidden() {
        assert_eq!(
            session_role("admin", "active"),
            Err(SessionError::Forbidden)
        );
    }

    #[test]
    fn the_role_serializes_in_its_wire_shape() {
        let body = serde_json::to_value(SessionResource {
            role: SessionRole::Owner,
        })
        .unwrap();
        assert_eq!(body, serde_json::json!({ "role": "owner" }));
        let member = serde_json::to_value(SessionRole::Member).unwrap();
        assert_eq!(member, serde_json::json!("member"));
    }

    #[test]
    fn session_failures_keep_their_wire_codes() {
        let unauthenticated = ApiError::from(SessionError::Unauthenticated);
        assert_eq!(unauthenticated.status, StatusCode::UNAUTHORIZED);
        assert_eq!(unauthenticated.code, "unauthorized");
        let forbidden = ApiError::from(SessionError::Forbidden);
        assert_eq!(forbidden.status, StatusCode::FORBIDDEN);
        assert_eq!(forbidden.code, "inactive_membership");
    }
}
