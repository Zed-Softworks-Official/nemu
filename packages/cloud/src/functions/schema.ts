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

    /**
     * Relay mailbox (ADR-0001). Each row is a sealed envelope's clear header
     * plus its opaque sealed parts, and nothing else: Convex never sees an
     * action, a result or authorization material.
     */
    relayMessages: defineTable({
        kind: v.union(
            v.literal('request'),
            v.literal('response'),
            v.literal('push')
        ),
        // Clear header, signed by the sender and bound to the ciphertext.
        controllerId: v.string(),
        identityEpoch: v.number(),
        accessClientId: v.string(),
        requestId: v.string(),
        /** Requests and pushes only. */
        counter: v.optional(v.number()),
        /** Requests only: the sender's signed expiry, in ms. */
        expiresAt: v.optional(v.number()),
        // Opaque sealed parts (base64url). Never parsed or logged.
        /** Requests only: the HPKE encapsulated key. */
        enc: v.optional(v.string()),
        ciphertext: v.string(),
        signature: v.string(),
        /** Mailbox bookkeeping: when Convex drops the row, in ms. */
        deleteAt: v.number(),
    })
        .index('by_controller_and_kind', ['controllerId', 'kind'])
        .index('by_request', ['controllerId', 'accessClientId', 'requestId'])
        .index('by_delete_at', ['deleteAt']),
})
