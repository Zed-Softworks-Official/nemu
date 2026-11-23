use axum::Json;
use axum::extract::State;
use serde::{Deserialize, Serialize};

use crate::api::auth::AuthenticatedClient;
use crate::api::error::ApiResult;
use crate::commissioning::{self, Via};
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
    auth: AuthenticatedClient,
    Json(body): Json<PermitJoinBody>,
) -> ApiResult<Json<PermitJoinResponse>> {
    let seconds = commissioning::permit_zigbee_join(&state, &auth, Via::Lan, body.seconds).await?;
    Ok(Json(PermitJoinResponse { ok: true, seconds }))
}
