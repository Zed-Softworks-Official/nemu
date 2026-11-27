//! Commissioning progress in Protocol-neutral steps, matching
//! `@nemu/protocol` `commissioning-progress.ts` (NEM-110).
//!
//! A Protocol adapter publishes progress on `{base}/bridge/commissioning`.
//! Core reads it strictly, so a payload with any field beyond the step,
//! status and reason is dropped, and forwards it to Access Clients as the
//! `commissioningStep` event over the LAN WebSocket only. Progress stays off
//! Relay until NEM-123 pushes it sealed on the capability watch. Every field is an enum: a pairing code, passcode or
//! Wi-Fi credential has nowhere to go, so none can reach a client once
//! progress does cross Relay. The older `bridge/event` `commission_progress`
//! and `device_interview` events are read as before.

use serde::{Deserialize, Serialize};

/// The steps, in the order a commissioning reaches them.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CommissioningStep {
    Discovering,
    Connecting,
    Verifying,
    ConfiguringNetwork,
    JoiningNetwork,
    SettingUp,
}

/// Why a step failed, for the guidance an Access Client shows.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CommissioningFailureReason {
    Unreachable,
    NetworkRejected,
    NotVerified,
    TimedOut,
    Unknown,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "status", rename_all = "snake_case", deny_unknown_fields)]
pub enum CommissioningProgress {
    Active {
        step: CommissioningStep,
    },
    /// A struct variant, not a unit one: serde checks unknown fields only on these.
    Completed {},
    Failed {
        step: CommissioningStep,
        reason: CommissioningFailureReason,
    },
}

/// Reads a `bridge/commissioning` payload. Refuses unknown fields. The error
/// is fixed text: serde's would echo the refused value into the log.
pub fn parse_commissioning_progress(payload: &str) -> Result<CommissioningProgress, String> {
    serde_json::from_str(payload)
        .map_err(|_| "bridge/commissioning payload is not a known step; dropped".to_string())
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;
    use crate::events::DeviceEvent;

    #[test]
    fn reads_each_status() {
        assert_eq!(
            parse_commissioning_progress(r#"{"status":"active","step":"configuring_network"}"#),
            Ok(CommissioningProgress::Active {
                step: CommissioningStep::ConfiguringNetwork
            })
        );
        assert_eq!(
            parse_commissioning_progress(r#"{"status":"completed"}"#),
            Ok(CommissioningProgress::Completed {})
        );
        assert_eq!(
            parse_commissioning_progress(
                r#"{"status":"failed","step":"verifying","reason":"not_verified"}"#
            ),
            Ok(CommissioningProgress::Failed {
                step: CommissioningStep::Verifying,
                reason: CommissioningFailureReason::NotVerified,
            })
        );
    }

    #[test]
    fn refuses_unknown_steps_and_missing_fields() {
        for payload in [
            r#"{"status":"active"}"#,
            r#"{"status":"active","step":"pase"}"#,
            r#"{"status":"failed","step":"verifying"}"#,
            r#"{"status":"failed","step":"verifying","reason":"PaaNotTrusted"}"#,
            r#"{"stage":"looking","message":"Looking for your device"}"#,
            "not json",
        ] {
            assert!(parse_commissioning_progress(payload).is_err(), "{payload}");
        }
    }

    /// Progress will cross Relay once NEM-123 pushes it: a payload that
    /// carries a secret, under any name, is dropped rather than forwarded
    /// without it.
    #[test]
    fn refuses_progress_carrying_a_secret() {
        let secrets = [
            ("code", "34970112332"),
            ("pairingCode", "MT:Y.K9042C00KA0648G00"),
            ("passcode", "20202021"),
            ("wifiSsid", "home"),
            ("wifiPassword", "hunter2"),
            ("password", "hunter2"),
            ("message", "pairing code 34970112332 refused"),
            ("error", "wifi password hunter2 rejected"),
        ];
        for base in [
            json!({ "status": "active", "step": "connecting" }),
            json!({ "status": "completed" }),
            json!({ "status": "failed", "step": "connecting", "reason": "unreachable" }),
        ] {
            for (key, value) in secrets {
                let mut payload = base.clone();
                payload[key] = json!(value);
                assert!(
                    parse_commissioning_progress(&payload.to_string()).is_err(),
                    "{payload}"
                );
            }
        }
        for payload in [
            r#"{"status":"active","step":"34970112332"}"#,
            r#"{"status":"failed","step":"connecting","reason":"hunter2"}"#,
            r#"{"status":"active","step":"connecting","wifiPassword":"hunter2"}"#,
        ] {
            let error = parse_commissioning_progress(payload).expect_err(payload);
            // The error is logged, so it must not echo what it refused.
            assert!(
                !error.contains("34970112332") && !error.contains("hunter2"),
                "{error}"
            );
        }
    }

    #[test]
    fn sends_the_shared_event_shape() {
        let cases = [
            (
                CommissioningProgress::Active {
                    step: CommissioningStep::JoiningNetwork,
                },
                json!({ "type": "commissioningStep", "status": "active", "step": "joining_network" }),
            ),
            (
                CommissioningProgress::Completed {},
                json!({ "type": "commissioningStep", "status": "completed" }),
            ),
            (
                CommissioningProgress::Failed {
                    step: CommissioningStep::SettingUp,
                    reason: CommissioningFailureReason::TimedOut,
                },
                json!({
                    "type": "commissioningStep",
                    "status": "failed",
                    "step": "setting_up",
                    "reason": "timed_out",
                }),
            ),
        ];
        for (progress, expected) in cases {
            let event = DeviceEvent::CommissioningStep(progress.clone());
            let json = serde_json::to_value(&event).expect("event serializes");
            assert_eq!(json, expected);
            let back: DeviceEvent = serde_json::from_value(json).expect("event reads back");
            assert!(matches!(back, DeviceEvent::CommissioningStep(p) if p == progress));
        }
    }
}
