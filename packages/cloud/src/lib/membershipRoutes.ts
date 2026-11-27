import {
    type MembershipProjection,
    ProjectionError,
    type SignedMembershipProjection,
    supersedesProjection,
    verifyMembershipProjection,
} from '@nemu/protocol/relay-crypto'
import { ConvexError, v } from 'convex/values'
import type { Doc } from '../functions/_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../functions/_generated/server'

// Signed Membership routing projections (ADR-0005, ADR-0011, NEM-133). The
// Controller is the Membership authority; Convex keeps only the latest
// signed projection per Membership and routes Relay traffic on it. A row is
// routing facts plus the Controller's signature, nothing else: no role, name
// or email. Clients never trust it unsigned; they verify the signature
// against the Controller key they pinned at pairing.

export const membershipRoutingStateValidator = v.union(
    v.literal('active'),
    v.literal('ended')
)

export const signedMembershipProjectionValidator = v.object({
    projection: v.object({
        controllerId: v.string(),
        identityEpoch: v.number(),
        membershipId: v.string(),
        accountId: v.string(),
        state: membershipRoutingStateValidator,
        sequence: v.number(),
        accessClientIds: v.array(v.string()),
    }),
    signature: v.string(),
})

export type PublishOutcome = 'stored' | 'stale'

export type ProjectionPublishErrorCode =
    | 'malformed'
    | 'bad_signature'
    | 'wrong_controller'
    | 'unknown_controller'

/** Error codes only, so a refusal never echoes what it was sent. */
export function projectionError(code: ProjectionPublishErrorCode): ConvexError<{
    code: ProjectionPublishErrorCode
}> {
    const error = new ConvexError({ code })
    error.message = code
    return error
}

/** Controllers register their Ed25519 public key as standard base64. */
function decodeBase64(text: string): Uint8Array | null {
    try {
        const binary = atob(text)
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i)
        }
        return bytes
    } catch {
        return null
    }
}

async function controllerFor(ctx: QueryCtx, controllerId: string) {
    return await ctx.db
        .query('controllers')
        .withIndex('by_controller_id', (q) =>
            q.eq('controllerId', controllerId)
        )
        .unique()
}

export function toSignedProjection(
    route: Doc<'membershipRoutes'>
): SignedMembershipProjection {
    return {
        projection: {
            controllerId: route.controllerId,
            identityEpoch: route.identityEpoch,
            membershipId: route.membershipId,
            accountId: route.accountId,
            state: route.state,
            sequence: route.sequence,
            accessClientIds: route.accessClientIds,
        },
        signature: route.signature,
    }
}

/**
 * Stores a projection the Controller signed, if it is newer than the one
 * held for its Membership. Convex checks the signature against the public
 * key the Controller registered, so it only ever routes on what the
 * Controller said.
 */
export async function publishProjection(
    ctx: MutationCtx,
    signed: unknown
): Promise<PublishOutcome> {
    const controllerId =
        signed !== null &&
        typeof signed === 'object' &&
        'projection' in signed &&
        signed.projection !== null &&
        typeof signed.projection === 'object' &&
        'controllerId' in signed.projection &&
        typeof signed.projection.controllerId === 'string'
            ? signed.projection.controllerId
            : null
    if (controllerId === null) throw projectionError('malformed')
    const controller = await controllerFor(ctx, controllerId)
    if (!controller) throw projectionError('unknown_controller')
    const key = decodeBase64(controller.publicKey)
    if (key === null || key.length !== 32)
        throw projectionError('bad_signature')

    let projection: MembershipProjection
    try {
        projection = verifyMembershipProjection(signed, controllerId, key)
    } catch (error) {
        if (error instanceof ProjectionError) throw projectionError(error.code)
        throw error
    }

    const current = await ctx.db
        .query('membershipRoutes')
        .withIndex('by_membership', (q) =>
            q
                .eq('controllerId', projection.controllerId)
                .eq('membershipId', projection.membershipId)
        )
        .unique()
    if (!supersedesProjection(projection, current)) return 'stale'

    const row = {
        ...projection,
        signature: (signed as SignedMembershipProjection).signature,
    }
    if (current) {
        await ctx.db.replace(current._id, row)
    } else {
        await ctx.db.insert('membershipRoutes', row)
    }
    return 'stored'
}

/**
 * The newest identity epoch this Controller has published under. Routes from
 * an older epoch belong to a retired Controller instance (a restored Home
 * republishes every active Membership under its new epoch).
 */
async function currentEpoch(
    ctx: QueryCtx,
    controllerId: string
): Promise<number | null> {
    const newest = await ctx.db
        .query('membershipRoutes')
        .withIndex('by_controller_and_epoch', (q) =>
            q.eq('controllerId', controllerId)
        )
        .order('desc')
        .first()
    return newest?.identityEpoch ?? null
}

/**
 * Whether the Account holds an active Membership in this Home that names
 * this Access Client, by the latest signed projections. This is what Relay
 * routes on: an Account can post or read only as its own Access Clients.
 */
export async function routesAccessClient(
    ctx: QueryCtx,
    controllerId: string,
    accountId: string,
    accessClientId: string
): Promise<boolean> {
    const epoch = await currentEpoch(ctx, controllerId)
    if (epoch === null) return false
    const routes = await ctx.db
        .query('membershipRoutes')
        .withIndex('by_controller_and_account', (q) =>
            q.eq('controllerId', controllerId).eq('accountId', accountId)
        )
        .collect()
    return routes.some(
        (route) =>
            route.state === 'active' &&
            route.identityEpoch === epoch &&
            route.accessClientIds.includes(accessClientId)
    )
}

/** The caller's own projection for one Membership, as the Controller signed it. */
export async function membershipFor(
    ctx: QueryCtx,
    controllerId: string,
    membershipId: string,
    accountId: string
): Promise<SignedMembershipProjection | null> {
    const route = await ctx.db
        .query('membershipRoutes')
        .withIndex('by_membership', (q) =>
            q.eq('controllerId', controllerId).eq('membershipId', membershipId)
        )
        .unique()
    if (!route || route.accountId !== accountId) return null
    return toSignedProjection(route)
}
