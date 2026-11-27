//! Local sessions (NEM-126): on the home network an Access Client proves it
//! holds its Ed25519 key by signing a fresh Controller nonce. The TypeScript
//! twin is `@nemu/protocol/relay-crypto`'s `session.ts`.
//!
//! Also the checks Core runs on an Access Client's public keys before it binds
//! them into an Access grant, so the Rust and TypeScript verifiers never have
//! to disagree about a small-order key.

use curve25519_dalek::edwards::CompressedEdwardsY;
use curve25519_dalek::montgomery::MontgomeryPoint;
use ed25519_dalek::{Signature, Signer, SigningKey, VerifyingKey};

use super::wire::lv_cat;

pub const LOCAL_SESSION_LABEL: &[u8] = b"nemu-local-session-v1";
/// The Controller's nonces, and the Access Client's refusal nonces, are this
/// many bytes.
pub const NONCE_LEN: usize = 32;
pub const LAN_REFUSAL_LABEL: &[u8] = b"nemu-lan-refusal-v1";

/// A Controller's refusal of a Local session that tells the Access Client to
/// drop its keys and pair again. The Controller signs it over the client's
/// own fresh nonce, so nobody on the network can fake one or replay an old
/// one: an unsigned refusal never costs a client its keys.
#[derive(Debug, Clone, Copy)]
pub struct LanRefusal<'a> {
    pub controller_id: &'a str,
    pub access_client_id: &'a str,
    /// `unknown_access_client` or `tombstoned_access_client`.
    pub code: &'a str,
    pub client_nonce: &'a [u8],
}

/// The bytes the Controller signs for a [`LanRefusal`].
pub fn refusal_message(refusal: &LanRefusal<'_>) -> Vec<u8> {
    lv_cat(&[
        LAN_REFUSAL_LABEL,
        refusal.controller_id.as_bytes(),
        refusal.access_client_id.as_bytes(),
        refusal.code.as_bytes(),
        refusal.client_nonce,
    ])
}

pub fn sign_refusal(key: &SigningKey, refusal: &LanRefusal<'_>) -> [u8; 64] {
    key.sign(&refusal_message(refusal)).to_bytes()
}

#[derive(Debug, Clone, Copy)]
pub struct LocalSessionChallenge<'a> {
    pub controller_id: &'a str,
    pub access_client_id: &'a str,
    pub nonce: &'a [u8],
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, thiserror::Error)]
pub enum SessionRejection {
    #[error("bad_signature")]
    BadSignature,
}

/// The bytes the Access Client signs.
pub fn challenge_message(challenge: &LocalSessionChallenge<'_>) -> Vec<u8> {
    lv_cat(&[
        LOCAL_SESSION_LABEL,
        challenge.controller_id.as_bytes(),
        challenge.access_client_id.as_bytes(),
        challenge.nonce,
    ])
}

/// Access Client side; Core only uses it in tests.
#[cfg_attr(not(test), allow(dead_code))]
pub fn sign_challenge(key: &SigningKey, challenge: &LocalSessionChallenge<'_>) -> [u8; 64] {
    key.sign(&challenge_message(challenge)).to_bytes()
}

/// Strict Ed25519 verification against a key Core already accepted.
pub fn verify_challenge(
    signing_key: &[u8; 32],
    challenge: &LocalSessionChallenge<'_>,
    signature: &[u8],
) -> Result<(), SessionRejection> {
    let signature: [u8; 64] = signature
        .try_into()
        .map_err(|_| SessionRejection::BadSignature)?;
    let key = VerifyingKey::from_bytes(signing_key).map_err(|_| SessionRejection::BadSignature)?;
    key.verify_strict(
        &challenge_message(challenge),
        &Signature::from_bytes(&signature),
    )
    .map_err(|_| SessionRejection::BadSignature)
}

/// An Ed25519 public key Core will bind: the canonical encoding of a point
/// in the prime-order subgroup (not of small order, no torsion part). The
/// TypeScript twin is `signing.ts`'s `acceptableSigningKey`; with it, both
/// sides' strict verifiers accept exactly the same signatures.
pub fn acceptable_signing_key(key: &[u8; 32]) -> bool {
    CompressedEdwardsY(*key).decompress().is_some_and(|point| {
        point.compress().to_bytes() == *key && !point.is_small_order() && point.is_torsion_free()
    })
}

/// An X25519 public key Core will bind: not of small order, so a shared
/// secret with it is never predictable.
pub fn acceptable_encryption_key(key: &[u8; 32]) -> bool {
    MontgomeryPoint(*key)
        .to_edwards(0)
        .is_some_and(|point| !point.is_small_order())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn small_order_keys_are_refused() {
        let identity = {
            let mut bytes = [0u8; 32];
            bytes[0] = 1;
            bytes
        };
        assert!(!acceptable_signing_key(&identity));
        assert!(!acceptable_encryption_key(&[0u8; 32]));
        assert!(!acceptable_encryption_key(&identity));

        let signing = SigningKey::from_bytes(&[7u8; 32]);
        assert!(acceptable_signing_key(&signing.verifying_key().to_bytes()));
        let encryption = crate::relay_crypto::hpke::public_key(&[9u8; 32]);
        assert!(acceptable_encryption_key(&encryption));
    }
}
