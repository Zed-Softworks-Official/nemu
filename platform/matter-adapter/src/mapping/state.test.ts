import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
    HARNESS_PLUG,
    PLUG_WITH_AGGREGATOR_METER,
} from './fixtures.test-support.ts'
import { mapNode } from './node.ts'
import { stateForDevice } from './state.ts'

const plug = (snapshot = HARNESS_PLUG) => {
    const [device] = mapNode('2', snapshot)
    assert.ok(device)
    return device
}

describe('Device state', () => {
    it('reports OnOff as state, and nothing for meter readings', () => {
        assert.deepEqual(stateForDevice(plug(), HARNESS_PLUG), {
            state: 'OFF',
        })
        const on = { ...HARNESS_PLUG, '1/6/0': true }
        assert.deepEqual(stateForDevice(plug(on), on), { state: 'ON' })
    })

    it('folds the meter endpoint in, as the Rust adapter does', () => {
        assert.deepEqual(
            stateForDevice(
                plug(PLUG_WITH_AGGREGATOR_METER),
                PLUG_WITH_AGGREGATOR_METER
            ),
            { state: 'ON' }
        )
    })

    it('reports nothing the Device has not reported', () => {
        const { '1/6/0': _, ...unreported } = HARNESS_PLUG
        assert.deepEqual(stateForDevice(plug(), unreported), {})
    })
})
