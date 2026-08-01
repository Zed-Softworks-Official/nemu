use axum::Json;
use axum::extract::State;
use serde::Serialize;

use crate::state::AppState;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IdentifyResponse {
    pub controller_id: String,
    pub name: String,
}

pub async fn identify(State(state): State<AppState>) -> Json<IdentifyResponse> {
    Json(IdentifyResponse {
        controller_id: state.identity.controller_id.clone(),
        name: state.identity.name.clone(),
    })
}
