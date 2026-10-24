use std::path::PathBuf;

use serde::Serialize;

use crate::audit;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseStatus {
    pub platform_version: String,
    pub channel: String,
    pub newer_release_available: bool,
}

#[derive(Debug, PartialEq, Eq)]
pub enum ForwardError {
    Refused,
    Unavailable(String),
}

pub trait UpdaterControl: Send + Sync {
    fn status(&self) -> Result<ReleaseStatus, String>;
}

/// The Updater installed under a Controller directory. Status reads Home data
/// from that directory and does not record an audit entry. This caller has no
/// published channel manifest and does not use the Controller identity key as
/// the release key, so no Release is available until a manifest host and the
/// release public key are supplied to `updater::status`.
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
        let manifests = updater::MissingManifestHost;
        let installed = updater::status(&self.controller_dir, &manifests, None)
            .map_err(|error| error.to_string())?;
        Ok(ReleaseStatus {
            platform_version: installed.platform_version,
            channel: installed.channel.as_str().to_string(),
            newer_release_available: installed.newer_release_available,
        })
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

#[cfg(test)]
mod tests {
    use std::sync::atomic::{AtomicU32, Ordering};

    use super::{ForwardError, ReleaseStatus, UpdaterControl, forward_release_status};

    struct FakeUpdater {
        status: ReleaseStatus,
        calls: AtomicU32,
    }

    impl UpdaterControl for FakeUpdater {
        fn status(&self) -> Result<ReleaseStatus, String> {
            self.calls.fetch_add(1, Ordering::SeqCst);
            Ok(self.status.clone())
        }
    }

    #[test]
    fn owner_release_status_is_forwarded_and_a_member_is_refused() {
        let updater = FakeUpdater {
            status: ReleaseStatus {
                platform_version: "0.4.2".to_string(),
                channel: "stable".to_string(),
                newer_release_available: false,
            },
            calls: AtomicU32::new(0),
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
            },
            calls: AtomicU32::new(0),
        };

        let forwarded = forward_release_status("owner", "active", &updater).expect("owner");
        assert_eq!(forwarded.platform_version, "0.4.9");
        assert_eq!(forwarded.channel, "stable");
        assert!(forwarded.newer_release_available);
        assert_eq!(updater.calls.load(Ordering::SeqCst), 1);

        let member = forward_release_status("member", "active", &updater);
        assert_eq!(member, Err(ForwardError::Refused));
        assert_eq!(updater.calls.load(Ordering::SeqCst), 1);
    }
}
