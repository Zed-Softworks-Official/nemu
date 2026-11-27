//! HPKE base mode (RFC 9180) for one suite only:
//! DHKEM(X25519, HKDF-SHA256), HKDF-SHA256, ChaCha20-Poly1305
//! (`kem_id` 0x0020, `kdf_id` 0x0001, `aead_id` 0x0003).

use chacha20poly1305::aead::{Aead, Payload};
use chacha20poly1305::{ChaCha20Poly1305, KeyInit as AeadKeyInit, Nonce};
use curve25519_dalek::montgomery::MontgomeryPoint;
use hkdf::Hkdf;
use hmac::{Hmac, KeyInit, Mac};
use rand::Rng;
use sha2::Sha256;
use subtle::ConstantTimeEq;

const KEM_SUITE_ID: &[u8] = b"KEM\x00\x20";
const HPKE_SUITE_ID: &[u8] = b"HPKE\x00\x20\x00\x01\x00\x03";
const VERSION_LABEL: &[u8] = b"HPKE-v1";
const MODE_BASE: u8 = 0x00;

pub const KEY_LEN: usize = 32;
pub const NONCE_LEN: usize = 12;

#[derive(Debug, Clone, Copy, PartialEq, Eq, thiserror::Error)]
pub enum HpkeError {
    /// The X25519 shared secret was all zeros (a low-order public key).
    #[error("invalid_public_key")]
    InvalidPublicKey,
    #[error("decrypt_failed")]
    DecryptFailed,
}

fn labeled_extract(suite_id: &[u8], salt: &[u8], label: &[u8], ikm: &[u8]) -> [u8; 32] {
    let mut mac =
        <Hmac<Sha256> as KeyInit>::new_from_slice(salt).expect("HMAC takes any key length");
    mac.update(VERSION_LABEL);
    mac.update(suite_id);
    mac.update(label);
    mac.update(ikm);
    mac.finalize().into_bytes().into()
}

fn labeled_expand(suite_id: &[u8], prk: &[u8; 32], label: &[u8], info: &[u8], out: &mut [u8]) {
    let len = u16::try_from(out.len()).expect("HPKE output length fits in two bytes");
    let mut labeled_info =
        Vec::with_capacity(2 + VERSION_LABEL.len() + suite_id.len() + label.len() + info.len());
    labeled_info.extend_from_slice(&len.to_be_bytes());
    labeled_info.extend_from_slice(VERSION_LABEL);
    labeled_info.extend_from_slice(suite_id);
    labeled_info.extend_from_slice(label);
    labeled_info.extend_from_slice(info);
    Hkdf::<Sha256>::from_prk(prk)
        .expect("PRK is one hash long")
        .expand(&labeled_info, out)
        .expect("HPKE never asks for more than 255 blocks");
}

/// X25519 public key for a secret key.
pub fn public_key(secret_key: &[u8; 32]) -> [u8; 32] {
    MontgomeryPoint::mul_base_clamped(*secret_key).to_bytes()
}

/// RFC 9180 section 7.1.3 `DeriveKeyPair` for X25519.
pub fn derive_key_pair(ikm: &[u8]) -> ([u8; 32], [u8; 32]) {
    let dkp_prk = labeled_extract(KEM_SUITE_ID, b"", b"dkp_prk", ikm);
    let mut secret_key = [0u8; 32];
    labeled_expand(KEM_SUITE_ID, &dkp_prk, b"sk", b"", &mut secret_key);
    let public = public_key(&secret_key);
    (secret_key, public)
}

fn dh(secret_key: &[u8; 32], public_key: &[u8; 32]) -> Result<[u8; 32], HpkeError> {
    let shared = MontgomeryPoint(*public_key)
        .mul_clamped(*secret_key)
        .to_bytes();
    if bool::from(shared.ct_eq(&[0u8; 32])) {
        return Err(HpkeError::InvalidPublicKey);
    }
    Ok(shared)
}

fn extract_and_expand(dh: &[u8; 32], kem_context: &[u8]) -> [u8; 32] {
    let eae_prk = labeled_extract(KEM_SUITE_ID, b"", b"eae_prk", dh);
    let mut shared_secret = [0u8; 32];
    labeled_expand(
        KEM_SUITE_ID,
        &eae_prk,
        b"shared_secret",
        kem_context,
        &mut shared_secret,
    );
    shared_secret
}

/// An HPKE encryption context (RFC 9180 section 5.2).
pub struct Context {
    key: [u8; KEY_LEN],
    base_nonce: [u8; NONCE_LEN],
    exporter_secret: [u8; 32],
    seq: u64,
}

impl Context {
    fn key_schedule(shared_secret: &[u8; 32], info: &[u8]) -> Self {
        let psk_id_hash = labeled_extract(HPKE_SUITE_ID, b"", b"psk_id_hash", b"");
        let info_hash = labeled_extract(HPKE_SUITE_ID, b"", b"info_hash", info);
        let mut key_schedule_context = Vec::with_capacity(65);
        key_schedule_context.push(MODE_BASE);
        key_schedule_context.extend_from_slice(&psk_id_hash);
        key_schedule_context.extend_from_slice(&info_hash);
        let secret = labeled_extract(HPKE_SUITE_ID, shared_secret, b"secret", b"");
        let mut key = [0u8; KEY_LEN];
        let mut base_nonce = [0u8; NONCE_LEN];
        let mut exporter_secret = [0u8; 32];
        labeled_expand(
            HPKE_SUITE_ID,
            &secret,
            b"key",
            &key_schedule_context,
            &mut key,
        );
        labeled_expand(
            HPKE_SUITE_ID,
            &secret,
            b"base_nonce",
            &key_schedule_context,
            &mut base_nonce,
        );
        labeled_expand(
            HPKE_SUITE_ID,
            &secret,
            b"exp",
            &key_schedule_context,
            &mut exporter_secret,
        );
        Self {
            key,
            base_nonce,
            exporter_secret,
            seq: 0,
        }
    }

    fn nonce(&self) -> [u8; NONCE_LEN] {
        let mut nonce = self.base_nonce;
        for (byte, seq) in nonce[NONCE_LEN - 8..]
            .iter_mut()
            .zip(self.seq.to_be_bytes())
        {
            *byte ^= seq;
        }
        nonce
    }

    pub fn seal(&mut self, aad: &[u8], plaintext: &[u8]) -> Vec<u8> {
        let ciphertext = aead_seal(&self.key, &self.nonce(), aad, plaintext);
        self.seq += 1;
        ciphertext
    }

    /// The sequence number only advances when the ciphertext opens.
    pub fn open(&mut self, aad: &[u8], ciphertext: &[u8]) -> Result<Vec<u8>, HpkeError> {
        let plaintext = aead_open(&self.key, &self.nonce(), aad, ciphertext)?;
        self.seq += 1;
        Ok(plaintext)
    }

    /// RFC 9180 section 5.3 secret export.
    pub fn export(&self, exporter_context: &[u8], out: &mut [u8]) {
        labeled_expand(
            HPKE_SUITE_ID,
            &self.exporter_secret,
            b"sec",
            exporter_context,
            out,
        );
    }
}

/// `SetupBaseS` with a random ephemeral key.
pub fn setup_base_sender(
    recipient_public_key: &[u8; 32],
    info: &[u8],
) -> Result<([u8; 32], Context), HpkeError> {
    let mut ikm = [0u8; 32];
    rand::rng().fill_bytes(&mut ikm);
    setup_base_sender_with_ikm(recipient_public_key, info, &ikm)
}

/// `SetupBaseS` with the ephemeral key derived from `ikm_e`, for wire vectors.
pub fn setup_base_sender_with_ikm(
    recipient_public_key: &[u8; 32],
    info: &[u8],
    ikm_e: &[u8],
) -> Result<([u8; 32], Context), HpkeError> {
    let (secret_e, enc) = derive_key_pair(ikm_e);
    let dh = dh(&secret_e, recipient_public_key)?;
    let mut kem_context = [0u8; 64];
    kem_context[..32].copy_from_slice(&enc);
    kem_context[32..].copy_from_slice(recipient_public_key);
    let shared_secret = extract_and_expand(&dh, &kem_context);
    Ok((enc, Context::key_schedule(&shared_secret, info)))
}

/// `SetupBaseR`.
pub fn setup_base_receiver(
    enc: &[u8; 32],
    recipient_secret_key: &[u8; 32],
    info: &[u8],
) -> Result<Context, HpkeError> {
    let dh = dh(recipient_secret_key, enc)?;
    let mut kem_context = [0u8; 64];
    kem_context[..32].copy_from_slice(enc);
    kem_context[32..].copy_from_slice(&public_key(recipient_secret_key));
    let shared_secret = extract_and_expand(&dh, &kem_context);
    Ok(Context::key_schedule(&shared_secret, info))
}

/// ChaCha20-Poly1305 with an explicit nonce, for keys exported from a context.
pub fn aead_seal(
    key: &[u8; KEY_LEN],
    nonce: &[u8; NONCE_LEN],
    aad: &[u8],
    plaintext: &[u8],
) -> Vec<u8> {
    <ChaCha20Poly1305 as AeadKeyInit>::new(key.into())
        .encrypt(
            Nonce::from_slice(nonce),
            Payload {
                msg: plaintext,
                aad,
            },
        )
        .expect("ChaCha20-Poly1305 encryption cannot fail for in-range lengths")
}

pub fn aead_open(
    key: &[u8; KEY_LEN],
    nonce: &[u8; NONCE_LEN],
    aad: &[u8],
    ciphertext: &[u8],
) -> Result<Vec<u8>, HpkeError> {
    <ChaCha20Poly1305 as AeadKeyInit>::new(key.into())
        .decrypt(
            Nonce::from_slice(nonce),
            Payload {
                msg: ciphertext,
                aad,
            },
        )
        .map_err(|_| HpkeError::DecryptFailed)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn low_order_public_keys_are_rejected() {
        let err = setup_base_sender_with_ikm(&[0u8; 32], b"", &[1u8; 32])
            .err()
            .unwrap();
        assert_eq!(err, HpkeError::InvalidPublicKey);
    }

    #[test]
    fn sender_and_receiver_round_trip() {
        let (secret_r, public_r) = derive_key_pair(b"recipient");
        let (enc, mut sender) = setup_base_sender(&public_r, b"info").unwrap();
        let mut receiver = setup_base_receiver(&enc, &secret_r, b"info").unwrap();
        let ct = sender.seal(b"aad", b"hello");
        assert_eq!(receiver.open(b"aad", &ct).unwrap(), b"hello");
        let ct = sender.seal(b"aad", b"again");
        assert_eq!(
            receiver.open(b"other", &ct).unwrap_err(),
            HpkeError::DecryptFailed
        );
    }
}
