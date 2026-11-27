use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::api::auth::AuthenticatedClient;
use crate::api::error::{ApiError, ApiResult};
use crate::audit::{self, AuditKind, AuditWrite};
use crate::db::models::Member;
use crate::pairing::access_clients::list_access_clients;
use crate::pairing::members::{
    activate_member, count_members, delete_member, find_member_by_email, find_member_by_user_id,
    get_member, insert_member, list_members, normalize_email,
};
use crate::state::AppState;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MemberResource {
    pub id: String,
    pub user_id: Option<String>,
    pub email: String,
    pub display_name: Option<String>,
    pub role: String,
    pub status: String,
    pub created_at: String,
}

impl From<&Member> for MemberResource {
    fn from(member: &Member) -> Self {
        Self {
            id: member.id.to_string(),
            user_id: member.user_id.clone(),
            email: member.email.clone(),
            display_name: member.display_name.clone(),
            role: member.role.clone(),
            status: member.status.clone(),
            created_at: member.created_at.to_rfc3339(),
        }
    }
}

#[derive(Serialize)]
pub struct MembersResponse {
    pub members: Vec<MemberResource>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InviteMemberBody {
    pub email: String,
}

pub async fn list_members_handler(
    State(state): State<AppState>,
    _auth: AuthenticatedClient,
) -> ApiResult<Json<MembersResponse>> {
    let members = list_household_members(&state).await?;
    Ok(Json(MembersResponse { members }))
}

pub async fn invite_member_handler(
    State(state): State<AppState>,
    auth: AuthenticatedClient,
    Json(body): Json<InviteMemberBody>,
) -> ApiResult<(StatusCode, Json<MemberResource>)> {
    let member = invite_member(&state, &auth, &body.email).await?;
    Ok((StatusCode::CREATED, Json(member)))
}

pub async fn delete_member_handler(
    State(state): State<AppState>,
    auth: AuthenticatedClient,
    Path(id): Path<String>,
) -> ApiResult<StatusCode> {
    remove_member(&state, &auth, &id).await?;
    Ok(StatusCode::NO_CONTENT)
}

/// Leaving a Home: ends the caller's own Membership.
pub async fn leave_home_handler(
    State(state): State<AppState>,
    auth: AuthenticatedClient,
) -> ApiResult<StatusCode> {
    crate::api::access::leave_home(&state, &auth).await?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn list_household_members(state: &AppState) -> ApiResult<Vec<MemberResource>> {
    let members = list_members(&state.db).await.map_err(ApiError::internal)?;
    Ok(members.iter().map(MemberResource::from).collect())
}

pub async fn invite_member(
    state: &AppState,
    auth: &AuthenticatedClient,
    email: &str,
) -> ApiResult<MemberResource> {
    require_owner(state, auth).await?;
    let email = normalize_email(email)
        .map_err(|message| ApiError::bad_request("invalid_email", message))?;

    if let Some(existing) = find_member_by_email(&state.db, &email)
        .await
        .map_err(ApiError::internal)?
    {
        return Ok(MemberResource::from(&existing));
    }

    let member = insert_member(
        &state.db,
        None,
        &email,
        None,
        "member",
        "pending",
        Some(AuditWrite {
            kind: AuditKind::MembershipChange,
            actor_user_id: auth.user_id.clone(),
            summary: format!("invited {email}"),
            detail: serde_json::json!({ "action": "invite", "email": email, "role": "member" }),
        }),
    )
    .await
    .map_err(ApiError::internal)?;
    Ok(MemberResource::from(&member))
}

pub async fn remove_member(
    state: &AppState,
    auth: &AuthenticatedClient,
    member_id: &str,
) -> ApiResult<()> {
    let id = Uuid::parse_str(member_id)
        .map_err(|_| ApiError::bad_request("invalid_id", "member id must be a UUID"))?;
    let target = get_member(&state.db, id)
        .await
        .map_err(ApiError::internal)?
        .ok_or_else(|| ApiError::not_found("not_found", "Member not found"))?;

    let actor = member_for_client(state, auth).await?;
    let is_self = actor
        .as_ref()
        .and_then(|member| member.user_id.as_deref())
        .is_some_and(|user_id| target.user_id.as_deref() == Some(user_id))
        || actor.as_ref().is_some_and(|member| member.id == target.id);

    if !is_self {
        require_owner(state, auth).await?;
    }

    if target.role == "owner" {
        let owners = list_members(&state.db)
            .await
            .map_err(ApiError::internal)?
            .into_iter()
            .filter(|member| member.role == "owner")
            .count();
        if owners <= 1 {
            return Err(ApiError::forbidden(
                "last_owner",
                "Cannot remove the last owner",
            ));
        }
    }

    // Deleting the Member deletes (and tombstones) its Access Clients.
    let access_clients: Vec<Uuid> = list_access_clients(&state.db)
        .await
        .map_err(ApiError::internal)?
        .into_iter()
        .filter(|(_, member)| member.id == target.id)
        .map(|(access_client, _)| access_client.id)
        .collect();
    let deleted = delete_member(
        &state.db,
        id,
        Some(AuditWrite {
            kind: AuditKind::MembershipChange,
            actor_user_id: actor.as_ref().and_then(|member| member.user_id.clone()),
            summary: format!("removed member {}", target.email),
            detail: serde_json::json!({
                "action": "remove",
                "memberId": target.id,
                "email": target.email,
                "role": target.role,
            }),
        }),
    )
    .await
    .map_err(ApiError::internal)?;
    for access_client in access_clients {
        state.local_sessions.drop_access_client(access_client);
    }
    if deleted {
        Ok(())
    } else {
        Err(ApiError::not_found("not_found", "Member not found"))
    }
}

/// The Membership a pairing binds to: the first Owner when the Home has no
/// Members yet, else the caller's existing Membership or the Invitation it
/// accepts (ADR-0020).
pub async fn resolve_pairing_member(
    state: &AppState,
    user_id: &str,
    email: &str,
    display_name: Option<&str>,
) -> ApiResult<Member> {
    let member_count = count_members(&state.db).await.map_err(ApiError::internal)?;
    if member_count > 0 {
        return resolve_or_activate_member(state, user_id, email, display_name).await;
    }
    let email = normalize_email(email)
        .map_err(|message| ApiError::bad_request("invalid_email", message))?;
    let user_id = user_id.trim();
    if user_id.is_empty() {
        return Err(ApiError::bad_request("invalid_user", "userId is required"));
    }
    insert_member(
        &state.db,
        Some(user_id),
        &email,
        display_name.map(str::trim).filter(|name| !name.is_empty()),
        "owner",
        "active",
        Some(bootstrap_audit(user_id, &email)),
    )
    .await
    .map_err(ApiError::internal)
}

/// The caller's Membership, which must be active. Owners and Members both pass.
pub async fn require_active_member(
    state: &AppState,
    auth: &AuthenticatedClient,
) -> ApiResult<Member> {
    let member = member_for_client(state, auth).await?.ok_or_else(|| {
        ApiError::forbidden(
            "bootstrap_required",
            "Link this dashboard to a household account first",
        )
    })?;
    if member.status != "active" {
        return Err(ApiError::forbidden(
            "inactive_membership",
            "This Membership is not active",
        ));
    }
    Ok(member)
}

pub async fn require_owner(state: &AppState, auth: &AuthenticatedClient) -> ApiResult<Member> {
    let member = member_for_client(state, auth).await?.ok_or_else(|| {
        ApiError::forbidden(
            "bootstrap_required",
            "Link this dashboard to a household account first",
        )
    })?;
    audit::authorize_read(&member.role, &member.status)
        .map_err(|_| ApiError::forbidden("owner_required", "Only the home owner can do that"))?;
    Ok(member)
}

fn bootstrap_audit(user_id: &str, email: &str) -> AuditWrite {
    AuditWrite {
        kind: AuditKind::MembershipChange,
        actor_user_id: Some(user_id.to_string()),
        summary: format!("bootstrapped owner {email}"),
        detail: serde_json::json!({ "action": "bootstrap", "email": email, "role": "owner" }),
    }
}

async fn member_for_client(
    state: &AppState,
    auth: &AuthenticatedClient,
) -> ApiResult<Option<Member>> {
    if let Some(user_id) = auth.user_id.as_deref() {
        return find_member_by_user_id(&state.db, user_id)
            .await
            .map_err(ApiError::internal);
    }
    Ok(None)
}

async fn resolve_or_activate_member(
    state: &AppState,
    user_id: &str,
    email: &str,
    display_name: Option<&str>,
) -> ApiResult<Member> {
    let email = normalize_email(email)
        .map_err(|message| ApiError::bad_request("invalid_email", message))?;
    let user_id = user_id.trim();

    if let Some(member) = find_member_by_user_id(&state.db, user_id)
        .await
        .map_err(ApiError::internal)?
    {
        return Ok(member);
    }

    let Some(member) = find_member_by_email(&state.db, &email)
        .await
        .map_err(ApiError::internal)?
    else {
        return Err(ApiError::forbidden(
            "not_a_member",
            "This Google account is not a member of this home",
        ));
    };

    if member.status == "pending" || member.user_id.is_none() {
        let activated = activate_member(
            &state.db,
            member.id,
            user_id,
            display_name.map(str::trim).filter(|name| !name.is_empty()),
            Some(AuditWrite {
                kind: AuditKind::MembershipChange,
                actor_user_id: Some(user_id.to_string()),
                summary: format!("activated member {}", member.email),
                detail: serde_json::json!({
                    "action": "activate",
                    "memberId": member.id,
                    "email": member.email,
                }),
            }),
        )
        .await
        .map_err(ApiError::internal)?;
        return Ok(activated);
    }

    if member.user_id.as_deref() != Some(user_id) {
        return Err(ApiError::forbidden(
            "not_a_member",
            "This Google account is not a member of this home",
        ));
    }

    Ok(member)
}
