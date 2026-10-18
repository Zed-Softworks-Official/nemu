import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { deviceEventSchema } from './events.ts'
import { relayToClientEnvelopeSchema } from './relay.ts'

const capabilityId = '6f1d7c6a-6a2e-4d0a-9c3e-3d6c1b9a4e21'
const epoch = '2b7e1c4a-8f3d-4a6b-9c1e-5d8a7b6c4e32'

const reading = {
    capabilityId,
    device: { protocol: 'matter', externalId: 'plug-1' },
    physicalScope: { kind: 'device' },
    kind: 'power',
    value: {
        value: 1500,
        scale: 3,
        constraintRevisionId: 'limits-2026-09-11',
    },
    availability: { status: 'available' },
    observedAt: '2026-10-09T18:00:00.000Z',
    receivedAt: '2026-10-09T18:00:01.000Z',
    revision: 4,
}

const snapshot = {
    type: 'capabilitySnapshot',
    epoch,
    revision: 4,
    capabilities: [reading],
}

const change = {
    type: 'capabilityChange',
    epoch,
    revision: 5,
    state: {
        ...reading,
        revision: 5,
        value: { ...reading.value, value: 1600 },
    },
}

describe('typed current-state transport messages', () => {
    it('uses the same snapshot and live-change messages on LAN and Relay', () => {
        const lanSnapshot = deviceEventSchema.parse(snapshot)
        const relaySnapshot = relayToClientEnvelopeSchema.parse({
            requestId: 'snapshot-request',
            signature: 'signed',
            message: snapshot,
        })
        assert.deepEqual(lanSnapshot, relaySnapshot.message)

        const lanChange = deviceEventSchema.parse(change)
        const relayChange = relayToClientEnvelopeSchema.parse({
            requestId: 'watch-request',
            signature: 'signed',
            message: change,
        })
        assert.deepEqual(lanChange, relayChange.message)
    })
})
