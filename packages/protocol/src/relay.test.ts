import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { relayReplyMessageSchema, relayRequestMessageSchema } from './relay.ts'

describe('Leaving a Home and Access Client revocation over Relay', () => {
    it('sends leaveHome and revokeCurrent with no arguments', () => {
        for (const type of ['leaveHome', 'revokeCurrent'] as const) {
            assert.deepEqual(relayRequestMessageSchema.parse({ type }), {
                type,
            })
        }
    })
})

describe('Access Clients over Relay (NEM-131)', () => {
    it('lists and revokes Access Clients by Access Client ID', () => {
        assert.deepEqual(
            relayRequestMessageSchema.parse({ type: 'listAccessClients' }),
            { type: 'listAccessClients' }
        )
        assert.deepEqual(
            relayRequestMessageSchema.parse({
                type: 'revokeAccessClient',
                accessClientId: 'ac-1',
            }),
            { type: 'revokeAccessClient', accessClientId: 'ac-1' }
        )
        const reply = relayReplyMessageSchema.parse({
            type: 'accessClients',
            accessClients: [
                {
                    id: 'ac-1',
                    label: 'phone',
                    createdAt: '2026-11-27T00:00:00Z',
                    lastSeenAt: null,
                    userId: 'user-1',
                },
            ],
        })
        assert.equal(reply.type, 'accessClients')
    })

    it('has no token actions', () => {
        for (const message of [
            { type: 'listTokens' },
            { type: 'revokeToken', tokenId: 'ac-1' },
        ]) {
            assert.equal(
                relayRequestMessageSchema.safeParse(message).success,
                false,
                message.type
            )
        }
        assert.equal(
            relayReplyMessageSchema.safeParse({ type: 'tokens', tokens: [] })
                .success,
            false
        )
    })
})

describe('First-Owner bootstrap', () => {
    it('is not a Relay action: it pairs on the home network (NEM-126)', () => {
        const parsed = relayRequestMessageSchema.safeParse({
            type: 'bootstrapOwner',
            userId: 'u',
            email: 'owner@example.com',
        })
        assert.equal(parsed.success, false)
    })
})

describe('Sealed Relay plaintext (NEM-129)', () => {
    it('has no session mint request or result: no bearer token crosses Relay', () => {
        assert.equal(
            relayRequestMessageSchema.safeParse({
                type: 'sessionMint',
                userId: 'u',
                email: 'a@example.com',
                clientLabel: 'phone',
            }).success,
            false
        )
        assert.equal(
            relayReplyMessageSchema.safeParse({
                type: 'sessionMintResult',
                clientToken: 'secret',
                controllerId: 'nemu_1',
            }).success,
            false
        )
    })

    it('has no message for Matter pairing codes or Wi-Fi credentials', () => {
        for (const type of [
            'commissionMatter',
            'getMatterWifi',
            'saveMatterWifi',
        ]) {
            assert.equal(
                relayRequestMessageSchema.safeParse({ type }).success,
                false,
                type
            )
        }
    })

    it('reads a refused request with its error details', () => {
        const parsed = relayReplyMessageSchema.parse({
            type: 'commandResult',
            ok: false,
            error: {
                code: 'retired_epoch',
                message: 'Try again.',
                details: { identityEpoch: 2 },
            },
        })
        assert.equal(parsed.type, 'commandResult')
    })
})
