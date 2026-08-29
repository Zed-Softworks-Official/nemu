use std::collections::HashSet;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tracing::warn;

/// First operational node id the controller assigns to a device (commissioner is 1).
pub const FIRST_DEVICE_NODE_ID: u64 = 2;

#[derive(Debug, Default, Serialize, Deserialize)]
struct AdoptFile {
    #[serde(default)]
    node_ids: Vec<u64>,
}

/// Node ids that joined this fabric even when matter-controller did not persist
/// a DeviceEntry (CASE timed out after AddNOC). Survives process restart.
#[derive(Debug, Clone)]
pub struct AdoptStore {
    path: PathBuf,
    node_ids: HashSet<u64>,
}

impl AdoptStore {
    pub fn load(path: impl AsRef<Path>) -> Self {
        let path = path.as_ref().to_path_buf();
        let node_ids = match std::fs::read_to_string(&path) {
            Ok(raw) => serde_json::from_str::<AdoptFile>(&raw)
                .map(|file| file.node_ids.into_iter().collect())
                .unwrap_or_default(),
            Err(_) => HashSet::new(),
        };
        Self { path, node_ids }
    }

    pub fn ids(&self) -> impl Iterator<Item = u64> + '_ {
        self.node_ids.iter().copied()
    }

    pub fn is_empty(&self) -> bool {
        self.node_ids.is_empty()
    }

    pub fn insert(&mut self, node_id: u64) {
        if self.node_ids.insert(node_id) {
            self.persist();
        }
    }

    pub fn remove(&mut self, node_id: u64) {
        if self.node_ids.remove(&node_id) {
            self.persist();
        }
    }

    fn persist(&self) {
        if let Some(parent) = self.path.parent()
            && let Err(error) = std::fs::create_dir_all(parent)
        {
            warn!(error = %error, "failed to create adopt store directory");
            return;
        }
        let mut node_ids: Vec<u64> = self.node_ids.iter().copied().collect();
        node_ids.sort_unstable();
        let body = AdoptFile { node_ids };
        match serde_json::to_string_pretty(&body) {
            Ok(raw) => {
                if let Err(error) = std::fs::write(&self.path, raw) {
                    warn!(error = %error, "failed to write adopt store");
                }
            }
            Err(error) => warn!(error = %error, "failed to serialize adopt store"),
        }
    }
}

pub fn next_device_node_id(known: &HashSet<u64>) -> u64 {
    let max = known.iter().copied().max().unwrap_or(1);
    let mut candidate = max + 1;
    if candidate < FIRST_DEVICE_NODE_ID {
        candidate = FIRST_DEVICE_NODE_ID;
    }
    candidate
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn first_device_is_two() {
        assert_eq!(next_device_node_id(&HashSet::new()), 2);
    }

    #[test]
    fn allocates_past_highest() {
        let known = HashSet::from([2, 4]);
        assert_eq!(next_device_node_id(&known), 5);
    }
}
