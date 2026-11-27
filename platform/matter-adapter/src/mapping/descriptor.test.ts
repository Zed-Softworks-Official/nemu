import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { bridgeDeviceSchema } from '@nemu/protocol'
import type { AttributeSnapshot } from '../attributes.ts'
import { DEVICE_TYPE_DIMMABLE_PLUG } from './clusters.ts'
import { deviceDescriptor, isLimitAttribute } from './descriptor.ts'
import {
    BULB,
    deviceTypes,
    HARNESS_LIGHT,
    HARNESS_PLUG,
} from './fixtures.test-support.ts'
import { mapNode } from './node.ts'

describe('device descriptor', () => {
    it('describes the harness plug exactly as the golden records it', () => {
        const [device] = mapNode('2', HARNESS_PLUG)
        assert.ok(device)
        const descriptor = deviceDescriptor(
            device,
            'Harness Plug',
            HARNESS_PLUG
        )
        assert.deepEqual(descriptor, {
            external_id: '2',
            ieee_address: '2',
            friendly_name: 'Harness Plug',
            type: 'switch',
            supported: true,
            definition: {
                model: 'Harness Plug',
                description: 'Matter on/off plug-in unit (Nemu Harness)',
                exposes: [
                    {
                        type: 'switch',
                        features: [
                            {
                                type: 'binary',
                                name: 'state',
                                property: 'state',
                                access: 7,
                                value_on: 'ON',
                                value_off: 'OFF',
                            },
                        ],
                    },
                ],
            },
        })
        assert.deepEqual(bridgeDeviceSchema.parse(descriptor), descriptor)
    })

    it('uses the name it is given', () => {
        const [device] = mapNode('2', HARNESS_PLUG)
        assert.ok(device)
        assert.equal(
            deviceDescriptor(device, 'Kettle', HARNESS_PLUG).friendly_name,
            'Kettle'
        )
    })

    it('describes the harness light exactly as the golden records it', () => {
        const [device] = mapNode('3', HARNESS_LIGHT)
        assert.ok(device)
        const descriptor = deviceDescriptor(
            device,
            'Harness Light',
            HARNESS_LIGHT
        )
        assert.deepEqual(descriptor, {
            external_id: '3',
            ieee_address: '3',
            friendly_name: 'Harness Light',
            type: 'light',
            supported: true,
            definition: {
                model: 'Harness Light',
                description: 'Matter light (Nemu Harness)',
                exposes: [
                    {
                        type: 'light',
                        features: [
                            {
                                type: 'binary',
                                name: 'state',
                                property: 'state',
                                access: 7,
                                value_on: 'ON',
                                value_off: 'OFF',
                            },
                            numeric('brightness', 1, 254),
                            numeric('color_temp', 200, 400),
                        ],
                    },
                ],
            },
        })
        assert.deepEqual(bridgeDeviceSchema.parse(descriptor), descriptor)
    })
})

const numeric = (property: string, min: number, max: number) => ({
    type: 'numeric',
    name: property,
    property,
    access: 7,
    value_min: min,
    value_max: max,
})

/** The Rust adapter's `features` helper: the first Device's features. */
const features = (snapshot: AttributeSnapshot) => {
    const [device] = mapNode('9', snapshot)
    assert.ok(device)
    return deviceDescriptor(device, 'Bulb', snapshot).definition.exposes[0]
        ?.features
}

describe('descriptor limits', () => {
    it("carries the bulb's own limits", () => {
        const snapshot = {
            ...BULB,
            '1/8/2': 1,
            '1/8/3': 200,
            '1/768/16395': 200,
            '1/768/16396': 400,
        }
        const [, brightness, colorTemp] = features(snapshot) ?? []
        assert.deepEqual(brightness, numeric('brightness', 1, 200))
        assert.deepEqual(colorTemp, numeric('color_temp', 200, 400))
    })

    it('uses the full level range and no color range when limits are unreported', () => {
        const all = features(BULB) ?? []
        assert.deepEqual(all[1], numeric('brightness', 0, 254))
        assert.equal(all.length, 2)
    })

    it('caps a reported MaxLevel at 254', () => {
        const all = features({ ...BULB, '1/8/3': 255 }) ?? []
        assert.deepEqual(all[1], numeric('brightness', 0, 254))
    })

    it('needs both color temperature limits for a color range', () => {
        const all = features({ ...BULB, '1/768/16395': 200 }) ?? []
        assert.equal(all.length, 2)
    })

    it('exposes a dimmable plug level range', () => {
        const snapshot = {
            '1/29/0': deviceTypes(DEVICE_TYPE_DIMMABLE_PLUG),
            '1/6/0': true,
            '1/8/0': 180,
            '1/8/3': 250,
        }
        assert.deepEqual(
            (features(snapshot) ?? [])[1],
            numeric('brightness', 0, 250)
        )
    })

    it('gives an on/off plug no brightness', () => {
        assert.equal((features(HARNESS_PLUG) ?? []).length, 1)
    })

    it('knows which attributes are limits', () => {
        assert.ok(isLimitAttribute(8, 2))
        assert.ok(isLimitAttribute(768, 0x400c))
        assert.ok(!isLimitAttribute(8, 0))
        assert.ok(!isLimitAttribute(6, 2))
    })
})
