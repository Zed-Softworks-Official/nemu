//! CPace (draft-irtf-cfrg-cpace-21) on ristretto255 with SHA-512, in the
//! initiator-responder setting, plus Nemu's pairing binding (ADR-0037).
//!
//! The Access Client is the initiator (A) and the Controller the responder (B):
//!
//! 1. A -> B: `Ya`, `ADa` (the Access Client's Ed25519 and X25519 public keys)
//! 2. B -> A: `Yb`, `ADb` (the Controller's keys) and B's confirmation tag `Tb`
//! 3. A -> B: A's confirmation tag `Ta`
//!
//! The PRS is the Pairing code. The channel identifier binds the run to the
//! Controller ID and the protocol version; `sid` is a fresh nonce both sides
//! know before the run. Key confirmation follows the draft's section 10.4.

use curve25519_dalek::ristretto::{CompressedRistretto, RistrettoPoint};
use curve25519_dalek::scalar::Scalar;
use curve25519_dalek::traits::IsIdentity;
use hmac::{Hmac, KeyInit, Mac};
use rand::Rng;
use sha2::{Digest, Sha512};
use subtle::ConstantTimeEq;

use super::wire::{lv_cat, lv_split, prepend_len_size};

pub const DSI: &[u8] = b"CPaceRistretto255";
const DSI_ISK: &[u8] = b"CPaceRistretto255_ISK";
/// SHA-512 input block size.
const S_IN_BYTES: usize = 128;

/// Channel identifier label; changes with any incompatible pairing change.
pub const PAIRING_LABEL: &[u8] = b"nemu-pairing-v1";
const ACCESS_CLIENT_AD_LABEL: &[u8] = b"access-client";
const CONTROLLER_AD_LABEL: &[u8] = b"controller";

#[derive(Debug, Clone, Copy, PartialEq, Eq, thiserror::Error)]
pub enum CpaceError {
    /// The peer's share is not a canonical ristretto255 encoding, or is the
    /// identity element.
    #[error("invalid_point")]
    InvalidPoint,
    #[error("invalid_associated_data")]
    InvalidAssociatedData,
    /// The peer's confirmation tag is wrong: a wrong Pairing code, a changed
    /// transcript, or a different channel.
    #[error("confirmation_failed")]
    ConfirmationFailed,
}

// ---------------------------------------------------------------------------
// Draft functions (section 7 and 8.3), exposed for the draft's test vectors.

pub fn generator_string(prs: &[u8], ci: &[u8], sid: &[u8]) -> Vec<u8> {
    let len_zpad = S_IN_BYTES.saturating_sub(prepend_len_size(prs) + prepend_len_size(DSI) + 1);
    let zpad = vec![0u8; len_zpad];
    lv_cat(&[DSI, prs, &zpad, ci, sid])
}

pub fn calculate_generator(prs: &[u8], ci: &[u8], sid: &[u8]) -> RistrettoPoint {
    let hash: [u8; 64] = Sha512::digest(generator_string(prs, ci, sid)).into();
    RistrettoPoint::from_uniform_bytes(&hash)
}

/// Draft section 8.3 `sample_scalar`: 32 random bytes with the bits above
/// `group_size_bits` (252) cleared.
pub fn sample_scalar() -> [u8; 32] {
    let mut bytes = [0u8; 32];
    rand::rng().fill_bytes(&mut bytes);
    bytes[31] &= 0x0f;
    bytes
}

pub fn scalar_mult(y: &[u8; 32], g: &RistrettoPoint) -> [u8; 32] {
    (Scalar::from_bytes_mod_order(*y) * g).compress().to_bytes()
}

/// Returns `None` where the draft returns `G.I`: an encoding that fails to
/// decode, or a product that is the identity.
pub fn scalar_mult_vfy(y: &[u8; 32], x: &[u8]) -> Option<[u8; 32]> {
    let point = CompressedRistretto::from_slice(x).ok()?.decompress()?;
    let k = Scalar::from_bytes_mod_order(*y) * point;
    if k.is_identity() {
        return None;
    }
    Some(k.compress().to_bytes())
}

pub fn transcript_ir(ya: &[u8], ad_a: &[u8], yb: &[u8], ad_b: &[u8]) -> Vec<u8> {
    let mut out = lv_cat(&[ya, ad_a]);
    out.extend(lv_cat(&[yb, ad_b]));
    out
}

pub fn isk_ir(
    sid: &[u8],
    k: &[u8; 32],
    ya: &[u8],
    ad_a: &[u8],
    yb: &[u8],
    ad_b: &[u8],
) -> [u8; 64] {
    let mut hasher = Sha512::new();
    hasher.update(lv_cat(&[DSI_ISK, sid, k]));
    hasher.update(transcript_ir(ya, ad_a, yb, ad_b));
    hasher.finalize().into()
}

pub fn sid_output_ir(ya: &[u8], ad_a: &[u8], yb: &[u8], ad_b: &[u8]) -> [u8; 64] {
    let mut hasher = Sha512::new();
    hasher.update(b"CPaceSidOutput");
    hasher.update(transcript_ir(ya, ad_a, yb, ad_b));
    hasher.finalize().into()
}

/// Draft section 10.4: `MAC(H(b"CPaceMac" || sid || ISK), lv_cat(Y, AD))`
/// with HMAC-SHA-512.
pub fn confirmation_tag(sid: &[u8], isk: &[u8; 64], y: &[u8], ad: &[u8]) -> [u8; 64] {
    let mut hasher = Sha512::new();
    hasher.update(b"CPaceMac");
    hasher.update(sid);
    hasher.update(isk);
    let mac_key = hasher.finalize();
    let mut mac =
        <Hmac<Sha512> as KeyInit>::new_from_slice(&mac_key).expect("HMAC takes any key length");
    mac.update(&lv_cat(&[y, ad]));
    mac.finalize().into_bytes().into()
}

// ---------------------------------------------------------------------------
// Nemu pairing binding.

/// Inputs both sides know before pairing starts.
#[derive(Debug, Clone, Copy)]
pub struct PairingContext<'a> {
    /// The Pairing code, as the digits the Owner sees.
    pub code: &'a str,
    pub controller_id: &'a str,
    /// A fresh per-attempt nonce, chosen by the Controller.
    pub sid: &'a [u8],
}

impl PairingContext<'_> {
    fn channel_identifier(&self) -> Vec<u8> {
        lv_cat(&[PAIRING_LABEL, self.controller_id.as_bytes()])
    }

    fn generator(&self) -> RistrettoPoint {
        calculate_generator(self.code.as_bytes(), &self.channel_identifier(), self.sid)
    }
}

/// A party's long-term public keys, carried in the CPace associated data.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PartyKeys {
    pub signing_key: [u8; 32],
    pub encryption_key: [u8; 32],
}

pub fn access_client_associated_data(keys: &PartyKeys) -> Vec<u8> {
    lv_cat(&[
        ACCESS_CLIENT_AD_LABEL,
        &keys.signing_key,
        &keys.encryption_key,
    ])
}

pub fn controller_associated_data(keys: &PartyKeys) -> Vec<u8> {
    lv_cat(&[CONTROLLER_AD_LABEL, &keys.signing_key, &keys.encryption_key])
}

fn parse_associated_data(label: &[u8], ad: &[u8]) -> Result<PartyKeys, CpaceError> {
    let parts = lv_split(ad).ok_or(CpaceError::InvalidAssociatedData)?;
    match parts.as_slice() {
        [found, signing, encryption] if *found == label => Ok(PartyKeys {
            signing_key: (*signing)
                .try_into()
                .map_err(|_| CpaceError::InvalidAssociatedData)?,
            encryption_key: (*encryption)
                .try_into()
                .map_err(|_| CpaceError::InvalidAssociatedData)?,
        }),
        _ => Err(CpaceError::InvalidAssociatedData),
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct InitiatorMessage {
    pub ya: [u8; 32],
    pub ad_a: Vec<u8>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResponderMessage {
    pub yb: [u8; 32],
    pub ad_b: Vec<u8>,
    pub tag_b: [u8; 64],
}

/// The Access Client's side of a pairing run.
pub struct Initiator {
    sid: Vec<u8>,
    scalar: [u8; 32],
    msg: InitiatorMessage,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct InitiatorOutcome {
    /// The Access Client's confirmation tag, sent to the Controller.
    pub tag_a: [u8; 64],
    pub isk: [u8; 64],
    /// The Controller keys to pin, authenticated by the Pairing code.
    pub controller_keys: PartyKeys,
}

impl Initiator {
    pub fn start(ctx: &PairingContext<'_>, own: &PartyKeys) -> (Self, InitiatorMessage) {
        Self::start_with_scalar(ctx, own, sample_scalar())
    }

    /// Deterministic variant for wire vectors.
    pub fn start_with_scalar(
        ctx: &PairingContext<'_>,
        own: &PartyKeys,
        scalar: [u8; 32],
    ) -> (Self, InitiatorMessage) {
        let msg = InitiatorMessage {
            ya: scalar_mult(&scalar, &ctx.generator()),
            ad_a: access_client_associated_data(own),
        };
        let initiator = Self {
            sid: ctx.sid.to_vec(),
            scalar,
            msg: msg.clone(),
        };
        (initiator, msg)
    }

    pub fn finish(self, reply: &ResponderMessage) -> Result<InitiatorOutcome, CpaceError> {
        let controller_keys = parse_associated_data(CONTROLLER_AD_LABEL, &reply.ad_b)?;
        let k = scalar_mult_vfy(&self.scalar, &reply.yb).ok_or(CpaceError::InvalidPoint)?;
        let isk = isk_ir(
            &self.sid,
            &k,
            &self.msg.ya,
            &self.msg.ad_a,
            &reply.yb,
            &reply.ad_b,
        );
        let expected_b = confirmation_tag(&self.sid, &isk, &reply.yb, &reply.ad_b);
        if !bool::from(expected_b.ct_eq(&reply.tag_b)) {
            return Err(CpaceError::ConfirmationFailed);
        }
        Ok(InitiatorOutcome {
            tag_a: confirmation_tag(&self.sid, &isk, &self.msg.ya, &self.msg.ad_a),
            isk,
            controller_keys,
        })
    }
}

/// The Controller's side of a pairing run, waiting for the Access Client's tag.
pub struct Responder {
    expected_tag_a: [u8; 64],
    isk: [u8; 64],
    access_client_keys: PartyKeys,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResponderOutcome {
    pub isk: [u8; 64],
    /// The Access Client keys to bind into an Access grant.
    pub access_client_keys: PartyKeys,
}

impl Responder {
    pub fn respond(
        ctx: &PairingContext<'_>,
        own: &PartyKeys,
        msg: &InitiatorMessage,
    ) -> Result<(Self, ResponderMessage), CpaceError> {
        Self::respond_with_scalar(ctx, own, msg, sample_scalar())
    }

    /// Deterministic variant for wire vectors.
    pub fn respond_with_scalar(
        ctx: &PairingContext<'_>,
        own: &PartyKeys,
        msg: &InitiatorMessage,
        scalar: [u8; 32],
    ) -> Result<(Self, ResponderMessage), CpaceError> {
        let access_client_keys = parse_associated_data(ACCESS_CLIENT_AD_LABEL, &msg.ad_a)?;
        let yb = scalar_mult(&scalar, &ctx.generator());
        let ad_b = controller_associated_data(own);
        let k = scalar_mult_vfy(&scalar, &msg.ya).ok_or(CpaceError::InvalidPoint)?;
        let isk = isk_ir(ctx.sid, &k, &msg.ya, &msg.ad_a, &yb, &ad_b);
        let reply = ResponderMessage {
            yb,
            tag_b: confirmation_tag(ctx.sid, &isk, &yb, &ad_b),
            ad_b,
        };
        let responder = Self {
            expected_tag_a: confirmation_tag(ctx.sid, &isk, &msg.ya, &msg.ad_a),
            isk,
            access_client_keys,
        };
        Ok((responder, reply))
    }

    pub fn confirm(self, tag_a: &[u8]) -> Result<ResponderOutcome, CpaceError> {
        if tag_a.len() != 64 || !bool::from(self.expected_tag_a.ct_eq(tag_a)) {
            return Err(CpaceError::ConfirmationFailed);
        }
        Ok(ResponderOutcome {
            isk: self.isk,
            access_client_keys: self.access_client_keys,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn keys(seed: u8) -> PartyKeys {
        PartyKeys {
            signing_key: [seed; 32],
            encryption_key: [seed.wrapping_add(1); 32],
        }
    }

    fn ctx<'a>(code: &'a str, sid: &'a [u8]) -> PairingContext<'a> {
        PairingContext {
            code,
            controller_id: "nemu_0123456789abcdef",
            sid,
        }
    }

    #[test]
    fn both_sides_agree_and_learn_each_others_keys() {
        let sid = [7u8; 16];
        let (initiator, msg_a) = Initiator::start(&ctx("123456", &sid), &keys(1));
        let (responder, msg_b) =
            Responder::respond(&ctx("123456", &sid), &keys(9), &msg_a).unwrap();
        let a = initiator.finish(&msg_b).unwrap();
        assert_eq!(a.controller_keys, keys(9));
        let b = responder.confirm(&a.tag_a).unwrap();
        assert_eq!(b.access_client_keys, keys(1));
        assert_eq!(a.isk, b.isk);
    }

    #[test]
    fn a_wrong_code_fails_confirmation_on_both_sides() {
        let sid = [7u8; 16];
        let (initiator, msg_a) = Initiator::start(&ctx("123456", &sid), &keys(1));
        let (responder, msg_b) =
            Responder::respond(&ctx("654321", &sid), &keys(9), &msg_a).unwrap();
        assert_eq!(
            initiator.finish(&msg_b).unwrap_err(),
            CpaceError::ConfirmationFailed
        );
        assert_eq!(
            responder.confirm(&[0u8; 64]).unwrap_err(),
            CpaceError::ConfirmationFailed
        );
    }

    #[test]
    fn substituted_keys_fail_confirmation() {
        let sid = [7u8; 16];
        let (initiator, msg_a) = Initiator::start(&ctx("123456", &sid), &keys(1));
        let (_, mut msg_b) = Responder::respond(&ctx("123456", &sid), &keys(9), &msg_a).unwrap();
        msg_b.ad_b = controller_associated_data(&keys(42));
        assert_eq!(
            initiator.finish(&msg_b).unwrap_err(),
            CpaceError::ConfirmationFailed
        );
    }

    #[test]
    fn the_identity_element_is_rejected() {
        let sid = [7u8; 16];
        let msg_a = InitiatorMessage {
            ya: [0u8; 32],
            ad_a: access_client_associated_data(&keys(1)),
        };
        let err = Responder::respond(&ctx("123456", &sid), &keys(9), &msg_a)
            .err()
            .unwrap();
        assert_eq!(err, CpaceError::InvalidPoint);
    }

    #[test]
    fn malformed_associated_data_is_rejected() {
        let sid = [7u8; 16];
        let msg_a = InitiatorMessage {
            ya: [0u8; 32],
            ad_a: controller_associated_data(&keys(1)),
        };
        let err = Responder::respond(&ctx("123456", &sid), &keys(9), &msg_a)
            .err()
            .unwrap();
        assert_eq!(err, CpaceError::InvalidAssociatedData);
    }
}
