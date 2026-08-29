use axum::Json;
use axum::extract::State;
use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::api::error::{ApiError, ApiResult};
use crate::identity::{get_string, set_string};
use crate::state::AppState;

const KEY_WIFI_SSID: &str = "matter_wifi_ssid";
const KEY_WIFI_PASSWORD: &str = "matter_wifi_password";

/// Commission a Matter device by pairing code (QR `MT:` payload or 11/21-digit
/// manual code). Wi-Fi is reused from controller settings when omitted.
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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WifiResponse {
    pub configured: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub network_name: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveWifiBody {
    pub wifi_ssid: String,
    pub wifi_password: String,
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

    let saved = load_wifi(&state).await?;
    let provided_ssid = body
        .wifi_ssid
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());

    let provided_password = body
        .wifi_password
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());

    let (ssid, password) = if let Some(ssid) = provided_ssid {
        if let Some(password) = provided_password {
            save_wifi(&state, ssid, password).await?;
            (Some(ssid.to_string()), password.to_string())
        } else if let Some((saved_ssid, saved_password)) =
            saved.as_ref().filter(|(saved_ssid, _)| saved_ssid == ssid)
        {
            (Some(saved_ssid.clone()), saved_password.clone())
        } else {
            (Some(ssid.to_string()), String::new())
        }
    } else if let Some((ssid, password)) = saved {
        (Some(ssid), password)
    } else {
        (None, String::new())
    };

    let mut payload = json!({ "code": code });
    if let Some(ssid) = ssid {
        payload["wifiSsid"] = json!(ssid);
        payload["wifiPassword"] = json!(password);
    }

    state
        .mqtt
        .commission(payload)
        .await
        .map_err(|error| ApiError::service_unavailable("commission_failed", error))?;

    Ok(Json(CommissionResponse { ok: true }))
}

pub async fn cancel(State(state): State<AppState>) -> ApiResult<Json<CommissionResponse>> {
    state
        .mqtt
        .cancel_commission()
        .await
        .map_err(|error| ApiError::service_unavailable("cancel_failed", error))?;

    Ok(Json(CommissionResponse { ok: true }))
}

pub async fn get_wifi(State(state): State<AppState>) -> ApiResult<Json<WifiResponse>> {
    let saved = load_wifi(&state).await?;
    Ok(Json(WifiResponse {
        configured: saved.is_some(),
        network_name: saved.map(|(ssid, _)| ssid),
    }))
}

pub async fn put_wifi(
    State(state): State<AppState>,
    Json(body): Json<SaveWifiBody>,
) -> ApiResult<Json<WifiResponse>> {
    let ssid = body.wifi_ssid.trim();
    if ssid.is_empty() || ssid.len() > 32 {
        return Err(ApiError::bad_request(
            "invalid_network",
            "home Wi-Fi name must be 1–32 characters",
        ));
    }
    if body.wifi_password.len() > 64 {
        return Err(ApiError::bad_request(
            "invalid_password",
            "home Wi-Fi password must be at most 64 characters",
        ));
    }
    save_wifi(&state, ssid, &body.wifi_password).await?;
    Ok(Json(WifiResponse {
        configured: true,
        network_name: Some(ssid.to_string()),
    }))
}

async fn load_wifi(state: &AppState) -> Result<Option<(String, String)>, ApiError> {
    let cloak = cloak_key(state);
    let conn = state
        .db
        .get()
        .await
        .map_err(|error| ApiError::internal(format!("db pool error: {error}")))?;
    conn.interact(move |conn| -> Result<Option<(String, String)>, String> {
        let ssid = get_string(conn, KEY_WIFI_SSID)?;
        let password = get_string(conn, KEY_WIFI_PASSWORD)?;
        Ok(match (ssid, password) {
            (Some(ssid), Some(password)) if !ssid.is_empty() => {
                Some((ssid, uncloak(&cloak, &password)))
            }
            _ => None,
        })
    })
    .await
    .map_err(|error| ApiError::internal(format!("db interact error: {error}")))?
    .map_err(ApiError::internal)
}

async fn save_wifi(state: &AppState, ssid: &str, password: &str) -> Result<(), ApiError> {
    let cloak = cloak_key(state);
    let ssid = ssid.to_string();
    let password = cloak_value(&cloak, password);
    let conn = state
        .db
        .get()
        .await
        .map_err(|error| ApiError::internal(format!("db pool error: {error}")))?;
    conn.interact(move |conn| -> Result<(), String> {
        set_string(conn, KEY_WIFI_SSID, &ssid)?;
        set_string(conn, KEY_WIFI_PASSWORD, &password)?;
        Ok(())
    })
    .await
    .map_err(|error| ApiError::internal(format!("db interact error: {error}")))?
    .map_err(ApiError::internal)
}

fn cloak_key(state: &AppState) -> String {
    format!("nemu-matter-wifi:{}", state.identity.controller_id)
}

fn cloak_value(key: &str, plaintext: &str) -> String {
    let key_bytes = key.as_bytes();
    let mixed: Vec<u8> = plaintext
        .as_bytes()
        .iter()
        .enumerate()
        .map(|(index, byte)| byte ^ key_bytes[index % key_bytes.len()])
        .collect();
    format!("xor1:{}", to_hex(&mixed))
}

fn uncloak(key: &str, stored: &str) -> String {
    let Some(hex) = stored.strip_prefix("xor1:") else {
        return stored.to_string();
    };
    let Ok(bytes) = from_hex(hex) else {
        return stored.to_string();
    };
    let key_bytes = key.as_bytes();
    let decrypted: Vec<u8> = bytes
        .iter()
        .enumerate()
        .map(|(index, byte)| byte ^ key_bytes[index % key_bytes.len()])
        .collect();
    match String::from_utf8(decrypted) {
        Ok(password) => password,
        Err(_) => stored.to_string(),
    }
}

fn to_hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn from_hex(hex: &str) -> Result<Vec<u8>, ()> {
    if hex.len() % 2 != 0 {
        return Err(());
    }
    (0..hex.len())
        .step_by(2)
        .map(|index| u8::from_str_radix(&hex[index..index + 2], 16).map_err(|_| ()))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn uncloak_preserves_utf8_passwords() {
        let key = "nemu-matter-wifi:test";
        let password = "café";
        let stored = cloak_value(key, password);
        assert_eq!(uncloak(key, &stored), password);
    }
}
