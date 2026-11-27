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
