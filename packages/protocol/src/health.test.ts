import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { healthResponseSchema, healthSummarySchema } from './api.ts'
import {
    relayToClientEnvelopeSchema,
    relayToControllerEnvelopeSchema,
} from './relay.ts'

const ownerSummary = {
    view: 'owner',
    status: 'ok',
    services: { mqtt: true, zigbee: true, matter: false },
    devices: { online: 3, total: 4 },
    controller: { database: true, relayConnected: true },
}

const memberSummary = {
    view: 'member',
    status: 'degraded',
    services: { mqtt: false, zigbee: true, matter: true },
    devices: { online: 0, total: 2 },
}

describe('Controller health summary', () => {
    it('reads the Owner view with Controller details', () => {
        assert.deepEqual(healthSummarySchema.parse(ownerSummary), ownerSummary)
    })

    it('reads the Member view without Controller details', () => {
        assert.deepEqual(
            healthSummarySchema.parse(memberSummary),
            memberSummary
        )
    })

    it('refuses an Owner view without Controller details', () => {
        const { controller: _, ...withoutDetails } = ownerSummary
        assert.equal(
            healthSummarySchema.safeParse(withoutDetails).success,
            false
        )
    })

    it('drops Controller details from a Member view', () => {
        const parsed = healthSummarySchema.parse({
            ...memberSummary,
            controller: { database: true, relayConnected: true },
        })
        assert.equal('controller' in parsed, false)
    })

    it('keeps the public LAN probe shape', () => {
        assert.deepEqual(healthResponseSchema.parse({ status: 'ok' }), {
            status: 'ok',
        })
    })

    it('is requested over Relay', () => {
        assert.equal(
            relayToControllerEnvelopeSchema.safeParse({
                requestId: 'r1',
                clientToken: 'token',
                message: { type: 'getHealthSummary' },
            }).success,
            true
        )
    })

    it('answers over Relay with the same shape as LAN', () => {
        for (const summary of [ownerSummary, memberSummary]) {
            const parsed = relayToClientEnvelopeSchema.parse({
                requestId: 'r1',
                signature: 'sig',
                message: { type: 'healthSummary', ...summary },
            })
            const { type, ...body } = parsed.message as {
                type: string
            } & Record<string, unknown>
            assert.equal(type, 'healthSummary')
            assert.deepEqual(body, healthSummarySchema.parse(summary))
        }
    })
})
