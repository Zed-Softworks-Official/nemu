// Ed25519 signing on @noble/curves, and verification with exactly the
// semantics of Core's `ed25519_dalek::VerifyingKey::verify_strict`, so the
// Rust Controller and the TypeScript clients accept the same signatures.

import { ed25519 } from '@noble/curves/ed25519.js'
import { bytesToNumberLE } from '@noble/curves/utils.js'
import { sha512 } from '@noble/hashes/sha2.js'

import { concatBytes, equalBytes } from './bytes.ts'

/**
 * Something that signs with an Ed25519 key. Mobile wraps key bytes from the
 * secure store; web may wrap a non-extractable Web Crypto key, so signing
 * may be async.
 */
export type Ed25519Signer = {
    sign(message: Uint8Array): Uint8Array | Promise<Uint8Array>
}

const Point = ed25519.Point
const ORDER = Point.Fn.ORDER

export function ed25519PublicKey(secretKey: Uint8Array): Uint8Array {
    return ed25519.getPublicKey(secretKey)
}

export function ed25519Signer(secretKey: Uint8Array): Ed25519Signer {
    return { sign: (message) => ed25519.sign(message, secretKey) }
}

/**
 * An Ed25519 public key both sides bind and verify with: the canonical
 * encoding of a point in the prime-order subgroup (so not of small order,
 * and without a torsion part). Twin of Core's
 * `relay_crypto::session::acceptable_signing_key`.
 */
export function acceptableSigningKey(key: Uint8Array): boolean {
    if (key.length !== 32) return false
    try {
        const point = Point.fromBytes(key, false)
        return (
            equalBytes(point.toBytes(), key) &&
            !point.isSmallOrder() &&
            point.isTorsionFree()
        )
    } catch {
        return false
    }
}

/**
 * Strict Ed25519 verification, as `verify_strict` does it: a canonical `S`
 * below the group order, `R` and `A` not of small order, and the
 * cofactorless equation `R == [S]B - [k]A` compared on `R`'s exact bytes.
 * noble's own `verify` checks the cofactored equation, which accepts some
 * signatures Core refuses. The key must also be acceptable.
 */
export function ed25519Verify(
    publicKey: Uint8Array,
    message: Uint8Array,
    signature: Uint8Array
): boolean {
    if (signature.length !== 64 || !acceptableSigningKey(publicKey)) {
        return false
    }
    try {
        const a = Point.fromBytes(publicKey, false)
        const rBytes = signature.subarray(0, 32)
        const r = Point.fromBytes(rBytes, false)
        if (r.isSmallOrder()) return false
        const s = bytesToNumberLE(signature.subarray(32, 64))
        if (s >= ORDER) return false
        const k =
            bytesToNumberLE(sha512(concatBytes(rBytes, publicKey, message))) %
            ORDER
        const expected = Point.BASE.multiplyUnsafe(s).subtract(
            a.multiplyUnsafe(k)
        )
        return equalBytes(expected.toBytes(), rBytes)
    } catch {
        return false
    }
}
