import { v } from 'convex/values'
import { httpAction, internalMutation, query } from './_generated/server'
import { internal } from './_generated/api'
import { authedQuery } from './lib/customFunctions'

export const registerController = internalMutation({
    args: {
        controllerId: v.string(),
        publicKey: v.string(),
        name: v.string(),
    },
    returns: v.null(),
    handler: async (ctx, args) => {
        const existing = await ctx.db
            .query('controllers')
            .withIndex('by_controller_id', (q) =>
                q.eq('controllerId', args.controllerId)
            )
            .unique()

        if (existing) {
            await ctx.db.patch(existing._id, {
                publicKey: args.publicKey,
                name: args.name,
            })
            return null
        }

        await ctx.db.insert('controllers', {
            controllerId: args.controllerId,
            publicKey: args.publicKey,
            name: args.name,
            registeredAt: Date.now(),
        })
        return null
    },
})

export const listMine = authedQuery({
    args: {},
    returns: v.array(
        v.object({
            controllerId: v.string(),
            name: v.string(),
            publicKey: v.string(),
            registeredAt: v.number(),
            pairedAt: v.number(),
        })
    ),
    handler: async (ctx) => {
        const pairings = await ctx.db
            .query('pairings')
            .withIndex('by_user', (q) => q.eq('userId', ctx.identity.subject))
            .collect()

        const results = []
        for (const pairing of pairings) {
            const controller = await ctx.db
                .query('controllers')
                .withIndex('by_controller_id', (q) =>
                    q.eq('controllerId', pairing.controllerId)
                )
                .unique()
            if (controller) {
                results.push({
                    controllerId: controller.controllerId,
                    name: controller.name,
                    publicKey: controller.publicKey,
                    registeredAt: controller.registeredAt,
                    pairedAt: pairing.createdAt,
                })
            }
        }
        return results
    },
})

export const getByControllerId = query({
    args: { controllerId: v.string() },
    returns: v.union(
        v.object({
            controllerId: v.string(),
            name: v.string(),
            publicKey: v.string(),
            registeredAt: v.number(),
        }),
        v.null()
    ),
    handler: async (ctx, args) => {
        const controller = await ctx.db
            .query('controllers')
            .withIndex('by_controller_id', (q) =>
                q.eq('controllerId', args.controllerId)
            )
            .unique()
        if (!controller) return null
        return {
            controllerId: controller.controllerId,
            name: controller.name,
            publicKey: controller.publicKey,
            registeredAt: controller.registeredAt,
        }
    },
})

export const registerHttp = httpAction(async (ctx, req) => {
    let body: {
        controllerId?: string
        publicKey?: string
        name?: string
        registrationSecret?: string
    }
    try {
        body = await req.json()
    } catch {
        return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
        })
    }

    const expected = process.env.CONTROLLER_REGISTRATION_SECRET
    if (expected && body.registrationSecret !== expected) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
        })
    }

    if (!body.controllerId || !body.publicKey || !body.name) {
        return new Response(
            JSON.stringify({
                error: 'controllerId, publicKey, and name are required',
            }),
            {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            }
        )
    }

    await ctx.runMutation(internal.controllers.registerController, {
        controllerId: body.controllerId,
        publicKey: body.publicKey,
        name: body.name,
    })

    return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    })
})
