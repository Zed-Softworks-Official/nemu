use axum::Json;
use axum::extract::State;

use crate::api::auth::AuthenticatedClient;
use crate::api::error::ApiResult;
use crate::api::members::require_owner;
use crate::capabilities::admission_journal::{self, HistoryHealth};
use crate::state::AppState;

pub async fn history_health(
    State(state): State<AppState>,
    auth: AuthenticatedClient,
) -> ApiResult<Json<HistoryHealth>> {
    require_owner(&state, &auth).await?;
    Ok(Json(admission_journal::current_health()))
}
