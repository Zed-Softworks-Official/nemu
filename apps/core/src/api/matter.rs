use axum::Json;
use axum::extract::State;
use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::api::error::{ApiError, ApiResult};
use crate::state::AppState;

/// Commission a Matter device by pairing code (QR `MT:` payload or 11/21-digit
/// manual code). Wi-Fi credentials are pass-through to the matter bridge and
/// never persisted by core.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommissionBody {
    pub code: String,
    pub wifi_ssid: Option<String>,
    pub wifi_password: Option<String>,
}

#[derive(Serialize)]
pub struct CommissionResponse {
    pub ok: bool,
}

pub async fn commission(
    State(state): State<AppState>,
    Json(body): Json<CommissionBody>,
) -> ApiResult<Json<CommissionResponse>> {
    let code = body.code.trim().to_string();
    if code.is_empty() {
        return Err(ApiError::bad_request(
            "invalid_code",
            "pairing code must not be empty",
        ));
    }

    let mut payload = json!({ "code": code });
    if let Some(ssid) = body.wifi_ssid.as_deref().map(str::trim) {
        if !ssid.is_empty() {
            payload["wifiSsid"] = json!(ssid);
            payload["wifiPassword"] = json!(body.wifi_password.as_deref().unwrap_or(""));
        }
    }

    state
        .mqtt
        .commission(payload)
        .await
        .map_err(|error| ApiError::service_unavailable("commission_failed", error))?;

    Ok(Json(CommissionResponse { ok: true }))
}
