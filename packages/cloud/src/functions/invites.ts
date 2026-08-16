import { v } from 'convex/values'
import { authedMutation, authedQuery } from '../lib/customFunctions'
import { normalizeEmail } from '../lib/email'

const inviteValidator = v.object({
    _id: v.id('invites'),
    _creationTime: v.number(),
    controllerId: v.string(),
    email: v.string(),
    invitedByUserId: v.string(),
    createdAt: v.number(),
})

export const listMine = authedQuery({
    args: {},
    returns: v.array(inviteValidator),
    handler: async (ctx) => {
        const email = normalizeEmail(ctx.identity.email)
        if (!email) {
            return []
        }
        return await ctx.db
            .query('invites')
            .withIndex('by_email', (q) => q.eq('email', email))
            .collect()
    },
})

export const remove = authedMutation({
    args: {
        controllerId: v.string(),
        email: v.string(),
    },
    returns: v.null(),
    handler: async (ctx, args) => {
        const caller = await ctx.db
            .query('pairings')
            .withIndex('by_user_and_controller', (q) =>
                q
                    .eq('userId', ctx.identity.subject)
                    .eq('controllerId', args.controllerId)
            )
            .unique()
        if (!caller || (caller.role !== 'owner' && caller.role !== undefined)) {
            throw new Error('Only the home owner can revoke invites')
        }

        const email = normalizeEmail(args.email)
        if (!email) {
            throw new Error('Email is invalid')
        }

        const invite = await ctx.db
            .query('invites')
            .withIndex('by_controller_and_email', (q) =>
                q.eq('controllerId', args.controllerId).eq('email', email)
            )
            .unique()
        if (invite) {
            await ctx.db.delete(invite._id)
        }
        return null
    },
})
