import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { commissionRequestSchema } from './api.ts'
import {
    relayToClientEnvelopeSchema,
    relayToControllerEnvelopeSchema,
} from './relay.ts'

describe('Commissioning requests over Relay', () => {
    for (const message of [
        { type: 'cancelMatterCommission' },
        { type: 'permitJoin', seconds: 180 },
        { type: 'permitJoin', seconds: 0 },
    ]) {
        it(`carries ${message.type} unchanged`, () => {
            const envelope = relayToControllerEnvelopeSchema.parse({
                requestId: 'r1',
                clientToken: 't',
                message,
            })
            assert.deepEqual(envelope.message, message)
        })
    }

    for (const message of [
        { type: 'commissionMatter', code: '34970112332' },
        { type: 'getMatterWifi' },
        { type: 'saveMatterWifi', wifiSsid: 'home', wifiPassword: 'pw' },
    ]) {
        it(`has no envelope for ${message.type}`, () => {
            assert.equal(
                relayToControllerEnvelopeSchema.safeParse({
                    requestId: 'r1',
                    clientToken: 't',
                    message,
                }).success,
                false
            )
        })
    }
})

describe('Commissioning outcomes over Relay', () => {
    for (const message of [
        { type: 'cancelMatterCommission', ok: true },
        { type: 'permitJoin', ok: true, seconds: 180 },
    ]) {
        it(`reads ${message.type} in the same shape as LAN`, () => {
            const envelope = relayToClientEnvelopeSchema.parse({
                requestId: 'r1',
                signature: 's',
                message,
            })
            assert.deepEqual(envelope.message, message)
        })
    }
})

describe('Matter commissioning requests over LAN', () => {
    it('need a pairing code', () => {
        assert.equal(
            commissionRequestSchema.parse({ code: ' 34970112332 ' }).code,
            '34970112332'
        )
        for (const request of [{}, { code: '' }, { code: '   ' }]) {
            assert.equal(
                commissionRequestSchema.safeParse(request).success,
                false
            )
        }
    })
})
