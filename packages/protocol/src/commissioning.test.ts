import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
    relayToClientEnvelopeSchema,
    relayToControllerEnvelopeSchema,
} from './relay.ts'

describe('Commissioning requests over Relay', () => {
    for (const message of [
        { type: 'commissionMatter', code: '34970112332' },
        {
            type: 'commissionMatter',
            code: 'MT:Y.K90',
            wifiSsid: 'home',
            wifiPassword: '',
        },
        { type: 'cancelMatterCommission' },
        { type: 'getMatterWifi' },
        { type: 'saveMatterWifi', wifiSsid: 'home', wifiPassword: 'pw' },
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

    it('rejects a Matter commission without a pairing code', () => {
        assert.equal(
            relayToControllerEnvelopeSchema.safeParse({
                requestId: 'r1',
                clientToken: 't',
                message: { type: 'commissionMatter', code: ' ' },
            }).success,
            false
        )
    })
})

describe('Commissioning outcomes over Relay', () => {
    for (const message of [
        { type: 'commissionMatter', ok: true },
        { type: 'cancelMatterCommission', ok: true },
        { type: 'matterWifi', configured: true, networkName: 'home' },
        { type: 'matterWifi', configured: false },
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
