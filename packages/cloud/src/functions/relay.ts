import { v } from 'convex/values'
import { authedMutation, authedQuery } from '../lib/customFunctions'
import type { Doc } from './_generated/dataModel'
import type { MutationCtx, QueryCtx } from './_generated/server'
import { internalMutation, internalQuery, mutation } from './_generated/server'

const RELAY_TTL_MS = 5 * 60 * 1000

const relayMessageValidator = v.object({
    _id: v.id('relayMessages'),
    _creationTime: v.number(),
    controllerId: v.string(),
    direction: v.union(v.literal('toController'), v.literal('toClient')),
    requestId: v.string(),
    payload: v.string(),
    consumed: v.boolean(),
    expiresAt: v.number(),
})

async function requirePairing(
    ctx: (QueryCtx | MutationCtx) & { identity: { subject: string } },
    controllerId: string
): Promise<Doc<'pairings'>> {
    const pairing = await ctx.db
        .query('pairings')
        .withIndex('by_user_and_controller', (q) =>
            q
                .eq('userId', ctx.identity.subject)
                .eq('controllerId', controllerId)
        )
        .unique()
    if (!pairing) {
        throw new Error('Not paired with this controller')
    }
    return pairing
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
            consumed: false,
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
        const results: Doc<'relayMessages'>[] = []
        for (const requestId of args.requestIds) {
            const messages = await ctx.db
                .query('relayMessages')
                .withIndex('by_request_id', (q) => q.eq('requestId', requestId))
                .collect()
            for (const message of messages) {
                if (message.direction !== 'toClient') continue
                const pairing = await ctx.db
                    .query('pairings')
                    .withIndex('by_user_and_controller', (q) =>
                        q
                            .eq('userId', ctx.identity.subject)
                            .eq('controllerId', message.controllerId)
                    )
                    .unique()
                if (pairing) {
                    results.push(message)
                }
            }
        }
        return results
    },
})

export const pendingForController = internalQuery({
    args: {
        controllerId: v.string(),
    },
    returns: v.array(relayMessageValidator),
    handler: async (ctx, args) => {
        return await ctx.db
            .query('relayMessages')
            .withIndex('by_controller_and_direction', (q) =>
                q
                    .eq('controllerId', args.controllerId)
                    .eq('direction', 'toController')
                    .eq('consumed', false)
            )
            .collect()
    },
})

export const markConsumed = internalMutation({
    args: {
        messageId: v.id('relayMessages'),
    },
    returns: v.null(),
    handler: async (ctx, args) => {
        await ctx.db.patch(args.messageId, { consumed: true })
        return null
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
            .withIndex('by_request_id', (q) =>
                q.eq('requestId', args.requestId)
            )
            .collect()
        for (const message of pending) {
            if (
                message.direction === 'toController' &&
                message.controllerId === args.controllerId &&
                !message.consumed
            ) {
                await ctx.db.patch(message._id, { consumed: true })
            }
        }

        return await ctx.db.insert('relayMessages', {
            controllerId: args.controllerId,
            direction: 'toClient',
            requestId: args.requestId,
            payload: args.payload,
            consumed: false,
            expiresAt: Date.now() + RELAY_TTL_MS,
        })
    },
})

export const cleanup = internalMutation({
    args: {},
    returns: v.number(),
    handler: async (ctx) => {
        const now = Date.now()
        let deleted = 0

        const expired = await ctx.db
            .query('relayMessages')
            .withIndex('by_expiry', (q) => q.lt('expiresAt', now))
            .take(100)

        for (const message of expired) {
            await ctx.db.delete(message._id)
            deleted++
        }

        return deleted
    },
})
