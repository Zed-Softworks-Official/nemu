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

/// Accept only a non-empty `https` URL; trim a trailing slash when valid.
fn normalize_https_url(raw: &str) -> Option<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }
    let parsed = reqwest::Url::parse(trimmed).ok()?;
    if parsed.scheme() != "https" {
        return None;
    }
    let host = parsed.host_str()?;
    if host.is_empty() {
        return None;
    }
    Some(trimmed.trim_end_matches('/').to_string())
}

/// Derive the Convex WebSocket (`.convex.cloud`) URL from the HTTP site URL,
/// unless `NEMU_CONVEX_URL` is a valid https URL.
pub fn convex_cloud_url(site_url: &str) -> String {
    if let Ok(url) = std::env::var("NEMU_CONVEX_URL") {
        if let Some(normalized) = normalize_https_url(&url) {
            return normalized;
        }
        if !url.trim().is_empty() {
            warn!("NEMU_CONVEX_URL must be a non-empty https URL; ignoring override");
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
    let site_url = normalize_https_url(site_url)
        .ok_or_else(|| "Convex site URL must be a valid https URL".to_string())?;
    let url = format!("{}/controllers/session", site_url);
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

    let session: ControllerSession = response
        .json()
        .await
        .map_err(|e| format!("session decode failed: {e}"))?;

    Ok(session)
}

pub async fn register_with_convex(
    site_url: &str,
    identity: &ControllerIdentity,
    registration_secret: Option<&str>,
    lan_ip: Option<&str>,
) -> Result<Option<ControllerSession>, String> {
    let site_url = normalize_https_url(site_url)
        .ok_or_else(|| "Convex site URL must be a valid https URL".to_string())?;
    let url = format!("{}/controllers/register", site_url);

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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_https_url_accepts_https_and_trims_slash() {
        assert_eq!(
            normalize_https_url(" https://happy-animal-123.convex.cloud/ "),
            Some("https://happy-animal-123.convex.cloud".to_string())
        );
        assert_eq!(
            normalize_https_url("https://happy-animal-123.convex.site"),
            Some("https://happy-animal-123.convex.site".to_string())
        );
    }

    #[test]
    fn normalize_https_url_rejects_non_https_and_malformed() {
        assert_eq!(normalize_https_url(""), None);
        assert_eq!(normalize_https_url("   "), None);
        assert_eq!(normalize_https_url("http://evil.example/convex"), None);
        assert_eq!(
            normalize_https_url("wss://happy-animal-123.convex.cloud"),
            None
        );
        assert_eq!(normalize_https_url("file:///etc/passwd"), None);
        assert_eq!(normalize_https_url("not-a-url"), None);
        assert_eq!(normalize_https_url("https://"), None);
    }
}
