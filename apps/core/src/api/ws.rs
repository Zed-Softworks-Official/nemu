use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::State;
use axum::response::IntoResponse;
use futures_util::{SinkExt, StreamExt};
use tokio::sync::broadcast::error::RecvError;
use tracing::{debug, warn};
use uuid::Uuid;

use crate::commands::execute_set;
use crate::events::{ClientWsMessage, DeviceEvent};
use crate::state::AppState;

pub async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, state))
}

async fn handle_socket(socket: WebSocket, state: AppState) {
    let (mut sender, mut receiver) = socket.split();
    let mut events = state.events.subscribe();

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
        db: true,
    };
    if let Ok(payload) = serde_json::to_string(&health) {
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
            msg = receiver.next() => {
                match msg {
                    Some(Ok(Message::Text(text))) => {
                        if let Err(e) = handle_client_text(&state, &mut sender, &text).await {
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
                Ok(id) => execute_set(state, id, payload).await,
                Err(_) => Err(crate::commands::CommandError::DeviceNotFound),
            };

            let event = match result {
                Ok(()) => DeviceEvent::CommandResult {
                    request_id,
                    ok: true,
                    error: None,
                },
                Err(err) => DeviceEvent::CommandResult {
                    request_id,
                    ok: false,
                    error: Some(err.to_error_body()),
                },
            };

            let payload = serde_json::to_string(&event).map_err(|e| e.to_string())?;
            sender
                .send(Message::Text(payload.into()))
                .await
                .map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}
