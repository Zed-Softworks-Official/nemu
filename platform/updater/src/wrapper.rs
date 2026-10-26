//! The wrapper pins the release-signing public key.
//!
//! The first wrapper is the pin file already on the Home. A Release does not
//! sign that file, and a Release cannot create it. A later Release may carry
//! a new pin. The Home installs that pin only after the health gate and keeps
//! the previous wrapper.

use std::path::Path;

use base64::Engine;
use base64::engine::general_purpose::STANDARD as BASE64;
use ed25519_dalek::VerifyingKey;

pub(crate) const CURRENT_PIN: &str = "updater/release-public-key";
pub(crate) const PREVIOUS_WRAPPER: &str = "updater/previous-wrapper";

/// The pin the current wrapper trusts. Missing means this Home has no wrapper yet.
pub(crate) fn load_pin(controller_dir: &Path) -> Option<VerifyingKey> {
    read_pin_file(&controller_dir.join(CURRENT_PIN))
}

/// Replaces the current pin and keeps the previous wrapper.
///
/// A Home with no pin file is left unchanged. The first wrapper is the one
/// placed with the Home, not one a Release writes.
pub(crate) fn commit_pin(controller_dir: &Path, next: &VerifyingKey) -> Result<(), std::io::Error> {
    let current = controller_dir.join(CURRENT_PIN);
    if !current.is_file() {
        return Ok(());
    }
    let previous = controller_dir.join(PREVIOUS_WRAPPER);
    if let Some(parent) = previous.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::copy(&current, &previous)?;
    std::fs::write(&current, next.to_bytes())?;
    Ok(())
}

fn read_pin_file(path: &Path) -> Option<VerifyingKey> {
    let bytes = std::fs::read(path).ok()?;
    let key = if bytes.len() == 32 {
        bytes
    } else {
        let text = String::from_utf8(bytes).ok()?;
        BASE64.decode(text.trim()).ok()?
    };
    let key: [u8; 32] = key.try_into().ok()?;
    VerifyingKey::from_bytes(&key).ok()
}
