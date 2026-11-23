//! The host Updater (ADR-0028, ADR-0033).
//!
//! `nemu-updater.service` runs `wrapper`, which supervises `daemon`. The
//! installer runs `bootstrap` once before the stack starts. The Controller
//! directory is `NEMU_DIR`, default `/opt/nemu`.

use std::path::PathBuf;
use std::process::ExitCode;
use std::sync::Arc;

use updater::{
    BootstrapOutcome, HostOps, ReleaseChannel, RemoteManifestHost, UpdaterArch, UpdaterOps,
    VERSION_BANNER, bind_control_socket, bootstrap, load_release_key, serve_control_socket,
};

const USAGE: &str =
    "usage: updater <version | wrapper | daemon | bootstrap --channel stable|canary | status>";

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let dir = controller_dir();
    match args.first().map(String::as_str) {
        Some("version") => {
            println!("{VERSION_BANNER} {}", env!("CARGO_PKG_VERSION"));
            ExitCode::SUCCESS
        }
        Some("wrapper") => {
            let own = std::env::current_exe().unwrap_or_else(|_| dir.join("updater/wrapper"));
            updater::run_wrapper(&dir, &own)
        }
        Some("daemon") => daemon(dir),
        Some("bootstrap") => run_bootstrap(dir, &args[1..]),
        Some("status") => match HostOps::new(&dir).status() {
            Ok(status) => {
                println!(
                    "{}",
                    serde_json::to_string_pretty(&status).unwrap_or_default()
                );
                ExitCode::SUCCESS
            }
            Err(error) => {
                eprintln!("{error}");
                ExitCode::FAILURE
            }
        },
        _ => {
            eprintln!("{USAGE}");
            ExitCode::from(2)
        }
    }
}

fn controller_dir() -> PathBuf {
    std::env::var_os("NEMU_DIR")
        .filter(|dir| !dir.is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("/opt/nemu"))
}

fn daemon(dir: PathBuf) -> ExitCode {
    let client_uid = std::env::var("NEMU_UPDATER_CLIENT_UID")
        .ok()
        .and_then(|uid| uid.parse().ok())
        .unwrap_or(updater::DEFAULT_CLIENT_UID);
    let socket = dir.join(updater::SOCKET_PATH);
    let listener = match bind_control_socket(&socket, client_uid) {
        Ok(listener) => listener,
        Err(error) => {
            eprintln!("updater: could not bind {}: {error}", socket.display());
            return ExitCode::FAILURE;
        }
    };
    eprintln!("updater: listening on {}", socket.display());
    let ops = Arc::new(HostOps::new(&dir));
    ops.spawn_hourly();
    serve_control_socket(listener, ops);
    ExitCode::SUCCESS
}

fn run_bootstrap(dir: PathBuf, args: &[String]) -> ExitCode {
    let channel = match args {
        [flag, channel] if flag == "--channel" => match channel.as_str() {
            "stable" => ReleaseChannel::Stable,
            "canary" => ReleaseChannel::Canary,
            other => {
                eprintln!("unknown Release channel: {other} (use stable or canary)");
                return ExitCode::from(2);
            }
        },
        _ => {
            eprintln!("{USAGE}");
            return ExitCode::from(2);
        }
    };
    let manifests = RemoteManifestHost::from_env(&dir);
    let key = load_release_key(&dir);
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0);
    match bootstrap(
        &dir,
        channel,
        &manifests,
        key.as_ref(),
        UpdaterArch::from_host(),
        now,
    ) {
        Ok(BootstrapOutcome::Installed { platform_version }) => {
            println!("installed {platform_version} from {}", channel.as_str());
            ExitCode::SUCCESS
        }
        Ok(BootstrapOutcome::AlreadyInstalled {
            platform_version,
            channel,
        }) => {
            println!("already on {platform_version} ({})", channel.as_str());
            ExitCode::SUCCESS
        }
        Err(error) => {
            eprintln!("{error}");
            ExitCode::FAILURE
        }
    }
}
