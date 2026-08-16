import { v } from 'convex/values'
import { authedMutation, authedQuery } from '../lib/customFunctions'
import { normalizeEmail } from '../lib/email'
import type { Doc } from './_generated/dataModel'
import type { MutationCtx, QueryCtx } from './_generated/server'

const pairingRoleValidator = v.union(v.literal('owner'), v.literal('member'))

const pairingValidator = v.object({
    _id: v.id('pairings'),
    _creationTime: v.number(),
    userId: v.string(),
    controllerId: v.string(),
    createdAt: v.number(),
    role: v.optional(pairingRoleValidator),
})

async function pairingFor(
    ctx: (QueryCtx | MutationCtx) & { identity: { subject: string } },
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

function isOwner(pairing: Doc<'pairings'>): boolean {
    return pairing.role === 'owner' || pairing.role === undefined
}

export const list = authedQuery({
    args: {},
    returns: v.array(pairingValidator),
    handler: async (ctx) => {
        return await ctx.db
            .query('pairings')
            .withIndex('by_user', (q) => q.eq('userId', ctx.identity.subject))
            .collect()
    },
})

export const create = authedMutation({
    args: {
        controllerId: v.string(),
    },
    returns: v.id('pairings'),
    handler: async (ctx, args) => {
        const existing = await pairingFor(ctx, args.controllerId)
        if (existing) {
            return existing._id
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

        const existingForController = await ctx.db
            .query('pairings')
            .withIndex('by_controller', (q) =>
                q.eq('controllerId', args.controllerId)
            )
            .take(1)

        if (existingForController.length === 0) {
            return await ctx.db.insert('pairings', {
                userId: ctx.identity.subject,
                controllerId: args.controllerId,
                createdAt: Date.now(),
                role: 'owner',
            })
        }

        const email = normalizeEmail(ctx.identity.email)
        if (!email) {
            throw new Error('Google account email is required')
        }

        const invite = await ctx.db
            .query('invites')
            .withIndex('by_controller_and_email', (q) =>
                q.eq('controllerId', args.controllerId).eq('email', email)
            )
            .unique()
        if (!invite) {
            throw new Error('Not invited to this home')
        }

        await ctx.db.delete(invite._id)
        return await ctx.db.insert('pairings', {
            userId: ctx.identity.subject,
            controllerId: args.controllerId,
            createdAt: Date.now(),
            role: 'member',
        })
    },
})

export const invite = authedMutation({
    args: {
        controllerId: v.string(),
        email: v.string(),
    },
    returns: v.id('invites'),
    handler: async (ctx, args) => {
        const pairing = await pairingFor(ctx, args.controllerId)
        if (!pairing || !isOwner(pairing)) {
            throw new Error('Only the home owner can invite people')
        }

        const email = normalizeEmail(args.email)
        if (!email) {
            throw new Error('Email is invalid')
        }

        const existing = await ctx.db
            .query('invites')
            .withIndex('by_controller_and_email', (q) =>
                q.eq('controllerId', args.controllerId).eq('email', email)
            )
            .unique()
        if (existing) {
            return existing._id
        }

        return await ctx.db.insert('invites', {
            controllerId: args.controllerId,
            email,
            invitedByUserId: ctx.identity.subject,
            createdAt: Date.now(),
        })
    },
})

export const remove = authedMutation({
    args: {
        controllerId: v.string(),
    },
    returns: v.null(),
    handler: async (ctx, args) => {
        const existing = await pairingFor(ctx, args.controllerId)
        if (existing) {
            await ctx.db.delete(existing._id)
        }
        return null
    },
})

export const removeUser = authedMutation({
    args: {
        controllerId: v.string(),
        userId: v.string(),
    },
    returns: v.null(),
    handler: async (ctx, args) => {
        const caller = await pairingFor(ctx, args.controllerId)
        if (!caller || !isOwner(caller)) {
            throw new Error('Only the home owner can remove people')
        }
        if (args.userId === ctx.identity.subject) {
            throw new Error('Use leave to remove yourself')
        }

        const target = await ctx.db
            .query('pairings')
            .withIndex('by_user_and_controller', (q) =>
                q
                    .eq('userId', args.userId)
                    .eq('controllerId', args.controllerId)
            )
            .unique()
        if (target) {
            if (isOwner(target)) {
                const owners = (
                    await ctx.db
                        .query('pairings')
                        .withIndex('by_controller', (q) =>
                            q.eq('controllerId', args.controllerId)
                        )
                        .collect()
                ).filter(isOwner)
                if (owners.length <= 1) {
                    throw new Error('Cannot remove the last owner')
                }
            }
            await ctx.db.delete(target._id)
        }
        return null
    },
})
