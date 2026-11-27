// Local sessions (NEM-126): on the home network an Access Client proves it
// holds its Ed25519 key by signing a fresh Controller nonce, and the
// Controller answers with a short-lived Local session.

import { lvCat, utf8Encode } from './bytes.ts'
import { type Ed25519Signer, ed25519Verify } from './signing.ts'

export const LOCAL_SESSION_LABEL = utf8Encode('nemu-local-session-v1')
export const LAN_REFUSAL_LABEL = utf8Encode('nemu-lan-refusal-v1')

/**
 * The Controller's nonces, and the Access Client's refusal nonces, are this
 * many bytes.
 */
export const LOCAL_SESSION_NONCE_LENGTH = 32

export type LocalSessionChallenge = {
    controllerId: string
    accessClientId: string
    nonce: Uint8Array
}

/** The bytes the Access Client signs. */
export function localSessionMessage(
    challenge: LocalSessionChallenge
): Uint8Array {
    return lvCat(
        LOCAL_SESSION_LABEL,
        utf8Encode(challenge.controllerId),
        utf8Encode(challenge.accessClientId),
        challenge.nonce
    )
}

export async function signLocalSessionChallenge(
    signer: Ed25519Signer,
    challenge: LocalSessionChallenge
): Promise<Uint8Array> {
    return await signer.sign(localSessionMessage(challenge))
}

/**
 * A Controller's refusal of a Local session that tells the Access Client to
 * drop its keys and pair again, signed over the client's own fresh nonce.
 * Twin of Core's `relay_crypto::session::LanRefusal`.
 */
export type LanRefusal = {
    controllerId: string
    accessClientId: string
    /** `unknown_access_client` or `tombstoned_access_client`. */
    code: string
    clientNonce: Uint8Array
}

/** The bytes the Controller signs for a `LanRefusal`. */
export function lanRefusalMessage(refusal: LanRefusal): Uint8Array {
    return lvCat(
        LAN_REFUSAL_LABEL,
        utf8Encode(refusal.controllerId),
        utf8Encode(refusal.accessClientId),
        utf8Encode(refusal.code),
        refusal.clientNonce
    )
}

export async function signLanRefusal(
    signer: Ed25519Signer,
    refusal: LanRefusal
): Promise<Uint8Array> {
    return await signer.sign(lanRefusalMessage(refusal))
}

/** True only when the pinned Controller key signed this exact refusal. */
export function verifyLanRefusal(
    controllerSigningKey: Uint8Array,
    refusal: LanRefusal,
    signature: Uint8Array
): boolean {
    return ed25519Verify(
        controllerSigningKey,
        lanRefusalMessage(refusal),
        signature
    )
}

/** Strict Ed25519 verification, as Core does. */
export function verifyLocalSessionChallenge(
    signingKey: Uint8Array,
    challenge: LocalSessionChallenge,
    signature: Uint8Array
): boolean {
    return ed25519Verify(signingKey, localSessionMessage(challenge), signature)
}
