// Access grants: Controller-signed EdDSA JWS (RFC 7515 compact form) that
// bind an Access Client's two public keys to one Membership. Twin of Core's
// `relay_crypto::grant`. A grant carries no role, no identity epoch and no
// expiry.

import { z } from 'zod'

import {
    b64urlDecode,
    b64urlDecodeLength,
    b64urlEncode,
    utf8Decode,
    utf8Encode,
} from './bytes.ts'
import { type Ed25519Signer, ed25519Verify } from './signing.ts'

export const GRANT_TYPE = 'nemu-access-grant+jwt'
const PROTECTED_HEADER = `{"alg":"EdDSA","typ":"${GRANT_TYPE}"}`

export type AccessGrant = {
    controllerId: string
    accessClientId: string
    membershipId: string
    /** The Access Client's Ed25519 public key. */
    signingKey: Uint8Array
    /** The Access Client's X25519 public key. */
    encryptionKey: Uint8Array
    /** Issue time, seconds since the Unix epoch. */
    issuedAt: number
}

export type GrantRejection =
    | 'malformed'
    | 'unsupported_algorithm'
    | 'bad_signature'
    | 'wrong_controller'

export class GrantError extends Error {
    readonly code: GrantRejection

    constructor(code: GrantRejection) {
        super(code)
        this.name = 'GrantError'
        this.code = code
    }
}

const claimsSchema = z.object({
    controllerId: z.string(),
    accessClientId: z.string().min(1),
    membershipId: z.string().min(1),
    signingKey: z.string(),
    encryptionKey: z.string(),
    iat: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
})

const protectedHeaderSchema = z.object({ alg: z.string(), typ: z.string() })

export async function issueGrant(
    grant: AccessGrant,
    controllerSigner: Ed25519Signer
): Promise<string> {
    // Key order matches Core's serialization so both produce the same bytes.
    const payload = JSON.stringify({
        controllerId: grant.controllerId,
        accessClientId: grant.accessClientId,
        membershipId: grant.membershipId,
        signingKey: b64urlEncode(grant.signingKey),
        encryptionKey: b64urlEncode(grant.encryptionKey),
        iat: grant.issuedAt,
    })
    const signingInput = `${b64urlEncode(utf8Encode(PROTECTED_HEADER))}.${b64urlEncode(utf8Encode(payload))}`
    const signature = await controllerSigner.sign(utf8Encode(signingInput))
    return `${signingInput}.${b64urlEncode(signature)}`
}

function decodeJson(segment: string): unknown {
    const bytes = b64urlDecode(segment)
    const text = bytes === null ? null : utf8Decode(bytes)
    if (text === null) throw new GrantError('malformed')
    try {
        return JSON.parse(text)
    } catch {
        throw new GrantError('malformed')
    }
}

/** Verifies a grant against the Controller's Ed25519 key and ID. */
export function verifyGrant(
    jws: string,
    controllerId: string,
    controllerSigningKey: Uint8Array
): AccessGrant {
    const parts = jws.split('.')
    if (parts.length !== 3) throw new GrantError('malformed')
    const [headerB64, payloadB64, signatureB64] = parts as [
        string,
        string,
        string,
    ]
    const header = protectedHeaderSchema.safeParse(decodeJson(headerB64))
    if (!header.success) throw new GrantError('malformed')
    if (header.data.alg !== 'EdDSA' || header.data.typ !== GRANT_TYPE) {
        throw new GrantError('unsupported_algorithm')
    }
    const signature = b64urlDecodeLength(signatureB64, 64)
    if (signature === null) throw new GrantError('malformed')
    const signingInput = utf8Encode(`${headerB64}.${payloadB64}`)
    if (!ed25519Verify(controllerSigningKey, signingInput, signature)) {
        throw new GrantError('bad_signature')
    }
    const claims = claimsSchema.safeParse(decodeJson(payloadB64))
    if (!claims.success) throw new GrantError('malformed')
    const signingKey = b64urlDecodeLength(claims.data.signingKey, 32)
    const encryptionKey = b64urlDecodeLength(claims.data.encryptionKey, 32)
    if (signingKey === null || encryptionKey === null) {
        throw new GrantError('malformed')
    }
    if (claims.data.controllerId !== controllerId) {
        throw new GrantError('wrong_controller')
    }
    return {
        controllerId: claims.data.controllerId,
        accessClientId: claims.data.accessClientId,
        membershipId: claims.data.membershipId,
        signingKey,
        encryptionKey,
        issuedAt: claims.data.iat,
    }
}
