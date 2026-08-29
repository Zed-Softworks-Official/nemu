use std::io::Write;
use std::path::Path;

use serde::de::DeserializeOwned;
use tracing::warn;

pub fn persist_atomically(path: &Path, raw: &str) -> std::io::Result<()> {
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

pub fn load_persisted<T>(path: &Path, label: &str) -> (T, bool)
where
    T: DeserializeOwned + Default,
{
    match std::fs::read_to_string(path) {
        Ok(raw) => match serde_json::from_str::<T>(&raw) {
            Ok(value) => (value, true),
            Err(error) => {
                warn!(
                    error = %error,
                    path = %path.display(),
                    "malformed {}; preserving on disk",
                    label
                );
                (T::default(), false)
            }
        },
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => (T::default(), true),
        Err(error) => {
            warn!(
                error = %error,
                path = %path.display(),
                "failed to read {}; preserving on disk",
                label
            );
            (T::default(), false)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::{Deserialize, Serialize};

    #[derive(Debug, Default, PartialEq, Serialize, Deserialize)]
    struct Sample {
        value: i32,
    }

    fn temp_path(name: &str) -> std::path::PathBuf {
        std::env::temp_dir().join(format!(
            "nemu-store-{name}-{}-{}.json",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0)
        ))
    }

    #[test]
    fn persist_roundtrip() {
        let path = temp_path("roundtrip");
        persist_atomically(&path, "{\"value\":7}").unwrap();
        let (sample, persist_enabled) = load_persisted::<Sample>(&path, "sample");
        let _ = std::fs::remove_file(&path);
        assert_eq!(sample, Sample { value: 7 });
        assert!(persist_enabled);
    }

    #[test]
    fn missing_file_enables_persist() {
        let path = temp_path("missing");
        let _ = std::fs::remove_file(&path);
        let (sample, persist_enabled) = load_persisted::<Sample>(&path, "sample");
        assert_eq!(sample, Sample::default());
        assert!(persist_enabled);
    }

    #[test]
    fn malformed_file_disables_persist() {
        let path = temp_path("malformed");
        std::fs::write(&path, "{not json").unwrap();
        let (sample, persist_enabled) = load_persisted::<Sample>(&path, "sample");
        let _ = std::fs::remove_file(&path);
        assert_eq!(sample, Sample::default());
        assert!(!persist_enabled);
    }
}
