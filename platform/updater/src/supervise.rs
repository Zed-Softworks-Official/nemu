//! The wrapper process `nemu-updater.service` starts (ADR-0028, ADR-0033).
//!
//! The wrapper is the binary the installer placed at `updater/wrapper`; a
//! Release does not replace it. It runs the installed Updater binary
//! (`updater/bin/{generation}`) as the daemon. A binary that fails its
//! startup check, or exits within a minute three times in a row, is skipped
//! and the previous generation is started instead. When no installed binary
//! starts, the wrapper runs its own daemon so Owner requests and the hourly
//! check still work.

use std::collections::HashSet;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

use crate::daemon::EXIT_RESTART_FOR_BINARY;
use crate::install::{BINARY_DIR, current_generation};

/// Text `version` prints. The startup check and the installer look for it.
pub const VERSION_BANNER: &str = "nemu-updater";
const CRASH_WINDOW: Duration = Duration::from_secs(60);
const CRASH_LIMIT: u32 = 3;
const CHECK_TIMEOUT: Duration = Duration::from_secs(10);
const RESTART_DELAY: Duration = Duration::from_secs(2);

/// The binary to start: the newest generation not yet marked failed, or
/// `None` when every installed generation has failed.
pub fn choose_generation(
    controller_dir: &Path,
    newest: u64,
    failed: &HashSet<u64>,
) -> Option<(u64, PathBuf)> {
    (1..=newest).rev().find_map(|generation| {
        let path = controller_dir.join(BINARY_DIR).join(generation.to_string());
        (!failed.contains(&generation) && path.is_file()).then_some((generation, path))
    })
}

/// True when `binary version` answers with the banner within the timeout.
pub fn passes_startup_check(binary: &Path) -> bool {
    let _ = std::fs::set_permissions(binary, std::fs::Permissions::from_mode(0o755));
    let Ok(mut child) = Command::new(binary)
        .arg("version")
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
    else {
        return false;
    };
    let started = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                if !status.success() {
                    return false;
                }
                let mut out = String::new();
                if let Some(mut stdout) = child.stdout.take() {
                    let _ = std::io::Read::read_to_string(&mut stdout, &mut out);
                }
                return out.contains(VERSION_BANNER);
            }
            Ok(None) if started.elapsed() < CHECK_TIMEOUT => {
                std::thread::sleep(Duration::from_millis(100));
            }
            _ => {
                let _ = child.kill();
                return false;
            }
        }
    }
}

/// Supervises the daemon forever.
pub fn run(controller_dir: &Path, own_binary: &Path) -> ! {
    let mut failed = HashSet::new();
    let mut crashes = 0u32;
    let mut last_generation = None;
    loop {
        let newest = current_generation(controller_dir);
        let chosen = loop {
            match choose_generation(controller_dir, newest, &failed) {
                Some((generation, path)) if passes_startup_check(&path) => {
                    break Some((generation, path));
                }
                Some((generation, _)) => {
                    eprintln!("updater wrapper: generation {generation} failed its startup check");
                    failed.insert(generation);
                }
                None => break None,
            }
        };
        let (generation, binary) = match chosen {
            Some((generation, path)) => (Some(generation), path),
            None => (None, own_binary.to_path_buf()),
        };
        if generation != last_generation {
            crashes = 0;
            last_generation = generation;
        }
        match generation {
            Some(generation) => eprintln!("updater wrapper: starting generation {generation}"),
            None => eprintln!("updater wrapper: no installed Updater starts; running the wrapper"),
        }
        let started = Instant::now();
        let status = Command::new(&binary)
            .arg("daemon")
            .env("NEMU_DIR", controller_dir)
            .status();
        let code = status.as_ref().ok().and_then(|status| status.code());
        if code == Some(EXIT_RESTART_FOR_BINARY) {
            crashes = 0;
            failed.clear();
            continue;
        }
        if started.elapsed() < CRASH_WINDOW {
            crashes += 1;
            if crashes >= CRASH_LIMIT {
                if let Some(generation) = generation {
                    eprintln!(
                        "updater wrapper: generation {generation} exited {CRASH_LIMIT} times within a minute; starting the previous one"
                    );
                    failed.insert(generation);
                }
                crashes = 0;
            }
        } else {
            crashes = 0;
        }
        std::thread::sleep(RESTART_DELAY);
    }
}

#[cfg(test)]
mod tests {
    use std::collections::HashSet;
    use std::fs;

    use super::{choose_generation, passes_startup_check};
    use crate::install::BINARY_DIR;

    fn temp_dir(label: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "nemu-wrapper-{label}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(dir.join(BINARY_DIR)).unwrap();
        dir
    }

    #[test]
    fn the_newest_generation_that_has_not_failed_is_chosen() {
        let dir = temp_dir("choose");
        for generation in [1, 2, 3] {
            fs::write(dir.join(BINARY_DIR).join(generation.to_string()), b"x").unwrap();
        }

        let none_failed = HashSet::new();
        assert_eq!(choose_generation(&dir, 3, &none_failed).unwrap().0, 3);

        let newest_failed = HashSet::from([3]);
        assert_eq!(choose_generation(&dir, 3, &newest_failed).unwrap().0, 2);

        fs::remove_file(dir.join(BINARY_DIR).join("2")).unwrap();
        assert_eq!(choose_generation(&dir, 3, &newest_failed).unwrap().0, 1);

        let all_failed = HashSet::from([1, 3]);
        assert!(choose_generation(&dir, 3, &all_failed).is_none());
        assert!(choose_generation(&dir, 0, &none_failed).is_none());
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn a_binary_that_does_not_answer_version_fails_the_startup_check() {
        let dir = temp_dir("check");
        let good = dir.join("good");
        fs::write(&good, "#!/bin/sh\necho nemu-updater 0.1.0\n").unwrap();
        let silent = dir.join("silent");
        fs::write(&silent, "#!/bin/sh\nexit 0\n").unwrap();
        let broken = dir.join("broken");
        fs::write(&broken, b"\x7fELF-not-really").unwrap();

        assert!(passes_startup_check(&good));
        assert!(!passes_startup_check(&silent));
        assert!(!passes_startup_check(&broken));
        assert!(!passes_startup_check(&dir.join("missing")));
        let _ = fs::remove_dir_all(dir);
    }
}
