import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { bridgeCommissioningSchema } from './bridge.ts'
import {
    COMMISSIONING_STEPS,
    commissioningProgressSchema,
    commissioningStepEventSchema,
} from './commissioning-progress.ts'
import { deviceEventSchema } from './events.ts'
import { relayReplyMessageSchema } from './relay.ts'

const progress = [
    ...COMMISSIONING_STEPS.map((step) => ({ status: 'active', step })),
    { status: 'completed' },
    {
        status: 'failed',
        step: 'configuring_network',
        reason: 'network_rejected',
    },
] as const

describe('Commissioning progress', () => {
    it('lists the steps in the order a commissioning reaches them', () => {
        assert.deepEqual(COMMISSIONING_STEPS, [
            'discovering',
            'connecting',
            'verifying',
            'configuring_network',
            'joining_network',
            'setting_up',
        ])
    })

    for (const payload of progress) {
        it(`reads ${JSON.stringify(payload)} from the adapter and over LAN only`, () => {
            assert.deepEqual(bridgeCommissioningSchema.parse(payload), payload)
            const event = { type: 'commissioningStep', ...payload }
            assert.deepEqual(deviceEventSchema.parse(event), event)
            // Progress stays off Relay until NEM-123 pushes it sealed on
            // the capability watch.
            assert.equal(
                relayReplyMessageSchema.safeParse(event).success,
                false
            )
        })
    }

    it('names the step that failed and why', () => {
        for (const payload of [
            { status: 'failed', reason: 'unreachable' },
            { status: 'failed', step: 'verifying' },
            { status: 'active' },
            { status: 'active', step: 'commissioning_pase' },
            { status: 'failed', step: 'verifying', reason: 'PaaNotTrusted' },
        ]) {
            assert.equal(
                commissioningProgressSchema.safeParse(payload).success,
                false,
                JSON.stringify(payload)
            )
        }
    })
})

/**
 * Progress reaches Access Clients, over Relay too once NEM-123 pushes it, so
 * it must never carry a secret. The schemas are
 * strict and every field is an enum: a pairing code, passcode or Wi-Fi
 * credential has nowhere to go, under any name or as any value.
 */
describe('Commissioning progress carries no secrets', () => {
    const secrets: Record<string, string> = {
        code: '34970112332',
        pairingCode: 'MT:Y.K9042C00KA0648G00',
        passcode: '20202021',
        wifiSsid: 'home',
        wifiPassword: 'hunter2',
        ssid: 'home',
        password: 'hunter2',
        message: 'pairing code 34970112332 was refused',
        error: 'wifi password hunter2 rejected',
        externalId: '1',
    }

    for (const payload of progress) {
        for (const [key, value] of Object.entries(secrets)) {
            it(`refuses ${payload.status} progress with ${key}`, () => {
                const withSecret = { ...payload, [key]: value }
                assert.equal(
                    bridgeCommissioningSchema.safeParse(withSecret).success,
                    false
                )
                const event = { type: 'commissioningStep', ...withSecret }
                assert.equal(
                    commissioningStepEventSchema.safeParse(event).success,
                    false
                )
                assert.equal(deviceEventSchema.safeParse(event).success, false)
                assert.equal(
                    relayReplyMessageSchema.safeParse(event).success,
                    false
                )
            })
        }
    }

    it('refuses a secret in place of a step or reason', () => {
        for (const payload of [
            { status: 'active', step: '34970112332' },
            { status: 'failed', step: 'connecting', reason: 'hunter2' },
        ]) {
            assert.equal(
                bridgeCommissioningSchema.safeParse(payload).success,
                false
            )
        }
    })
})
