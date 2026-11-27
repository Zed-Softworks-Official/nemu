import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
    BULB,
    HARNESS_LIGHT,
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

    it('reports the harness light as the golden records it', () => {
        const [light] = mapNode('3', HARNESS_LIGHT)
        assert.ok(light)
        assert.deepEqual(stateForDevice(light, HARNESS_LIGHT), {
            state: 'OFF',
            brightness: 100,
            color_temp: 250,
        })
    })

    it('rounds and clamps the level into 0-254', () => {
        const [bulb] = mapNode('9', BULB)
        assert.ok(bulb)
        assert.equal(
            stateForDevice(bulb, { ...BULB, '1/8/0': 99.6 }).brightness,
            100
        )
        assert.equal(
            stateForDevice(bulb, { ...BULB, '1/8/0': 255 }).brightness,
            254
        )
        assert.equal(
            'brightness' in stateForDevice(bulb, { ...BULB, '1/8/0': null }),
            false
        )
    })

    it('reports color_temp only when it is above zero', () => {
        const [bulb] = mapNode('9', BULB)
        assert.ok(bulb)
        assert.equal(
            'color_temp' in stateForDevice(bulb, { ...BULB, '1/768/7': 0 }),
            false
        )
        assert.equal(
            stateForDevice(bulb, { ...BULB, '1/768/7': 300 }).color_temp,
            300
        )
    })

    it('reports color from CurrentX and CurrentY', () => {
        const [bulb] = mapNode('9', BULB)
        assert.ok(bulb)
        const snapshot = { ...BULB, '1/768/3': 32768, '1/768/4': 21561 }
        assert.deepEqual(stateForDevice(bulb, snapshot).color, {
            x: 0.5,
            y: 0.329,
        })
        const half = { ...BULB, '1/768/3': 32768 }
        assert.equal('color' in stateForDevice(bulb, half), false)
    })
})
