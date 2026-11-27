# Bind pairing keys with CPace on the Pairing code

Status: accepted, not yet implemented (NEM-61). Refines how ADR-0001's "verified local pairing" is verified.

Each Access Client pairs with its Controller by running CPace (draft-irtf-cfrg-cpace, ristretto255 with SHA-512) keyed by the Pairing code. Both sides' Ed25519 and X25519 public keys go into the CPace associated data, and both sides confirm the resulting key before the Controller issues an Access grant. Pairing does not trust TLS or the network path: Convex issues the LAN certificate and today holds its private key, the self-signed and plain-HTTP fallbacks have no pinning, and a 6-digit code mixed into a plain hash or MAC can be brute-forced offline by anyone who records one exchange. With CPace, an impostor gets one online guess per pairing attempt, and the Controller limits attempts per code and expires codes. Accepting an Invitation and bootstrapping the first Owner use the same exchange.

## Considered options

- **Trust TLS on `lan.nemu.sh`.** Rejected because Convex can impersonate any Controller while it holds the certificate key, and the `nemu.local` and HTTP fallbacks have no trust anchor.
- **HMAC the exchanged keys with the Pairing code.** Rejected because a 6-digit code falls to offline guessing.
- **SPAKE2 (RFC 9382) or an augmented PAKE (SPAKE2+, OPAQUE).** SPAKE2 has no RFC-compliant Rust crate or maintained JS library. Augmented PAKEs protect a stored password verifier, which a one-time code doesn't need.
- **Off-the-shelf CPace libraries.** Rejected for now because the Rust and JS candidates are new, unaudited, single-maintainer projects that implement different CPace suites.

## Consequences

Nemu implements CPace itself, a small module in Rust on `curve25519-dalek` and in TypeScript on `@noble/curves`, and checks both against the draft's ristretto255 test vectors and against each other. Pairing over plain HTTP becomes as safe as pairing over HTTPS. The module needs an external review before the public beta. Moving the LAN TLS private key off Convex is still required by the privacy rule, but pairing no longer depends on it.
