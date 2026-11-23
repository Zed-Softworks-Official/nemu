import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { sessionResponseSchema } from './api.ts'
import {
    relayToClientEnvelopeSchema,
    relayToControllerEnvelopeSchema,
} from './relay.ts'

describe('Role in the session (NEM-86)', () => {
    it('parses the LAN session response for Owners and Members', () => {
        for (const role of ['owner', 'member'] as const) {
            assert.deepEqual(sessionResponseSchema.parse({ role }), { role })
        }
    })

    it('rejects a role the Controller never reports', () => {
        assert.equal(
            sessionResponseSchema.safeParse({ role: 'admin' }).success,
            false
        )
        assert.equal(sessionResponseSchema.safeParse({}).success, false)
    })

    it('sends getSession over Relay with no arguments', () => {
        const parsed = relayToControllerEnvelopeSchema.parse({
            requestId: 'r1',
            clientToken: 'token',
            message: { type: 'getSession' },
        })
        assert.deepEqual(parsed.message, { type: 'getSession' })
    })

    it('answers over Relay with the same shape as LAN', () => {
        const parsed = relayToClientEnvelopeSchema.parse({
            requestId: 'r1',
            signature: 'sig',
            message: { type: 'session', role: 'member' },
        })
        assert.deepEqual(parsed.message, { type: 'session', role: 'member' })
        const { type: _type, ...body } = parsed.message as {
            type: string
            role: string
        }
        assert.deepEqual(sessionResponseSchema.parse(body), { role: 'member' })
    })
})
