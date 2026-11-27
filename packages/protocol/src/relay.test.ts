import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { relayToControllerEnvelopeSchema } from './relay.ts'

describe('Leaving a Home and Access Client revocation over Relay', () => {
    it('sends leaveHome and revokeCurrent with no arguments', () => {
        for (const type of ['leaveHome', 'revokeCurrent'] as const) {
            const parsed = relayToControllerEnvelopeSchema.parse({
                requestId: 'r1',
                clientToken: 'token',
                message: { type },
            })
            assert.deepEqual(parsed.message, { type })
        }
    })
})

describe('First-Owner bootstrap', () => {
    it('is not a Relay action: it pairs on the home network (NEM-126)', () => {
        const parsed = relayToControllerEnvelopeSchema.safeParse({
            requestId: 'r1',
            clientToken: 'token',
            message: {
                type: 'bootstrapOwner',
                userId: 'u',
                email: 'owner@example.com',
            },
        })
        assert.equal(parsed.success, false)
    })
})
