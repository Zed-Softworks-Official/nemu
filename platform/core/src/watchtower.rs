use std::time::Duration;

use serde::Deserialize;

// Owner install no longer calls Watchtower. NEM-46 removes the client.
#[allow(dead_code)]
const WATCHTOWER_UNAVAILABLE: &str = "Watchtower is not configured or unreachable. Re-run the installer with force to enable on-demand updates.";

pub const RELEASE_BUNDLE: [&str; 2] = [
    "ghcr.io/zed-softworks-official/nemu-core",
    "ghcr.io/zed-softworks-official/nemu-matter",
];

#[derive(Clone)]
pub struct WatchtowerClient {
    base_url: String,
    token: String,
    pub images: Vec<String>,
    http: reqwest::Client,
}

#[derive(Debug, Deserialize)]
struct CheckResponse {
    #[serde(default)]
    containers: Vec<ContainerCheck>,
}

#[derive(Debug, Clone, Deserialize)]
struct ContainerCheck {
    #[serde(default)]
    name: Option<String>,
    #[serde(default, alias = "imageName")]
    image: Option<String>,
    #[serde(default, alias = "updateAvailable")]
    update_available: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ReleaseBundleStatus {
    Current,
    Ready,
    Incomplete,
}

impl WatchtowerClient {
    pub fn new(base_url: String, token: String, images: Vec<String>) -> Self {
        Self {
            base_url: base_url.trim_end_matches('/').to_string(),
            token,
            images,
            http: reqwest::Client::new(),
        }
    }

    pub async fn check(&self) -> Result<bool, String> {
        let url = format!("{}/v1/check", self.base_url);
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

        match release_bundle_status(&body.containers) {
            ReleaseBundleStatus::Ready => Ok(true),
            ReleaseBundleStatus::Current => Ok(false),
            ReleaseBundleStatus::Incomplete => {
                Err("Core and first-party adapters must be checked as one release bundle".into())
            }
        }
    }

    pub async fn apply(&self) -> Result<(), String> {
        let url = format!("{}/v1/update?async=true", self.base_url);
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

#[allow(dead_code)]
pub fn unavailable_message() -> &'static str {
    WATCHTOWER_UNAVAILABLE
}

fn release_bundle_status(containers: &[ContainerCheck]) -> ReleaseBundleStatus {
    let mut found = std::collections::HashSet::new();
    let mut update_available = false;
    for container in containers {
        let Some(member) = bundle_member(container) else {
            continue;
        };
        found.insert(member);
        update_available |= container.update_available;
    }
    if found.len() != RELEASE_BUNDLE.len() {
        return ReleaseBundleStatus::Incomplete;
    }
    if update_available {
        ReleaseBundleStatus::Ready
    } else {
        ReleaseBundleStatus::Current
    }
}

fn bundle_member(container: &ContainerCheck) -> Option<&'static str> {
    let image = container.image.as_deref().unwrap_or("");
    let name = container.name.as_deref().unwrap_or("");
    RELEASE_BUNDLE.into_iter().find(|member| {
        let short = member.rsplit('/').next().unwrap_or(member);
        image_without_tag(image).rsplit('/').next() == Some(short) || name.contains(short)
    })
}

fn image_without_tag(image: &str) -> &str {
    let without_digest = image
        .split_once('@')
        .map(|(image, _)| image)
        .unwrap_or(image);
    match without_digest.rsplit_once(':') {
        Some((name, tag)) if !tag.contains('/') => name,
        _ => without_digest,
    }
}

#[cfg(test)]
mod tests {
    use super::{ContainerCheck, RELEASE_BUNDLE, ReleaseBundleStatus, release_bundle_status};

    fn container(image: &str, update_available: bool) -> ContainerCheck {
        ContainerCheck {
            name: None,
            image: Some(image.to_string()),
            update_available,
        }
    }

    #[test]
    fn release_bundle_updates_core_and_matter_together() {
        assert_eq!(RELEASE_BUNDLE.len(), 2);
        let ready = release_bundle_status(&[
            container("ghcr.io/zed-softworks-official/nemu-core:latest", true),
            container("ghcr.io/zed-softworks-official/nemu-matter:1.2.0", false),
        ]);
        assert_eq!(ready, ReleaseBundleStatus::Ready);

        let current = release_bundle_status(&[
            container("ghcr.io/zed-softworks-official/nemu-core:latest", false),
            container("ghcr.io/zed-softworks-official/nemu-matter:latest", false),
        ]);
        assert_eq!(current, ReleaseBundleStatus::Current);
    }

    #[test]
    fn a_single_image_is_not_a_release_bundle() {
        let core_only = release_bundle_status(&[container(
            "ghcr.io/zed-softworks-official/nemu-core:latest",
            true,
        )]);
        assert_eq!(core_only, ReleaseBundleStatus::Incomplete);
    }
}
