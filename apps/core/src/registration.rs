use serde::Serialize;
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

pub async fn register_with_convex(
    site_url: &str,
    identity: &ControllerIdentity,
    registration_secret: Option<&str>,
    lan_ip: Option<&str>,
) -> Result<(), String> {
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

    info!(
        controller_id = %identity.controller_id,
        "registered controller with Convex"
    );
    Ok(())
}

pub async fn register_with_retry(
    site_url: &str,
    identity: &ControllerIdentity,
    registration_secret: Option<&str>,
    lan_ip: Option<&str>,
) {
    match register_with_convex(site_url, identity, registration_secret, lan_ip).await {
        Ok(()) => {}
        Err(e) => {
            warn!(error = %e, "initial Convex registration failed; will retry from relay loop");
        }
    }
}
