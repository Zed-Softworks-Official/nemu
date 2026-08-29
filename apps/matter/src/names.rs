use std::collections::{HashMap, HashSet};
use std::io::Write;
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
    persist_enabled: bool,
}

impl NameStore {
    pub fn load(path: impl AsRef<Path>) -> Self {
        let path = path.as_ref().to_path_buf();
        let (names, persist_enabled) = match std::fs::read_to_string(&path) {
            Ok(raw) => match serde_json::from_str::<NameFile>(&raw) {
                Ok(file) => (file.names, true),
                Err(error) => {
                    warn!(
                        error = %error,
                        path = %path.display(),
                        "malformed name store; preserving on disk"
                    );
                    (HashMap::new(), false)
                }
            },
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => (HashMap::new(), true),
            Err(error) => {
                warn!(
                    error = %error,
                    path = %path.display(),
                    "failed to read name store; preserving on disk"
                );
                (HashMap::new(), false)
            }
        };
        Self {
            path,
            names,
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

fn persist_atomically(path: &Path, raw: &str) -> std::io::Result<()> {
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("store.json");
    let tmp = path.with_file_name(format!(".{file_name}.tmp"));
    let result = (|| {
        let mut file = std::fs::File::create(&tmp)?;
        file.write_all(raw.as_bytes())?;
        file.sync_all()?;
        std::fs::rename(&tmp, path)
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(&tmp);
    }
    result
}
