use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tracing::warn;

use crate::store::{load_persisted, persist_atomically};

#[derive(Debug, Default, Serialize, Deserialize)]
struct NameFile {
    names: HashMap<String, String>,
}

#[derive(Debug, Clone)]
pub struct NameStore {
    path: PathBuf,
    names: HashMap<String, String>,
    persist_enabled: bool,
}

impl NameStore {
    pub fn load(path: impl AsRef<Path>) -> Self {
        let path = path.as_ref().to_path_buf();
        let (file, persist_enabled) = load_persisted::<NameFile>(&path, "name store");
        Self {
            path,
            names: file.names,
            persist_enabled,
        }
    }

    pub fn get(&self, id: &str) -> Option<&str> {
        self.names.get(id).map(String::as_str)
    }

    pub fn set(&mut self, id: &str, name: &str) {
        self.names.insert(id.to_string(), name.to_string());
        self.persist();
    }

    pub fn retain_only(&mut self, keep: &HashSet<String>) {
        self.names.retain(|id, _| keep.contains(id));
        self.persist();
    }

    fn persist(&self) {
        if !self.persist_enabled {
            return;
        }
        if let Some(parent) = self.path.parent()
            && let Err(error) = std::fs::create_dir_all(parent)
        {
            warn!(error = %error, "failed to create name store directory");
            return;
        }
        let body = NameFile {
            names: self.names.clone(),
        };
        match serde_json::to_string_pretty(&body) {
            Ok(raw) => {
                if let Err(error) = persist_atomically(&self.path, &raw) {
                    warn!(error = %error, "failed to write name store");
                }
            }
            Err(error) => warn!(error = %error, "failed to serialize name store"),
        }
    }
}
