use axum::extract::State;
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::response::IntoResponse;
use futures_util::{SinkExt, StreamExt};
use tokio::sync::broadcast::error::RecvError;
use tracing::{debug, warn};
use uuid::Uuid;

use crate::api::auth::AuthenticatedClient;
use crate::capabilities::history_query::{self, HistoryQueryError};
use crate::commands::execute_set;
use crate::events::{ClientWsMessage, DeviceEvent};
use crate::state::AppState;

pub async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
    auth: AuthenticatedClient,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, state, auth))
}

async fn handle_socket(socket: WebSocket, state: AppState, auth: AuthenticatedClient) {
    let (mut sender, mut receiver) = socket.split();
    let mut events = state.events.subscribe();
    let mut capability_events = state.capabilities.subscribe();

    // Prompt client to refetch full device list.
    if let Ok(payload) = serde_json::to_string(&DeviceEvent::Resync) {
        if sender.send(Message::Text(payload.into())).await.is_err() {
            return;
        }
    }

    // Forward health snapshot.
    let health = DeviceEvent::Health {
        mqtt: state.health.mqtt(),
        zigbee: state.health.zigbee(),
        matter: state.health.matter(),
        db: true,
    };
    if let Ok(payload) = serde_json::to_string(&health) {
        if sender.send(Message::Text(payload.into())).await.is_err() {
            return;
        }
    }

    let snapshot = DeviceEvent::from_capability_snapshot(state.capabilities.snapshot());
    if let Ok(payload) = serde_json::to_string(&snapshot) {
        if sender.send(Message::Text(payload.into())).await.is_err() {
            return;
        }
    }

    loop {
        tokio::select! {
            event = events.recv() => {
                match event {
                    Ok(event) => {
                        match serde_json::to_string(&event) {
                            Ok(payload) => {
                                if sender.send(Message::Text(payload.into())).await.is_err() {
                                    break;
                                }
                            }
                            Err(e) => warn!(error = %e, "failed to serialize device event"),
                        }
                    }
                    Err(RecvError::Lagged(n)) => {
                        warn!(skipped = n, "ws consumer lagged; sending resync");
                        let payload = serde_json::to_string(&DeviceEvent::Resync)
                            .unwrap_or_else(|_| r#"{"type":"resync"}"#.to_string());
                        if sender.send(Message::Text(payload.into())).await.is_err() {
                            break;
                        }
                    }
                    Err(RecvError::Closed) => break,
                }
            }
            change = capability_events.recv() => {
                match change {
                    Ok(change) => {
                        let event = DeviceEvent::from_capability_change(change);
                        match serde_json::to_string(&event) {
                            Ok(payload) => {
                                if sender.send(Message::Text(payload.into())).await.is_err() {
                                    break;
                                }
                            }
                            Err(e) => warn!(error = %e, "failed to serialize capability change"),
                        }
                    }
                    Err(RecvError::Lagged(skipped)) => {
                        debug!(skipped, "capability ws consumer lagged; sending snapshot");
                        let snapshot = DeviceEvent::from_capability_snapshot(
                            state.capabilities.snapshot(),
                        );
                        if let Ok(payload) = serde_json::to_string(&snapshot) {
                            if sender.send(Message::Text(payload.into())).await.is_err() {
                                break;
                            }
                        }
                    }
                    Err(RecvError::Closed) => break,
                }
            }
            msg = receiver.next() => {
                match msg {
                    Some(Ok(Message::Text(text))) => {
                        if let Err(e) = handle_client_text(&state, &auth, &mut sender, &text).await {
                            debug!(error = %e, "ws client message error");
                        }
                    }
                    Some(Ok(Message::Ping(payload))) => {
                        if sender.send(Message::Pong(payload)).await.is_err() {
                            break;
                        }
                    }
                    Some(Ok(Message::Close(_))) | None => break,
                    Some(Ok(_)) => {}
                    Some(Err(e)) => {
                        debug!(error = %e, "ws receive error");
                        break;
                    }
                }
            }
        }
    }
}

async fn handle_client_text(
    state: &AppState,
    auth: &AuthenticatedClient,
    sender: &mut futures_util::stream::SplitSink<WebSocket, Message>,
    text: &str,
) -> Result<(), String> {
    let msg: ClientWsMessage =
        serde_json::from_str(text).map_err(|e| format!("invalid client message: {e}"))?;

    match msg {
        ClientWsMessage::Command {
            request_id,
            device_id,
            payload,
        } => {
            let result = match Uuid::parse_str(&device_id) {
                Ok(id) => execute_set(state, &request_id, id, payload).await,
                Err(_) => Err(crate::commands::CommandError::DeviceNotFound),
            };

            let event = match result {
                Ok(outcome) => DeviceEvent::CommandResult {
                    request_id,
                    ok: true,
                    outcome: Some(outcome.as_str().to_string()),
                    error: None,
                },
                Err(err) => DeviceEvent::CommandResult {
                    request_id,
                    ok: false,
                    outcome: None,
                    error: Some(err.to_error_body()),
                },
            };

            let payload = serde_json::to_string(&event).map_err(|e| e.to_string())?;
            sender
                .send(Message::Text(payload.into()))
                .await
                .map_err(|e| e.to_string())?;
        }
        ClientWsMessage::RequestCapabilitySnapshot => {
            let snapshot = DeviceEvent::from_capability_snapshot(state.capabilities.snapshot());
            let payload = serde_json::to_string(&snapshot).map_err(|e| e.to_string())?;
            sender
                .send(Message::Text(payload.into()))
                .await
                .map_err(|e| e.to_string())?;
        }
        ClientWsMessage::HistoryQuery { request_id, query } => {
            let payload = match history_query::query_for_client(state, auth, query).await {
                Ok(response) => {
                    let mut body = serde_json::to_value(&response).map_err(|e| e.to_string())?;
                    body["type"] = serde_json::json!("historyQueryResult");
                    body["requestId"] = serde_json::json!(request_id);
                    body
                }
                Err(error) => history_query_error(&request_id, &error),
            };
            let text = serde_json::to_string(&payload).map_err(|e| e.to_string())?;
            sender
                .send(Message::Text(text.into()))
                .await
                .map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}

fn history_query_error(request_id: &str, error: &HistoryQueryError) -> serde_json::Value {
    serde_json::json!({
        "type": "commandResult",
        "requestId": request_id,
        "ok": false,
        "error": { "code": error.code(), "message": error.message() }
    })
}
