import { v } from 'convex/values'
import { requireControllerIdentity } from '../lib/auth'
import { authedMutation, authedQuery } from '../lib/customFunctions'
import {
    CLEANUP_BATCH_SIZE,
    checkSealedRequest,
    checkSealedToClient,
    RELAY_TTL_MS,
    relayError,
    relayKindValidator,
    relayRateLimiter,
    requestDeleteAt,
    type SealedToClient,
    sealedRequestValidator,
    sealedToClientValidator,
    toSealedRequest,
    toSealedToClient,
} from '../lib/relay'
import { internal } from './_generated/api'
import type { Doc } from './_generated/dataModel'
import type { MutationCtx, QueryCtx } from './_generated/server'
import {
    internalMutation,
    internalQuery,
    mutation,
    query,
} from './_generated/server'

// Privacy (ADR-0001): nothing in this module logs, and errors carry only a
// code. Envelope fields never reach a log line or an error message.

/**
 * Whether a Relay message may still be handed out. Reads filter on this so an
 * expired message is never returned, however late the cleanup sweep runs.
 */
function isLive(message: Doc<'relayMessages'>, now: number): boolean {
    return message.deleteAt > now
}

const toClientMessageValidator = v.object({
    _id: v.id('relayMessages'),
    kind: relayKindValidator,
    sealed: sealedToClientValidator,
})

type AuthedCtx = (QueryCtx | MutationCtx) & { identity: { subject: string } }

async function isPairedWith(
    ctx: AuthedCtx,
    controllerId: string
): Promise<boolean> {
    const pairing = await ctx.db
        .query('pairings')
        .withIndex('by_user_and_controller', (q) =>
            q
                .eq('userId', ctx.identity.subject)
                .eq('controllerId', controllerId)
        )
        .unique()
    return pairing !== null
}

async function pendingRequests(
    ctx: QueryCtx,
    controllerId: string
): Promise<Doc<'relayMessages'>[]> {
    const now = Date.now()
    const messages = await ctx.db
        .query('relayMessages')
        .withIndex('by_controller_and_kind', (q) =>
            q.eq('controllerId', controllerId).eq('kind', 'request')
        )
        .collect()
    return messages.filter((message) => isLive(message, now))
}

async function writeToClient(ctx: MutationCtx, input: SealedToClient) {
    const sealed = checkSealedToClient(input)
    const { header } = sealed
    const controller = await ctx.db
        .query('controllers')
        .withIndex('by_controller_id', (q) =>
            q.eq('controllerId', header.controllerId)
        )
        .unique()
    if (!controller) {
        throw new Error('Controller not found')
    }

    const isPush = 'counter' in header
    if (!isPush) {
        // Privacy: delete the request as soon as it's answered. A push leaves
        // its watch request to expire on its own schedule.
        const answered = await ctx.db
            .query('relayMessages')
            .withIndex('by_request', (q) =>
                q
                    .eq('controllerId', header.controllerId)
                    .eq('accessClientId', header.accessClientId)
                    .eq('requestId', header.requestId)
            )
            .collect()
        for (const message of answered) {
            if (message.kind === 'request') {
                await ctx.db.delete(message._id)
            }
        }
    }

    return await ctx.db.insert('relayMessages', {
        kind: isPush ? 'push' : 'response',
        controllerId: header.controllerId,
        identityEpoch: header.identityEpoch,
        accessClientId: header.accessClientId,
        requestId: header.requestId,
        ...(isPush ? { counter: header.counter } : {}),
        ciphertext: sealed.ciphertext,
        signature: sealed.signature,
        deleteAt: Date.now() + RELAY_TTL_MS,
    })
}

/**
 * An Access Client hands a sealed request to its Controller. Convex checks
 * only routing metadata: the Account's pairing, the header's shape and
 * expiry, and rate limits per Controller and per Access Client.
 */
export const send = authedMutation({
    args: {
        sealed: sealedRequestValidator,
    },
    returns: v.id('relayMessages'),
    handler: async (ctx, args) => {
        const sealed = checkSealedRequest(args.sealed)
        const { header } = sealed
        if (!(await isPairedWith(ctx, header.controllerId))) {
            throw new Error('Not paired with this controller')
        }

        const now = Date.now()
        const deleteAt = requestDeleteAt(header.expiresAt, now)
        if (deleteAt <= now) {
            throw relayError('expired')
        }

        // A failed limit throws, and the mutation rolls back any tokens the
        // other limit already took.
        await relayRateLimiter.limit(ctx, 'relayPerAccessClient', {
            key: JSON.stringify([header.controllerId, header.accessClientId]),
            throws: true,
        })
        await relayRateLimiter.limit(ctx, 'relayPerController', {
            key: header.controllerId,
            throws: true,
        })

        return await ctx.db.insert('relayMessages', {
            kind: 'request',
            ...header,
            enc: sealed.enc,
            ciphertext: sealed.ciphertext,
            signature: sealed.signature,
            deleteAt,
        })
    },
})

/** Responses and pushes for one Access Client's requests. */
export const responses = authedQuery({
    args: {
        controllerId: v.string(),
        accessClientId: v.string(),
        requestIds: v.array(v.string()),
    },
    returns: v.array(toClientMessageValidator),
    handler: async (ctx, args) => {
        if (!(await isPairedWith(ctx, args.controllerId))) {
            return []
        }
        const now = Date.now()
        const results: Array<{
            _id: Doc<'relayMessages'>['_id']
            kind: Doc<'relayMessages'>['kind']
            sealed: SealedToClient
        }> = []
        for (const requestId of args.requestIds) {
            const messages = await ctx.db
                .query('relayMessages')
                .withIndex('by_request', (q) =>
                    q
                        .eq('controllerId', args.controllerId)
                        .eq('accessClientId', args.accessClientId)
                        .eq('requestId', requestId)
                )
                .collect()
            for (const message of messages) {
                if (message.kind === 'request') continue
                if (!isLive(message, now)) continue
                results.push({
                    _id: message._id,
                    kind: message.kind,
                    sealed: toSealedToClient(message),
                })
            }
        }
        return results
    },
})

/**
 * IDs that are missing, already deleted, malformed or not the caller's are
 * skipped quietly, so acknowledging twice is harmless.
 */
export const acknowledge = authedMutation({
    args: {
        messageIds: v.array(v.string()),
    },
    returns: v.null(),
    handler: async (ctx, args) => {
        const pairedByController = new Map<string, boolean>()
        for (const rawId of args.messageIds) {
            const messageId = ctx.db.normalizeId('relayMessages', rawId)
            if (!messageId) continue
            const message = await ctx.db.get(messageId)
            if (!message || message.kind === 'request') continue
            let allowed = pairedByController.get(message.controllerId)
            if (allowed === undefined) {
                allowed = await isPairedWith(ctx, message.controllerId)
                pairedByController.set(message.controllerId, allowed)
            }
            if (allowed) {
                await ctx.db.delete(messageId)
            }
        }
        return null
    },
})

export const controllerExists = internalQuery({
    args: {
        controllerId: v.string(),
    },
    returns: v.boolean(),
    handler: async (ctx, args) => {
        const controller = await ctx.db
            .query('controllers')
            .withIndex('by_controller_id', (q) =>
                q.eq('controllerId', args.controllerId)
            )
            .unique()
        return controller !== null
    },
})

/** HTTP fallback read for Controllers without a Convex session. */
export const pendingForController = internalQuery({
    args: {
        controllerId: v.string(),
    },
    returns: v.array(sealedRequestValidator),
    handler: async (ctx, args) => {
        return (await pendingRequests(ctx, args.controllerId)).map(
            toSealedRequest
        )
    },
})

/** Subscription target for the controller Convex Rust client. */
export const pendingForMe = query({
    args: {},
    returns: v.array(sealedRequestValidator),
    handler: async (ctx) => {
        const { controllerId } = await requireControllerIdentity(ctx)
        return (await pendingRequests(ctx, controllerId)).map(toSealedRequest)
    },
})

export const respondAsController = mutation({
    args: {
        sealed: sealedToClientValidator,
    },
    returns: v.id('relayMessages'),
    handler: async (ctx, args) => {
        const { controllerId } = await requireControllerIdentity(ctx)
        if (args.sealed.header.controllerId !== controllerId) {
            throw relayError('wrong_controller')
        }
        return await writeToClient(ctx, args.sealed)
    },
})

/** HTTP fallback write; the caller has checked the registration secret. */
export const respondInternal = internalMutation({
    args: {
        sealed: sealedToClientValidator,
    },
    returns: v.id('relayMessages'),
    handler: async (ctx, args) => {
        return await writeToClient(ctx, args.sealed)
    },
})

export const respond = mutation({
    args: {
        sealed: sealedToClientValidator,
        registrationSecret: v.optional(v.string()),
    },
    returns: v.id('relayMessages'),
    handler: async (ctx, args) => {
        const expected = process.env.CONTROLLER_REGISTRATION_SECRET
        if (expected && args.registrationSecret !== expected) {
            throw new Error('Unauthorized')
        }
        return await writeToClient(ctx, args.sealed)
    },
})

/**
 * Backstop sweep for Relay messages nobody collected. Batched and
 * self-rescheduling so a burst drains without exceeding per-mutation write
 * limits.
 */
export const cleanup = internalMutation({
    args: {},
    returns: v.number(),
    handler: async (ctx) => {
        const expired = await ctx.db
            .query('relayMessages')
            .withIndex('by_delete_at', (q) => q.lt('deleteAt', Date.now()))
            .take(CLEANUP_BATCH_SIZE)

        for (const message of expired) {
            await ctx.db.delete(message._id)
        }

        if (expired.length === CLEANUP_BATCH_SIZE) {
            await ctx.scheduler.runAfter(0, internal.relay.cleanup, {})
        }

        return expired.length
    },
})
