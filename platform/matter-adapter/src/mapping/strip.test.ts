/**
 * Multi-outlet strips, ported from the Rust adapter's `mapping.rs` strip,
 * Component and legacy-ID tests with the same fixtures and expected outputs.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { AttributeSnapshot } from '../attributes.ts'
import { DEVICE_TYPE_AGGREGATOR, DEVICE_TYPE_ROOT_NODE } from './clusters.ts'
import { commandsForSet, outletFromSet, targetEndpoints } from './commands.ts'
import { deviceDescriptor } from './descriptor.ts'
import {
    BULB,
    deviceTypes,
    HARNESS_STRIP,
    STRIP,
} from './fixtures.test-support.ts'
import {
    collapsedLegacyIds,
    deviceCoversEndpoint,
    mapNode,
    mapNodeWithFallback,
} from './node.ts'
import { listEndpoints } from './snapshot.ts'
import { stateForDevice } from './state.ts'

const strip = (snapshot: AttributeSnapshot = STRIP, nodeId = '17') => {
    const devices = mapNode(nodeId, snapshot)
    assert.equal(devices.length, 1)
    const [device] = devices
    assert.ok(device)
    return device
}

describe('strips', () => {
    it('lists the non-root endpoints', () => {
        assert.deepEqual(listEndpoints(STRIP), [1, 2, 3, 4])
    })

    it('collapses a power strip into one Device', () => {
        const device = strip()
        assert.equal(device.id, '17')
        assert.equal(device.kind, 'strip')
        assert.equal(device.defaultName, 'Kitchen strip')
        assert.equal(device.model, 'Power Strip S3')
        assert.equal(device.description, 'Matter smart strip (Acme)')
        assert.deepEqual(device.outlets, [
            { endpoint: 2, name: 'Outlet 1' },
            { endpoint: 3, name: 'Outlet 2' },
            { endpoint: 4, name: 'Outlet 3' },
        ])
        assert.equal(device.endpoint, 2)
        assert.equal(device.energyEndpoint, 1)
    })

    it('collapses an energy-only multi-outlet node', () => {
        const device = strip(
            {
                '0/29/0': deviceTypes(DEVICE_TYPE_ROOT_NODE),
                '0/40/3': 'P316M',
                '1/144/8': 1_000,
                '2/144/8': 2_000,
                '3/145/1': { '0': 3_000 },
                '4/144/8': 4_000,
                '5/144/8': 5_000,
                '6/145/1': { '0': 6_000 },
            },
            '52'
        )
        assert.equal(device.kind, 'strip')
        assert.equal(device.outlets?.length, 6)
        assert.equal(device.energyEndpoint, undefined)
    })

    it('collapses voltage-only outlets', () => {
        const snapshot: AttributeSnapshot = {
            '0/29/0': deviceTypes(DEVICE_TYPE_ROOT_NODE),
            '0/40/3': 'P316M',
            ...Object.fromEntries(
                [1, 2, 3, 4, 5, 6].map((endpoint) => [
                    `${endpoint}/144/11`,
                    120_000,
                ])
            ),
        }
        const device = strip(snapshot, '56')
        assert.equal(device.kind, 'strip')
        assert.equal(device.outlets?.length, 6)
    })

    it('maps unclassified endpoints as a strip in the fallback', () => {
        const devices = mapNodeWithFallback('56', {
            '0/29/0': deviceTypes(DEVICE_TYPE_ROOT_NODE),
            '1/29/0': deviceTypes(DEVICE_TYPE_AGGREGATOR),
            '2/29/0': deviceTypes(DEVICE_TYPE_AGGREGATOR),
        })
        assert.equal(devices[0]?.kind, 'strip')
        assert.equal(devices[0]?.outlets?.length, 2)
        assert.equal(devices[0]?.id, '56')
    })

    it('maps a lone unclassified endpoint as a switch in the fallback', () => {
        const [device] = mapNodeWithFallback('7', {
            '1/29/0': deviceTypes(DEVICE_TYPE_AGGREGATOR),
        })
        assert.equal(device?.kind, 'switch')
        assert.equal(device?.outlets, undefined)
        assert.deepEqual(mapNodeWithFallback('7', {}), [])
    })

    it('lists the legacy per-endpoint IDs a strip folded in', () => {
        assert.deepEqual(collapsedLegacyIds('17', STRIP).sort(), [
            '17:1',
            '17:2',
            '17:3',
            '17:4',
        ])
        assert.deepEqual(collapsedLegacyIds('9', BULB), [])
    })

    it('nests each outlet state with its Component ID', () => {
        assert.deepEqual(stateForDevice(strip(), STRIP), {
            outlets: [
                { id: '2', name: 'Outlet 1', state: 'ON' },
                { id: '3', name: 'Outlet 2', state: 'OFF' },
                { id: '4', name: 'Outlet 3', state: 'OFF' },
            ],
        })
    })

    it('describes a strip as a strip', () => {
        const descriptor = deviceDescriptor(strip(), 'Kitchen strip', STRIP)
        assert.equal(descriptor.type, 'strip')
        assert.equal(descriptor.external_id, '17')
        assert.equal(descriptor.definition.exposes[0]?.type, 'strip')
    })

    it('reads outlet as a number or a decimal string, not as a setting', () => {
        const payload = { outlet: '2', state: 'OFF' }
        assert.deepEqual(commandsForSet(payload).ignored, [])
        assert.equal(outletFromSet(payload), 2)
        assert.equal(outletFromSet({ outlet: 3 }), 3)
        assert.equal(outletFromSet({ outlet: 'two' }), undefined)
        assert.equal(outletFromSet({}), undefined)
    })

    it('targets the named outlet, else every outlet', () => {
        const device = strip()
        assert.deepEqual(
            targetEndpoints(device, { state: 'ON', outlet: '3' }),
            [3]
        )
        assert.deepEqual(targetEndpoints(device, { state: 'ON' }), [2, 3, 4])
        // An endpoint the strip does not have falls back to every outlet.
        assert.deepEqual(
            targetEndpoints(device, { state: 'ON', outlet: 9 }),
            [2, 3, 4]
        )
        assert.ok(deviceCoversEndpoint(device, 1))
        assert.ok(!deviceCoversEndpoint(device, 9))
    })
})

describe('the harness strip', () => {
    const device = strip(HARNESS_STRIP, '4')

    it('is one Device with one Component per outlet', () => {
        assert.deepEqual(device, {
            id: '4',
            nodeId: '4',
            endpoint: 1,
            outlets: [
                { endpoint: 1, name: 'Outlet 1' },
                { endpoint: 2, name: 'Outlet 2' },
            ],
            kind: 'strip',
            defaultName: 'Harness Strip',
            model: 'Harness Strip',
            description: 'Matter smart strip (Nemu Harness)',
        })
    })

    it('describes it exactly as the golden records it', () => {
        assert.deepEqual(
            deviceDescriptor(device, 'Harness Strip', HARNESS_STRIP),
            {
                external_id: '4',
                ieee_address: '4',
                friendly_name: 'Harness Strip',
                type: 'strip',
                supported: true,
                definition: {
                    model: 'Harness Strip',
                    description: 'Matter smart strip (Nemu Harness)',
                    exposes: [
                        {
                            type: 'strip',
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
            }
        )
    })

    it('publishes each outlet state as the golden records it', () => {
        assert.deepEqual(stateForDevice(device, HARNESS_STRIP), {
            outlets: [
                { id: '1', name: 'Outlet 1', state: 'OFF' },
                { id: '2', name: 'Outlet 2', state: 'ON' },
            ],
        })
    })

    it('announces its two per-endpoint IDs as legacy', () => {
        assert.deepEqual(collapsedLegacyIds('4', HARNESS_STRIP), ['4:1', '4:2'])
    })
})
