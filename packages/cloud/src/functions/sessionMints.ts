import { v } from 'convex/values'
import { authedMutation } from '../lib/customFunctions'
import { normalizeEmail } from '../lib/email'

const RELAY_TTL_MS = 5 * 60 * 1000

export const request = authedMutation({
    args: {
        controllerId: v.string(),
        requestId: v.string(),
        clientLabel: v.string(),
        displayName: v.optional(v.string()),
    },
    returns: v.id('relayMessages'),
    handler: async (ctx, args) => {
        const email = normalizeEmail(ctx.identity.email)
        if (!email) {
            throw new Error('Google account email is required')
        }

        const label = args.clientLabel.trim()
        if (!label) {
            throw new Error('clientLabel is required')
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

        let pairing = await ctx.db
            .query('pairings')
            .withIndex('by_user_and_controller', (q) =>
                q
                    .eq('userId', ctx.identity.subject)
                    .eq('controllerId', args.controllerId)
            )
            .unique()

        if (!pairing) {
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
            const pairingId = await ctx.db.insert('pairings', {
                userId: ctx.identity.subject,
                controllerId: args.controllerId,
                createdAt: Date.now(),
                role: 'member',
            })
            pairing = await ctx.db.get(pairingId)
        }

        if (!pairing) {
            throw new Error('Not paired with this controller')
        }

        const payload = JSON.stringify({
            requestId: args.requestId,
            message: {
                type: 'sessionMint',
                userId: ctx.identity.subject,
                email,
                clientLabel: label,
                displayName: args.displayName,
            },
        })

        return await ctx.db.insert('relayMessages', {
            controllerId: args.controllerId,
            direction: 'toController',
            requestId: args.requestId,
            payload,
            consumed: false,
            expiresAt: Date.now() + RELAY_TTL_MS,
        })
    },
})
