import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
    CLUSTER_COLOR_CONTROL,
    CLUSTER_LEVEL_CONTROL,
    CLUSTER_ON_OFF,
} from './clusters.ts'
import { commandsForSet, hexToXy, targetEndpoints } from './commands.ts'
import { HARNESS_PLUG } from './fixtures.test-support.ts'
import { mapNode } from './node.ts'

describe('Commands for a set', () => {
    it('turns state into OnOff On, Off and Toggle', () => {
        assert.deepEqual(commandsForSet({ state: 'ON' }).actions, [
            { cluster: CLUSTER_ON_OFF, command: 0x01 },
        ])
        assert.deepEqual(commandsForSet({ state: ' off ' }).actions, [
            { cluster: CLUSTER_ON_OFF, command: 0x00 },
        ])
        assert.deepEqual(commandsForSet({ state: false }).actions, [
            { cluster: CLUSTER_ON_OFF, command: 0x00 },
        ])
        assert.deepEqual(commandsForSet({ state: 'toggle' }).actions, [
            { cluster: CLUSTER_ON_OFF, command: 0x02 },
        ])
    })

    it('does not treat transaction or outlet as a setting', () => {
        assert.deepEqual(
            commandsForSet({ state: 'OFF', transaction: 'cmd-1', outlet: '2' }),
            {
                actions: [{ cluster: CLUSTER_ON_OFF, command: 0x00 }],
                ignored: [],
            }
        )
    })

    it('ignores read-only and unknown keys', () => {
        const { actions, ignored } = commandsForSet({
            power: 12,
            energy: 1,
            frobnicate: true,
            state: 'sideways',
        })
        assert.deepEqual(actions, [])
        assert.deepEqual([...ignored].sort(), [
            'energy',
            'frobnicate',
            'power',
            'state',
        ])
    })

    it('targets the Device endpoint', () => {
        const [device] = mapNode('2', HARNESS_PLUG)
        assert.ok(device)
        assert.deepEqual(targetEndpoints(device, { state: 'ON' }), [1])
    })

    it('moves to a level with on/off, clamped to 254', () => {
        assert.deepEqual(commandsForSet({ state: 'ON' }).actions, [
            { cluster: CLUSTER_ON_OFF, command: 0x01 },
        ])
        assert.deepEqual(commandsForSet({ state: 'ON', brightness: 300 }), {
            actions: [level(254)],
            ignored: [],
        })
        assert.deepEqual(commandsForSet({ brightness: 150 }).actions, [
            level(150),
        ])
        assert.deepEqual(commandsForSet({ brightness: 0 }).actions, [level(0)])
        assert.deepEqual(commandsForSet({ brightness: -5 }).actions, [level(0)])
        assert.deepEqual(commandsForSet({ brightness: 99.6 }).actions, [
            level(100),
        ])
    })

    it('still turns off when off comes with a brightness', () => {
        assert.deepEqual(commandsForSet({ state: 'OFF', brightness: 128 }), {
            actions: [{ cluster: CLUSTER_ON_OFF, command: 0x00 }],
            ignored: [],
        })
    })

    it('ignores a brightness that is not a number', () => {
        assert.deepEqual(commandsForSet({ brightness: 'bright' }), {
            actions: [],
            ignored: ['brightness'],
        })
    })

    it('moves to a color temperature as requested, within 16 bits', () => {
        assert.deepEqual(commandsForSet({ color_temp: 300 }).actions, [
            colorTemp(300),
        ])
        // The Device clamps to its own physical range (the golden's 500 -> 400).
        assert.deepEqual(commandsForSet({ color_temp: 500 }).actions, [
            colorTemp(500),
        ])
        assert.deepEqual(commandsForSet({ color_temp: 70_000 }).actions, [
            colorTemp(65_535),
        ])
        assert.deepEqual(commandsForSet({ color_temp: 'warm' }).ignored, [
            'color_temp',
        ])
    })

    it('moves to a color from x/y or hex', () => {
        assert.deepEqual(commandsForSet({ color: { x: 0.5, y: 2 } }).actions, [
            {
                cluster: CLUSTER_COLOR_CONTROL,
                command: 0x07,
                fields: { ...OPTIONS, colorX: 32768, colorY: 65535 },
            },
        ])
        const [hex] = commandsForSet({ color: { hex: '#ffffff' } }).actions
        assert.equal(hex?.command, 0x07)
        assert.deepEqual(commandsForSet({ color: 'red' }).ignored, ['color'])
    })

    it('turns hex primaries into xy', () => {
        const red = hexToXy('#ff0000')
        assert.ok(red && red[0] > 0.6 && red[1] < 0.36)
        const white = hexToXy('#ffffff')
        assert.ok(white && Math.abs(white[0] - 0.3127) < 0.01)
        assert.equal(hexToXy('nope'), undefined)
    })
})

const OPTIONS = { transitionTime: 0, optionsMask: {}, optionsOverride: {} }

const level = (value: number) => ({
    cluster: CLUSTER_LEVEL_CONTROL,
    command: 0x04,
    fields: { ...OPTIONS, level: value },
})

const colorTemp = (mireds: number) => ({
    cluster: CLUSTER_COLOR_CONTROL,
    command: 0x0a,
    fields: { ...OPTIONS, colorTemperatureMireds: mireds },
})
