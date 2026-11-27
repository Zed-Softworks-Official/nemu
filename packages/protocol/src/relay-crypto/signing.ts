// Ed25519 signing and strict verification on @noble/curves.

import { ed25519 } from '@noble/curves/ed25519.js'

/**
 * Something that signs with an Ed25519 key. Mobile wraps key bytes from the
 * secure store; web may wrap a non-extractable Web Crypto key, so signing
 * may be async.
 */
export type Ed25519Signer = {
    sign(message: Uint8Array): Uint8Array | Promise<Uint8Array>
}

export function ed25519PublicKey(secretKey: Uint8Array): Uint8Array {
    return ed25519.getPublicKey(secretKey)
}

export function ed25519Signer(secretKey: Uint8Array): Ed25519Signer {
    return { sign: (message) => ed25519.sign(message, secretKey) }
}

/** RFC 8032 strict verification (no ZIP-215 leniency). */
export function ed25519Verify(
    publicKey: Uint8Array,
    message: Uint8Array,
    signature: Uint8Array
): boolean {
    try {
        return ed25519.verify(signature, message, publicKey, { zip215: false })
    } catch {
        return false
    }
}
