use std::path::PathBuf;

use serde::Serialize;

use crate::audit;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseStatus {
    pub platform_version: String,
    pub channel: String,
    pub newer_release_available: bool,
    pub maintenance_mode: bool,
    pub rollback_snapshot_available: bool,
    pub rollback_stuck: bool,
}

#[derive(Debug, PartialEq, Eq)]
pub enum ForwardError {
    Refused,
    Unavailable(String),
}

pub trait UpdaterControl: Send + Sync {
    fn status(&self) -> Result<ReleaseStatus, String>;
    fn install(&self) -> Result<(), String>;
    fn rollback(&self) -> Result<(), String>;
    fn maintenance_mode(&self) -> bool;
}

/// The Updater installed under a Controller directory. Status reads Home data
/// from that directory and does not record an audit entry. A release key and
/// channel manifest are read from that directory when they have been supplied.
/// A missing key still reports no newer Release and does not use the Controller
/// identity key.
#[derive(Clone)]
pub struct DirectoryUpdater {
    controller_dir: PathBuf,
}

impl DirectoryUpdater {
    pub fn new(controller_dir: impl Into<PathBuf>) -> Self {
        Self {
            controller_dir: controller_dir.into(),
        }
    }
}

impl UpdaterControl for DirectoryUpdater {
    fn status(&self) -> Result<ReleaseStatus, String> {
        let manifests = updater::DirectoryManifestHost::new(&self.controller_dir);
        let release_key = updater::load_release_key(&self.controller_dir);
        let installed = updater::status(&self.controller_dir, &manifests, release_key.as_ref())
            .map_err(|error| error.to_string())?;
        Ok(ReleaseStatus {
            platform_version: installed.platform_version,
            channel: installed.channel.as_str().to_string(),
            newer_release_available: installed.newer_release_available,
            maintenance_mode: installed.maintenance_mode,
            rollback_snapshot_available: installed.rollback_snapshot_available,
            rollback_stuck: installed.rollback_stuck,
        })
    }

    fn install(&self) -> Result<(), String> {
        updater::run_install(&self.controller_dir).map_err(|error| error.to_string())
    }

    fn rollback(&self) -> Result<(), String> {
        updater::run_rollback(&self.controller_dir).map_err(|error| error.to_string())
    }

    fn maintenance_mode(&self) -> bool {
        updater::maintenance_mode(&self.controller_dir)
    }
}

/// Forwards a status read to the Updater for an active Owner.
/// A Member is refused. A status read is not an audited update.
pub fn forward_release_status(
    role: &str,
    member_status: &str,
    updater: &dyn UpdaterControl,
) -> Result<ReleaseStatus, ForwardError> {
    audit::authorize_read(role, member_status).map_err(|_| ForwardError::Refused)?;
    updater.status().map_err(ForwardError::Unavailable)
}

/// Forwards an install to the Updater for an active Owner. A Member is refused.
pub fn forward_install(
    role: &str,
    member_status: &str,
    updater: &dyn UpdaterControl,
) -> Result<(), ForwardError> {
    audit::authorize_read(role, member_status).map_err(|_| ForwardError::Refused)?;
    updater.install().map_err(ForwardError::Unavailable)
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

/// The Audit record for an Owner install. The kind is the existing update kind.
pub fn install_audit(actor_user_id: Option<String>) -> audit::AuditWrite {
    audit::AuditWrite {
        kind: audit::AuditKind::Update,
        actor_user_id,
        summary: "started install of the current Release".to_string(),
        detail: serde_json::json!({ "action": "install" }),
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
    use std::sync::atomic::{AtomicU32, Ordering};

    use super::{
        ForwardError, ReleaseStatus, UpdaterControl, forward_install, forward_release_status,
        forward_rollback, install_audit, rollback_audit,
    };

    struct FakeUpdater {
        status: ReleaseStatus,
        calls: AtomicU32,
        installs: AtomicU32,
        rollbacks: AtomicU32,
    }

    impl UpdaterControl for FakeUpdater {
        fn status(&self) -> Result<ReleaseStatus, String> {
            self.calls.fetch_add(1, Ordering::SeqCst);
            Ok(self.status.clone())
        }

        fn install(&self) -> Result<(), String> {
            self.installs.fetch_add(1, Ordering::SeqCst);
            Ok(())
        }

        fn rollback(&self) -> Result<(), String> {
            self.rollbacks.fetch_add(1, Ordering::SeqCst);
            Ok(())
        }

        fn maintenance_mode(&self) -> bool {
            self.status.maintenance_mode
        }
    }

    #[test]
    fn owner_release_status_is_forwarded_and_a_member_is_refused() {
        let updater = FakeUpdater {
            status: ReleaseStatus {
                platform_version: "0.4.2".to_string(),
                channel: "stable".to_string(),
                newer_release_available: false,
                maintenance_mode: false,
                rollback_snapshot_available: false,
                rollback_stuck: false,
            },
            calls: AtomicU32::new(0),
            installs: AtomicU32::new(0),
            rollbacks: AtomicU32::new(0),
        };

        let forwarded = forward_release_status("owner", "active", &updater).expect("owner");
        assert_eq!(forwarded.platform_version, "0.4.2");
        assert_eq!(forwarded.channel, "stable");
        assert!(!forwarded.newer_release_available);
        assert_eq!(updater.calls.load(Ordering::SeqCst), 1);

        let member = forward_release_status("member", "active", &updater);
        assert_eq!(member, Err(ForwardError::Refused));
        assert_eq!(updater.calls.load(Ordering::SeqCst), 1);

        let pending = forward_release_status("owner", "pending", &updater);
        assert_eq!(pending, Err(ForwardError::Refused));
        assert_eq!(updater.calls.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn an_owner_is_forwarded_a_newer_release_and_a_member_is_refused() {
        let updater = FakeUpdater {
            status: ReleaseStatus {
                platform_version: "0.4.9".to_string(),
                channel: "stable".to_string(),
                newer_release_available: true,
                maintenance_mode: true,
                rollback_snapshot_available: true,
                rollback_stuck: true,
            },
            calls: AtomicU32::new(0),
            installs: AtomicU32::new(0),
            rollbacks: AtomicU32::new(0),
        };

        let forwarded = forward_release_status("owner", "active", &updater).expect("owner");
        assert_eq!(forwarded.platform_version, "0.4.9");
        assert_eq!(forwarded.channel, "stable");
        assert!(forwarded.newer_release_available);
        assert!(forwarded.maintenance_mode);
        assert!(forwarded.rollback_snapshot_available);
        assert!(forwarded.rollback_stuck);
        assert_eq!(updater.calls.load(Ordering::SeqCst), 1);

        let member = forward_release_status("member", "active", &updater);
        assert_eq!(member, Err(ForwardError::Refused));
        assert_eq!(updater.calls.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn an_owner_install_is_forwarded_and_audited_and_a_member_is_refused() {
        let updater = FakeUpdater {
            status: ReleaseStatus {
                platform_version: "0.4.10".to_string(),
                channel: "stable".to_string(),
                newer_release_available: true,
                maintenance_mode: false,
                rollback_snapshot_available: false,
                rollback_stuck: false,
            },
            calls: AtomicU32::new(0),
            installs: AtomicU32::new(0),
            rollbacks: AtomicU32::new(0),
        };

        let member = forward_install("member", "active", &updater);
        assert_eq!(member, Err(ForwardError::Refused));
        assert_eq!(updater.installs.load(Ordering::SeqCst), 0);

        let pending = forward_install("owner", "pending", &updater);
        assert_eq!(pending, Err(ForwardError::Refused));
        assert_eq!(updater.installs.load(Ordering::SeqCst), 0);

        forward_install("owner", "active", &updater).expect("owner install");
        assert_eq!(updater.installs.load(Ordering::SeqCst), 1);

        let audit = install_audit(Some("owner-1".to_string()));
        assert_eq!(audit.kind, crate::audit::AuditKind::Update);
        assert_eq!(audit.detail["action"], "install");
        assert_eq!(audit.actor_user_id.as_deref(), Some("owner-1"));
    }

    #[test]
    fn an_owner_rollback_is_forwarded_and_audited_and_a_member_is_refused() {
        let updater = FakeUpdater {
            status: ReleaseStatus {
                platform_version: "0.4.10".to_string(),
                channel: "stable".to_string(),
                newer_release_available: false,
                maintenance_mode: false,
                rollback_snapshot_available: true,
                rollback_stuck: false,
            },
            calls: AtomicU32::new(0),
            installs: AtomicU32::new(0),
            rollbacks: AtomicU32::new(0),
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
}
