import type { Device, DeviceState } from '@nemu/protocol'
import { describe, expect, it } from 'vitest'
import { reportsRequested } from './command-confirmation'

function light(state: DeviceState): Device {
    return { id: 'l', name: 'Lamp', type: 'light', online: true, state }
}
const before = light({
    state: 'ON',
    brightness: 20,
    color_temp: 200,
    color: { hex: '#FF0000' },
})

describe('A report that confirms a Command', () => {
    it.each([
        ['power', { state: 'OFF' }, { state: 'OFF' }, true],
        ['other power', { state: 'OFF' }, { state: 'ON' }, false],
        ['brightness', { brightness: 127 }, { brightness: 128 }, true],
        ['other brightness', { brightness: 127 }, { brightness: 90 }, false],
        [
            'off at minimum',
            { brightness: 0 },
            { state: 'OFF', brightness: 20 },
            true,
        ],
        ['color temperature', { color_temp: 300 }, { color_temp: 301 }, true],
        [
            'other color temperature',
            { color_temp: 300 },
            { color_temp: 250 },
            false,
        ],
        [
            'a new color',
            { color: { hex: '#00FF00' } },
            { color: { x: 0.3, y: 0.6 } },
            true,
        ],
        [
            'the same color',
            { color: { hex: '#00FF00' } },
            { color: { hex: '#FF0000' }, battery: 4 },
            false,
        ],
    ] as const)('%s', (_name, payload, reported, confirms) => {
        expect(
            reportsRequested({ ...payload }, light({ ...reported }), before)
        ).toBe(confirms)
    })

    it('is for the outlet that was asked', () => {
        const strip = (one: string, two: string) =>
            light({
                outlets: [
                    { id: '1', state: one },
                    { id: '2', state: two },
                ],
            })
        const payload = { outlet: '1', state: 'ON' }
        const off = strip('OFF', 'OFF')
        expect(reportsRequested(payload, strip('OFF', 'ON'), off)).toBe(false)
        expect(reportsRequested(payload, strip('ON', 'OFF'), off)).toBe(true)
    })
})
