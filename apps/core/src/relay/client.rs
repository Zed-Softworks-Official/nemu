use serde::{Deserialize, Serialize};
use serde_json::{Value as JsonValue, json};
use tracing::{debug, info, warn};
use uuid::Uuid;

use crate::commands::execute_set;
use crate::pairing::tokens::verify_client_token;
use crate::registration::register_with_convex;
use crate::state::AppState;

const POLL_INTERVAL_MS: u64 = 2_000;
const IDLE_BACKOFF_MS: u64 = 5_000;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PendingMessage {
    request_id: String,
    payload: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PendingResponse {
    messages: Vec<PendingMessage>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ToControllerEnvelope {
    request_id: String,
    client_token: String,
    message: ToControllerMessage,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
enum ToControllerMessage {
    #[serde(rename = "command")]
    Command {
        #[serde(rename = "deviceId")]
        device_id: String,
        payload: JsonValue,
    },
    #[serde(rename = "getDevices")]
    GetDevices,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RespondBody<'a> {
    controller_id: &'a str,
    request_id: &'a str,
    payload: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    registration_secret: Option<&'a str>,
}

pub fn spawn_relay_loop(state: AppState) {
    tokio::spawn(async move {
        run_relay_loop(state).await;
    });
}

async fn run_relay_loop(state: AppState) {
    let Some(site_url) = state.convex_site_url.clone() else {
        info!("NEMU_CONVEX_SITE_URL unset; relay client disabled");
        return;
    };

    info!("relay client started");
    let mut consecutive_failures: u32 = 0;

    loop {
        match poll_and_process(&state, &site_url).await {
            Ok(processed) => {
                consecutive_failures = 0;
                if processed == 0 {
                    tokio::time::sleep(std::time::Duration::from_millis(POLL_INTERVAL_MS)).await;
                }
            }
            Err(e) => {
                consecutive_failures = consecutive_failures.saturating_add(1);
                warn!(error = %e, failures = consecutive_failures, "relay poll failed");
                if consecutive_failures >= 3 {
                    // Attempt re-registration in case the controller row was lost.
                    let _ = register_with_convex(
                        &site_url,
                        &state.identity,
                        state.registration_secret.as_deref(),
                        state.lan_ip.as_deref(),
                    )
                    .await;
                }
                tokio::time::sleep(std::time::Duration::from_millis(IDLE_BACKOFF_MS)).await;
            }
        }
    }
}

async fn poll_and_process(state: &AppState, site_url: &str) -> Result<usize, String> {
    let url = format!("{}/relay/pending", site_url.trim_end_matches('/'));
    let body = json!({
        "controllerId": state.identity.controller_id,
        "registrationSecret": state.registration_secret,
    });

    let client = reqwest::Client::new();
    let response = client
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("pending request failed: {e}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(format!("pending failed ({status}): {text}"));
    }

    let pending: PendingResponse = response
        .json()
        .await
        .map_err(|e| format!("pending decode failed: {e}"))?;

    for message in &pending.messages {
        if let Err(e) = handle_message(state, site_url, message).await {
            warn!(request_id = %message.request_id, error = %e, "failed to handle relay message");
        }
    }

    Ok(pending.messages.len())
}

async fn handle_message(
    state: &AppState,
    site_url: &str,
    message: &PendingMessage,
) -> Result<(), String> {
    let envelope: ToControllerEnvelope = serde_json::from_str(&message.payload)
        .map_err(|e| format!("invalid envelope: {e}"))?;

    if envelope.request_id != message.request_id {
        debug!(
            envelope_id = %envelope.request_id,
            message_id = %message.request_id,
            "requestId mismatch; using message.requestId"
        );
    }

    let token_ok = verify_client_token(&state.db, &envelope.client_token)
        .await?
        .is_some();
    if !token_ok {
        let payload = build_error_response(
            state,
            &message.request_id,
            "unauthorized",
            "Invalid client token",
        );
        return respond(state, site_url, &message.request_id, payload).await;
    }

    let response_payload = match envelope.message {
        ToControllerMessage::GetDevices => {
            let devices = state.registry.list().await;
            let mut resources = Vec::with_capacity(devices.len());
            for device in devices {
                resources.push(state.registry.to_resource(state, &device).await);
            }
            build_devices_response(state, &message.request_id, resources)
        }
        ToControllerMessage::Command {
            ref device_id,
            ref payload,
        } => {
            let result = match Uuid::parse_str(device_id) {
                Ok(id) => execute_set(state, id, payload.clone()).await,
                Err(_) => Err(crate::commands::CommandError::DeviceNotFound),
            };
            match result {
                Ok(()) => build_command_result(state, &message.request_id, true, None),
                Err(err) => build_command_result(
                    state,
                    &message.request_id,
                    false,
                    Some((err.code(), err.to_string())),
                ),
            }
        }
    };

    respond(state, site_url, &message.request_id, response_payload).await
}

async fn respond(
    state: &AppState,
    site_url: &str,
    request_id: &str,
    payload: String,
) -> Result<(), String> {
    let url = format!("{}/relay/respond", site_url.trim_end_matches('/'));
    let body = RespondBody {
        controller_id: &state.identity.controller_id,
        request_id,
        payload,
        registration_secret: state.registration_secret.as_deref(),
    };

    let client = reqwest::Client::new();
    let response = client
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("respond request failed: {e}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(format!("respond failed ({status}): {text}"));
    }
    Ok(())
}

fn build_devices_response<T: Serialize>(
    state: &AppState,
    request_id: &str,
    devices: T,
) -> String {
    let message = json!({
        "requestId": request_id,
        "signature": "",
        "message": {
            "type": "devices",
            "devices": devices,
        }
    });
    sign_envelope(state, message)
}

fn build_command_result(
    state: &AppState,
    request_id: &str,
    ok: bool,
    error: Option<(&str, String)>,
) -> String {
    let mut message = json!({
        "type": "commandResult",
        "ok": ok,
    });
    if let Some((code, msg)) = error {
        message["error"] = json!({ "code": code, "message": msg });
    }
    let envelope = json!({
        "requestId": request_id,
        "signature": "",
        "message": message,
    });
    sign_envelope(state, envelope)
}

fn build_error_response(
    state: &AppState,
    request_id: &str,
    code: &str,
    message: &str,
) -> String {
    build_command_result(state, request_id, false, Some((code, message.to_string())))
}

fn sign_envelope(state: &AppState, mut envelope: JsonValue) -> String {
    // Sign the message body (without signature) so clients can verify authenticity.
    let to_sign = envelope
        .get("message")
        .cloned()
        .unwrap_or(JsonValue::Null);
    let bytes = serde_json::to_vec(&to_sign).unwrap_or_default();
    let signature = state.identity.keypair.sign_b64(&bytes);
    envelope["signature"] = json!(signature);
    envelope.to_string()
}
