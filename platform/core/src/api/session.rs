//! The caller's Membership role for the current session.
//!
//! Clients use the role only to decide what to show. Every operation still
//! checks its own permission in Core (ADR-0005). LAN and Relay both call
//! [`read_session`], so the answer cannot differ between them (ADR-0023).

use axum::Json;
use axum::extract::State;
use serde::Serialize;

use crate::api::auth::AuthenticatedClient;
use crate::api::error::ApiResult;
use crate::pairing::members::{MembershipRole, active_membership};
use crate::state::AppState;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionResource {
    pub role: MembershipRole,
}

/// Reports the calling Access Client's Membership role.
pub async fn read_session(
    state: &AppState,
    auth: &AuthenticatedClient,
) -> ApiResult<SessionResource> {
    let (_, role) = active_membership(&state.db, auth).await?;
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
    fn the_role_serializes_in_its_wire_shape() {
        let body = serde_json::to_value(SessionResource {
            role: MembershipRole::Owner,
        })
        .unwrap();
        assert_eq!(body, serde_json::json!({ "role": "owner" }));
        let member = serde_json::to_value(MembershipRole::Member).unwrap();
        assert_eq!(member, serde_json::json!("member"));
    }
}
