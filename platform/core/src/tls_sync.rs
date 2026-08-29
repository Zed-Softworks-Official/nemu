use std::sync::Arc;
use std::time::Duration;

use serde::Deserialize;
use tracing::{info, warn};

use crate::listen::SharedTls;
use crate::state::AppState;
use crate::tls;

const POLL_INTERVAL: Duration = Duration::from_secs(180);

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TlsBundle {
    hostname: String,
    cert_pem: String,
    key_pem: String,
}

pub fn spawn_tls_sync(state: AppState, tls: SharedTls, operator_files: bool) {
    if operator_files {
        info!("NEMU_TLS_CERT_PATH set; skipping cloud TLS poll");
        return;
    }
    if state.convex_site_url.is_none() {
        return;
    }
    tokio::spawn(async move {
        run_tls_sync(state, tls).await;
    });
}

async fn run_tls_sync(state: AppState, tls: SharedTls) {
    let Some(site_url) = state.convex_site_url.clone() else {
        return;
    };
    info!("LAN TLS poll started");
    loop {
        if let Err(error) = poll_once(&state, &site_url, &tls).await {
            warn!(%error, "LAN TLS poll failed");
        }
        tokio::time::sleep(POLL_INTERVAL).await;
    }
}

async fn poll_once(state: &AppState, site_url: &str, tls: &SharedTls) -> Result<(), String> {
    let url = format!("{}/controllers/tls", site_url.trim_end_matches('/'));
    let client = reqwest::Client::new();
    let response = client
        .post(&url)
        .json(&serde_json::json!({
            "controllerId": state.identity.controller_id,
            "registrationSecret": state.registration_secret,
        }))
        .send()
        .await
        .map_err(|e| format!("tls request failed: {e}"))?;

    if response.status().as_u16() == 404 {
        return Ok(());
    }
    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(format!("tls fetch failed ({status}): {text}"));
    }

    let bundle: TlsBundle = response
        .json()
        .await
        .map_err(|e| format!("tls decode failed: {e}"))?;

    let existing = tls::load_issued_pems(&state.db).await?;
    if existing
        .as_ref()
        .is_some_and(|(cert, key)| cert == &bundle.cert_pem && key == &bundle.key_pem)
    {
        return Ok(());
    }

    let config = tls::server_config_from_pem(&bundle.cert_pem, &bundle.key_pem)?;
    tls::persist_issued_tls(
        &state.db,
        &bundle.cert_pem,
        &bundle.key_pem,
        &bundle.hostname,
    )
    .await?;

    match tls.write() {
        Ok(mut guard) => {
            *guard = Some(Arc::new(config));
        }
        Err(poisoned) => {
            *poisoned.into_inner() = Some(Arc::new(config));
        }
    }

    info!(hostname = %bundle.hostname, "installed Let's Encrypt certificate");
    Ok(())
}
