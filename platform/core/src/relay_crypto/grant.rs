//! Access grants: Controller-signed EdDSA JWS (RFC 7515 compact form) that
//! bind an Access Client's two public keys to one Membership.
//!
//! A grant carries no role; the Controller looks the role up per request. It
//! stays valid offline until revoked and survives a Home restore, so it
//! carries no identity epoch and no expiry.

use ed25519_dalek::{Signature, Signer, SigningKey, VerifyingKey};
use serde::{Deserialize, Serialize};

use super::wire::{
    MAX_SAFE_INTEGER, b64url_decode, b64url_decode_32, b64url_decode_64, b64url_encode,
};

pub const GRANT_TYPE: &str = "nemu-access-grant+jwt";
/// The exact protected header every grant carries.
const PROTECTED_HEADER: &str = r#"{"alg":"EdDSA","typ":"nemu-access-grant+jwt"}"#;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AccessGrant {
    pub controller_id: String,
    pub access_client_id: String,
    pub membership_id: String,
    /// The Access Client's Ed25519 public key.
    pub signing_key: [u8; 32],
    /// The Access Client's X25519 public key.
    pub encryption_key: [u8; 32],
    /// Issue time, seconds since the Unix epoch.
    pub issued_at: u64,
}

/// JSON claim set, in serialization order.
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Claims {
    controller_id: String,
    access_client_id: String,
    membership_id: String,
    signing_key: String,
    encryption_key: String,
    iat: u64,
}

#[derive(Deserialize)]
struct ProtectedHeader {
    alg: String,
    typ: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, thiserror::Error)]
pub enum GrantRejection {
    #[error("malformed")]
    Malformed,
    #[error("unsupported_algorithm")]
    UnsupportedAlgorithm,
    #[error("bad_signature")]
    BadSignature,
    #[error("wrong_controller")]
    WrongController,
}

pub fn issue_grant(grant: &AccessGrant, controller_signing_key: &SigningKey) -> String {
    let claims = Claims {
        controller_id: grant.controller_id.clone(),
        access_client_id: grant.access_client_id.clone(),
        membership_id: grant.membership_id.clone(),
        signing_key: b64url_encode(&grant.signing_key),
        encryption_key: b64url_encode(&grant.encryption_key),
        iat: grant.issued_at,
    };
    let payload = serde_json::to_vec(&claims).expect("claims serialize");
    let signing_input = format!(
        "{}.{}",
        b64url_encode(PROTECTED_HEADER.as_bytes()),
        b64url_encode(&payload)
    );
    let signature = controller_signing_key.sign(signing_input.as_bytes());
    format!("{signing_input}.{}", b64url_encode(&signature.to_bytes()))
}

/// Verifies a grant against the Controller's Ed25519 key and ID.
pub fn verify_grant(
    jws: &str,
    controller_id: &str,
    controller_signing_key: &[u8; 32],
) -> Result<AccessGrant, GrantRejection> {
    let mut parts = jws.split('.');
    let (Some(header_b64), Some(payload_b64), Some(signature_b64), None) =
        (parts.next(), parts.next(), parts.next(), parts.next())
    else {
        return Err(GrantRejection::Malformed);
    };
    let header_json = b64url_decode(header_b64).ok_or(GrantRejection::Malformed)?;
    let header: ProtectedHeader =
        serde_json::from_slice(&header_json).map_err(|_| GrantRejection::Malformed)?;
    if header.alg != "EdDSA" || header.typ != GRANT_TYPE {
        return Err(GrantRejection::UnsupportedAlgorithm);
    }
    let signature = b64url_decode_64(signature_b64).ok_or(GrantRejection::Malformed)?;
    let key = VerifyingKey::from_bytes(controller_signing_key)
        .map_err(|_| GrantRejection::BadSignature)?;
    let signing_input = &jws[..header_b64.len() + 1 + payload_b64.len()];
    key.verify_strict(signing_input.as_bytes(), &Signature::from_bytes(&signature))
        .map_err(|_| GrantRejection::BadSignature)?;

    let payload = b64url_decode(payload_b64).ok_or(GrantRejection::Malformed)?;
    let claims: Claims = serde_json::from_slice(&payload).map_err(|_| GrantRejection::Malformed)?;
    if claims.iat > MAX_SAFE_INTEGER
        || claims.access_client_id.is_empty()
        || claims.membership_id.is_empty()
    {
        return Err(GrantRejection::Malformed);
    }
    let grant = AccessGrant {
        signing_key: b64url_decode_32(&claims.signing_key).ok_or(GrantRejection::Malformed)?,
        encryption_key: b64url_decode_32(&claims.encryption_key)
            .ok_or(GrantRejection::Malformed)?,
        controller_id: claims.controller_id,
        access_client_id: claims.access_client_id,
        membership_id: claims.membership_id,
        issued_at: claims.iat,
    };
    if grant.controller_id != controller_id {
        return Err(GrantRejection::WrongController);
    }
    Ok(grant)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn grant() -> AccessGrant {
        AccessGrant {
            controller_id: "nemu_0123456789abcdef".into(),
            access_client_id: "ac_1".into(),
            membership_id: "m_1".into(),
            signing_key: [4u8; 32],
            encryption_key: [5u8; 32],
            issued_at: 1_790_000_000,
        }
    }

    #[test]
    fn issues_and_verifies() {
        let key = SigningKey::from_bytes(&[1u8; 32]);
        let jws = issue_grant(&grant(), &key);
        let verified = verify_grant(
            &jws,
            "nemu_0123456789abcdef",
            &key.verifying_key().to_bytes(),
        )
        .unwrap();
        assert_eq!(verified, grant());
    }

    #[test]
    fn rejects_another_controller_and_another_key() {
        let key = SigningKey::from_bytes(&[1u8; 32]);
        let jws = issue_grant(&grant(), &key);
        let public = key.verifying_key().to_bytes();
        assert_eq!(
            verify_grant(&jws, "nemu_other", &public).unwrap_err(),
            GrantRejection::WrongController
        );
        let other = SigningKey::from_bytes(&[2u8; 32])
            .verifying_key()
            .to_bytes();
        assert_eq!(
            verify_grant(&jws, "nemu_0123456789abcdef", &other).unwrap_err(),
            GrantRejection::BadSignature
        );
        assert_eq!(
            verify_grant("a.b", "x", &public).unwrap_err(),
            GrantRejection::Malformed
        );
    }
}
