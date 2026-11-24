//! The long-lived Updater daemon (ADR-0033).
//!
//! It runs the hourly Release check and answers Owner requests that Core
//! forwards over a Unix socket under the Controller directory. Core enforces
//! Owner and Member roles before it forwards; the socket's file ownership
//! keeps anything other than `nemu-core` out. There is no TCP port and no
//! token.
//!
//! Each connection carries one JSON request line and gets one JSON response
//! line. Install and rollback are started in the background and answered
//! immediately, because they recreate `nemu-core`, which holds the other end
//! of the socket. One operation runs at a time.

use std::io::{BufRead, BufReader, Write};
use std::os::unix::fs::PermissionsExt;
use std::os::unix::net::{UnixListener, UnixStream};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use serde::{Deserialize, Serialize};

use crate::{ReleaseChannel, ReleaseStatus};

/// Socket path relative to the Controller directory.
pub const SOCKET_PATH: &str = "run/updater.sock";
/// Exit code the daemon uses after it commits or restores an Updater binary,
/// so the wrapper starts that binary. The wrapper does not count it as a crash.
pub const EXIT_RESTART_FOR_BINARY: i32 = 75;
/// Container user that runs `nemu-core` (platform/core/Dockerfile).
pub const DEFAULT_CLIENT_UID: u32 = 10001;
const HOURLY_TICK_SECS: u64 = 60;
const REQUEST_TIMEOUT_SECS: u64 = 30;

#[derive(Debug, Deserialize, PartialEq, Eq)]
#[serde(tag = "op", rename_all = "camelCase")]
pub enum Request {
    Status,
    /// Cheap: reads the maintenance flag only. Core asks before each Command.
    Maintenance,
    Install {
        /// The Release an Owner confirmed. A Core that predates it sends none.
        #[serde(default, rename = "platformVersion")]
        platform_version: Option<String>,
    },
    Rollback,
    SwitchChannel {
        channel: ReleaseChannel,
    },
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SwitchOutcome {
    pub channel: ReleaseChannel,
    /// True when the chosen channel has a newer Release and its install started.
    pub installed: bool,
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", untagged)]
pub enum Response {
    Status { ok: bool, status: ReleaseStatus },
    Maintenance { ok: bool, maintenance: bool },
    Started { ok: bool, started: bool },
    Switched { ok: bool, switch: SwitchOutcome },
    Error { ok: bool, error: String },
}

impl Response {
    fn error(message: impl Into<String>) -> Self {
        Self::Error {
            ok: false,
            error: message.into(),
        }
    }
}

/// What the daemon does for each request. The host implementation drives the
/// library against the Controller directory; tests use a fake.
pub trait UpdaterOps: Send + Sync {
    fn status(&self) -> Result<ReleaseStatus, String>;
    fn maintenance_mode(&self) -> bool;
    fn start_install(&self, platform_version: Option<&str>) -> Result<(), String>;
    fn start_rollback(&self) -> Result<(), String>;
    fn switch_channel(&self, channel: ReleaseChannel) -> Result<SwitchOutcome, String>;
}

/// Answers one request line.
pub fn handle_line(line: &str, ops: &dyn UpdaterOps) -> Response {
    let request: Request = match serde_json::from_str(line.trim()) {
        Ok(request) => request,
        Err(_) => return Response::error("unknown request"),
    };
    let result = match request {
        Request::Status => ops
            .status()
            .map(|status| Response::Status { ok: true, status }),
        Request::Maintenance => Ok(Response::Maintenance {
            ok: true,
            maintenance: ops.maintenance_mode(),
        }),
        Request::Install { platform_version } => ops
            .start_install(platform_version.as_deref())
            .map(|()| Response::Started {
                ok: true,
                started: true,
            }),
        Request::Rollback => ops.start_rollback().map(|()| Response::Started {
            ok: true,
            started: true,
        }),
        Request::SwitchChannel { channel } => ops
            .switch_channel(channel)
            .map(|switch| Response::Switched { ok: true, switch }),
    };
    result.unwrap_or_else(Response::error)
}

/// Binds the control socket. A stale socket from an earlier run is removed.
/// The directory only lets others traverse it; the socket belongs to
/// `client_uid` with mode 0600, so only `nemu-core` (and root) can connect.
pub fn bind(socket: &Path, client_uid: u32) -> std::io::Result<UnixListener> {
    if let Some(parent) = socket.parent() {
        std::fs::create_dir_all(parent)?;
        std::fs::set_permissions(parent, std::fs::Permissions::from_mode(0o711))?;
    }
    if socket.exists() {
        std::fs::remove_file(socket)?;
    }
    let listener = UnixListener::bind(socket)?;
    std::fs::set_permissions(socket, std::fs::Permissions::from_mode(0o600))?;
    chown(socket, client_uid)?;
    Ok(listener)
}

fn chown(path: &Path, uid: u32) -> std::io::Result<()> {
    let bytes = std::os::unix::ffi::OsStrExt::as_bytes(path.as_os_str());
    let path = std::ffi::CString::new(bytes)
        .map_err(|error| std::io::Error::new(std::io::ErrorKind::InvalidInput, error))?;
    // Only root can give the socket away. A non-root run (tests, development)
    // keeps its own ownership. The group is unchanged: mode 0600 grants none.
    if unsafe { libc::geteuid() } != 0 {
        return Ok(());
    }
    let rc = unsafe { libc::chown(path.as_ptr(), uid, u32::MAX) };
    if rc == 0 {
        Ok(())
    } else {
        Err(std::io::Error::last_os_error())
    }
}

/// Serves requests until the process exits.
pub fn serve(listener: UnixListener, ops: Arc<dyn UpdaterOps>) {
    for stream in listener.incoming() {
        let Ok(stream) = stream else { continue };
        let ops = Arc::clone(&ops);
        std::thread::spawn(move || answer(stream, ops.as_ref()));
    }
}

fn answer(stream: UnixStream, ops: &dyn UpdaterOps) {
    let timeout = Some(Duration::from_secs(REQUEST_TIMEOUT_SECS));
    let _ = stream.set_read_timeout(timeout);
    let _ = stream.set_write_timeout(timeout);
    let mut line = String::new();
    let mut reader = BufReader::new(&stream);
    if reader.read_line(&mut line).is_err() {
        return;
    }
    let response = handle_line(&line, ops);
    let Ok(mut bytes) = serde_json::to_vec(&response) else {
        return;
    };
    bytes.push(b'\n');
    let mut writer = &stream;
    let _ = writer.write_all(&bytes);
}

/// The daemon's operations on a Controller directory.
pub struct HostOps {
    controller_dir: PathBuf,
    busy: Arc<AtomicBool>,
}

impl HostOps {
    pub fn new(controller_dir: impl Into<PathBuf>) -> Self {
        Self {
            controller_dir: controller_dir.into(),
            busy: Arc::new(AtomicBool::new(false)),
        }
    }

    /// Runs `work` on its own thread while holding the one-operation slot.
    /// `Err` when another operation already holds it.
    fn in_background(
        &self,
        name: &'static str,
        work: impl FnOnce(&Path) -> Result<bool, String> + Send + 'static,
    ) -> Result<(), String> {
        if self.busy.swap(true, Ordering::SeqCst) {
            return Err("another update operation is already running".to_string());
        }
        let busy = Arc::clone(&self.busy);
        let dir = self.controller_dir.clone();
        std::thread::spawn(move || {
            let before = crate::install::current_generation(&dir);
            match work(&dir) {
                Ok(_) => eprintln!("updater: {name} finished"),
                Err(error) => eprintln!("updater: {name} failed: {error}"),
            }
            busy.store(false, Ordering::SeqCst);
            restart_if_binary_changed(&dir, before);
        });
        Ok(())
    }

    /// Starts the hourly check loop on its own thread.
    pub fn spawn_hourly(self: &Arc<Self>) {
        let ops = Arc::clone(self);
        std::thread::spawn(move || {
            loop {
                ops.hourly_tick();
                std::thread::sleep(Duration::from_secs(HOURLY_TICK_SECS));
            }
        });
    }

    fn hourly_tick(&self) {
        if self.busy.swap(true, Ordering::SeqCst) {
            return;
        }
        let before = crate::install::current_generation(&self.controller_dir);
        let result = crate::host::with_host_env(&self.controller_dir, |env| {
            crate::install::hourly_check(&self.controller_dir, env)
        });
        match result {
            Ok(true) => eprintln!("updater: hourly check installed a Release"),
            Ok(false) => {}
            Err(error) => eprintln!("updater: hourly check failed: {error}"),
        }
        self.busy.store(false, Ordering::SeqCst);
        restart_if_binary_changed(&self.controller_dir, before);
    }
}

/// A committed install or a rollback changes the binary the wrapper runs.
/// Exiting lets the wrapper start it.
fn restart_if_binary_changed(controller_dir: &Path, before: u64) {
    if crate::install::current_generation(controller_dir) != before {
        eprintln!("updater: the Updater binary changed; restarting");
        std::process::exit(EXIT_RESTART_FOR_BINARY);
    }
}

impl UpdaterOps for HostOps {
    fn status(&self) -> Result<ReleaseStatus, String> {
        let manifests = crate::host::RemoteManifestHost::from_env(&self.controller_dir);
        let key = crate::host::load_release_key(&self.controller_dir);
        crate::status(&self.controller_dir, &manifests, key.as_ref())
            .map_err(|error| error.to_string())
    }

    fn maintenance_mode(&self) -> bool {
        crate::maintenance_mode(&self.controller_dir)
    }

    fn start_install(&self, platform_version: Option<&str>) -> Result<(), String> {
        let confirmed = platform_version.map(str::to_string);
        self.in_background("install", move |dir| {
            crate::host::run_install(dir, confirmed.as_deref())
                .map(|()| true)
                .map_err(|error| error.to_string())
        })
    }

    fn start_rollback(&self) -> Result<(), String> {
        self.in_background("rollback", |dir| {
            crate::host::run_rollback(dir)
                .map(|()| true)
                .map_err(|error| error.to_string())
        })
    }

    fn switch_channel(&self, channel: ReleaseChannel) -> Result<SwitchOutcome, String> {
        if self.busy.load(Ordering::SeqCst) {
            return Err("another update operation is already running".to_string());
        }
        let saved = crate::host::with_host_env(&self.controller_dir, |env| {
            crate::channel::save_channel(&self.controller_dir, channel, env)
        })
        .map_err(|error| error.to_string())?;
        if saved.installed {
            self.start_install(None)?;
        }
        Ok(SwitchOutcome {
            channel: saved.channel,
            installed: saved.installed,
        })
    }
}

#[cfg(test)]
mod tests {
    use std::io::{BufRead, BufReader, Write};
    use std::os::unix::net::UnixStream;
    use std::sync::{Arc, Mutex};

    use super::{Response, SwitchOutcome, UpdaterOps, bind, handle_line, serve};
    use crate::{AvailableRelease, ReleaseChannel, ReleaseStatus};

    #[derive(Default)]
    struct Fake {
        calls: Mutex<Vec<String>>,
    }

    fn status() -> ReleaseStatus {
        ReleaseStatus {
            platform_version: "0.1.1".to_string(),
            channel: ReleaseChannel::Stable,
            newer_release_available: true,
            available_release: Some(AvailableRelease {
                platform_version: "0.1.2".to_string(),
                release_notes: Some("- Faster pairing".to_string()),
            }),
            maintenance_mode: false,
            rollback_snapshot_available: false,
            rollback_stuck: false,
        }
    }

    impl UpdaterOps for Fake {
        fn status(&self) -> Result<ReleaseStatus, String> {
            self.calls.lock().unwrap().push("status".into());
            Ok(status())
        }

        fn maintenance_mode(&self) -> bool {
            self.calls.lock().unwrap().push("maintenance".into());
            true
        }

        fn start_install(&self, platform_version: Option<&str>) -> Result<(), String> {
            let call = match platform_version {
                Some(version) => format!("install:{version}"),
                None => "install".to_string(),
            };
            self.calls.lock().unwrap().push(call);
            Ok(())
        }

        fn start_rollback(&self) -> Result<(), String> {
            self.calls.lock().unwrap().push("rollback".into());
            Err("no Rollback snapshot".into())
        }

        fn switch_channel(&self, channel: ReleaseChannel) -> Result<SwitchOutcome, String> {
            self.calls
                .lock()
                .unwrap()
                .push(format!("switch:{}", channel.as_str()));
            Ok(SwitchOutcome {
                channel,
                installed: false,
            })
        }
    }

    #[test]
    fn each_request_reaches_its_operation() {
        let fake = Fake::default();

        assert_eq!(
            handle_line(r#"{"op":"status"}"#, &fake),
            Response::Status {
                ok: true,
                status: status()
            }
        );
        assert_eq!(
            handle_line(r#"{"op":"maintenance"}"#, &fake),
            Response::Maintenance {
                ok: true,
                maintenance: true
            }
        );
        assert_eq!(
            handle_line(r#"{"op":"install"}"#, &fake),
            Response::Started {
                ok: true,
                started: true
            }
        );
        assert_eq!(
            handle_line(r#"{"op":"install","platformVersion":"0.1.2"}"#, &fake),
            Response::Started {
                ok: true,
                started: true
            }
        );
        assert_eq!(
            handle_line(r#"{"op":"rollback"}"#, &fake),
            Response::Error {
                ok: false,
                error: "no Rollback snapshot".into()
            }
        );
        assert_eq!(
            handle_line(r#"{"op":"switchChannel","channel":"canary"}"#, &fake),
            Response::Switched {
                ok: true,
                switch: SwitchOutcome {
                    channel: ReleaseChannel::Canary,
                    installed: false
                }
            }
        );
        assert_eq!(
            *fake.calls.lock().unwrap(),
            [
                "status",
                "maintenance",
                "install",
                "install:0.1.2",
                "rollback",
                "switch:canary"
            ]
        );
    }

    /// Core sends the confirmed version to Updaters already installed on
    /// Homes. This is the request type they run.
    #[test]
    fn an_updater_that_predates_the_confirmed_version_ignores_it() {
        #[derive(serde::Deserialize, Debug, PartialEq)]
        #[serde(tag = "op", rename_all = "camelCase")]
        enum PublishedRequest {
            Install,
        }
        assert_eq!(
            serde_json::from_str::<PublishedRequest>(
                r#"{"op":"install","platformVersion":"0.1.2"}"#
            )
            .unwrap(),
            PublishedRequest::Install
        );
    }

    #[test]
    fn an_unknown_request_or_channel_does_nothing() {
        let fake = Fake::default();
        for line in [
            "",
            "not json",
            r#"{"op":"reboot"}"#,
            r#"{"op":"switchChannel","channel":"beta"}"#,
        ] {
            assert!(matches!(
                handle_line(line, &fake),
                Response::Error { ok: false, .. }
            ));
        }
        assert!(fake.calls.lock().unwrap().is_empty());
    }

    #[test]
    fn the_socket_answers_one_line_per_connection() {
        let dir = std::env::temp_dir().join(format!(
            "nemu-updater-sock-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let socket = dir.join("run/updater.sock");
        let uid = unsafe { libc::getuid() };
        let listener = bind(&socket, uid).expect("bind");
        let ops: Arc<dyn UpdaterOps> = Arc::new(Fake::default());
        std::thread::spawn(move || serve(listener, ops));

        let mut stream = UnixStream::connect(&socket).expect("connect");
        stream.write_all(b"{\"op\":\"status\"}\n").unwrap();
        let mut line = String::new();
        BufReader::new(&stream).read_line(&mut line).unwrap();
        let value: serde_json::Value = serde_json::from_str(&line).unwrap();
        assert_eq!(value["ok"], true);
        assert_eq!(value["status"]["platformVersion"], "0.1.1");
        assert_eq!(value["status"]["channel"], "stable");
        assert_eq!(
            value["status"]["availableRelease"]["platformVersion"],
            "0.1.2"
        );
        assert_eq!(
            value["status"]["availableRelease"]["releaseNotes"],
            "- Faster pairing"
        );

        let mode = std::fs::metadata(&socket).unwrap();
        assert_eq!(
            std::os::unix::fs::PermissionsExt::mode(&mode.permissions()) & 0o777,
            0o600
        );
        let _ = std::fs::remove_dir_all(dir);
    }
}
