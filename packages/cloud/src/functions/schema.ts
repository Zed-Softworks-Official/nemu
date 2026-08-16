import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

export default defineSchema({
    controllers: defineTable({
        controllerId: v.string(),
        publicKey: v.string(),
        name: v.string(),
        registeredAt: v.number(),
        lanIp: v.optional(v.string()),
        lanHostname: v.optional(v.string()),
        tlsCertPem: v.optional(v.string()),
        tlsKeyPem: v.optional(v.string()),
        tlsExpiresAt: v.optional(v.number()),
    }).index('by_controller_id', ['controllerId']),

    acmeAccounts: defineTable({
        directoryUrl: v.string(),
        accountKeyPem: v.string(),
    }).index('by_directory', ['directoryUrl']),

    pairings: defineTable({
        userId: v.string(),
        controllerId: v.string(),
        createdAt: v.number(),
        role: v.optional(v.union(v.literal('owner'), v.literal('member'))),
    })
        .index('by_user', ['userId'])
        .index('by_user_and_controller', ['userId', 'controllerId'])
        .index('by_controller', ['controllerId']),

    invites: defineTable({
        controllerId: v.string(),
        email: v.string(),
        invitedByUserId: v.string(),
        createdAt: v.number(),
    })
        .index('by_email', ['email'])
        .index('by_controller_and_email', ['controllerId', 'email']),

    relayMessages: defineTable({
        controllerId: v.string(),
        direction: v.union(v.literal('toController'), v.literal('toClient')),
        requestId: v.string(),
        payload: v.string(),
        consumed: v.boolean(),
        expiresAt: v.number(),
    })
        .index('by_controller_and_direction', [
            'controllerId',
            'direction',
            'consumed',
        ])
        .index('by_request_id', ['requestId'])
        .index('by_expiry', ['expiresAt']),
})
