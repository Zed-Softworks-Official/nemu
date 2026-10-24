use axum::Json;
use axum::extract::State;
use serde::Serialize;
use serde_json::Value as JsonValue;

use crate::api::auth::AuthenticatedClient;
use crate::api::error::{ApiError, ApiResult};
use crate::api::members::require_owner;
use crate::audit::{self, AuditRow};
use crate::state::AppState;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditRecordResponse {
    pub id: String,
    pub kind: String,
    pub actor_user_id: Option<String>,
    pub summary: String,
    pub detail: JsonValue,
    pub created_at: String,
}

impl From<AuditRow> for AuditRecordResponse {
    fn from(row: AuditRow) -> Self {
        Self {
            id: row.id.to_string(),
            kind: row.kind,
            actor_user_id: row.actor_user_id,
            summary: row.summary,
            detail: row.detail,
            created_at: row.created_at.to_rfc3339(),
        }
    }
}

#[derive(Serialize)]
pub struct AuditResponse {
    pub records: Vec<AuditRecordResponse>,
}

pub async fn list_audit(
    State(state): State<AppState>,
    auth: AuthenticatedClient,
) -> ApiResult<Json<AuditResponse>> {
    require_owner(&state, &auth).await?;
    let records = audit::list_recent(&state.db, 200)
        .await
        .map_err(ApiError::internal)?;
    Ok(Json(AuditResponse {
        records: records.into_iter().map(AuditRecordResponse::from).collect(),
    }))
}
