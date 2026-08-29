use serde::{Deserialize, Serialize};
use tracing::{info, warn};

use crate::identity::ControllerIdentity;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RegisterBody<'a> {
    controller_id: &'a str,
    public_key: &'a str,
    name: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    registration_secret: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    lan_ip: Option<&'a str>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ControllerSession {
    pub token: String,
    #[allow(dead_code)]
    pub expires_at: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RegisterResponse {
    #[serde(default)]
    #[allow(dead_code)]
    ok: bool,
    #[serde(default)]
    token: Option<String>,
    #[serde(default)]
    expires_at: Option<i64>,
}

/// Derive the Convex WebSocket (`.convex.cloud`) URL from the HTTP site URL,
/// unless `NEMU_CONVEX_URL` is set.
pub fn convex_cloud_url(site_url: &str) -> String {
    if let Ok(url) = std::env::var("NEMU_CONVEX_URL") {
        let trimmed = url.trim();
        if !trimmed.is_empty() {
            return trimmed.trim_end_matches('/').to_string();
        }
    }
    site_url
        .trim_end_matches('/')
        .replace(".convex.site", ".convex.cloud")
}

pub async fn fetch_controller_session(
    site_url: &str,
    controller_id: &str,
    registration_secret: Option<&str>,
) -> Result<ControllerSession, String> {
    let url = format!("{}/controllers/session", site_url.trim_end_matches('/'));
    let body = serde_json::json!({
        "controllerId": controller_id,
        "registrationSecret": registration_secret,
    });

    let client = reqwest::Client::new();
    let response = client
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("session request failed: {e}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(format!("session failed ({status}): {text}"));
    }

    response
        .json()
        .await
        .map_err(|e| format!("session decode failed: {e}"))
}

pub async fn register_with_convex(
    site_url: &str,
    identity: &ControllerIdentity,
    registration_secret: Option<&str>,
    lan_ip: Option<&str>,
) -> Result<Option<ControllerSession>, String> {
    let url = format!("{}/controllers/register", site_url.trim_end_matches('/'));

    let body = RegisterBody {
        controller_id: &identity.controller_id,
        public_key: &identity.keypair.public_key_b64,
        name: &identity.name,
        registration_secret,
        lan_ip,
    };

    let client = reqwest::Client::new();
    let response = client
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("convex register request failed: {e}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(format!("convex register failed ({status}): {text}"));
    }

    let parsed: RegisterResponse = response
        .json()
        .await
        .map_err(|e| format!("convex register decode failed: {e}"))?;

    info!(
        controller_id = %identity.controller_id,
        "registered controller with Convex"
    );

    Ok(match (parsed.token, parsed.expires_at) {
        (Some(token), Some(expires_at)) => Some(ControllerSession { token, expires_at }),
        _ => None,
    })
}

pub async fn register_with_retry(
    site_url: &str,
    identity: &ControllerIdentity,
    registration_secret: Option<&str>,
    lan_ip: Option<&str>,
) -> Option<ControllerSession> {
    match register_with_convex(site_url, identity, registration_secret, lan_ip).await {
        Ok(session) => session,
        Err(e) => {
            warn!(error = %e, "initial Convex registration failed; will retry from relay loop");
            None
        }
    }
}
