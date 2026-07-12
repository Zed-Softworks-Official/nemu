use axum::Json;
use axum::extract::State;
use serde::{Deserialize, Serialize};

use crate::api::error::{ApiError, ApiResult};
use crate::state::AppState;

#[derive(Deserialize)]
pub struct PermitJoinBody {
    pub seconds: Option<u32>,
}

#[derive(Serialize)]
pub struct PermitJoinResponse {
    pub ok: bool,
    pub seconds: u32,
}

pub async fn permit_join(
    State(state): State<AppState>,
    Json(body): Json<PermitJoinBody>,
) -> ApiResult<Json<PermitJoinResponse>> {
    let seconds = body.seconds.unwrap_or(120).clamp(1, 254);
    state
        .mqtt
        .permit_join(seconds)
        .await
        .map_err(|e| ApiError::service_unavailable("mqtt_error", e))?;

    Ok(Json(PermitJoinResponse { ok: true, seconds }))
}
