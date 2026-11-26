import { v } from 'convex/values'
import { requireControllerIdentity } from '../lib/auth'
import { authedMutation, authedQuery } from '../lib/customFunctions'
import { CLEANUP_BATCH_SIZE, RELAY_TTL_MS } from '../lib/relay'
import { internal } from './_generated/api'
import type { Doc } from './_generated/dataModel'
import type { MutationCtx, QueryCtx } from './_generated/server'
import {
    internalMutation,
    internalQuery,
    mutation,
    query,
} from './_generated/server'

const pendingEnvelopeValidator = v.object({
    requestId: v.string(),
    payload: v.string(),
})

/**
 * Whether a Relay message may still be handed out. Reads filter on this so an
 * expired message is never returned, however late the cleanup sweep runs.
 */
function isLive(message: Doc<'relayMessages'>, now: number): boolean {
    return message.expiresAt > now
}

const relayMessageValidator = v.object({
    _id: v.id('relayMessages'),
    _creationTime: v.number(),
    controllerId: v.string(),
    direction: v.union(v.literal('toController'), v.literal('toClient')),
    requestId: v.string(),
    payload: v.string(),
    expiresAt: v.number(),
})

type AuthedCtx = (QueryCtx | MutationCtx) & { identity: { subject: string } }

async function findPairing(
    ctx: AuthedCtx,
    controllerId: string
): Promise<Doc<'pairings'> | null> {
    return await ctx.db
        .query('pairings')
        .withIndex('by_user_and_controller', (q) =>
            q
                .eq('userId', ctx.identity.subject)
                .eq('controllerId', controllerId)
        )
        .unique()
}

async function isPairedWith(
    ctx: AuthedCtx,
    controllerId: string
): Promise<boolean> {
    return (await findPairing(ctx, controllerId)) !== null
}

async function requirePairing(
    ctx: AuthedCtx,
    controllerId: string
): Promise<Doc<'pairings'>> {
    const pairing = await findPairing(ctx, controllerId)
    if (!pairing) {
        throw new Error('Not paired with this controller')
    }
    return pairing
}

async function writeResponse(
    ctx: MutationCtx,
    args: { controllerId: string; requestId: string; payload: string }
) {
    const controller = await ctx.db
        .query('controllers')
        .withIndex('by_controller_id', (q) =>
            q.eq('controllerId', args.controllerId)
        )
        .unique()
    if (!controller) {
        throw new Error('Controller not found')
    }

    const pending = await ctx.db
        .query('relayMessages')
        .withIndex('by_request_id', (q) => q.eq('requestId', args.requestId))
        .collect()
    for (const message of pending) {
        if (
            message.direction === 'toController' &&
            message.controllerId === args.controllerId
        ) {
            // Privacy: delete inbound messages as soon as they're answered.
            await ctx.db.delete(message._id)
        }
    }

    return await ctx.db.insert('relayMessages', {
        controllerId: args.controllerId,
        direction: 'toClient',
        requestId: args.requestId,
        payload: args.payload,
        expiresAt: Date.now() + RELAY_TTL_MS,
    })
}

export const send = authedMutation({
    args: {
        controllerId: v.string(),
        requestId: v.string(),
        payload: v.string(),
    },
    returns: v.id('relayMessages'),
    handler: async (ctx, args) => {
        await requirePairing(ctx, args.controllerId)

        return await ctx.db.insert('relayMessages', {
            controllerId: args.controllerId,
            direction: 'toController',
            requestId: args.requestId,
            payload: args.payload,
            expiresAt: Date.now() + RELAY_TTL_MS,
        })
    },
})

export const responses = authedQuery({
    args: {
        requestIds: v.array(v.string()),
    },
    returns: v.array(relayMessageValidator),
    handler: async (ctx, args) => {
        const now = Date.now()
        const results: Doc<'relayMessages'>[] = []
        for (const requestId of args.requestIds) {
            const messages = await ctx.db
                .query('relayMessages')
                .withIndex('by_request_id', (q) => q.eq('requestId', requestId))
                .collect()
            for (const message of messages) {
                if (message.direction !== 'toClient') continue
                if (!isLive(message, now)) continue
                if (await isPairedWith(ctx, message.controllerId)) {
                    results.push(message)
                }
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
            if (!message || message.direction !== 'toClient') continue
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

export const pendingForController = internalQuery({
    args: {
        controllerId: v.string(),
    },
    returns: v.array(relayMessageValidator),
    handler: async (ctx, args) => {
        const now = Date.now()
        const messages = await ctx.db
            .query('relayMessages')
            .withIndex('by_controller_and_direction', (q) =>
                q
                    .eq('controllerId', args.controllerId)
                    .eq('direction', 'toController')
            )
            .collect()
        return messages.filter((message) => isLive(message, now))
    },
})

/** Subscription target for the controller Convex Rust client. */
export const pendingForMe = query({
    args: {},
    returns: v.array(pendingEnvelopeValidator),
    handler: async (ctx) => {
        const { controllerId } = await requireControllerIdentity(ctx)
        const now = Date.now()
        const messages = await ctx.db
            .query('relayMessages')
            .withIndex('by_controller_and_direction', (q) =>
                q
                    .eq('controllerId', controllerId)
                    .eq('direction', 'toController')
            )
            .collect()
        return messages
            .filter((message) => isLive(message, now))
            .map((message) => ({
                requestId: message.requestId,
                payload: message.payload,
            }))
    },
})

export const respondAsController = mutation({
    args: {
        requestId: v.string(),
        payload: v.string(),
    },
    returns: v.id('relayMessages'),
    handler: async (ctx, args) => {
        const { controllerId } = await requireControllerIdentity(ctx)
        return await writeResponse(ctx, {
            controllerId,
            requestId: args.requestId,
            payload: args.payload,
        })
    },
})

export const respondInternal = internalMutation({
    args: {
        controllerId: v.string(),
        requestId: v.string(),
        payload: v.string(),
    },
    returns: v.id('relayMessages'),
    handler: async (ctx, args) => {
        return await writeResponse(ctx, args)
    },
})

export const respond = mutation({
    args: {
        controllerId: v.string(),
        requestId: v.string(),
        payload: v.string(),
        registrationSecret: v.optional(v.string()),
    },
    returns: v.id('relayMessages'),
    handler: async (ctx, args) => {
        const expected = process.env.CONTROLLER_REGISTRATION_SECRET
        if (expected && args.registrationSecret !== expected) {
            throw new Error('Unauthorized')
        }

        return await writeResponse(ctx, {
            controllerId: args.controllerId,
            requestId: args.requestId,
            payload: args.payload,
        })
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
            .withIndex('by_expiry', (q) => q.lt('expiresAt', Date.now()))
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
