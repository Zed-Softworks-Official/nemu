use std::io::{BufRead, BufReader, Write};
use std::os::unix::net::UnixStream;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::audit;
use crate::pairing::members::active_role;

/// The Release the Home could install now, from the signed channel manifest.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AvailableRelease {
    pub platform_version: String,
    /// `None` when the Release was published without notes.
    #[serde(default)]
    pub release_notes: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseStatus {
    pub platform_version: String,
    pub channel: String,
    pub newer_release_available: bool,
    /// `None` when there is no newer Release, or when the Updater predates
    /// this field.
    pub available_release: Option<AvailableRelease>,
    pub maintenance_mode: bool,
    pub rollback_snapshot_available: bool,
    pub rollback_stuck: bool,
}

#[derive(Debug, PartialEq, Eq)]
pub enum ForwardError {
    Refused,
    /// The channel no longer serves the Release the Owner confirmed.
    ReleaseChanged,
    Unavailable(String),
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SwitchChannelOutcome {
    pub channel: String,
    pub installed: bool,
}

pub trait UpdaterControl: Send + Sync {
    fn status(&self) -> Result<ReleaseStatus, String>;
    /// Installs the newer Release. With `platform_version`, the Updater refuses
    /// any other one.
    fn install(&self, platform_version: Option<&str>) -> Result<(), String>;
    fn rollback(&self) -> Result<(), String>;
    fn switch_channel(&self, channel: &str) -> Result<SwitchChannelOutcome, String>;
    fn maintenance_mode(&self) -> bool;
}

/// Default path of the Updater control socket inside the `nemu-core`
/// container. Compose bind-mounts the host's `/opt/nemu/run` here (ADR-0033).
pub const DEFAULT_UPDATER_SOCKET: &str = "/run/nemu-updater/updater.sock";
const UPDATER_UNAVAILABLE: &str =
    "The Updater is not running on this Home. Re-run the installer to install it.";
const REQUEST_TIMEOUT: Duration = Duration::from_secs(45);
const MAINTENANCE_TIMEOUT: Duration = Duration::from_secs(2);
const MAINTENANCE_CACHE: Duration = Duration::from_secs(2);

/// The host Updater, reached over its Unix socket. Core checks the Owner
/// role before it forwards anything; the Updater trusts the socket's owner.
/// Install and rollback are answered once they have started, because they
/// recreate this container.
pub struct SocketUpdater {
    socket: PathBuf,
    maintenance: Mutex<Option<(Instant, bool)>>,
}

impl SocketUpdater {
    pub fn new(socket: impl Into<PathBuf>) -> Self {
        Self {
            socket: socket.into(),
            maintenance: Mutex::new(None),
        }
    }

    fn request(&self, body: Value, timeout: Duration) -> Result<Value, String> {
        let call = || -> Result<Value, String> {
            let mut stream =
                UnixStream::connect(&self.socket).map_err(|_| UPDATER_UNAVAILABLE.to_string())?;
            stream
                .set_read_timeout(Some(timeout))
                .and_then(|()| stream.set_write_timeout(Some(timeout)))
                .map_err(|error| error.to_string())?;
            let mut line = body.to_string();
            line.push('\n');
            stream
                .write_all(line.as_bytes())
                .map_err(|_| UPDATER_UNAVAILABLE.to_string())?;
            let mut reply = String::new();
            BufReader::new(&stream)
                .read_line(&mut reply)
                .map_err(|error| format!("the Updater did not answer: {error}"))?;
            let value: Value = serde_json::from_str(reply.trim())
                .map_err(|_| "the Updater sent an unreadable answer".to_string())?;
            if value.get("ok").and_then(Value::as_bool) == Some(true) {
                Ok(value)
            } else {
                Err(value
                    .get("error")
                    .and_then(Value::as_str)
                    .unwrap_or("the Updater refused the request")
                    .to_string())
            }
        };
        // Handlers call this from async code. On the multi-threaded runtime,
        // tell Tokio this worker blocks so other tasks keep running.
        match tokio::runtime::Handle::try_current() {
            Ok(handle) if handle.runtime_flavor() == tokio::runtime::RuntimeFlavor::MultiThread => {
                tokio::task::block_in_place(call)
            }
            _ => call(),
        }
    }
}

impl UpdaterControl for SocketUpdater {
    fn status(&self) -> Result<ReleaseStatus, String> {
        let value = self.request(json!({ "op": "status" }), REQUEST_TIMEOUT)?;
        let status = value
            .get("status")
            .ok_or_else(|| "the Updater sent no status".to_string())?;
        let flag = |name: &str| status.get(name).and_then(Value::as_bool).unwrap_or(false);
        let text = |name: &str| {
            status
                .get(name)
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string()
        };
        Ok(ReleaseStatus {
            platform_version: text("platformVersion"),
            channel: text("channel"),
            newer_release_available: flag("newerReleaseAvailable"),
            available_release: available_release(status),
            maintenance_mode: flag("maintenanceMode"),
            rollback_snapshot_available: flag("rollbackSnapshotAvailable"),
            rollback_stuck: flag("rollbackStuck"),
        })
    }

    fn install(&self, platform_version: Option<&str>) -> Result<(), String> {
        let mut body = json!({ "op": "install" });
        // An Updater that predates the field ignores it.
        if let Some(version) = platform_version {
            body["platformVersion"] = json!(version);
        }
        self.request(body, REQUEST_TIMEOUT).map(|_| ())
    }

    fn rollback(&self) -> Result<(), String> {
        self.request(json!({ "op": "rollback" }), REQUEST_TIMEOUT)
            .map(|_| ())
    }

    fn switch_channel(&self, channel: &str) -> Result<SwitchChannelOutcome, String> {
        if channel != "stable" && channel != "canary" {
            return Err(format!("unknown Release channel: {channel}"));
        }
        let value = self.request(
            json!({ "op": "switchChannel", "channel": channel }),
            REQUEST_TIMEOUT,
        )?;
        let switch = value.get("switch").cloned().unwrap_or_default();
        Ok(SwitchChannelOutcome {
            channel: switch
                .get("channel")
                .and_then(Value::as_str)
                .unwrap_or(channel)
                .to_string(),
            installed: switch
                .get("installed")
                .and_then(Value::as_bool)
                .unwrap_or(false),
        })
    }

    /// Asked before each Command, so the answer is cached briefly. A Home
    /// whose Updater does not answer is not in maintenance.
    fn maintenance_mode(&self) -> bool {
        let mut cached = self
            .maintenance
            .lock()
            .unwrap_or_else(|poison| poison.into_inner());
        if let Some((at, held)) = *cached
            && at.elapsed() < MAINTENANCE_CACHE
        {
            return held;
        }
        let held = self
            .request(json!({ "op": "maintenance" }), MAINTENANCE_TIMEOUT)
            .ok()
            .and_then(|value| value.get("maintenance").and_then(Value::as_bool))
            .unwrap_or(false);
        *cached = Some((Instant::now(), held));
        held
    }
}

fn available_release(status: &Value) -> Option<AvailableRelease> {
    serde_json::from_value(status.get("availableRelease")?.clone()).ok()
}

/// Forwards a status read to the Updater for any active Owner or Member.
/// Installing, rolling back and switching channel stay Owner-only.
/// An inactive Membership is refused. A status read is not an audited update.
pub fn forward_release_status(
    role: &str,
    member_status: &str,
    updater: &dyn UpdaterControl,
) -> Result<ReleaseStatus, ForwardError> {
    active_role(role, member_status).map_err(|_| ForwardError::Refused)?;
    updater.status().map_err(ForwardError::Unavailable)
}

/// Refuses an install when the channel no longer serves `confirmed`. This also
/// covers an Updater that ignores the version it is sent. Clients that predate
/// confirming a version send none.
pub fn check_confirmed_release(
    role: &str,
    member_status: &str,
    confirmed: Option<&str>,
    updater: &dyn UpdaterControl,
) -> Result<(), ForwardError> {
    audit::authorize_read(role, member_status).map_err(|_| ForwardError::Refused)?;
    let Some(confirmed) = confirmed else {
        return Ok(());
    };
    let status = updater.status().map_err(ForwardError::Unavailable)?;
    match status.available_release {
        Some(available) if available.platform_version == confirmed => Ok(()),
        _ => Err(ForwardError::ReleaseChanged),
    }
}

/// Forwards an install to the Updater for an active Owner. A Member is refused.
pub fn forward_install(
    role: &str,
    member_status: &str,
    confirmed: Option<&str>,
    updater: &dyn UpdaterControl,
) -> Result<(), ForwardError> {
    audit::authorize_read(role, member_status).map_err(|_| ForwardError::Refused)?;
    updater
        .install(confirmed)
        .map_err(ForwardError::Unavailable)
}

/// Forwards a rollback to the Updater for an active Owner. A Member is refused.
pub fn forward_rollback(
    role: &str,
    member_status: &str,
    updater: &dyn UpdaterControl,
) -> Result<(), ForwardError> {
    audit::authorize_read(role, member_status).map_err(|_| ForwardError::Refused)?;
    updater.rollback().map_err(ForwardError::Unavailable)
}

/// Forwards a channel change to the Updater for an active Owner.
/// A Member is refused. The caller records the Audit entry.
pub fn forward_switch_channel(
    role: &str,
    member_status: &str,
    channel: &str,
    updater: &dyn UpdaterControl,
) -> Result<SwitchChannelOutcome, ForwardError> {
    audit::authorize_read(role, member_status).map_err(|_| ForwardError::Refused)?;
    updater
        .switch_channel(channel)
        .map_err(ForwardError::Unavailable)
}

/// The Audit record for an Owner channel change. The kind is the existing update kind.
pub fn switch_channel_audit(actor_user_id: Option<String>, channel: &str) -> audit::AuditWrite {
    audit::AuditWrite {
        kind: audit::AuditKind::Update,
        actor_user_id,
        summary: format!("switched Release channel to {channel}"),
        detail: serde_json::json!({
            "action": "switchChannel",
            "channel": channel,
        }),
    }
}

/// The Audit record for an Owner install. The kind is the existing update kind.
pub fn install_audit(actor_user_id: Option<String>, confirmed: Option<&str>) -> audit::AuditWrite {
    audit::AuditWrite {
        kind: audit::AuditKind::Update,
        actor_user_id,
        summary: "started install of the current Release".to_string(),
        detail: match confirmed {
            Some(version) => {
                serde_json::json!({ "action": "install", "platformVersion": version })
            }
            None => serde_json::json!({ "action": "install" }),
        },
    }
}

/// The Audit record for an Owner rollback. The kind is the existing update kind.
pub fn rollback_audit(actor_user_id: Option<String>) -> audit::AuditWrite {
    audit::AuditWrite {
        kind: audit::AuditKind::Update,
        actor_user_id,
        summary: "started rollback of the last Release".to_string(),
        detail: serde_json::json!({ "action": "rollback" }),
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Mutex;
    use std::sync::atomic::{AtomicU32, Ordering};

    use super::{
        AvailableRelease, ForwardError, ReleaseStatus, SwitchChannelOutcome, UpdaterControl,
        check_confirmed_release, forward_install, forward_release_status, forward_rollback,
        forward_switch_channel, install_audit, rollback_audit, switch_channel_audit,
    };

    struct FakeUpdater {
        status: ReleaseStatus,
        calls: AtomicU32,
        installs: AtomicU32,
        rollbacks: AtomicU32,
        switches: Mutex<Vec<String>>,
    }

    impl UpdaterControl for FakeUpdater {
        fn status(&self) -> Result<ReleaseStatus, String> {
            self.calls.fetch_add(1, Ordering::SeqCst);
            Ok(self.status.clone())
        }

        fn install(&self, _platform_version: Option<&str>) -> Result<(), String> {
            self.installs.fetch_add(1, Ordering::SeqCst);
            Ok(())
        }

        fn rollback(&self) -> Result<(), String> {
            self.rollbacks.fetch_add(1, Ordering::SeqCst);
            Ok(())
        }

        fn switch_channel(&self, channel: &str) -> Result<SwitchChannelOutcome, String> {
            self.switches
                .lock()
                .expect("switches")
                .push(channel.to_string());
            Ok(SwitchChannelOutcome {
                channel: channel.to_string(),
                installed: false,
            })
        }

        fn maintenance_mode(&self) -> bool {
            self.status.maintenance_mode
        }
    }

    fn no_switches() -> Mutex<Vec<String>> {
        Mutex::new(Vec::new())
    }

    #[test]
    fn release_status_is_forwarded_to_owners_and_members_and_refused_when_inactive() {
        let updater = FakeUpdater {
            status: ReleaseStatus {
                platform_version: "0.4.2".to_string(),
                channel: "stable".to_string(),
                newer_release_available: false,
                available_release: None,
                maintenance_mode: false,
                rollback_snapshot_available: false,
                rollback_stuck: false,
            },
            calls: AtomicU32::new(0),
            installs: AtomicU32::new(0),
            rollbacks: AtomicU32::new(0),
            switches: no_switches(),
        };

        let forwarded = forward_release_status("owner", "active", &updater).expect("owner");
        assert_eq!(forwarded.platform_version, "0.4.2");
        assert_eq!(forwarded.channel, "stable");
        assert!(!forwarded.newer_release_available);
        assert_eq!(updater.calls.load(Ordering::SeqCst), 1);

        let member = forward_release_status("member", "active", &updater).expect("member");
        assert_eq!(member, forwarded);
        assert_eq!(updater.calls.load(Ordering::SeqCst), 2);

        let pending = forward_release_status("owner", "pending", &updater);
        assert_eq!(pending, Err(ForwardError::Refused));
        let pending_member = forward_release_status("member", "pending", &updater);
        assert_eq!(pending_member, Err(ForwardError::Refused));
        assert_eq!(updater.calls.load(Ordering::SeqCst), 2);
    }

    #[test]
    fn owners_and_members_both_see_a_newer_release() {
        let updater = FakeUpdater {
            status: ReleaseStatus {
                platform_version: "0.4.9".to_string(),
                channel: "stable".to_string(),
                newer_release_available: true,
                available_release: Some(AvailableRelease {
                    platform_version: "0.4.10".to_string(),
                    release_notes: Some("- Faster pairing".to_string()),
                }),
                maintenance_mode: true,
                rollback_snapshot_available: true,
                rollback_stuck: true,
            },
            calls: AtomicU32::new(0),
            installs: AtomicU32::new(0),
            rollbacks: AtomicU32::new(0),
            switches: no_switches(),
        };

        for role in ["owner", "member"] {
            let forwarded = forward_release_status(role, "active", &updater).expect(role);
            assert_eq!(forwarded.platform_version, "0.4.9");
            assert_eq!(forwarded.channel, "stable");
            assert!(forwarded.newer_release_available);
            let body = serde_json::to_value(&forwarded).expect("json");
            assert_eq!(body["availableRelease"]["platformVersion"], "0.4.10");
            assert_eq!(body["availableRelease"]["releaseNotes"], "- Faster pairing");
            assert!(forwarded.maintenance_mode);
            assert!(forwarded.rollback_snapshot_available);
            assert!(forwarded.rollback_stuck);
        }
        assert_eq!(updater.calls.load(Ordering::SeqCst), 2);
    }

    #[test]
    fn an_owner_install_is_forwarded_and_audited_and_a_member_is_refused() {
        let updater = FakeUpdater {
            status: ReleaseStatus {
                platform_version: "0.4.10".to_string(),
                channel: "stable".to_string(),
                newer_release_available: true,
                available_release: None,
                maintenance_mode: false,
                rollback_snapshot_available: false,
                rollback_stuck: false,
            },
            calls: AtomicU32::new(0),
            installs: AtomicU32::new(0),
            rollbacks: AtomicU32::new(0),
            switches: no_switches(),
        };

        let member = forward_install("member", "active", None, &updater);
        assert_eq!(member, Err(ForwardError::Refused));
        assert_eq!(updater.installs.load(Ordering::SeqCst), 0);

        let pending = forward_install("owner", "pending", None, &updater);
        assert_eq!(pending, Err(ForwardError::Refused));
        assert_eq!(updater.installs.load(Ordering::SeqCst), 0);

        forward_install("owner", "active", None, &updater).expect("owner install");
        assert_eq!(updater.installs.load(Ordering::SeqCst), 1);

        let audit = install_audit(Some("owner-1".to_string()), Some("0.4.10"));
        assert_eq!(audit.detail["platformVersion"], "0.4.10");
        assert_eq!(audit.kind, crate::audit::AuditKind::Update);
        assert_eq!(audit.detail["action"], "install");
        assert_eq!(audit.actor_user_id.as_deref(), Some("owner-1"));
    }

    #[test]
    fn an_install_is_refused_when_the_channel_serves_another_release() {
        let mut updater = FakeUpdater {
            status: ReleaseStatus {
                platform_version: "0.4.9".to_string(),
                channel: "stable".to_string(),
                newer_release_available: true,
                available_release: Some(AvailableRelease {
                    platform_version: "0.4.10".to_string(),
                    release_notes: None,
                }),
                maintenance_mode: false,
                rollback_snapshot_available: false,
                rollback_stuck: false,
            },
            calls: AtomicU32::new(0),
            installs: AtomicU32::new(0),
            rollbacks: AtomicU32::new(0),
            switches: no_switches(),
        };
        let check = |confirmed, updater: &FakeUpdater| {
            check_confirmed_release("owner", "active", confirmed, updater)
        };

        assert_eq!(check(Some("0.4.10"), &updater), Ok(()));
        assert_eq!(
            check(Some("0.4.9"), &updater),
            Err(ForwardError::ReleaseChanged)
        );
        assert_eq!(
            check_confirmed_release("member", "active", Some("0.4.10"), &updater),
            Err(ForwardError::Refused)
        );
        assert_eq!(updater.calls.load(Ordering::SeqCst), 2);

        // Clients that predate confirming a version.
        assert_eq!(check(None, &updater), Ok(()));
        assert_eq!(updater.calls.load(Ordering::SeqCst), 2);

        updater.status.available_release = None;
        assert_eq!(
            check(Some("0.4.10"), &updater),
            Err(ForwardError::ReleaseChanged)
        );
    }

    #[test]
    fn an_owner_rollback_is_forwarded_and_audited_and_a_member_is_refused() {
        let updater = FakeUpdater {
            status: ReleaseStatus {
                platform_version: "0.4.10".to_string(),
                channel: "stable".to_string(),
                newer_release_available: false,
                available_release: None,
                maintenance_mode: false,
                rollback_snapshot_available: true,
                rollback_stuck: false,
            },
            calls: AtomicU32::new(0),
            installs: AtomicU32::new(0),
            rollbacks: AtomicU32::new(0),
            switches: no_switches(),
        };

        let member = forward_rollback("member", "active", &updater);
        assert_eq!(member, Err(ForwardError::Refused));
        assert_eq!(updater.rollbacks.load(Ordering::SeqCst), 0);

        let pending = forward_rollback("owner", "pending", &updater);
        assert_eq!(pending, Err(ForwardError::Refused));
        assert_eq!(updater.rollbacks.load(Ordering::SeqCst), 0);

        forward_rollback("owner", "active", &updater).expect("owner rollback");
        assert_eq!(updater.rollbacks.load(Ordering::SeqCst), 1);
        assert_eq!(updater.installs.load(Ordering::SeqCst), 0);

        let audit = rollback_audit(Some("owner-1".to_string()));
        assert_eq!(audit.kind, crate::audit::AuditKind::Update);
        assert_eq!(audit.detail["action"], "rollback");
        assert_eq!(audit.actor_user_id.as_deref(), Some("owner-1"));
    }

    #[test]
    fn an_owner_channel_switch_is_forwarded_and_audited_and_a_member_is_refused() {
        let updater = FakeUpdater {
            status: ReleaseStatus {
                platform_version: "0.4.10".to_string(),
                channel: "stable".to_string(),
                newer_release_available: false,
                available_release: None,
                maintenance_mode: false,
                rollback_snapshot_available: false,
                rollback_stuck: false,
            },
            calls: AtomicU32::new(0),
            installs: AtomicU32::new(0),
            rollbacks: AtomicU32::new(0),
            switches: no_switches(),
        };

        let member = forward_switch_channel("member", "active", "canary", &updater);
        assert_eq!(member, Err(ForwardError::Refused));
        assert!(updater.switches.lock().expect("switches").is_empty());

        let pending = forward_switch_channel("owner", "pending", "stable", &updater);
        assert_eq!(pending, Err(ForwardError::Refused));
        assert!(updater.switches.lock().expect("switches").is_empty());

        let canary = forward_switch_channel("owner", "active", "canary", &updater).expect("canary");
        assert_eq!(canary.channel, "canary");

        let stable = forward_switch_channel("owner", "active", "stable", &updater).expect("stable");
        assert_eq!(stable.channel, "stable");
        assert_eq!(
            updater.switches.lock().expect("switches").as_slice(),
            ["canary", "stable"]
        );

        let audit = switch_channel_audit(Some("owner-1".to_string()), "canary");
        assert_eq!(audit.kind, crate::audit::AuditKind::Update);
        assert_eq!(audit.detail["action"], "switchChannel");
        assert_eq!(audit.detail["channel"], "canary");
        assert_eq!(audit.actor_user_id.as_deref(), Some("owner-1"));
        assert_eq!(audit.summary, "switched Release channel to canary");
    }

    fn fake_updater_socket(
        replies: Vec<&'static str>,
    ) -> (std::path::PathBuf, std::thread::JoinHandle<Vec<String>>) {
        use std::io::{BufRead, BufReader, Write};
        let dir = std::path::PathBuf::from(format!(
            "/tmp/nemu-core-sock-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let socket = dir.join("updater.sock");
        let listener = std::os::unix::net::UnixListener::bind(&socket).unwrap();
        let handle = std::thread::spawn(move || {
            let mut seen = Vec::new();
            for reply in replies {
                let (stream, _) = listener.accept().unwrap();
                let mut line = String::new();
                BufReader::new(&stream).read_line(&mut line).unwrap();
                seen.push(line.trim().to_string());
                let mut writer = &stream;
                writer.write_all(format!("{reply}\n").as_bytes()).unwrap();
            }
            let _ = std::fs::remove_dir_all(&dir);
            seen
        });
        (socket, handle)
    }

    #[test]
    fn the_socket_updater_forwards_each_request_and_reads_the_answer() {
        let (socket, server) = fake_updater_socket(vec![
            r#"{"ok":true,"status":{"platformVersion":"0.1.1","channel":"canary","newerReleaseAvailable":true,"maintenanceMode":false,"rollbackSnapshotAvailable":true,"rollbackStuck":false}}"#,
            r#"{"ok":true,"started":true}"#,
            r#"{"ok":true,"started":true}"#,
            r#"{"ok":false,"error":"no Rollback snapshot"}"#,
            r#"{"ok":true,"switch":{"channel":"stable","installed":true}}"#,
            r#"{"ok":true,"maintenance":true}"#,
        ]);
        let updater = super::SocketUpdater::new(&socket);

        let status = updater.status().expect("status");
        assert_eq!(status.platform_version, "0.1.1");
        assert_eq!(status.channel, "canary");
        assert!(status.newer_release_available);
        assert!(status.rollback_snapshot_available);
        updater.install(None).expect("install");
        updater.install(Some("0.1.2")).expect("confirmed install");
        assert_eq!(updater.rollback(), Err("no Rollback snapshot".to_string()));
        let switched = updater.switch_channel("stable").expect("switch");
        assert_eq!(switched.channel, "stable");
        assert!(switched.installed);
        assert!(updater.maintenance_mode());
        // Cached: no seventh connection is made.
        assert!(updater.maintenance_mode());

        let seen = server.join().unwrap();
        assert_eq!(
            seen,
            [
                r#"{"op":"status"}"#,
                r#"{"op":"install"}"#,
                r#"{"op":"install","platformVersion":"0.1.2"}"#,
                r#"{"op":"rollback"}"#,
                r#"{"op":"switchChannel","channel":"stable"}"#,
                r#"{"op":"maintenance"}"#,
            ]
        );
    }

    #[test]
    fn a_missing_updater_is_unavailable_and_not_in_maintenance() {
        let updater = super::SocketUpdater::new("/nonexistent/nemu-updater.sock");
        assert!(
            updater
                .status()
                .unwrap_err()
                .contains("Re-run the installer")
        );
        assert!(!updater.maintenance_mode());
        assert!(updater.switch_channel("beta").is_err());
    }

    #[test]
    fn the_available_release_is_read_from_the_updater_reply() {
        let reply = |value| super::available_release(&value);
        assert_eq!(
            reply(serde_json::json!({
                "availableRelease": {
                    "platformVersion": "0.4.10",
                    "releaseNotes": "- Faster pairing",
                }
            })),
            Some(AvailableRelease {
                platform_version: "0.4.10".to_string(),
                release_notes: Some("- Faster pairing".to_string()),
            })
        );
        assert_eq!(
            reply(serde_json::json!({
                "availableRelease": { "platformVersion": "0.4.10", "releaseNotes": null }
            })),
            Some(AvailableRelease {
                platform_version: "0.4.10".to_string(),
                release_notes: None,
            })
        );
        // An Updater that predates the field.
        assert_eq!(
            reply(serde_json::json!({ "platformVersion": "0.4.9" })),
            None
        );
    }
}
