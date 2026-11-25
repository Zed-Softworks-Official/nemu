import type { Device } from '@nemu/protocol'
import { brightnessRange, colorTempRange } from '@nemu/protocol'
import { describe, expect, it } from 'vitest'

import { brightnessPercentToPayload, colorTempPayload } from './device-commands'
import { presentDevice } from './device-presentation'

const LAMP: Device = {
    id: 'lamp',
    name: 'Lamp',
    type: 'light',
    online: true,
    state: { state: 'ON', brightness: 101, color_temp: 300 },
}
const LIMITED: Device = {
    ...LAMP,
    limits: {
        brightness: { min: 1, max: 201 },
        colorTemp: { min: 200, max: 400 },
    },
}

describe('level Commands', () => {
    it('stay inside the Device’s own limits', () => {
        const brightness = brightnessRange(LIMITED)
        const colorTemp = colorTempRange(LIMITED)
        expect(presentDevice(LIMITED).level).toBe(50)
        expect(brightnessPercentToPayload(100, brightness)).toEqual({
            brightness: 201,
        })
        expect(colorTempPayload(500, colorTemp)).toEqual({ color_temp: 400 })
        expect(colorTempPayload(153, colorTemp)).toEqual({ color_temp: 200 })
    })

    it('use the common ranges when the Device reports no limits', () => {
        expect(presentDevice(LAMP).level).toBe(40)
        expect(brightnessPercentToPayload(100, brightnessRange(LAMP))).toEqual({
            brightness: 254,
        })
        expect(colorTempPayload(900, colorTempRange(LAMP))).toEqual({
            color_temp: 500,
        })
    })
})
