use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use chrono::Utc;
use serde::Deserialize;

use crate::api::auth::AuthenticatedClient;
use crate::api::error::{ApiError, ApiResult};
use crate::api::members::require_owner;
use crate::audit::{AuditKind, AuditWrite};
use crate::capabilities::history_budget::{
    self, AcceptedBudgetChange, BudgetSnapshot, ConfirmationRequired, HistoryBudgetView,
    ResolutionTier,
};
use crate::events::ErrorBody;
use crate::state::AppState;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PutBudgetBody {
    pub budget_bytes: u64,
    #[serde(default)]
    pub confirm_deletion: bool,
}

#[derive(Debug)]
pub enum UpdateError {
    Api(ApiError),
    Confirmation(ConfirmationRequired),
}

impl From<ApiError> for UpdateError {
    fn from(error: ApiError) -> Self {
        Self::Api(error)
    }
}

impl IntoResponse for UpdateError {
    fn into_response(self) -> Response {
        match self {
            Self::Api(error) => error.into_response(),
            Self::Confirmation(required) => {
                let body = Json(ConfirmationBody {
                    error: ErrorBody {
                        code: "confirmation_required".to_string(),
                        message: "Lowering the History budget below current usage deletes retained History. Send confirmDeletion: true to continue.".to_string(),
                    },
                    proposed_deletion: true,
                    likely_resolution_loss: required.likely_resolution_loss,
                    restores_deleted_history: false,
                });
                (StatusCode::CONFLICT, body).into_response()
            }
        }
    }
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ConfirmationBody {
    error: ErrorBody,
    proposed_deletion: bool,
    likely_resolution_loss: Vec<ResolutionTier>,
    restores_deleted_history: bool,
}

pub async fn show(
    State(state): State<AppState>,
    auth: AuthenticatedClient,
) -> ApiResult<Json<HistoryBudgetView>> {
    require_owner(&state, &auth).await?;
    let snapshot = history_budget::load_snapshot(&state.db)
        .await
        .map_err(ApiError::internal)?;
    Ok(Json(snapshot.view()))
}

pub async fn update(
    State(state): State<AppState>,
    auth: AuthenticatedClient,
    Json(body): Json<PutBudgetBody>,
) -> Result<Json<HistoryBudgetView>, UpdateError> {
    require_owner(&state, &auth).await?;
    let stored = i64::try_from(body.budget_bytes).map_err(|_| {
        ApiError::bad_request(
            "invalid_budget",
            "History budget must fit in a signed 64-bit integer",
        )
    })?;
    let snapshot = history_budget::load_snapshot(&state.db)
        .await
        .map_err(ApiError::internal)?;
    let decision = history_budget::evaluate_budget_change(
        snapshot.effective_budget_bytes(),
        body.budget_bytes,
        snapshot.usage_bytes,
        body.confirm_deletion,
        &snapshot.tier_bytes,
    )
    .map_err(UpdateError::Confirmation)?;
    let audit = audit_event(
        &auth,
        &snapshot,
        body.budget_bytes,
        body.confirm_deletion,
        &decision,
    );
    history_budget::store_budget(&state.db, stored, Utc::now(), audit)
        .await
        .map_err(ApiError::internal)?;
    let mut snapshot = snapshot;
    snapshot.configured_budget_bytes = Some(body.budget_bytes);
    Ok(Json(snapshot.view()))
}

fn audit_event(
    auth: &AuthenticatedClient,
    snapshot: &BudgetSnapshot,
    proposed_budget: u64,
    confirm_deletion: bool,
    decision: &AcceptedBudgetChange,
) -> Option<AuditWrite> {
    if !decision.write_audit {
        return None;
    }
    Some(AuditWrite {
        kind: AuditKind::HistoryBudgetChange,
        actor_user_id: auth.user_id.clone(),
        summary: format!("set history budget to {proposed_budget} bytes"),
        detail: serde_json::json!({
            "action": "set_budget",
            "previousBudgetBytes": snapshot.effective_budget_bytes(),
            "budgetBytes": proposed_budget,
            "usageBytes": snapshot.usage_bytes,
            "confirmDeletion": confirm_deletion,
            "restoresDeletedHistory": false,
        }),
    })
}
