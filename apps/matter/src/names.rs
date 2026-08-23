use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tracing::warn;

#[derive(Debug, Default, Serialize, Deserialize)]
struct NameFile {
    names: HashMap<String, String>,
}

#[derive(Debug, Clone)]
pub struct NameStore {
    path: PathBuf,
    names: HashMap<String, String>,
}

impl NameStore {
    pub fn load(path: impl AsRef<Path>) -> Self {
        let path = path.as_ref().to_path_buf();
        let names = match std::fs::read_to_string(&path) {
            Ok(raw) => serde_json::from_str::<NameFile>(&raw)
                .map(|file| file.names)
                .unwrap_or_default(),
            Err(_) => HashMap::new(),
        };
        Self { path, names }
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
                if let Err(error) = std::fs::write(&self.path, raw) {
                    warn!(error = %error, "failed to write name store");
                }
            }
            Err(error) => warn!(error = %error, "failed to serialize name store"),
        }
    }
}
