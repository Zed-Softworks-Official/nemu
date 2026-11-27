//! Signed Membership routing projections (ADR-0005, NEM-133).
//!
//! The Controller signs one projection per Membership routing change and
//! publishes it through its outbox ([`crate::pairing::routing`]). Convex
//! routes Relay traffic on the latest projection per Membership, and Access
//! Clients verify it against the Controller key they pinned at pairing. A
//! projection carries routing facts only: no role, name or email. It names
//! the Membership's Access Clients, so Convex accepts a Relay envelope only
//! for an Access Client of the Account that posts it.
//!
//! The signed bytes are `lv_cat("nemu-membership-routing-v2", controllerId,
//! u64be(identityEpoch), membershipId, accountId, state, u64be(sequence),
//! lv_cat(accessClientIds...))`.
//! The TypeScript twin is `@nemu/protocol/relay-crypto`'s `projection.ts`.

use ed25519_dalek::{Signature, Signer, SigningKey, VerifyingKey};
use serde::{Deserialize, Serialize};

use super::wire::{MAX_SAFE_INTEGER, b64url_decode_64, b64url_encode, lv_cat, u64_be};

const PROJECTION_LABEL: &[u8] = b"nemu-membership-routing-v2";
const MAX_ID_BYTES: usize = 256;
/// The most Access Clients one projection names. Core names the newest ones
/// when a Membership has more; the rest cannot use Relay.
pub const MAX_ROUTED_ACCESS_CLIENTS: usize = 64;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MembershipRoutingState {
    Active,
    Ended,
}

impl MembershipRoutingState {
    pub fn as_str(self) -> &'static str {
        match self {
            MembershipRoutingState::Active => "active",
            MembershipRoutingState::Ended => "ended",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MembershipProjection {
    /// The Home, named by its Controller.
    pub controller_id: String,
    pub identity_epoch: u64,
    pub membership_id: String,
    /// The Account's identity reference (its Clerk subject).
    pub account_id: String,
    pub state: MembershipRoutingState,
    /// Grows with every change this Controller publishes.
    pub sequence: u64,
    /// The Membership's Access Clients that may use Relay. Empty when ended.
    pub access_client_ids: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SignedMembershipProjection {
    pub projection: MembershipProjection,
    /// Ed25519 over [`MembershipProjection::encode`], base64url.
    pub signature: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, thiserror::Error)]
pub enum ProjectionRejection {
    #[error("malformed")]
    Malformed,
    #[error("bad_signature")]
    BadSignature,
    #[error("wrong_controller")]
    WrongController,
}

fn valid_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= MAX_ID_BYTES
}

impl MembershipProjection {
    /// The bytes the Controller signs.
    pub fn encode(&self) -> Vec<u8> {
        lv_cat(&[
            PROJECTION_LABEL,
            self.controller_id.as_bytes(),
            &u64_be(self.identity_epoch),
            self.membership_id.as_bytes(),
            self.account_id.as_bytes(),
            self.state.as_str().as_bytes(),
            &u64_be(self.sequence),
            &lv_cat(
                &self
                    .access_client_ids
                    .iter()
                    .map(|id| id.as_bytes())
                    .collect::<Vec<_>>(),
            ),
        ])
    }

    fn well_formed(&self) -> bool {
        valid_id(&self.controller_id)
            && valid_id(&self.membership_id)
            && valid_id(&self.account_id)
            && (1..=MAX_SAFE_INTEGER).contains(&self.identity_epoch)
            && (1..=MAX_SAFE_INTEGER).contains(&self.sequence)
            && self.access_client_ids.len() <= MAX_ROUTED_ACCESS_CLIENTS
            && self.access_client_ids.iter().all(|id| valid_id(id))
            && (self.state == MembershipRoutingState::Active || self.access_client_ids.is_empty())
    }
}

pub fn sign_projection(
    projection: MembershipProjection,
    controller_signing_key: &SigningKey,
) -> Result<SignedMembershipProjection, ProjectionRejection> {
    if !projection.well_formed() {
        return Err(ProjectionRejection::Malformed);
    }
    let signature = controller_signing_key.sign(&projection.encode()).to_bytes();
    Ok(SignedMembershipProjection {
        projection,
        signature: b64url_encode(&signature),
    })
}

/// Strict verification against the Controller's ID and Ed25519 key. Core
/// only signs; clients and Convex verify. Kept here for the wire vectors.
#[cfg_attr(not(test), allow(dead_code))]
pub fn verify_projection(
    signed: &SignedMembershipProjection,
    controller_id: &str,
    controller_signing_key: &[u8; 32],
) -> Result<MembershipProjection, ProjectionRejection> {
    let projection = &signed.projection;
    if !projection.well_formed() {
        return Err(ProjectionRejection::Malformed);
    }
    let signature = b64url_decode_64(&signed.signature).ok_or(ProjectionRejection::Malformed)?;
    let key = VerifyingKey::from_bytes(controller_signing_key)
        .map_err(|_| ProjectionRejection::BadSignature)?;
    key.verify_strict(&projection.encode(), &Signature::from_bytes(&signature))
        .map_err(|_| ProjectionRejection::BadSignature)?;
    if projection.controller_id != controller_id {
        return Err(ProjectionRejection::WrongController);
    }
    Ok(projection.clone())
}
