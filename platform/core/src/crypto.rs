use base64::Engine;
use base64::engine::general_purpose::STANDARD as BASE64;
use ed25519_dalek::{Signer, SigningKey, VerifyingKey};
use rand::{Rng, RngExt};
use sha2::{Digest, Sha256};

pub fn sha256_hex(input: &str) -> String {
    let digest = Sha256::digest(input.as_bytes());
    hex::encode(digest)
}

pub fn random_token() -> String {
    let mut bytes = [0u8; 32];
    rand::rng().fill_bytes(&mut bytes);
    hex::encode(bytes)
}

pub fn generate_pairing_code() -> String {
    let n = rand::rng().random_range(0..1_000_000u32);
    format!("{n:06}")
}

pub fn generate_controller_id() -> String {
    format!("nemu_{}", &random_token()[..16])
}

#[derive(Clone)]
pub struct ControllerKeypair {
    pub signing_key: SigningKey,
    pub public_key_b64: String,
    pub private_key_b64: String,
}

impl std::fmt::Debug for ControllerKeypair {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ControllerKeypair")
            .field("public_key_b64", &self.public_key_b64)
            .field("private_key_b64", &"***")
            .finish()
    }
}

impl ControllerKeypair {
    pub fn generate() -> Self {
        let signing_key = SigningKey::generate(&mut rand::rng());
        Self::from_signing_key(signing_key)
    }

    pub fn from_private_key_b64(private_key_b64: &str) -> Result<Self, String> {
        let bytes = BASE64
            .decode(private_key_b64)
            .map_err(|e| format!("invalid private key encoding: {e}"))?;
        let arr: [u8; 32] = bytes
            .try_into()
            .map_err(|_| "private key must be 32 bytes".to_string())?;
        Ok(Self::from_signing_key(SigningKey::from_bytes(&arr)))
    }

    fn from_signing_key(signing_key: SigningKey) -> Self {
        let verifying: VerifyingKey = signing_key.verifying_key();
        Self {
            public_key_b64: BASE64.encode(verifying.as_bytes()),
            private_key_b64: BASE64.encode(signing_key.to_bytes()),
            signing_key,
        }
    }

    pub fn sign_b64(&self, message: &[u8]) -> String {
        let sig = self.signing_key.sign(message);
        BASE64.encode(sig.to_bytes())
    }
}
