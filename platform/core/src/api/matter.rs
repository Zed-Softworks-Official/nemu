use axum::Json;
use axum::extract::State;
use serde::{Deserialize, Serialize};

use crate::api::auth::AuthenticatedClient;
use crate::api::error::ApiResult;
use crate::commissioning::{self, CommissionRequest, MatterWifi, Via};
use crate::state::AppState;

#[derive(Serialize)]
pub struct CommissionResponse {
    pub ok: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveWifiBody {
    pub wifi_ssid: String,
    pub wifi_password: String,
}

pub async fn commission(
    State(state): State<AppState>,
    auth: AuthenticatedClient,
    Json(body): Json<CommissionRequest>,
) -> ApiResult<Json<CommissionResponse>> {
    commissioning::commission_matter(&state, &auth, Via::Lan, body).await?;
    Ok(Json(CommissionResponse { ok: true }))
}

pub async fn cancel(
    State(state): State<AppState>,
    auth: AuthenticatedClient,
) -> ApiResult<Json<CommissionResponse>> {
    commissioning::cancel_matter_commission(&state, &auth).await?;
    Ok(Json(CommissionResponse { ok: true }))
}

pub async fn get_wifi(
    State(state): State<AppState>,
    auth: AuthenticatedClient,
) -> ApiResult<Json<MatterWifi>> {
    Ok(Json(commissioning::read_matter_wifi(&state, &auth).await?))
}

pub async fn put_wifi(
    State(state): State<AppState>,
    auth: AuthenticatedClient,
    Json(body): Json<SaveWifiBody>,
) -> ApiResult<Json<MatterWifi>> {
    Ok(Json(
        commissioning::save_matter_wifi(&state, &auth, &body.wifi_ssid, &body.wifi_password)
            .await?,
    ))
}
