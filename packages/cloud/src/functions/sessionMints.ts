import { ConvexError, v } from 'convex/values'
import { authedMutation } from '../lib/customFunctions'
import { normalizeEmail } from '../lib/email'

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

        // Relay messages now hold only sealed envelopes (NEM-128), so a
        // plaintext session mint has nowhere to go. Throwing rolls back the
        // invite redemption above. NEM-131 deletes this function; new Access
        // Clients pair on the home network instead (NEM-126).
        throw new ConvexError({ code: 'session_mint_retired' })
    },
})
