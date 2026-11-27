use std::collections::{BTreeMap, HashSet};
use std::time::{Duration, Instant};

use convex::{AuthenticationToken, ConvexClient, FunctionResult, Value};
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::{Value as JsonValue, json};
use tokio::sync::broadcast::error::RecvError;
use tracing::{debug, info, warn};
use uuid::Uuid;

use crate::api::access::{leave_home, revoke_current};
use crate::api::auth::AuthenticatedClient;
use crate::api::error::ApiError;
use crate::api::members::{
    SessionMintInput, invite_member, list_household_members, mint_session, remove_member,
};
use crate::api::pairing::{list_household_tokens, revoke_household_token};
use crate::api::rooms::load_rooms;
use crate::commands::execute_set;
use crate::events::DeviceEvent;
use crate::pairing::tokens::verify_client_token;
use crate::registration::{convex_cloud_url, fetch_controller_session, register_with_convex};
use crate::setup;
use crate::state::{AppState, CapabilityWatch};

/// HTTP fallback poll interval when the WebSocket client is unavailable.
const FALLBACK_POLL_INTERVAL_MS: u64 = 15_000;
const IDLE_BACKOFF_MS: u64 = 5_000;
const FALLBACK_ROUNDS_BEFORE_RETRY: u32 = 4;
const CAPABILITY_WATCH_TTL: Duration = Duration::from_secs(45);

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
    #[serde(default)]
    client_token: Option<String>,
    /// Unix milliseconds after which the sender gave up. Absent from reads
    /// and older clients.
    #[serde(default)]
    expires_at: Option<i64>,
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
    #[serde(rename = "getRooms")]
    GetRooms,
    #[serde(rename = "getDevices")]
    GetDevices,
    #[serde(rename = "sessionMint")]
    SessionMint {
        #[serde(rename = "userId")]
        user_id: String,
        email: String,
        #[serde(rename = "clientLabel")]
        client_label: String,
        #[serde(rename = "displayName")]
        display_name: Option<String>,
    },
    #[serde(rename = "listMembers")]
    ListMembers,
    #[serde(rename = "inviteMember")]
    InviteMember { email: String },
    #[serde(rename = "removeMember")]
    RemoveMember {
        #[serde(rename = "memberId")]
        member_id: String,
    },
    #[serde(rename = "listTokens")]
    ListTokens,
    #[serde(rename = "revokeToken")]
    RevokeToken {
        #[serde(rename = "tokenId")]
        token_id: String,
    },
    #[serde(rename = "revokeCurrent")]
    RevokeCurrent,
    #[serde(rename = "leaveHome")]
    LeaveHome,
    #[serde(rename = "getCapabilitySnapshot")]
    GetCapabilitySnapshot,
    #[serde(rename = "watchCapabilityChanges")]
    WatchCapabilityChanges,
    #[serde(rename = "historyQuery")]
    HistoryQuery {
        #[serde(flatten)]
        query: crate::capabilities::history_query::HistoryQueryRequest,
    },
    #[serde(rename = "designateHomeMeter")]
    DesignateHomeMeter {
        #[serde(flatten)]
        selection: crate::capabilities::home_meter::DesignationSelection,
    },
    #[serde(rename = "getHomeMeterDesignation")]
    GetHomeMeterDesignation,
    #[serde(rename = "exportHistoryBackup")]
    ExportHistoryBackup,
    #[serde(rename = "importHistoryBackup")]
    ImportHistoryBackup { archive: String },
    #[serde(rename = "releaseStatus")]
    ReleaseStatus,
    #[serde(rename = "installRelease")]
    InstallRelease {
        /// The Release the Owner confirmed. Absent from older clients.
        #[serde(rename = "platformVersion", default)]
        platform_version: Option<String>,
    },
    #[serde(rename = "rollbackRelease")]
    RollbackRelease,
    #[serde(rename = "switchReleaseChannel")]
    SwitchReleaseChannel { channel: String },
    #[serde(rename = "renameDevice")]
    RenameDevice {
        #[serde(rename = "deviceId")]
        device_id: String,
        name: String,
    },
    #[serde(rename = "assignRoom")]
    AssignRoom {
        #[serde(rename = "deviceId")]
        device_id: String,
        #[serde(rename = "componentId", default)]
        component_id: Option<String>,
        /// Required; `null` clears the Room.
        #[serde(
            rename = "roomId",
            deserialize_with = "crate::api::devices::required_nullable"
        )]
        room_id: Option<String>,
    },
    #[serde(rename = "removeDevice")]
    RemoveDevice {
        #[serde(rename = "deviceId")]
        device_id: String,
    },
    #[serde(rename = "createRoom")]
    CreateRoom {
        name: String,
        #[serde(rename = "sortOrder", default)]
        sort_order: Option<i32>,
    },
    #[serde(rename = "updateRoom")]
    UpdateRoom {
        #[serde(rename = "roomId")]
        room_id: String,
        #[serde(default)]
        name: Option<String>,
        #[serde(rename = "sortOrder", default)]
        sort_order: Option<i32>,
    },
    #[serde(rename = "deleteRoom")]
    DeleteRoom {
        #[serde(rename = "roomId")]
        room_id: String,
        /// Required; `null` moves the Room's contents to No Room.
        #[serde(
            rename = "destinationRoomId",
            deserialize_with = "crate::api::devices::required_nullable"
        )]
        destination_room_id: Option<String>,
    },
    /// Carries no pairing code or Wi-Fi details, so a commissioning started
    /// over LAN can still be stopped after the client moves to Relay.
    #[serde(rename = "cancelMatterCommission")]
    CancelMatterCommission,
    #[serde(rename = "permitJoin")]
    PermitJoin {
        #[serde(default)]
        seconds: Option<u32>,
    },
    #[serde(rename = "getSession")]
    GetSession,
    #[serde(rename = "getHealthSummary")]
    GetHealthSummary,
}

/// Why a Relay envelope could not become a request (ADR-0016).
#[derive(Debug, Clone, PartialEq, Eq)]
enum EnvelopeRejection {
    /// This Controller does not know the requested action.
    UnsupportedAction { request_id: String, action: String },
    /// An action that needs the Home network arrived over Relay
    /// ([`LAN_ONLY_ACTIONS`]).
    LanOnly { request_id: String, action: String },
    /// A known action arrived in a shape this Controller cannot read.
    ProtocolMismatch { request_id: String, detail: String },
    /// No request ID to answer; the envelope is dropped. Carries no detail,
    /// because it is logged and a parse error can quote the payload.
    Unreadable,
}

/// Actions that only run over LAN, rejected before their contents are parsed.
/// They carry Matter pairing codes or Wi-Fi credentials, which must not cross
/// Relay for any role until Relay envelopes are encrypted end to end (NEM-63,
/// ADR-0034). Clients refuse to send them; this is defence in depth. A
/// Presence check that gains a Relay message belongs here too.
const LAN_ONLY_ACTIONS: &[&str] = &["commissionMatter", "getMatterWifi", "saveMatterWifi"];

/// How far an Access Client's clock may trail the Controller's.
const EXPIRY_CLOCK_SKEW_MS: i64 = 60_000;

/// A write can wait in the sender's Convex client while it is disconnected.
/// Its sender has already reported that it did not happen, so it must not
/// run once it finally arrives (ADR-0015).
fn envelope_expired(expires_at: Option<i64>, now_ms: i64) -> bool {
    expires_at.is_some_and(|at| now_ms > at.saturating_add(EXPIRY_CLOCK_SKEW_MS))
}

fn parse_envelope(payload: &str) -> Result<ToControllerEnvelope, EnvelopeRejection> {
    let raw: JsonValue =
        serde_json::from_str(payload).map_err(|_| EnvelopeRejection::Unreadable)?;
    let request_id = raw
        .get("requestId")
        .and_then(JsonValue::as_str)
        .map(str::to_string);
    let requested = raw.pointer("/message/type").and_then(JsonValue::as_str);
    if let (Some(request_id), Some(action)) = (request_id.as_ref(), requested)
        && LAN_ONLY_ACTIONS.contains(&action)
    {
        return Err(EnvelopeRejection::LanOnly {
            request_id: request_id.clone(),
            action: action.to_string(),
        });
    }
    match serde_json::from_value::<ToControllerEnvelope>(raw.clone()) {
        Ok(envelope) => Ok(envelope),
        Err(error) => {
            let Some(request_id) = request_id else {
                return Err(EnvelopeRejection::Unreadable);
            };
            let action = raw
                .pointer("/message/type")
                .and_then(JsonValue::as_str)
                .unwrap_or_default()
                .to_string();
            if error.to_string().starts_with("unknown variant") {
                Err(EnvelopeRejection::UnsupportedAction { request_id, action })
            } else {
                Err(EnvelopeRejection::ProtocolMismatch {
                    request_id,
                    detail: error.to_string(),
                })
            }
        }
    }
}

/// The error code and message answering a rejected envelope, or `None` when
/// there is no request ID to answer.
fn rejection_reply(rejection: &EnvelopeRejection) -> Option<(&'static str, String)> {
    match rejection {
        EnvelopeRejection::UnsupportedAction { action, .. } => Some((
            "unsupported_action",
            format!("This Controller does not support {action:?}. Update the Controller."),
        )),
        EnvelopeRejection::LanOnly { action, .. } => Some((
            "unsupported_action",
            format!(
                "{action:?} is not available over Relay. It needs this phone on the Home network."
            ),
        )),
        EnvelopeRejection::ProtocolMismatch { detail, .. } => Some((
            "protocol_mismatch",
            format!("This Controller cannot read the request: {detail}"),
        )),
        EnvelopeRejection::Unreadable => None,
    }
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

enum RespondVia<'a> {
    Convex(&'a mut ConvexClient),
    Http { site_url: &'a str },
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
    let cloud_url = convex_cloud_url(&site_url);

    info!(%cloud_url, "relay client started");
    spawn_capability_watch_pushes(state.clone(), site_url.clone());

    loop {
        match run_subscription_relay(&state, &site_url, &cloud_url).await {
            Ok(()) => {
                warn!("relay subscription ended; reconnecting");
            }
            Err(e) => {
                warn!(error = %e, "relay subscription failed; entering HTTP fallback");
                let _ = register_with_convex(
                    &site_url,
                    &state.identity,
                    state.registration_secret.as_deref(),
                    state.lan_ip.as_deref(),
                )
                .await;
                run_http_fallback(&state, &site_url).await;
            }
        }
        tokio::time::sleep(Duration::from_millis(IDLE_BACKOFF_MS)).await;
    }
}

async fn run_subscription_relay(
    state: &AppState,
    site_url: &str,
    cloud_url: &str,
) -> Result<(), String> {
    let mut client = ConvexClient::new(cloud_url)
        .await
        .map_err(|e| format!("convex client connect failed: {e}"))?;

    let site_url_owned = site_url.to_string();
    let controller_id = state.identity.controller_id.clone();
    let registration_secret = state.registration_secret.clone();

    let fetcher = {
        let site_url_owned = site_url_owned.clone();
        let controller_id = controller_id.clone();
        let registration_secret = registration_secret.clone();
        Box::new(move |_force_refresh: bool| {
            let site_url_owned = site_url_owned.clone();
            let controller_id = controller_id.clone();
            let registration_secret = registration_secret.clone();
            Box::pin(async move {
                let session = fetch_controller_session(
                    &site_url_owned,
                    &controller_id,
                    registration_secret.as_deref(),
                )
                .await
                .map_err(anyhow::Error::msg)?;
                Ok(AuthenticationToken::User(session.token))
            })
                as std::pin::Pin<
                    Box<
                        dyn std::future::Future<Output = anyhow::Result<AuthenticationToken>>
                            + Send,
                    >,
                >
        }) as convex::AuthTokenFetcher
    };

    client.set_auth_callback(Some(fetcher)).await;

    let mut sub = client
        .subscribe("relay:pendingForMe", BTreeMap::new())
        .await
        .map_err(|e| format!("subscribe pendingForMe failed: {e}"))?;

    info!("relay subscription active");
    state.health.set_relay(true);
    let outcome = relay_pending_messages(state, &mut client, &mut sub).await;
    state.health.set_relay(false);
    outcome
}

async fn relay_pending_messages(
    state: &AppState,
    client: &mut ConvexClient,
    sub: &mut convex::QuerySubscription,
) -> Result<(), String> {
    let mut in_flight: HashSet<String> = HashSet::new();
    let mut mut_client = client.clone();

    while let Some(result) = sub.next().await {
        let messages = match parse_pending_result(result) {
            Ok(messages) => messages,
            Err(e) => {
                warn!(error = %e, "pendingForMe result error");
                return Err(e);
            }
        };

        for message in messages {
            if !in_flight.insert(message.request_id.clone()) {
                continue;
            }
            let outcome =
                handle_message(state, &mut RespondVia::Convex(&mut mut_client), &message).await;
            in_flight.remove(&message.request_id);
            if let Err(e) = outcome {
                warn!(
                    request_id = %message.request_id,
                    error = %e,
                    "failed to handle relay message"
                );
                return Err(e);
            }
        }
    }

    Ok(())
}

async fn run_http_fallback(state: &AppState, site_url: &str) {
    let mut consecutive_failures: u32 = 0;
    for _ in 0..FALLBACK_ROUNDS_BEFORE_RETRY {
        let polled = poll_and_process_http(state, site_url).await;
        state.health.set_relay(polled.is_ok());
        match polled {
            Ok(processed) => {
                consecutive_failures = 0;
                if processed == 0 {
                    tokio::time::sleep(Duration::from_millis(FALLBACK_POLL_INTERVAL_MS)).await;
                }
            }
            Err(e) => {
                consecutive_failures = consecutive_failures.saturating_add(1);
                warn!(error = %e, failures = consecutive_failures, "relay HTTP fallback poll failed");
                if consecutive_failures >= 3 {
                    let _ = register_with_convex(
                        site_url,
                        &state.identity,
                        state.registration_secret.as_deref(),
                        state.lan_ip.as_deref(),
                    )
                    .await;
                }
                tokio::time::sleep(Duration::from_millis(IDLE_BACKOFF_MS)).await;
            }
        }
    }
}

async fn poll_and_process_http(state: &AppState, site_url: &str) -> Result<usize, String> {
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
        if let Err(e) = handle_message(state, &mut RespondVia::Http { site_url }, message).await {
            warn!(request_id = %message.request_id, error = %e, "failed to handle relay message");
        }
    }

    Ok(pending.messages.len())
}

fn parse_pending_result(result: FunctionResult) -> Result<Vec<PendingMessage>, String> {
    let value = match result {
        FunctionResult::Value(value) => value,
        FunctionResult::ErrorMessage(message) => return Err(message),
        FunctionResult::ConvexError(err) => return Err(err.message),
    };
    let json = value.export();
    serde_json::from_value(json).map_err(|e| format!("pendingForMe decode failed: {e}"))
}

async fn handle_message(
    state: &AppState,
    respond_via: &mut RespondVia<'_>,
    message: &PendingMessage,
) -> Result<(), String> {
    let envelope = match parse_envelope(&message.payload) {
        Ok(envelope) => envelope,
        Err(rejection) => {
            let Some((code, text)) = rejection_reply(&rejection) else {
                return Err("unreadable relay envelope".to_string());
            };
            let payload = build_error_response(state, &message.request_id, code, &text);
            return respond(state, respond_via, &message.request_id, payload).await;
        }
    };

    if envelope.request_id != message.request_id {
        debug!(
            envelope_id = %envelope.request_id,
            message_id = %message.request_id,
            "requestId mismatch; using message.requestId"
        );
    }

    if matches!(envelope.message, ToControllerMessage::SessionMint { .. }) {
        let response_payload =
            handle_session_mint(state, &message.request_id, envelope.message).await;
        return respond(state, respond_via, &message.request_id, response_payload).await;
    }

    if envelope_expired(envelope.expires_at, chrono::Utc::now().timestamp_millis()) {
        let payload = build_error_response(
            state,
            &message.request_id,
            "request_expired",
            "This request arrived too late, so nothing changed. Check that this device's clock is right, then try again.",
        );
        return respond(state, respond_via, &message.request_id, payload).await;
    }

    let Some(token) = envelope
        .client_token
        .as_deref()
        .filter(|token| !token.is_empty())
    else {
        let payload = build_error_response(
            state,
            &message.request_id,
            "unauthorized",
            "Invalid client token",
        );
        return respond(state, respond_via, &message.request_id, payload).await;
    };

    let Some(row) = verify_client_token(&state.db, token).await? else {
        let payload = build_error_response(
            state,
            &message.request_id,
            "unauthorized",
            "Invalid client token",
        );
        return respond(state, respond_via, &message.request_id, payload).await;
    };
    let auth = AuthenticatedClient::from_row(row);

    let response_payload = match envelope.message {
        ToControllerMessage::SessionMint { .. } => unreachable!(),
        ToControllerMessage::GetDevices => {
            let devices = state.registry.list().await;
            let mut resources = Vec::with_capacity(devices.len());
            for device in devices {
                resources.push(state.registry.to_resource(state, &device).await);
            }
            build_devices_response(state, &message.request_id, resources)
        }
        ToControllerMessage::GetRooms => typed_outcome(
            state,
            &message.request_id,
            load_rooms(state).await,
            |rooms| json!({ "type": "rooms", "rooms": rooms }),
        ),
        ToControllerMessage::Command {
            ref device_id,
            ref payload,
        } => {
            let result = match Uuid::parse_str(device_id) {
                Ok(id) => execute_set(state, &message.request_id, id, payload.clone()).await,
                Err(_) => Err(crate::commands::CommandError::DeviceNotFound),
            };
            match result {
                Ok(outcome) => build_command_result(
                    state,
                    &message.request_id,
                    true,
                    Some(outcome.as_str()),
                    None,
                ),
                Err(err) => build_command_result(
                    state,
                    &message.request_id,
                    false,
                    None,
                    Some((err.code(), err.to_string())),
                ),
            }
        }
        ToControllerMessage::ListMembers => typed_outcome(
            state,
            &message.request_id,
            list_household_members(state).await,
            |members| json!({ "type": "members", "members": members }),
        ),
        ToControllerMessage::InviteMember { email } => typed_outcome(
            state,
            &message.request_id,
            invite_member(state, &auth, &email).await,
            |member| json!({ "type": "member", "member": member }),
        ),
        ToControllerMessage::RemoveMember { member_id } => done_outcome(
            state,
            &message.request_id,
            remove_member(state, &auth, &member_id).await,
        ),
        ToControllerMessage::ListTokens => typed_outcome(
            state,
            &message.request_id,
            list_household_tokens(state).await,
            |tokens| json!({ "type": "tokens", "tokens": tokens }),
        ),
        ToControllerMessage::RevokeToken { token_id } => done_outcome(
            state,
            &message.request_id,
            revoke_household_token(state, &auth, &token_id).await,
        ),
        ToControllerMessage::RevokeCurrent => done_outcome(
            state,
            &message.request_id,
            revoke_current(state, &auth).await,
        ),
        ToControllerMessage::LeaveHome => {
            done_outcome(state, &message.request_id, leave_home(state, &auth).await)
        }
        ToControllerMessage::GetCapabilitySnapshot => {
            let event = DeviceEvent::from_capability_snapshot(state.capabilities.snapshot());
            let message_body = serde_json::to_value(&event).unwrap_or(JsonValue::Null);
            build_typed_response(state, &message.request_id, message_body)
        }
        ToControllerMessage::WatchCapabilityChanges => {
            register_capability_watch(state, auth.token_id, &message.request_id);
            build_typed_response(
                state,
                &message.request_id,
                json!({ "type": "capabilityWatchAck" }),
            )
        }
        ToControllerMessage::HistoryQuery { query } => {
            match crate::capabilities::history_query::query_for_client(state, &auth, query).await {
                Ok(outcome) => match serde_json::to_value(&outcome) {
                    Ok(mut body) => {
                        body["requestId"] = json!(message.request_id);
                        build_typed_response(state, &message.request_id, body)
                    }
                    Err(_) => build_error_response(
                        state,
                        &message.request_id,
                        "history_unavailable",
                        "History query failed",
                    ),
                },
                Err(error) => {
                    build_error_response(state, &message.request_id, error.code(), error.message())
                }
            }
        }
        ToControllerMessage::GetHomeMeterDesignation => {
            match crate::capabilities::home_meter::read_designation_for_client(state, &auth).await {
                Ok(designation) => build_typed_response(
                    state,
                    &message.request_id,
                    json!({
                        "type": "homeMeterDesignation",
                        "requestId": message.request_id,
                        "designation": designation,
                    }),
                ),
                Err(error) => {
                    build_error_response(state, &message.request_id, error.code(), &error.message())
                }
            }
        }
        ToControllerMessage::DesignateHomeMeter { selection } => {
            match crate::capabilities::home_meter::designate_for_client(state, &auth, selection)
                .await
            {
                Ok(designation) => build_typed_response(
                    state,
                    &message.request_id,
                    json!({
                        "type": "homeMeterDesignation",
                        "requestId": message.request_id,
                        "designation": designation,
                    }),
                ),
                Err(error) => {
                    build_error_response(state, &message.request_id, error.code(), &error.message())
                }
            }
        }
        ToControllerMessage::ExportHistoryBackup => {
            match crate::capabilities::history_backup::export_for_client(state, &auth).await {
                Ok(archive) => build_typed_response(
                    state,
                    &message.request_id,
                    json!({
                        "type": "historyBackup",
                        "requestId": message.request_id,
                        "archive": archive,
                    }),
                ),
                Err(error) => {
                    build_error_response(state, &message.request_id, error.code(), error.message())
                }
            }
        }
        ToControllerMessage::ImportHistoryBackup { archive } => {
            match crate::capabilities::history_backup::import_for_client(state, &auth, &archive)
                .await
            {
                Ok(()) => build_typed_response(
                    state,
                    &message.request_id,
                    json!({
                        "type": "historyBackupRestored",
                        "requestId": message.request_id,
                    }),
                ),
                Err(error) => {
                    build_error_response(state, &message.request_id, error.code(), error.message())
                }
            }
        }
        ToControllerMessage::SwitchReleaseChannel { channel } => body_outcome(
            state,
            &message.request_id,
            "switchReleaseChannel",
            crate::api::updates::switch_release_channel(state, &auth, &channel).await,
        ),
        ToControllerMessage::InstallRelease { platform_version } => body_outcome(
            state,
            &message.request_id,
            "installRelease",
            crate::api::updates::install_release(state, &auth, platform_version.as_deref()).await,
        ),
        ToControllerMessage::RollbackRelease => body_outcome(
            state,
            &message.request_id,
            "rollbackRelease",
            crate::api::updates::rollback_release(state, &auth).await,
        ),
        ToControllerMessage::RenameDevice { device_id, name } => device_outcome(
            state,
            &message.request_id,
            setup::rename_device(state, &auth, &device_id, &name).await,
        ),
        ToControllerMessage::AssignRoom {
            device_id,
            component_id,
            room_id,
        } => device_outcome(
            state,
            &message.request_id,
            setup::assign_room(
                state,
                &auth,
                setup::RoomAssignment {
                    device_id,
                    component_id,
                    room_id,
                },
            )
            .await,
        ),
        ToControllerMessage::RemoveDevice { device_id } => done_outcome(
            state,
            &message.request_id,
            setup::remove_device(state, &auth, &device_id).await,
        ),
        ToControllerMessage::CreateRoom { name, sort_order } => room_outcome(
            state,
            &message.request_id,
            setup::create_room(state, &auth, &name, sort_order).await,
        ),
        ToControllerMessage::UpdateRoom {
            room_id,
            name,
            sort_order,
        } => room_outcome(
            state,
            &message.request_id,
            setup::update_room(state, &auth, &room_id, name.as_deref(), sort_order).await,
        ),
        ToControllerMessage::DeleteRoom {
            room_id,
            destination_room_id,
        } => done_outcome(
            state,
            &message.request_id,
            setup::delete_room(state, &auth, &room_id, destination_room_id.as_deref()).await,
        ),
        ToControllerMessage::CancelMatterCommission => typed_outcome(
            state,
            &message.request_id,
            crate::commissioning::cancel_matter_commission(state, &auth).await,
            |()| json!({ "type": "cancelMatterCommission", "ok": true }),
        ),
        ToControllerMessage::PermitJoin { seconds } => typed_outcome(
            state,
            &message.request_id,
            crate::commissioning::permit_zigbee_join(
                state,
                &auth,
                crate::commissioning::Via::Relay,
                seconds,
            )
            .await,
            |seconds| json!({ "type": "permitJoin", "ok": true, "seconds": seconds }),
        ),
        ToControllerMessage::GetSession => body_outcome(
            state,
            &message.request_id,
            "session",
            crate::api::session::read_session(state, &auth).await,
        ),
        ToControllerMessage::GetHealthSummary => body_outcome(
            state,
            &message.request_id,
            "healthSummary",
            crate::api::health::read_health_summary(state, &auth).await,
        ),
        ToControllerMessage::ReleaseStatus => body_outcome(
            state,
            &message.request_id,
            "releaseStatus",
            crate::api::updates::read_release_status(state, &auth).await,
        ),
    };

    respond(state, respond_via, &message.request_id, response_payload).await
}

async fn handle_session_mint(
    state: &AppState,
    request_id: &str,
    message: ToControllerMessage,
) -> String {
    let ToControllerMessage::SessionMint {
        user_id,
        email,
        client_label,
        display_name,
    } = message
    else {
        return build_error_response(
            state,
            request_id,
            "internal_error",
            "Unexpected mint payload",
        );
    };

    match mint_session(
        state,
        SessionMintInput {
            user_id,
            email,
            client_label,
            display_name,
        },
    )
    .await
    {
        Ok(result) => build_typed_response(
            state,
            request_id,
            json!({
                "type": "sessionMintResult",
                "clientToken": result.client_token,
                "controllerId": result.controller_id,
            }),
        ),
        Err(err) => build_error_response(state, request_id, &err.code, &err.message),
    }
}

async fn respond(
    state: &AppState,
    respond_via: &mut RespondVia<'_>,
    request_id: &str,
    payload: String,
) -> Result<(), String> {
    match respond_via {
        RespondVia::Convex(client) => {
            let mut args = BTreeMap::new();
            args.insert("requestId".into(), Value::from(request_id));
            args.insert("payload".into(), Value::from(payload.as_str()));
            match client
                .mutation("relay:respondAsController", args)
                .await
                .map_err(|e| format!("respond mutation failed: {e}"))?
            {
                FunctionResult::Value(_) => Ok(()),
                FunctionResult::ErrorMessage(message) => Err(message),
                FunctionResult::ConvexError(err) => Err(err.message),
            }
        }
        RespondVia::Http { site_url } => {
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
    }
}

fn build_devices_response<T: Serialize>(state: &AppState, request_id: &str, devices: T) -> String {
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

fn build_typed_response(state: &AppState, request_id: &str, message: JsonValue) -> String {
    let envelope = json!({
        "requestId": request_id,
        "signature": "",
        "message": message,
    });
    sign_envelope(state, envelope)
}

fn build_command_result(
    state: &AppState,
    request_id: &str,
    ok: bool,
    outcome: Option<&str>,
    error: Option<(&str, String)>,
) -> String {
    let mut message = json!({
        "type": "commandResult",
        "ok": ok,
    });
    if let Some(outcome) = outcome {
        message["outcome"] = json!(outcome);
    }
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

/// Answers with the message `body` builds, or with the error as a LAN caller
/// would get it.
fn typed_outcome<T, E: Into<ApiError>>(
    state: &AppState,
    request_id: &str,
    result: Result<T, E>,
    body: impl FnOnce(T) -> JsonValue,
) -> String {
    match result {
        Ok(value) => build_typed_response(state, request_id, body(value)),
        Err(error) => build_api_error_response(state, request_id, &error.into()),
    }
}

/// Answers with the LAN response body, plus the Relay message `type`.
fn body_outcome<T: Serialize, E: Into<ApiError>>(
    state: &AppState,
    request_id: &str,
    message_type: &str,
    result: Result<T, E>,
) -> String {
    let result = result.map_err(Into::into).and_then(|value| {
        serde_json::to_value(value).map_err(|error| ApiError::internal(error.to_string()))
    });
    typed_outcome(state, request_id, result, |mut body| {
        body["type"] = json!(message_type);
        body
    })
}

fn device_outcome(
    state: &AppState,
    request_id: &str,
    result: Result<crate::events::DeviceResource, setup::SetupError>,
) -> String {
    typed_outcome(
        state,
        request_id,
        result,
        |device| json!({ "type": "device", "device": device }),
    )
}

fn room_outcome(
    state: &AppState,
    request_id: &str,
    result: Result<crate::events::RoomResource, setup::SetupError>,
) -> String {
    typed_outcome(
        state,
        request_id,
        result,
        |room| json!({ "type": "room", "room": room }),
    )
}

fn done_outcome<E: Into<ApiError>>(
    state: &AppState,
    request_id: &str,
    result: Result<(), E>,
) -> String {
    match result {
        Ok(()) => build_command_result(state, request_id, true, None, None),
        Err(error) => build_api_error_response(state, request_id, &error.into()),
    }
}

/// An error over Relay carries the same code, message, and details as on LAN.
fn build_api_error_response(state: &AppState, request_id: &str, error: &ApiError) -> String {
    let mut body = json!({ "code": error.code, "message": error.message });
    if let Some(details) = &error.details {
        body["details"] = (**details).clone();
    }
    build_typed_response(
        state,
        request_id,
        json!({ "type": "commandResult", "ok": false, "error": body }),
    )
}

fn build_error_response(state: &AppState, request_id: &str, code: &str, message: &str) -> String {
    build_command_result(
        state,
        request_id,
        false,
        None,
        Some((code, message.to_string())),
    )
}

fn sign_envelope(state: &AppState, mut envelope: JsonValue) -> String {
    // Sign the message body (without signature) so clients can verify authenticity.
    let to_sign = envelope.get("message").cloned().unwrap_or(JsonValue::Null);
    let bytes = serde_json::to_vec(&to_sign).unwrap_or_default();
    let signature = state.identity.keypair.sign_b64(&bytes);
    envelope["signature"] = json!(signature);
    envelope.to_string()
}

fn spawn_capability_watch_pushes(state: AppState, site_url: String) {
    tokio::spawn(async move {
        let mut changes = state.capabilities.subscribe();
        loop {
            let message = match changes.recv().await {
                Ok(change) => {
                    serde_json::to_value(DeviceEvent::from_capability_change(change)).ok()
                }
                Err(RecvError::Lagged(skipped)) => {
                    warn!(
                        skipped,
                        "capability relay consumer lagged; pushing a snapshot"
                    );
                    serde_json::to_value(DeviceEvent::from_capability_snapshot(
                        state.capabilities.snapshot(),
                    ))
                    .ok()
                }
                Err(RecvError::Closed) => break,
            };
            if let Some(message) = message {
                push_capability_message(&state, &site_url, message).await;
            }
        }
    });
}

async fn push_capability_message(state: &AppState, site_url: &str, message: JsonValue) {
    for watch in live_capability_watches(state) {
        let payload = build_typed_response(state, &watch.request_id, message.clone());
        if let Err(error) = respond(
            state,
            &mut RespondVia::Http { site_url },
            &watch.request_id,
            payload,
        )
        .await
        {
            warn!(
                request_id = %watch.request_id,
                error = %error,
                "failed to push Capability message"
            );
        }
    }
}

fn register_capability_watch(state: &AppState, token_id: Uuid, request_id: &str) {
    let mut watches = state
        .capability_watches
        .lock()
        .expect("capability watch lock");
    let now = Instant::now();
    watches.retain(|watch| watch.token_id != token_id && watch.expires_at > now);
    watches.push(CapabilityWatch {
        request_id: request_id.to_string(),
        token_id,
        expires_at: now + CAPABILITY_WATCH_TTL,
    });
}

fn live_capability_watches(state: &AppState) -> Vec<CapabilityWatch> {
    let mut watches = state
        .capability_watches
        .lock()
        .expect("capability watch lock");
    let now = Instant::now();
    watches.retain(|watch| watch.expires_at > now);
    watches.clone()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn envelope(message: JsonValue) -> String {
        json!({ "requestId": "r1", "clientToken": "t", "message": message }).to_string()
    }

    #[test]
    fn parses_the_health_summary_request() {
        let parsed = parse_envelope(&envelope(json!({ "type": "getHealthSummary" }))).unwrap();
        assert!(matches!(
            parsed.message,
            ToControllerMessage::GetHealthSummary
        ));
    }

    #[test]
    fn parses_device_and_room_setup_requests() {
        let parsed = parse_envelope(&envelope(json!({
            "type": "renameDevice", "deviceId": "d", "name": "Lamp"
        })))
        .unwrap();
        assert!(matches!(
            parsed.message,
            ToControllerMessage::RenameDevice { ref device_id, ref name }
                if device_id == "d" && name == "Lamp"
        ));

        let parsed = parse_envelope(&envelope(json!({
            "type": "assignRoom", "deviceId": "d", "componentId": "l2", "roomId": null
        })))
        .unwrap();
        assert!(matches!(
            parsed.message,
            ToControllerMessage::AssignRoom { ref component_id, room_id: None, .. }
                if component_id.as_deref() == Some("l2")
        ));
        // A missing roomId is a request error, not a clear.
        assert!(
            parse_envelope(&envelope(json!({
                "type": "assignRoom", "deviceId": "d", "componentId": "l2"
            })))
            .is_err()
        );

        for message in [
            json!({ "type": "removeDevice", "deviceId": "d" }),
            json!({ "type": "createRoom", "name": "Den" }),
            json!({ "type": "updateRoom", "roomId": "r", "name": "Den" }),
        ] {
            assert!(
                parse_envelope(&envelope(message.clone())).is_ok(),
                "{message}"
            );
        }
    }

    #[test]
    fn parses_session_requests() {
        let parsed = parse_envelope(&envelope(json!({ "type": "getSession" }))).unwrap();
        assert!(matches!(parsed.message, ToControllerMessage::GetSession));
    }

    #[test]
    fn delete_room_requires_a_destination_or_no_room() {
        let parsed = parse_envelope(&envelope(json!({
            "type": "deleteRoom", "roomId": "r", "destinationRoomId": "d"
        })))
        .unwrap();
        assert!(matches!(
            parsed.message,
            ToControllerMessage::DeleteRoom { ref room_id, ref destination_room_id }
                if room_id == "r" && destination_room_id.as_deref() == Some("d")
        ));
        let parsed = parse_envelope(&envelope(json!({
            "type": "deleteRoom", "roomId": "r", "destinationRoomId": null
        })))
        .unwrap();
        assert!(matches!(
            parsed.message,
            ToControllerMessage::DeleteRoom {
                destination_room_id: None,
                ..
            }
        ));
        // A missing destination is a request error, not No Room.
        assert!(matches!(
            parse_envelope(&envelope(json!({ "type": "deleteRoom", "roomId": "r" }))),
            Err(EnvelopeRejection::ProtocolMismatch { .. })
        ));
    }

    #[test]
    fn unknown_request_types_are_unsupported_actions() {
        let rejection = parse_envelope(&envelope(json!({ "type": "teleportDevice" }))).unwrap_err();
        assert_eq!(
            rejection,
            EnvelopeRejection::UnsupportedAction {
                request_id: "r1".into(),
                action: "teleportDevice".into(),
            }
        );
    }

    #[test]
    fn first_owner_bootstrap_is_not_a_relay_action() {
        // First-Owner bootstrap pairs on the home network with CPace (NEM-126).
        let rejection = parse_envelope(&envelope(json!({
            "type": "bootstrapOwner",
            "userId": "user_1",
            "email": "owner@example.com",
        })))
        .unwrap_err();
        assert_eq!(
            rejection,
            EnvelopeRejection::UnsupportedAction {
                request_id: "r1".into(),
                action: "bootstrapOwner".into(),
            }
        );
    }

    #[test]
    fn zigbee_join_and_matter_cancel_are_accepted_over_relay() {
        let parsed =
            parse_envelope(&envelope(json!({ "type": "permitJoin", "seconds": 180 }))).unwrap();
        assert!(matches!(
            parsed.message,
            ToControllerMessage::PermitJoin { seconds: Some(180) }
        ));
        for message in [
            json!({ "type": "cancelMatterCommission" }),
            json!({ "type": "permitJoin" }),
        ] {
            assert!(
                parse_envelope(&envelope(message.clone())).is_ok(),
                "{message}"
            );
        }
    }

    #[test]
    fn pairing_codes_and_wifi_credentials_are_refused_over_relay() {
        for message in [
            json!({ "type": "commissionMatter", "code": "34970112332" }),
            json!({ "type": "commissionMatter", "code": 7, "wifiPassword": ["hunter2"] }),
            json!({ "type": "getMatterWifi" }),
            json!({ "type": "saveMatterWifi", "wifiSsid": "home", "wifiPassword": "hunter2" }),
        ] {
            let action = message["type"].as_str().unwrap().to_string();
            let rejection = parse_envelope(&envelope(message)).unwrap_err();
            assert_eq!(
                rejection,
                EnvelopeRejection::LanOnly {
                    request_id: "r1".into(),
                    action: action.clone(),
                }
            );
            let (code, text) = rejection_reply(&rejection).unwrap();
            assert_eq!(code, "unsupported_action");
            for secret in ["34970112332", "hunter2"] {
                assert!(!text.contains(secret), "{action}: {text}");
            }
        }
    }

    #[test]
    fn a_write_that_outlived_its_sender_is_expired() {
        assert!(!envelope_expired(None, 1_000_000));
        assert!(!envelope_expired(Some(1_000_000), 1_000_000));
        assert!(!envelope_expired(
            Some(1_000_000),
            1_000_000 + EXPIRY_CLOCK_SKEW_MS
        ));
        assert!(envelope_expired(
            Some(1_000_000),
            1_000_001 + EXPIRY_CLOCK_SKEW_MS
        ));
        let parsed = parse_envelope(
            &json!({
                "requestId": "r1", "clientToken": "t", "expiresAt": 42,
                "message": { "type": "leaveHome" }
            })
            .to_string(),
        )
        .unwrap();
        assert_eq!(parsed.expires_at, Some(42));
    }

    #[test]
    fn an_install_carries_the_confirmed_release_when_the_client_sends_one() {
        for (message, expected) in [
            (json!({ "type": "installRelease" }), None),
            (
                json!({ "type": "installRelease", "platformVersion": "0.4.10" }),
                Some("0.4.10"),
            ),
        ] {
            let parsed = parse_envelope(&envelope(message)).unwrap();
            assert!(matches!(
                parsed.message,
                ToControllerMessage::InstallRelease { ref platform_version }
                    if platform_version.as_deref() == expected
            ));
        }
    }

    #[test]
    fn unknown_actions_reply_with_unsupported_action() {
        let rejection = parse_envelope(&envelope(json!({ "type": "teleportDevice" }))).unwrap_err();
        let (code, text) = rejection_reply(&rejection).unwrap();
        assert_eq!(code, "unsupported_action");
        assert!(text.contains("teleportDevice"), "{text}");
        assert!(rejection_reply(&EnvelopeRejection::Unreadable).is_none());
    }

    #[test]
    fn malformed_known_requests_are_protocol_mismatches() {
        let rejection = parse_envelope(&envelope(json!({ "type": "renameDevice", "deviceId": 7 })))
            .unwrap_err();
        assert!(matches!(
            rejection,
            EnvelopeRejection::ProtocolMismatch { ref request_id, .. } if request_id == "r1"
        ));
        assert!(matches!(
            parse_envelope("not json").unwrap_err(),
            EnvelopeRejection::Unreadable
        ));
    }

    #[test]
    fn leave_home_and_revoke_current_take_no_arguments() {
        let leave: ToControllerEnvelope = serde_json::from_str(
            r#"{"requestId":"r1","clientToken":"t","message":{"type":"leaveHome"}}"#,
        )
        .unwrap();
        assert!(matches!(leave.message, ToControllerMessage::LeaveHome));
        let revoke: ToControllerEnvelope = serde_json::from_str(
            r#"{"requestId":"r2","clientToken":"t","message":{"type":"revokeCurrent"}}"#,
        )
        .unwrap();
        assert!(matches!(revoke.message, ToControllerMessage::RevokeCurrent));
    }
}
