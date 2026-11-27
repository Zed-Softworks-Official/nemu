//! The actions a sealed Relay request can carry, and running them.
//!
//! A request's plaintext is one action as JSON (`{"type": ...}`); the reply's
//! plaintext is one message in the same shape LAN callers get (ADR-0023).

use serde::Deserialize;
use serde_json::{Value as JsonValue, json};
use uuid::Uuid;

use crate::api::access::{leave_home, revoke_current};
use crate::api::auth::AuthenticatedClient;
use crate::api::error::ApiError;
use crate::api::members::{invite_member, list_household_members, remove_member};
use crate::api::pairing::{list_household_access_clients, revoke_household_access_client};
use crate::api::rooms::load_rooms;
use crate::commands::execute_set;
use crate::events::DeviceEvent;
use crate::relay_crypto::envelope::{RequestHeader, RequestKeys};
use crate::setup;
use crate::state::AppState;

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub(crate) enum RelayAction {
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
    #[serde(rename = "listMembers")]
    ListMembers,
    #[serde(rename = "inviteMember")]
    InviteMember { email: String },
    #[serde(rename = "removeMember")]
    RemoveMember {
        #[serde(rename = "memberId")]
        member_id: String,
    },
    #[serde(rename = "listAccessClients")]
    ListAccessClients,
    #[serde(rename = "revokeAccessClient")]
    RevokeAccessClient {
        #[serde(rename = "accessClientId")]
        access_client_id: String,
    },
    #[serde(rename = "revokeCurrent")]
    RevokeCurrent,
    #[serde(rename = "leaveHome")]
    LeaveHome,
    #[serde(rename = "getCapabilitySnapshot")]
    GetCapabilitySnapshot,
    #[serde(rename = "watchCapabilityChanges")]
    WatchCapabilityChanges {
        /// The requestId of the watch this one renews, which it replaces.
        #[serde(default)]
        renews: Option<String>,
    },
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

impl RelayAction {
    /// Reads change nothing and store no outcome. Every other action is a
    /// write: its outcome is stored, and a retry gets it back.
    pub(crate) fn is_read(&self) -> bool {
        matches!(
            self,
            RelayAction::GetDevices
                | RelayAction::GetRooms
                | RelayAction::ListMembers
                | RelayAction::ListAccessClients
                | RelayAction::GetCapabilitySnapshot
                | RelayAction::WatchCapabilityChanges { .. }
                | RelayAction::HistoryQuery { .. }
                | RelayAction::GetHomeMeterDesignation
                | RelayAction::ExportHistoryBackup
                | RelayAction::ReleaseStatus
                | RelayAction::GetSession
                | RelayAction::GetHealthSummary
        )
    }

    pub(crate) fn is_command(&self) -> bool {
        matches!(self, RelayAction::Command { .. })
    }
}

/// Why a decrypted request could not become an action (ADR-0016).
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum ActionRejection {
    /// This Controller does not know the requested action.
    UnsupportedAction { action: String },
    /// An action that needs the Home network arrived over Relay
    /// ([`LAN_ONLY_ACTIONS`]).
    LanOnly { action: String },
    /// A known action arrived in a shape this Controller cannot read.
    ProtocolMismatch { detail: String },
    /// Not a JSON action at all. Carries no detail, because a parse error
    /// can quote the plaintext.
    Unreadable,
}

/// Actions that only run over LAN, refused before their contents are
/// parsed. They carry Matter pairing codes or Wi-Fi credentials. Envelopes
/// are now sealed end to end, but ADR-0034's interim limit stands until
/// NEM-98 lifts it. Clients refuse to send them; this is defence in depth. A
/// Presence check that gains a Relay message belongs here too.
pub(crate) const LAN_ONLY_ACTIONS: &[&str] =
    &["commissionMatter", "getMatterWifi", "saveMatterWifi"];

pub(crate) fn parse_action(plaintext: &[u8]) -> Result<RelayAction, ActionRejection> {
    let raw: JsonValue =
        serde_json::from_slice(plaintext).map_err(|_| ActionRejection::Unreadable)?;
    let Some(action) = raw
        .get("type")
        .and_then(JsonValue::as_str)
        .map(str::to_string)
    else {
        return Err(ActionRejection::Unreadable);
    };
    if LAN_ONLY_ACTIONS.contains(&action.as_str()) {
        return Err(ActionRejection::LanOnly { action });
    }
    serde_json::from_value::<RelayAction>(raw).map_err(|error| {
        if error.to_string().starts_with("unknown variant") {
            ActionRejection::UnsupportedAction { action }
        } else {
            ActionRejection::ProtocolMismatch {
                detail: error.to_string(),
            }
        }
    })
}

/// The error answering a refused action.
pub(crate) fn rejection_reply(rejection: &ActionRejection) -> JsonValue {
    match rejection {
        ActionRejection::UnsupportedAction { action } => error_message(
            "unsupported_action",
            &format!("This Controller does not support {action:?}. Update the Controller."),
        ),
        ActionRejection::LanOnly { action } => error_message(
            "unsupported_action",
            &format!(
                "{action:?} is not available over Relay. It needs this phone on the Home network."
            ),
        ),
        ActionRejection::ProtocolMismatch { detail } => error_message(
            "protocol_mismatch",
            &format!("This Controller cannot read the request: {detail}"),
        ),
        ActionRejection::Unreadable => error_message(
            "protocol_mismatch",
            "This Controller cannot read the request.",
        ),
    }
}

/// Runs `action` for `auth` and returns the reply message. A Command is
/// admitted to the Command ledger under `command_ledger_id`.
pub(crate) async fn dispatch(
    state: &AppState,
    auth: &AuthenticatedClient,
    request: (&RequestHeader, &RequestKeys),
    command_ledger_id: &str,
    action: RelayAction,
) -> JsonValue {
    let (header, keys) = request;
    let request_id = header.request_id.as_str();
    match action {
        RelayAction::GetDevices => {
            let devices = state.registry.list().await;
            let mut resources = Vec::with_capacity(devices.len());
            for device in devices {
                resources.push(state.registry.to_resource(state, &device).await);
            }
            build_devices_response(resources)
        }
        RelayAction::GetRooms => typed_outcome(
            load_rooms(state).await,
            |rooms| json!({ "type": "rooms", "rooms": rooms }),
        ),
        RelayAction::Command {
            ref device_id,
            ref payload,
        } => {
            let result = match Uuid::parse_str(device_id) {
                Ok(id) => execute_set(state, command_ledger_id, id, payload.clone()).await,
                Err(_) => Err(crate::commands::CommandError::DeviceNotFound),
            };
            match result {
                Ok(outcome) => build_command_result(true, Some(outcome.as_str()), None),
                Err(err) => build_command_result(false, None, Some((err.code(), err.to_string()))),
            }
        }
        RelayAction::ListMembers => typed_outcome(
            list_household_members(state).await,
            |members| json!({ "type": "members", "members": members }),
        ),
        RelayAction::InviteMember { email } => typed_outcome(
            invite_member(state, auth, &email).await,
            |member| json!({ "type": "member", "member": member }),
        ),
        RelayAction::RemoveMember { member_id } => {
            done_outcome(remove_member(state, auth, &member_id).await)
        }
        RelayAction::ListAccessClients => typed_outcome(
            list_household_access_clients(state).await,
            |access_clients| json!({ "type": "accessClients", "accessClients": access_clients }),
        ),
        RelayAction::RevokeAccessClient { access_client_id } => {
            done_outcome(revoke_household_access_client(state, auth, &access_client_id).await)
        }
        RelayAction::RevokeCurrent => done_outcome(revoke_current(state, auth).await),
        RelayAction::LeaveHome => done_outcome(leave_home(state, auth).await),
        RelayAction::GetCapabilitySnapshot => {
            let event = DeviceEvent::from_capability_snapshot(state.capabilities.snapshot());
            serde_json::to_value(&event).unwrap_or(JsonValue::Null)
        }
        RelayAction::WatchCapabilityChanges { renews } => {
            // Bound to the Access Client; pushes are sealed with the key
            // exported from this request.
            match crate::relay::watches::register(
                state,
                auth.access_client_id,
                header,
                keys,
                renews.as_deref(),
            )
            .await
            {
                Ok(()) => json!({ "type": "capabilityWatchAck" }),
                Err(error) => {
                    tracing::warn!(%error, "capability watch registration failed");
                    error_message(
                        "watch_unavailable",
                        "Live updates are unavailable right now.",
                    )
                }
            }
        }
        RelayAction::HistoryQuery { query } => {
            match crate::capabilities::history_query::query_for_client(state, auth, query).await {
                Ok(outcome) => match serde_json::to_value(&outcome) {
                    Ok(mut body) => {
                        body["requestId"] = json!(request_id);
                        body
                    }
                    Err(_) => error_message("history_unavailable", "History query failed"),
                },
                Err(error) => error_message(error.code(), error.message()),
            }
        }
        RelayAction::GetHomeMeterDesignation => {
            match crate::capabilities::home_meter::read_designation_for_client(state, auth).await {
                Ok(designation) => json!({
                    "type": "homeMeterDesignation",
                    "requestId": request_id,
                    "designation": designation,
                }),
                Err(error) => error_message(error.code(), &error.message()),
            }
        }
        RelayAction::DesignateHomeMeter { selection } => {
            match crate::capabilities::home_meter::designate_for_client(state, auth, selection)
                .await
            {
                Ok(designation) => json!({
                    "type": "homeMeterDesignation",
                    "requestId": request_id,
                    "designation": designation,
                }),
                Err(error) => error_message(error.code(), &error.message()),
            }
        }
        RelayAction::ExportHistoryBackup => {
            match crate::capabilities::history_backup::export_for_client(state, auth).await {
                Ok(archive) => json!({
                    "type": "historyBackup",
                    "requestId": request_id,
                    "archive": archive,
                }),
                Err(error) => error_message(error.code(), error.message()),
            }
        }
        RelayAction::ImportHistoryBackup { archive } => {
            match crate::capabilities::history_backup::import_for_client(state, auth, &archive)
                .await
            {
                Ok(()) => json!({
                    "type": "historyBackupRestored",
                    "requestId": request_id,
                }),
                Err(error) => error_message(error.code(), error.message()),
            }
        }
        RelayAction::SwitchReleaseChannel { channel } => body_outcome(
            "switchReleaseChannel",
            crate::api::updates::switch_release_channel(state, auth, &channel).await,
        ),
        RelayAction::InstallRelease { platform_version } => body_outcome(
            "installRelease",
            crate::api::updates::install_release(state, auth, platform_version.as_deref()).await,
        ),
        RelayAction::RollbackRelease => body_outcome(
            "rollbackRelease",
            crate::api::updates::rollback_release(state, auth).await,
        ),
        RelayAction::RenameDevice { device_id, name } => {
            device_outcome(setup::rename_device(state, auth, &device_id, &name).await)
        }
        RelayAction::AssignRoom {
            device_id,
            component_id,
            room_id,
        } => device_outcome(
            setup::assign_room(
                state,
                auth,
                setup::RoomAssignment {
                    device_id,
                    component_id,
                    room_id,
                },
            )
            .await,
        ),
        RelayAction::RemoveDevice { device_id } => {
            done_outcome(setup::remove_device(state, auth, &device_id).await)
        }
        RelayAction::CreateRoom { name, sort_order } => {
            room_outcome(setup::create_room(state, auth, &name, sort_order).await)
        }
        RelayAction::UpdateRoom {
            room_id,
            name,
            sort_order,
        } => room_outcome(
            setup::update_room(state, auth, &room_id, name.as_deref(), sort_order).await,
        ),
        RelayAction::DeleteRoom {
            room_id,
            destination_room_id,
        } => done_outcome(
            setup::delete_room(state, auth, &room_id, destination_room_id.as_deref()).await,
        ),
        RelayAction::CancelMatterCommission => typed_outcome(
            crate::commissioning::cancel_matter_commission(state, auth).await,
            |()| json!({ "type": "cancelMatterCommission", "ok": true }),
        ),
        RelayAction::PermitJoin { seconds } => typed_outcome(
            crate::commissioning::permit_zigbee_join(
                state,
                auth,
                crate::commissioning::Via::Relay,
                seconds,
            )
            .await,
            |seconds| json!({ "type": "permitJoin", "ok": true, "seconds": seconds }),
        ),
        RelayAction::GetSession => body_outcome(
            "session",
            crate::api::session::read_session(state, auth).await,
        ),
        RelayAction::GetHealthSummary => body_outcome(
            "healthSummary",
            crate::api::health::read_health_summary(state, auth).await,
        ),
        RelayAction::ReleaseStatus => body_outcome(
            "releaseStatus",
            crate::api::updates::read_release_status(state, auth).await,
        ),
    }
}

fn build_devices_response<T: serde::Serialize>(devices: T) -> JsonValue {
    json!({ "type": "devices", "devices": devices })
}

fn build_command_result(
    ok: bool,
    outcome: Option<&str>,
    error: Option<(&str, String)>,
) -> JsonValue {
    let mut message = json!({ "type": "commandResult", "ok": ok });
    if let Some(outcome) = outcome {
        message["outcome"] = json!(outcome);
    }
    if let Some((code, msg)) = error {
        message["error"] = json!({ "code": code, "message": msg });
    }
    message
}

/// The message `body` builds, or the error as a LAN caller would get it.
fn typed_outcome<T, E: Into<ApiError>>(
    result: Result<T, E>,
    body: impl FnOnce(T) -> JsonValue,
) -> JsonValue {
    match result {
        Ok(value) => body(value),
        Err(error) => api_error_message(&error.into()),
    }
}

/// The LAN response body, plus the Relay message `type`.
fn body_outcome<T: serde::Serialize, E: Into<ApiError>>(
    message_type: &str,
    result: Result<T, E>,
) -> JsonValue {
    let result = result.map_err(Into::into).and_then(|value| {
        serde_json::to_value(value).map_err(|error| ApiError::internal(error.to_string()))
    });
    typed_outcome(result, |mut body| {
        body["type"] = json!(message_type);
        body
    })
}

fn device_outcome(result: Result<crate::events::DeviceResource, setup::SetupError>) -> JsonValue {
    typed_outcome(
        result,
        |device| json!({ "type": "device", "device": device }),
    )
}

fn room_outcome(result: Result<crate::events::RoomResource, setup::SetupError>) -> JsonValue {
    typed_outcome(result, |room| json!({ "type": "room", "room": room }))
}

fn done_outcome<E: Into<ApiError>>(result: Result<(), E>) -> JsonValue {
    match result {
        Ok(()) => build_command_result(true, None, None),
        Err(error) => api_error_message(&error.into()),
    }
}

/// An error over Relay carries the same code, message, and details as on LAN.
pub(crate) fn api_error_message(error: &ApiError) -> JsonValue {
    let mut body = json!({ "code": error.code, "message": error.message });
    if let Some(details) = &error.details {
        body["details"] = (**details).clone();
    }
    json!({ "type": "commandResult", "ok": false, "error": body })
}

pub(crate) fn error_message(code: &str, message: &str) -> JsonValue {
    build_command_result(false, None, Some((code, message.to_string())))
}
