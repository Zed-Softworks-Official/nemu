import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { deviceSchema } from './device.ts'
import {
    brightnessRange,
    brightnessToPercent,
    colorTempRange,
    DEFAULT_BRIGHTNESS_RANGE,
    DEFAULT_COLOR_TEMP_RANGE,
    kelvinRange,
    kelvinToMireds,
    miredsToKelvin,
    percentToBrightness,
} from './device-limits.ts'

const lamp = { id: 'lamp', name: 'Lamp', type: 'light', online: true }

describe('Device limits', () => {
    it('are carried on the Device', () => {
        const limits = {
            brightness: { min: 1, max: 200 },
            colorTemp: { min: 200, max: 400 },
        }
        const device = deviceSchema.parse({ ...lamp, limits })
        assert.deepEqual(device.limits, limits)
        assert.deepEqual(brightnessRange(device), limits.brightness)
        assert.deepEqual(colorTempRange(device), limits.colorTemp)
    })

    it('fall back when the Device reports none', () => {
        const device = deviceSchema.parse(lamp)
        assert.deepEqual(brightnessRange(device), DEFAULT_BRIGHTNESS_RANGE)
        assert.deepEqual(colorTempRange(device), DEFAULT_COLOR_TEMP_RANGE)
    })

    it('that make no sense fall back without losing the Device', () => {
        for (const limits of [
            'none',
            { brightness: { min: 254, max: 0 }, colorTemp: { min: 0, max: 9 } },
            { brightness: { min: 0 }, colorTemp: null },
        ]) {
            const device = deviceSchema.parse({ ...lamp, limits })
            assert.deepEqual(brightnessRange(device), DEFAULT_BRIGHTNESS_RANGE)
            assert.deepEqual(colorTempRange(device), DEFAULT_COLOR_TEMP_RANGE)
        }
    })
})

describe('Kelvin and mireds', () => {
    const range = { min: 200, max: 400 }

    it('convert to whole numbers', () => {
        assert.equal(miredsToKelvin(153), 6536)
        assert.equal(miredsToKelvin(370), 2703)
        assert.equal(kelvinToMireds(2703, range), 370)
        // 1e6 / 3000 = 333.33
        assert.equal(kelvinToMireds(3000, range), 333)
        // 1e6 / 2990 = 334.45, 1e6 / 2985 = 335.008
        assert.equal(kelvinToMireds(2985, range), 335)
    })

    it('keep a Command inside the Device limits', () => {
        assert.equal(kelvinToMireds(1000, range), 400)
        assert.equal(kelvinToMireds(9000, range), 200)
    })

    it('reverse the limits', () => {
        assert.deepEqual(kelvinRange(range), { min: 2500, max: 5000 })
    })

    it('return every reachable mired unchanged', () => {
        const full = { min: 100, max: 600 }
        for (let mireds = full.min; mireds <= full.max; mireds += 1) {
            assert.equal(kelvinToMireds(miredsToKelvin(mireds), full), mireds)
        }
    })
})

describe('brightness', () => {
    it('is a percentage of the Device range', () => {
        const range = { min: 1, max: 201 }
        assert.equal(brightnessToPercent(101, range), 50)
        assert.equal(percentToBrightness(50, range), 101)
        assert.equal(percentToBrightness(0, range), 1)
        assert.equal(percentToBrightness(100, range), 201)
        assert.equal(brightnessToPercent(0, range), 0)
        assert.equal(brightnessToPercent(254, range), 100)
    })

    it('rounds to whole steps', () => {
        assert.equal(percentToBrightness(60, DEFAULT_BRIGHTNESS_RANGE), 152)
        assert.equal(brightnessToPercent(152, DEFAULT_BRIGHTNESS_RANGE), 60)
    })
})
