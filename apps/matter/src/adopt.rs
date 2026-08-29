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

/// Node ids to probe after a failed wildcard refresh (boot). Prefer ids mDNS
/// is advertising, then recently adopted nodes. Do not guess the next id — that
/// node was never commissioned and racing it during pairing breaks CASE.
pub fn recover_node_ids(known: &HashSet<u64>, mdns_hints: &[u64]) -> Vec<u64> {
    let mut adopted: Vec<u64> = known
        .iter()
        .copied()
        .filter(|&id| id >= FIRST_DEVICE_NODE_ID)
        .collect();
    adopted.sort_unstable_by(|a, b| b.cmp(a));
    unique_front(
        mdns_hints
            .iter()
            .copied()
            .filter(|&id| id >= FIRST_DEVICE_NODE_ID)
            .chain(adopted),
    )
}

/// After BLE CASE fails, AddNOC has usually already assigned `next`. Stale
/// adopted ids are ghosts; trying them burns the device's failsafe window.
pub fn ble_recover_node_ids(known: &HashSet<u64>, mdns_hints: &[u64]) -> Vec<u64> {
    let next = next_device_node_id(known);
    unique_front(
        mdns_hints
            .iter()
            .copied()
            .filter(|&id| id >= FIRST_DEVICE_NODE_ID)
            .chain(std::iter::once(next)),
    )
}

pub(crate) fn unique_front(ids: impl IntoIterator<Item = u64>) -> Vec<u64> {
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    for id in ids {
        if seen.insert(id) {
            out.push(id);
        }
    }
    out
}

/// Operational mDNS instance names are `{compressedFabric}-{nodeId}` as 16-digit hex.
/// Prefer ids listed after `none matching:` — those are live on the LAN, not the
/// id we guessed and failed to find.
pub fn node_ids_from_mdns_error(raw: &str) -> Vec<u64> {
    if let Some(rest) = raw.split("none matching:").nth(1) {
        let seen = operational_node_ids(rest);
        if !seen.is_empty() {
            return seen;
        }
    }
    Vec::new()
}

fn operational_node_ids(raw: &str) -> Vec<u64> {
    unique_front(
        raw.split(|c: char| !(c.is_ascii_hexdigit() || c == '-'))
            .filter_map(|token| {
                let (fabric, node) = token.split_once('-')?;
                if fabric.len() != 16 || node.len() != 16 {
                    return None;
                }
                if !fabric.chars().all(|c| c.is_ascii_hexdigit())
                    || !node.chars().all(|c| c.is_ascii_hexdigit())
                {
                    return None;
                }
                u64::from_str_radix(node, 16)
                    .ok()
                    .filter(|&id| id >= FIRST_DEVICE_NODE_ID)
            }),
    )
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

    #[test]
    fn boot_recover_skips_unallocated_next_id() {
        let known = HashSet::from([4, 5]);
        assert_eq!(recover_node_ids(&known, &[5]), vec![5, 4]);
        assert_eq!(recover_node_ids(&known, &[]), vec![5, 4]);
    }

    #[test]
    fn ble_recover_tries_live_mdns_then_next() {
        let known = HashSet::from([4, 5]);
        assert_eq!(ble_recover_node_ids(&known, &[]), vec![6]);
        assert_eq!(ble_recover_node_ids(&known, &[5]), vec![5, 6]);
    }

    #[test]
    fn parses_live_node_from_mdns_mismatch() {
        let raw = "operational node 23eb1b69ccf1eaf6-0000000000000006 not found via mDNS \
             (saw 1 operational mDNS record(s), none matching: 23eb1b69ccf1eaf6-0000000000000005)";
        assert_eq!(node_ids_from_mdns_error(raw), vec![5]);
    }

    #[test]
    fn empty_mdns_browse_has_no_hint() {
        let raw = "saw 0 operational mDNS records — either no _matter._tcp response reached this host";
        assert!(node_ids_from_mdns_error(raw).is_empty());
    }
}
