// The signed Membership routing projection, as an Access Client reads it
// (NEM-133). Convex keeps the latest one per Membership and routes Relay on
// it, but the client never trusts Convex's copy unsigned: it verifies the
// projection against the Controller key pinned at pairing and only then
// takes the identity epoch, or the end of its Membership, from it.

import {
    type MembershipProjection,
    verifyMembershipProjection,
} from '@nemu/protocol/relay-crypto'
import type { AccessClientEnrollment } from '../access-client-keys.ts'

/**
 * This Access Client's own projection, verified, or null when there is none
 * it can trust: none published yet, unreachable, forged, for another
 * Membership or another Home. A null leaves the client as it was, with the
 * signed `retired_epoch` refusal as the backstop for the epoch.
 */
export async function readMembershipProjection(
    fetch: () => Promise<unknown>,
    enrollment: AccessClientEnrollment
): Promise<MembershipProjection | null> {
    let signed: unknown
    try {
        signed = await fetch()
    } catch {
        return null
    }
    if (signed === null || signed === undefined) return null
    let projection: MembershipProjection
    try {
        projection = verifyMembershipProjection(
            signed,
            enrollment.controllerId,
            enrollment.controllerSigningKey
        )
    } catch {
        return null
    }
    if (projection.membershipId !== enrollment.membershipId) return null
    return projection
}

/**
 * What a verified projection means for the enrollment: the newer identity
 * epoch, if it names one. Epochs only grow, so an old copy replayed by
 * Convex never moves the client back.
 */
export function epochFromProjection(
    enrollment: AccessClientEnrollment,
    projection: MembershipProjection
): AccessClientEnrollment | null {
    const current = enrollment.identityEpoch ?? 1
    if (projection.identityEpoch <= current) return null
    return { ...enrollment, identityEpoch: projection.identityEpoch }
}
