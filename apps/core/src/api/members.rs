use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::api::auth::AuthenticatedClient;
use crate::api::error::{ApiError, ApiResult};
use crate::db::models::Member;
use crate::pairing::members::{
    activate_member, count_members, delete_member, find_member_by_email, find_member_by_user_id,
    get_member, insert_member, list_members, normalize_email,
};
use crate::pairing::tokens::{mint_client_token, revoke_tokens_for_user};
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

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BootstrapOwnerBody {
    pub user_id: String,
    pub email: String,
    pub display_name: Option<String>,
}

#[derive(Clone)]
pub struct SessionMintInput {
    pub user_id: String,
    pub email: String,
    pub client_label: String,
    pub display_name: Option<String>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SessionMintResult {
    pub client_token: String,
    pub controller_id: String,
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

pub async fn bootstrap_owner_handler(
    State(state): State<AppState>,
    auth: AuthenticatedClient,
    Json(body): Json<BootstrapOwnerBody>,
) -> ApiResult<Json<MemberResource>> {
    let member = bootstrap_owner(
        &state,
        &auth,
        &body.user_id,
        &body.email,
        body.display_name.as_deref(),
    )
    .await?;
    Ok(Json(member))
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

    let member = insert_member(&state.db, None, &email, None, "member", "pending")
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

    if let Some(user_id) = target.user_id.as_deref() {
        let _ = revoke_tokens_for_user(&state.db, user_id)
            .await
            .map_err(ApiError::internal)?;
    }

    let deleted = delete_member(&state.db, id)
        .await
        .map_err(ApiError::internal)?;
    if deleted {
        Ok(())
    } else {
        Err(ApiError::not_found("not_found", "Member not found"))
    }
}

pub async fn bootstrap_owner(
    state: &AppState,
    _auth: &AuthenticatedClient,
    user_id: &str,
    email: &str,
    display_name: Option<&str>,
) -> ApiResult<MemberResource> {
    let user_id = user_id.trim();
    if user_id.is_empty() {
        return Err(ApiError::bad_request("invalid_user", "userId is required"));
    }
    let email = normalize_email(email)
        .map_err(|message| ApiError::bad_request("invalid_email", message))?;

    let existing = count_members(&state.db).await.map_err(ApiError::internal)?;
    if existing > 0 {
        return Err(ApiError::conflict(
            "already_bootstrapped",
            "This home already has household members",
        ));
    }

    let member = insert_member(
        &state.db,
        Some(user_id),
        &email,
        display_name.map(str::trim).filter(|name| !name.is_empty()),
        "owner",
        "active",
    )
    .await
    .map_err(ApiError::internal)?;
    Ok(MemberResource::from(&member))
}

pub async fn mint_session(
    state: &AppState,
    input: SessionMintInput,
) -> ApiResult<SessionMintResult> {
    let user_id = input.user_id.trim();
    let label = input.client_label.trim();
    if user_id.is_empty() {
        return Err(ApiError::bad_request("invalid_user", "userId is required"));
    }
    if label.is_empty() {
        return Err(ApiError::bad_request(
            "invalid_label",
            "clientLabel is required",
        ));
    }
    let email = normalize_email(&input.email)
        .map_err(|message| ApiError::bad_request("invalid_email", message))?;

    let member =
        resolve_or_activate_member(state, user_id, &email, input.display_name.as_deref()).await?;

    let issued = mint_client_token(&state.db, label, member.user_id.as_deref())
        .await
        .map_err(ApiError::internal)?;

    Ok(SessionMintResult {
        client_token: issued.token,
        controller_id: state.identity.controller_id.clone(),
    })
}

pub async fn pair_member_session(
    state: &AppState,
    user_id: &str,
    email: &str,
    display_name: Option<&str>,
    client_label: &str,
) -> ApiResult<SessionMintResult> {
    let member_count = count_members(&state.db).await.map_err(ApiError::internal)?;

    if member_count == 0 {
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
        )
        .await
        .map_err(ApiError::internal)?;
    } else {
        resolve_or_activate_member(state, user_id, email, display_name).await?;
    }

    let issued = mint_client_token(&state.db, client_label, Some(user_id.trim()))
        .await
        .map_err(ApiError::internal)?;

    Ok(SessionMintResult {
        client_token: issued.token,
        controller_id: state.identity.controller_id.clone(),
    })
}

pub async fn require_owner(state: &AppState, auth: &AuthenticatedClient) -> ApiResult<Member> {
    let member = member_for_client(state, auth).await?.ok_or_else(|| {
        ApiError::forbidden(
            "bootstrap_required",
            "Link this dashboard to a household account first",
        )
    })?;
    if member.role != "owner" || member.status != "active" {
        return Err(ApiError::forbidden(
            "owner_required",
            "Only the home owner can do that",
        ));
    }
    Ok(member)
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
        return activate_member(
            &state.db,
            member.id,
            user_id,
            display_name.map(str::trim).filter(|name| !name.is_empty()),
        )
        .await
        .map_err(ApiError::internal);
    }

    if member.user_id.as_deref() != Some(user_id) {
        return Err(ApiError::forbidden(
            "not_a_member",
            "This Google account is not a member of this home",
        ));
    }

    Ok(member)
}
