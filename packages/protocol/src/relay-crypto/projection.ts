// Signed Membership routing projections (ADR-0005, NEM-133). The Controller
// signs one for each Membership routing change and publishes it through its
// outbox; Convex routes Relay traffic on the latest one per Membership, and
// clients verify it against the Controller key they pinned at pairing. Twin
// of Core's `relay_crypto::projection`.
//
// A projection carries routing facts only: no role, name or email.

import { z } from 'zod'

import {
    b64urlDecodeLength,
    b64urlEncode,
    lvCat,
    u64be,
    utf8Encode,
} from './bytes.ts'
import { type Ed25519Signer, ed25519Verify } from './signing.ts'

const PROJECTION_LABEL = utf8Encode('nemu-membership-routing-v1')
const MAX_ID_BYTES = 256

const id = z
    .string()
    .min(1)
    .refine((value) => utf8Encode(value).length <= MAX_ID_BYTES)
const safeUint = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)

export const membershipRoutingStateSchema = z.enum(['active', 'ended'])
export type MembershipRoutingState = z.infer<
    typeof membershipRoutingStateSchema
>

export const membershipProjectionSchema = z.strictObject({
    /** The Home, named by its Controller. */
    controllerId: id,
    identityEpoch: safeUint.min(1),
    membershipId: id,
    /** The Account's identity reference (its Clerk subject). */
    accountId: id,
    state: membershipRoutingStateSchema,
    /** Grows with every change this Controller publishes. */
    sequence: safeUint.min(1),
})
export type MembershipProjection = z.infer<typeof membershipProjectionSchema>

export const signedMembershipProjectionSchema = z.strictObject({
    projection: membershipProjectionSchema,
    signature: z.string(),
})
export type SignedMembershipProjection = z.infer<
    typeof signedMembershipProjectionSchema
>

export type ProjectionRejection =
    | 'malformed'
    | 'bad_signature'
    | 'wrong_controller'

export class ProjectionError extends Error {
    readonly code: ProjectionRejection

    constructor(code: ProjectionRejection) {
        super(code)
        this.name = 'ProjectionError'
        this.code = code
    }
}

/** The bytes the Controller signs. */
export function encodeMembershipProjection(
    projection: MembershipProjection
): Uint8Array {
    return lvCat(
        PROJECTION_LABEL,
        utf8Encode(projection.controllerId),
        u64be(projection.identityEpoch),
        utf8Encode(projection.membershipId),
        utf8Encode(projection.accountId),
        utf8Encode(projection.state),
        u64be(projection.sequence)
    )
}

export async function signMembershipProjection(
    projection: MembershipProjection,
    controllerSigner: Ed25519Signer
): Promise<SignedMembershipProjection> {
    const parsed = membershipProjectionSchema.parse(projection)
    const signature = await controllerSigner.sign(
        encodeMembershipProjection(parsed)
    )
    return { projection: parsed, signature: b64urlEncode(signature) }
}

/**
 * Verifies an untrusted projection (Convex's copy, say) against the
 * Controller's ID and the Ed25519 key pinned for it. Strict verification.
 */
export function verifyMembershipProjection(
    signed: unknown,
    controllerId: string,
    controllerSigningKey: Uint8Array
): MembershipProjection {
    const parsed = signedMembershipProjectionSchema.safeParse(signed)
    if (!parsed.success) throw new ProjectionError('malformed')
    const signature = b64urlDecodeLength(parsed.data.signature, 64)
    if (signature === null) throw new ProjectionError('malformed')
    const { projection } = parsed.data
    if (
        !ed25519Verify(
            controllerSigningKey,
            encodeMembershipProjection(projection),
            signature
        )
    ) {
        throw new ProjectionError('bad_signature')
    }
    if (projection.controllerId !== controllerId) {
        throw new ProjectionError('wrong_controller')
    }
    return projection
}

/**
 * Whether `candidate` supersedes `current` for the same Membership. A new
 * identity epoch (a restored Home) wins whatever its sequence, since a
 * restore may rewind the outbox; within an epoch the higher sequence wins.
 */
export function supersedesProjection(
    candidate: Pick<MembershipProjection, 'identityEpoch' | 'sequence'>,
    current: Pick<MembershipProjection, 'identityEpoch' | 'sequence'> | null
): boolean {
    if (current === null) return true
    if (candidate.identityEpoch !== current.identityEpoch) {
        return candidate.identityEpoch > current.identityEpoch
    }
    return candidate.sequence > current.sequence
}
