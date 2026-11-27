//! Cryptographic building blocks for end-to-end encrypted Relay (ADR-0001)
//! and verified local pairing (ADR-0037).
//!
//! Every primitive here has a TypeScript twin in `@nemu/protocol/relay-crypto`.
//! Both implementations are checked against the shared wire vectors in
//! `packages/protocol/testdata/relay-crypto/vectors.json`, so a change to any
//! byte layout here must change both sides and regenerate the vectors.
//!
//! - [`cpace`]: CPace (draft-irtf-cfrg-cpace-21, ristretto255 + SHA-512),
//!   keyed by the Pairing code, with both sides' public keys in the associated
//!   data and key confirmation in both directions.
//! - [`hpke`]: HPKE base mode (RFC 9180) with DHKEM(X25519, HKDF-SHA256),
//!   HKDF-SHA256 and ChaCha20-Poly1305.
//! - [`envelope`]: sealed Relay requests, responses and pushes.
//! - [`grant`]: Access grants as EdDSA JWS.
//! - [`replay`]: the 64-entry sliding counter window.
//!
//! Nothing in Core calls these yet; NEM-126 onwards wires them in.
#![cfg_attr(not(test), allow(dead_code))]

pub mod cpace;
pub mod envelope;
pub mod grant;
pub mod hpke;
pub mod replay;
mod wire;

#[cfg(test)]
mod vectors;
