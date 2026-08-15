import { v } from 'convex/values'
import { authedQuery } from '../lib/customFunctions'
import { isRfc1918Ipv4, lanHostnameFor } from '../lib/lanHostname'
import { internal } from './_generated/api'
import {
    httpAction,
    internalMutation,
    internalQuery,
    query,
} from './_generated/server'

const controllerPublicValidator = v.object({
    controllerId: v.string(),
    name: v.string(),
    publicKey: v.string(),
    registeredAt: v.number(),
    lanHostname: v.optional(v.string()),
})

export const registerController = internalMutation({
    args: {
        controllerId: v.string(),
        publicKey: v.string(),
        name: v.string(),
        lanIp: v.optional(v.string()),
    },
    returns: v.object({
        shouldIssue: v.boolean(),
        lanHostname: v.optional(v.string()),
    }),
    handler: async (ctx, args) => {
        const lanIp =
            args.lanIp && isRfc1918Ipv4(args.lanIp) ? args.lanIp : undefined
        const lanHostname = lanIp
            ? lanHostnameFor(args.controllerId)
            : undefined

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
                ...(lanIp ? { lanIp, lanHostname } : {}),
            })
            return {
                shouldIssue: Boolean(lanIp),
                lanHostname: lanHostname ?? existing.lanHostname,
            }
        }

        await ctx.db.insert('controllers', {
            controllerId: args.controllerId,
            publicKey: args.publicKey,
            name: args.name,
            registeredAt: Date.now(),
            lanIp,
            lanHostname,
        })
        return {
            shouldIssue: Boolean(lanIp),
            lanHostname,
        }
    },
})

export const saveTlsMaterial = internalMutation({
    args: {
        controllerId: v.string(),
        certPem: v.string(),
        keyPem: v.string(),
        expiresAt: v.number(),
        lanHostname: v.string(),
    },
    returns: v.null(),
    handler: async (ctx, args) => {
        const existing = await ctx.db
            .query('controllers')
            .withIndex('by_controller_id', (q) =>
                q.eq('controllerId', args.controllerId)
            )
            .unique()
        if (!existing) {
            throw new Error('Controller not found')
        }
        await ctx.db.patch(existing._id, {
            tlsCertPem: args.certPem,
            tlsKeyPem: args.keyPem,
            tlsExpiresAt: args.expiresAt,
            lanHostname: args.lanHostname,
        })
        return null
    },
})

export const getForIssue = internalQuery({
    args: { controllerId: v.string() },
    returns: v.union(
        v.object({
            controllerId: v.string(),
            lanIp: v.optional(v.string()),
            lanHostname: v.optional(v.string()),
            tlsCertPem: v.optional(v.string()),
            tlsExpiresAt: v.optional(v.number()),
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
            lanIp: controller.lanIp,
            lanHostname: controller.lanHostname,
            tlsCertPem: controller.tlsCertPem,
            tlsExpiresAt: controller.tlsExpiresAt,
        }
    },
})

export const getTlsBundle = internalQuery({
    args: { controllerId: v.string() },
    returns: v.union(
        v.object({
            hostname: v.string(),
            certPem: v.string(),
            keyPem: v.string(),
            expiresAt: v.number(),
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
        if (
            !controller?.tlsCertPem ||
            !controller.tlsKeyPem ||
            !controller.lanHostname ||
            controller.tlsExpiresAt === undefined
        ) {
            return null
        }
        return {
            hostname: controller.lanHostname,
            certPem: controller.tlsCertPem,
            keyPem: controller.tlsKeyPem,
            expiresAt: controller.tlsExpiresAt,
        }
    },
})

export const listNeedingRenewal = internalQuery({
    args: { now: v.number(), withinMs: v.number() },
    returns: v.array(v.string()),
    handler: async (ctx, args) => {
        const controllers = await ctx.db.query('controllers').take(200)
        const ids: string[] = []
        for (const controller of controllers) {
            if (!controller.lanIp) continue
            const expires = controller.tlsExpiresAt
            if (expires === undefined || expires <= args.now + args.withinMs) {
                ids.push(controller.controllerId)
            }
        }
        return ids
    },
})

export const getAcmeAccount = internalQuery({
    args: { directoryUrl: v.string() },
    returns: v.union(v.string(), v.null()),
    handler: async (ctx, args) => {
        const row = await ctx.db
            .query('acmeAccounts')
            .withIndex('by_directory', (q) =>
                q.eq('directoryUrl', args.directoryUrl)
            )
            .unique()
        return row?.accountKeyPem ?? null
    },
})

export const upsertAcmeAccount = internalMutation({
    args: { directoryUrl: v.string(), accountKeyPem: v.string() },
    returns: v.null(),
    handler: async (ctx, args) => {
        const existing = await ctx.db
            .query('acmeAccounts')
            .withIndex('by_directory', (q) =>
                q.eq('directoryUrl', args.directoryUrl)
            )
            .unique()
        if (existing) {
            await ctx.db.patch(existing._id, {
                accountKeyPem: args.accountKeyPem,
            })
            return null
        }
        await ctx.db.insert('acmeAccounts', {
            directoryUrl: args.directoryUrl,
            accountKeyPem: args.accountKeyPem,
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
            lanHostname: v.optional(v.string()),
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
                    lanHostname: controller.lanHostname,
                })
            }
        }
        return results
    },
})

export const getByControllerId = query({
    args: { controllerId: v.string() },
    returns: v.union(controllerPublicValidator, v.null()),
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
            lanHostname: controller.lanHostname,
        }
    },
})

export const registerHttp = httpAction(async (ctx, req) => {
    let body: {
        controllerId?: string
        publicKey?: string
        name?: string
        registrationSecret?: string
        lanIp?: string
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

    const result = await ctx.runMutation(
        internal.controllers.registerController,
        {
            controllerId: body.controllerId,
            publicKey: body.publicKey,
            name: body.name,
            lanIp: body.lanIp,
        }
    )

    if (result.shouldIssue) {
        await ctx.scheduler.runAfter(
            0,
            internal.acmeActions.issueForController,
            {
                controllerId: body.controllerId,
            }
        )
    }

    return new Response(
        JSON.stringify({ ok: true, lanHostname: result.lanHostname }),
        {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        }
    )
})

export const getTlsHttp = httpAction(async (ctx, req) => {
    let body: {
        controllerId?: string
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

    if (!body.controllerId) {
        return new Response(
            JSON.stringify({ error: 'controllerId is required' }),
            {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            }
        )
    }

    const bundle = await ctx.runQuery(internal.controllers.getTlsBundle, {
        controllerId: body.controllerId,
    })
    if (!bundle) {
        return new Response(
            JSON.stringify({ error: 'TLS material not ready' }),
            {
                status: 404,
                headers: { 'Content-Type': 'application/json' },
            }
        )
    }

    return new Response(JSON.stringify(bundle), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    })
})
