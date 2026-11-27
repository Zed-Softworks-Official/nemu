import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { bridgeDeviceSchema } from '@nemu/protocol'
import { deviceDescriptor } from './descriptor.ts'
import { HARNESS_PLUG } from './fixtures.test-support.ts'
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
})
