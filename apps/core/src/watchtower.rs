use std::time::Duration;

use serde::Deserialize;

const WATCHTOWER_UNAVAILABLE: &str = "Watchtower is not configured or unreachable. Re-run the installer with force to enable on-demand updates.";

#[derive(Clone)]
pub struct WatchtowerClient {
    base_url: String,
    token: String,
    pub image: String,
    http: reqwest::Client,
}

#[derive(Debug, Deserialize)]
struct CheckResponse {
    #[serde(default)]
    containers: Vec<ContainerCheck>,
}

#[derive(Debug, Deserialize)]
struct ContainerCheck {
    #[serde(default)]
    update_available: bool,
}

impl WatchtowerClient {
    pub fn new(base_url: String, token: String, image: String) -> Self {
        Self {
            base_url: base_url.trim_end_matches('/').to_string(),
            token,
            image,
            http: reqwest::Client::new(),
        }
    }

    pub async fn check(&self) -> Result<bool, String> {
        let url = format!("{}/v1/check?image={}", self.base_url, self.image);
        let response = self
            .http
            .post(&url)
            .bearer_auth(&self.token)
            .timeout(Duration::from_secs(45))
            .send()
            .await
            .map_err(|e| e.to_string())?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            return Err(format!("HTTP {status}: {text}"));
        }

        let body = response
            .json::<CheckResponse>()
            .await
            .map_err(|e| e.to_string())?;

        Ok(body.containers.iter().any(|c| c.update_available))
    }

    pub async fn apply(&self) -> Result<(), String> {
        let url = format!(
            "{}/v1/update?async=true&image={}",
            self.base_url, self.image
        );
        let response = self
            .http
            .post(&url)
            .bearer_auth(&self.token)
            .timeout(Duration::from_secs(15))
            .send()
            .await
            .map_err(|e| e.to_string())?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            return Err(format!("HTTP {status}: {text}"));
        }

        Ok(())
    }
}

pub fn unavailable_message() -> &'static str {
    WATCHTOWER_UNAVAILABLE
}
