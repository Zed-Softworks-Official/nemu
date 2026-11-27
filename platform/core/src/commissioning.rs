//! Device commissioning: Matter code entry, the Controller's saved Matter
//! Wi-Fi, and Zigbee permit-join.
//!
//! Each operation is one function that the LAN HTTP handler and the Relay
//! handler both call, so authorization cannot differ between the two paths
//! (ADR-0023). Every active Membership may commission (ADR-0034), but nothing
//! carrying a Matter pairing code or Wi-Fi credentials crosses Relay until
//! its envelopes are encrypted end to end (NEM-63): over Relay only Zigbee
//! permit-join, and cancelling Matter, are available. Each commissioning started over Relay writes one Audit log
//! entry before it starts, naming the Membership, the Access Client, and the
//! protocol, and carrying no Device identifiers. The Controller stays the only
//! Matter commissioner and fabric authority (ADR-0007): the phone only sends
//! the pairing code.

use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::api::auth::AuthenticatedClient;
use crate::api::error::ApiError;
use crate::audit::{self, AuditKind, AuditWrite};
use crate::config::Protocol;
use crate::db::models::Member;
use crate::identity::{get_string, set_string};
use crate::pairing::members::active_membership;
use crate::state::{AppState, DbPool};

const KEY_WIFI_SSID: &str = "matter_wifi_ssid";
const KEY_WIFI_PASSWORD: &str = "matter_wifi_password";

/// Seconds the Zigbee network stays open when the caller does not say.
const DEFAULT_PERMIT_JOIN_SECONDS: u32 = 120;
/// Zigbee2MQTT's longest permit-join window.
const MAX_PERMIT_JOIN_SECONDS: u32 = 254;

/// The path a commissioning request arrived on.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Via {
    Lan,
    Relay,
}

/// A Matter commissioning request: a QR `MT:` payload or an 11/21-digit
/// manual code. Wi-Fi is reused from the Controller's saved network when
/// omitted.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommissionRequest {
    pub code: String,
    #[serde(default)]
    pub wifi_ssid: Option<String>,
    #[serde(default)]
    pub wifi_password: Option<String>,
}

/// The Controller's saved Matter Wi-Fi. The password never leaves the
/// Controller.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MatterWifi {
    pub configured: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub network_name: Option<String>,
}

/// The Audit log entry for one commissioning started over Relay. It names
/// the Membership, the Access Client, and the protocol, and nothing that
/// identifies a Device: no pairing code, network name, or Device ID.
pub fn relay_commissioning_audit(
    member: &Member,
    client: &AuthenticatedClient,
    protocol: Protocol,
) -> AuditWrite {
    AuditWrite {
        kind: AuditKind::RelayCommissioning,
        actor_user_id: member.user_id.clone(),
        summary: format!(
            "{} started {} commissioning over Relay from {}",
            member.role,
            protocol.as_str(),
            client.label
        ),
        detail: json!({
            "membershipId": member.id,
            "role": member.role,
            "accessClientId": client.access_client_id,
            "accessClientLabel": client.label,
            "protocol": protocol.as_str(),
            "via": "relay",
        }),
    }
}

/// Start Matter commissioning on the Controller.
pub async fn commission_matter(
    state: &AppState,
    auth: &AuthenticatedClient,
    via: Via,
    request: CommissionRequest,
) -> Result<(), ApiError> {
    let member = authorize_caller(state, auth).await?;
    let code = request.code.trim().to_string();
    if code.is_empty() {
        return Err(ApiError::bad_request(
            "invalid_code",
            "pairing code must not be empty",
        ));
    }

    let saved = load_wifi(state).await?;
    let provided_ssid = request
        .wifi_ssid
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    // Omitted vs Some("") must stay distinct so saved-SSID fallback only
    // happens when the client did not send a password at all.
    let provided_password = request.wifi_password.as_deref();

    let (ssid, password) = if let Some(ssid) = provided_ssid {
        if let Some(password) = provided_password {
            let ssid = validate_wifi_credentials(ssid, password)?;
            save_wifi(state, ssid, password).await?;
            (Some(ssid.to_string()), password.to_string())
        } else if let Some((saved_ssid, saved_password)) =
            saved.as_ref().filter(|(saved_ssid, _)| saved_ssid == ssid)
        {
            (Some(saved_ssid.clone()), saved_password.clone())
        } else {
            (Some(ssid.to_string()), String::new())
        }
    } else if let Some((ssid, password)) = saved {
        (Some(ssid), password)
    } else {
        (None, String::new())
    };

    let mut payload = json!({ "code": code });
    if let Some(ssid) = ssid {
        payload["wifiSsid"] = json!(ssid);
        payload["wifiPassword"] = json!(password);
    }

    audit_relay_start(&state.db, via, &member, auth, Protocol::Matter).await?;
    state
        .mqtt
        .commission(payload)
        .await
        .map_err(|error| ApiError::service_unavailable("commission_failed", error))?;
    Ok(())
}

/// Abort in-flight Matter commissioning.
pub async fn cancel_matter_commission(
    state: &AppState,
    auth: &AuthenticatedClient,
) -> Result<(), ApiError> {
    authorize_caller(state, auth).await?;
    state
        .mqtt
        .cancel_commission()
        .await
        .map_err(|error| ApiError::service_unavailable("cancel_failed", error))?;
    Ok(())
}

/// Whether the Controller has a saved Matter Wi-Fi network, and its name.
pub async fn read_matter_wifi(
    state: &AppState,
    auth: &AuthenticatedClient,
) -> Result<MatterWifi, ApiError> {
    authorize_caller(state, auth).await?;
    let saved = load_wifi(state).await?;
    Ok(MatterWifi {
        configured: saved.is_some(),
        network_name: saved.map(|(ssid, _)| ssid),
    })
}

/// Save the Wi-Fi network the Controller hands to Matter Devices.
pub async fn save_matter_wifi(
    state: &AppState,
    auth: &AuthenticatedClient,
    wifi_ssid: &str,
    wifi_password: &str,
) -> Result<MatterWifi, ApiError> {
    authorize_caller(state, auth).await?;
    let ssid = validate_wifi_credentials(wifi_ssid, wifi_password)?;
    save_wifi(state, ssid, wifi_password).await?;
    Ok(MatterWifi {
        configured: true,
        network_name: Some(ssid.to_string()),
    })
}

/// Open the Zigbee network for `seconds` (120 when omitted), or close it with
/// 0. Returns the window actually applied. Only opening it counts as
/// commissioning.
pub async fn permit_zigbee_join(
    state: &AppState,
    auth: &AuthenticatedClient,
    via: Via,
    seconds: Option<u32>,
) -> Result<u32, ApiError> {
    let member = authorize_caller(state, auth).await?;
    let seconds = permit_join_seconds(seconds);
    if seconds > 0 {
        audit_relay_start(&state.db, via, &member, auth, Protocol::Zigbee).await?;
    }
    state
        .mqtt
        .permit_join(seconds)
        .await
        .map_err(|error| ApiError::service_unavailable("mqtt_error", error))?;
    Ok(seconds)
}

fn permit_join_seconds(seconds: Option<u32>) -> u32 {
    seconds
        .unwrap_or(DEFAULT_PERMIT_JOIN_SECONDS)
        .min(MAX_PERMIT_JOIN_SECONDS)
}

/// The entry is written before commissioning starts, so a commissioning
/// started over Relay is never missing from the Audit log.
async fn audit_relay_start(
    pool: &DbPool,
    via: Via,
    member: &Member,
    auth: &AuthenticatedClient,
    protocol: Protocol,
) -> Result<(), ApiError> {
    if via != Via::Relay {
        return Ok(());
    }
    audit::record(pool, relay_commissioning_audit(member, auth, protocol))
        .await
        .map(|_| ())
        .map_err(ApiError::internal)
}

/// Active Owners and Members may commission Devices (ADR-0006, ADR-0034).
async fn authorize_caller(
    state: &AppState,
    auth: &AuthenticatedClient,
) -> Result<Member, ApiError> {
    let (member, _) = active_membership(&state.db, auth).await?;
    Ok(member)
}

fn validate_wifi_credentials<'a>(ssid: &'a str, password: &str) -> Result<&'a str, ApiError> {
    let ssid = ssid.trim();
    if ssid.is_empty() || ssid.len() > 32 {
        return Err(ApiError::bad_request(
            "invalid_network",
            "home Wi-Fi name must be 1–32 characters",
        ));
    }
    if password.len() > 64 {
        return Err(ApiError::bad_request(
            "invalid_password",
            "home Wi-Fi password must be at most 64 characters",
        ));
    }
    Ok(ssid)
}

async fn load_wifi(state: &AppState) -> Result<Option<(String, String)>, ApiError> {
    let cloak = cloak_key(state);
    let conn = state
        .db
        .get()
        .await
        .map_err(|error| ApiError::internal(format!("db pool error: {error}")))?;
    conn.interact(move |conn| -> Result<Option<(String, String)>, String> {
        let ssid = get_string(conn, KEY_WIFI_SSID)?;
        let password = get_string(conn, KEY_WIFI_PASSWORD)?;
        Ok(match (ssid, password) {
            (Some(ssid), Some(password)) if !ssid.is_empty() => {
                Some((ssid, uncloak(&cloak, &password)))
            }
            _ => None,
        })
    })
    .await
    .map_err(|error| ApiError::internal(format!("db interact error: {error}")))?
    .map_err(ApiError::internal)
}

async fn save_wifi(state: &AppState, ssid: &str, password: &str) -> Result<(), ApiError> {
    let cloak = cloak_key(state);
    let ssid = ssid.to_string();
    let password = cloak_value(&cloak, password);
    let conn = state
        .db
        .get()
        .await
        .map_err(|error| ApiError::internal(format!("db pool error: {error}")))?;
    conn.interact(move |conn| -> Result<(), String> {
        set_string(conn, KEY_WIFI_SSID, &ssid)?;
        set_string(conn, KEY_WIFI_PASSWORD, &password)?;
        Ok(())
    })
    .await
    .map_err(|error| ApiError::internal(format!("db interact error: {error}")))?
    .map_err(ApiError::internal)
}

fn cloak_key(state: &AppState) -> String {
    format!("nemu-matter-wifi:{}", state.identity.controller_id)
}

fn cloak_value(key: &str, plaintext: &str) -> String {
    let key_bytes = key.as_bytes();
    let mixed: Vec<u8> = plaintext
        .as_bytes()
        .iter()
        .enumerate()
        .map(|(index, byte)| byte ^ key_bytes[index % key_bytes.len()])
        .collect();
    format!("xor1:{}", to_hex(&mixed))
}

fn uncloak(key: &str, stored: &str) -> String {
    let Some(hex) = stored.strip_prefix("xor1:") else {
        return stored.to_string();
    };
    let Ok(bytes) = from_hex(hex) else {
        return stored.to_string();
    };
    let key_bytes = key.as_bytes();
    let decrypted: Vec<u8> = bytes
        .iter()
        .enumerate()
        .map(|(index, byte)| byte ^ key_bytes[index % key_bytes.len()])
        .collect();
    match String::from_utf8(decrypted) {
        Ok(password) => password,
        Err(_) => stored.to_string(),
    }
}

fn to_hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn from_hex(hex: &str) -> Result<Vec<u8>, ()> {
    if !hex.len().is_multiple_of(2) {
        return Err(());
    }
    (0..hex.len())
        .step_by(2)
        .map(|index| u8::from_str_radix(&hex[index..index + 2], 16).map_err(|_| ()))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;
    use uuid::Uuid;

    fn member(role: &str) -> Member {
        Member {
            id: Uuid::new_v4(),
            user_id: Some(format!("user-{role}")),
            email: format!("{role}@example.com"),
            display_name: None,
            role: role.into(),
            status: "active".into(),
            created_at: Utc::now(),
        }
    }

    fn client() -> AuthenticatedClient {
        AuthenticatedClient {
            access_client_id: Uuid::new_v4(),
            label: "Kitchen phone".into(),
            user_id: Some("user-member".into()),
        }
    }

    #[test]
    fn relay_commissioning_audit_names_the_membership_client_and_protocol() {
        let member = member("member");
        let client = client();
        for protocol in [Protocol::Matter, Protocol::Zigbee] {
            let entry = relay_commissioning_audit(&member, &client, protocol);
            assert_eq!(entry.kind, AuditKind::RelayCommissioning);
            assert_eq!(entry.actor_user_id.as_deref(), Some("user-member"));
            assert_eq!(entry.detail["membershipId"], json!(member.id));
            assert_eq!(entry.detail["role"], "member");
            assert_eq!(
                entry.detail["accessClientId"],
                json!(client.access_client_id)
            );
            assert_eq!(entry.detail["accessClientLabel"], "Kitchen phone");
            assert_eq!(entry.detail["protocol"], protocol.as_str());
            let mut keys: Vec<_> = entry.detail.as_object().unwrap().keys().collect();
            keys.sort();
            assert_eq!(
                keys,
                [
                    "accessClientId",
                    "accessClientLabel",
                    "membershipId",
                    "protocol",
                    "role",
                    "via"
                ]
            );
        }
    }

    #[test]
    fn permit_join_defaults_to_two_minutes_and_caps_the_window() {
        assert_eq!(permit_join_seconds(None), 120);
        assert_eq!(permit_join_seconds(Some(0)), 0);
        assert_eq!(permit_join_seconds(Some(180)), 180);
        assert_eq!(permit_join_seconds(Some(600)), 254);
    }

    #[test]
    fn commission_requests_keep_an_omitted_password_distinct_from_an_empty_one() {
        let omitted: CommissionRequest =
            serde_json::from_value(json!({ "code": "MT:1", "wifiSsid": "home" })).unwrap();
        assert_eq!(omitted.wifi_password, None);
        let empty: CommissionRequest = serde_json::from_value(
            json!({ "code": "MT:1", "wifiSsid": "home", "wifiPassword": "" }),
        )
        .unwrap();
        assert_eq!(empty.wifi_password.as_deref(), Some(""));
    }

    #[test]
    fn uncloak_preserves_utf8_passwords() {
        let key = "nemu-matter-wifi:test";
        let password = "café";
        let stored = cloak_value(key, password);
        assert_eq!(uncloak(key, &stored), password);
    }

    #[test]
    fn validate_wifi_rejects_empty_ssid() {
        let err = validate_wifi_credentials("  ", "secret").unwrap_err();
        assert_eq!(err.code, "invalid_network");
    }

    #[test]
    fn validate_wifi_rejects_long_password() {
        let err = validate_wifi_credentials("home", &"x".repeat(65)).unwrap_err();
        assert_eq!(err.code, "invalid_password");
    }

    #[test]
    fn validate_wifi_preserves_password_whitespace() {
        let ssid = validate_wifi_credentials(" home ", "  secret  ").unwrap();
        assert_eq!(ssid, "home");
    }

    #[test]
    fn validate_wifi_accepts_empty_password() {
        assert_eq!(validate_wifi_credentials("home", "").unwrap(), "home");
    }

    /// One Relay commissioning writes one Audit log entry with no Device
    /// identifiers; a LAN commissioning writes none.
    #[tokio::test]
    #[ignore = "requires the isolated PostgreSQL database created by the verification script"]
    async fn relay_commissioning_writes_one_audit_entry_without_device_identifiers() {
        let pool = crate::db::test_pool();
        let member = member("member");
        let client = client();
        let before = audit::list_recent(&pool, 1_000).await.unwrap().len();

        audit_relay_start(&pool, Via::Lan, &member, &client, Protocol::Matter)
            .await
            .unwrap();
        audit_relay_start(&pool, Via::Relay, &member, &client, Protocol::Matter)
            .await
            .unwrap();

        let rows = audit::list_recent(&pool, 1_000).await.unwrap();
        assert_eq!(rows.len(), before + 1);
        let mine: Vec<_> = rows
            .iter()
            .filter(|row| row.detail["accessClientId"] == json!(client.access_client_id))
            .collect();
        assert_eq!(mine.len(), 1);
        let row = mine[0];
        assert_eq!(row.kind, "relay_commissioning");
        assert_eq!(row.actor_user_id.as_deref(), Some("user-member"));
        assert_eq!(row.detail["protocol"], "matter");
        assert_eq!(row.detail["membershipId"], json!(member.id));
        for forbidden in ["deviceId", "code", "wifiSsid", "wifiPassword", "externalId"] {
            assert!(row.detail.get(forbidden).is_none(), "{forbidden}");
        }
    }
}
