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
