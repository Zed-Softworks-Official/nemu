// Local sessions (NEM-126): on the home network an Access Client proves it
// holds its Ed25519 key by signing a fresh Controller nonce, and the
// Controller answers with a short-lived Local session.

import { lvCat, utf8Encode } from './bytes.ts'
import { type Ed25519Signer, ed25519Verify } from './signing.ts'

export const LOCAL_SESSION_LABEL = utf8Encode('nemu-local-session-v1')

/** The Controller's nonces are this many bytes. */
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

/** Strict Ed25519 verification, as Core does. */
export function verifyLocalSessionChallenge(
    signingKey: Uint8Array,
    challenge: LocalSessionChallenge,
    signature: Uint8Array
): boolean {
    return ed25519Verify(signingKey, localSessionMessage(challenge), signature)
}
