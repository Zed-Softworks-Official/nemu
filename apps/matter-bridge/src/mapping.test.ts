import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
    CLUSTER,
    collapsedLegacyIds,
    commandsForSet,
    DEVICE_TYPE,
    deviceDescriptor,
    hexToXy,
    isStateAttributePath,
    listEndpoints,
    mapNode,
    mapNodeWithFallback,
    outletIdFromSet,
    stateForDevice,
    stateForEndpoint,
} from './mapping'

/** Build the descriptor DeviceTypeList entry the server publishes (field id 0). */
function deviceTypes(...types: number[]): unknown {
    return types.map((type) => ({ '0': type, '1': 1 }))
}

/** Three-outlet power strip: root node 0, aggregator 1, outlets 2–4, energy on 1. */
const strip = {
    nodeId: '17',
    available: true,
    attributes: {
        [`0/${CLUSTER.descriptor}/0`]: deviceTypes(DEVICE_TYPE.rootNode),
        [`0/${CLUSTER.basicInformation}/1`]: 'Acme',
        [`0/${CLUSTER.basicInformation}/3`]: 'Power Strip S3',
        [`0/${CLUSTER.basicInformation}/5`]: 'Kitchen strip',
        [`1/${CLUSTER.descriptor}/0`]: deviceTypes(DEVICE_TYPE.aggregator),
        [`1/${CLUSTER.electricalPower}/8`]: 12_500, // mW
        [`1/${CLUSTER.electricalPower}/4`]: 230_100, // mV
        [`1/${CLUSTER.electricalPower}/5`]: 54, // mA
        [`1/${CLUSTER.electricalEnergy}/1`]: { '0': 1_234_000 }, // mWh
        [`2/${CLUSTER.descriptor}/0`]: deviceTypes(DEVICE_TYPE.onOffPlugInUnit),
        [`2/${CLUSTER.onOff}/0`]: true,
        [`3/${CLUSTER.descriptor}/0`]: deviceTypes(DEVICE_TYPE.onOffPlugInUnit),
        [`3/${CLUSTER.onOff}/0`]: false,
        [`4/${CLUSTER.descriptor}/0`]: deviceTypes(DEVICE_TYPE.onOffPlugInUnit),
        [`4/${CLUSTER.onOff}/0`]: false,
    },
}

/** Single dimmable bulb on endpoint 1. */
const bulb = {
    nodeId: '9',
    available: true,
    attributes: {
        [`0/${CLUSTER.descriptor}/0`]: deviceTypes(DEVICE_TYPE.rootNode),
        [`0/${CLUSTER.basicInformation}/3`]: 'Bulb A19',
        [`1/${CLUSTER.descriptor}/0`]: deviceTypes(DEVICE_TYPE.dimmableLight),
        [`1/${CLUSTER.onOff}/0`]: true,
        [`1/${CLUSTER.levelControl}/0`]: 180,
    },
}

describe('listEndpoints', () => {
    it('lists non-root endpoints ascending', () => {
        assert.deepEqual(listEndpoints(strip.attributes), [1, 2, 3, 4])
    })
})

describe('mapNode', () => {
    it('collapses a power strip into one smart-strip device', () => {
        const devices = mapNode(strip)
        assert.equal(devices.length, 1)
        const [device] = devices
        assert.ok(device)
        assert.equal(device.id, '17')
        assert.equal(device.kind, 'strip')
        assert.equal(device.defaultName, 'Kitchen strip')
        assert.equal(device.model, 'Power Strip S3')
        assert.deepEqual(
            device.outlets?.map((outlet) => [outlet.endpointId, outlet.name]),
            [
                [2, 'Outlet 1'],
                [3, 'Outlet 2'],
                [4, 'Outlet 3'],
            ]
        )
        assert.equal(device.energyEndpointId, 1)
    })

    it('keeps a bare nodeId for single-endpoint nodes', () => {
        const devices = mapNode(bulb)
        assert.equal(devices.length, 1)
        assert.equal(devices[0]?.id, '9')
        assert.equal(devices[0]?.kind, 'light')
        assert.equal(devices[0]?.defaultName, 'Bulb A19')
    })

    it('still collapses when an outlet carries the measurement clusters', () => {
        const attributes = {
            ...strip.attributes,
            [`2/${CLUSTER.electricalPower}/8`]: 5_000,
        }
        delete (attributes as Record<string, unknown>)[
            `1/${CLUSTER.electricalPower}/8`
        ]
        delete (attributes as Record<string, unknown>)[
            `1/${CLUSTER.electricalPower}/4`
        ]
        delete (attributes as Record<string, unknown>)[
            `1/${CLUSTER.electricalPower}/5`
        ]
        delete (attributes as Record<string, unknown>)[
            `1/${CLUSTER.electricalEnergy}/1`
        ]
        const devices = mapNode({ ...strip, attributes })
        assert.equal(devices.length, 1)
        assert.equal(devices[0]?.id, '17')
        assert.equal(devices[0]?.kind, 'strip')
        assert.equal(devices[0]?.energyEndpointId, undefined)
    })

    it('collapses energy-only multi-outlet nodes into a strip', () => {
        const attributes = {
            [`0/${CLUSTER.descriptor}/0`]: deviceTypes(DEVICE_TYPE.rootNode),
            [`0/${CLUSTER.basicInformation}/3`]: 'P316M',
            [`1/${CLUSTER.electricalPower}/8`]: 1_000,
            [`2/${CLUSTER.electricalPower}/8`]: 2_000,
            [`3/${CLUSTER.electricalEnergy}/1`]: { '0': 3_000 },
            [`4/${CLUSTER.electricalPower}/8`]: 4_000,
            [`5/${CLUSTER.electricalPower}/8`]: 5_000,
            [`6/${CLUSTER.electricalEnergy}/1`]: { '0': 6_000 },
        }
        const devices = mapNode({
            nodeId: '52',
            available: false,
            attributes,
        })
        assert.equal(devices.length, 1)
        assert.equal(devices[0]?.id, '52')
        assert.equal(devices[0]?.kind, 'strip')
        assert.equal(devices[0]?.outlets?.length, 6)
    })

    it('collapses Tapo-style RMSVoltage-only outlets into a strip', () => {
        const attributes: Record<string, unknown> = {
            [`0/${CLUSTER.descriptor}/0`]: deviceTypes(DEVICE_TYPE.rootNode),
            [`0/${CLUSTER.basicInformation}/3`]: 'P316M',
        }
        for (const endpoint of [1, 2, 3, 4, 5, 6]) {
            attributes[`${endpoint}/${CLUSTER.electricalPower}/11`] = 120_000
        }
        const devices = mapNode({
            nodeId: '56',
            available: true,
            attributes,
        })
        assert.equal(devices.length, 1)
        assert.equal(devices[0]?.id, '56')
        assert.equal(devices[0]?.kind, 'strip')
        assert.equal(devices[0]?.outlets?.length, 6)
    })

    it('folds energy-only readings onto a single plug without a sibling', () => {
        const plug = {
            nodeId: '4',
            available: true,
            attributes: {
                [`0/${CLUSTER.descriptor}/0`]: deviceTypes(
                    DEVICE_TYPE.rootNode
                ),
                [`0/${CLUSTER.basicInformation}/3`]: 'Smart Plug',
                [`1/${CLUSTER.descriptor}/0`]: deviceTypes(
                    DEVICE_TYPE.aggregator
                ),
                [`1/${CLUSTER.electricalPower}/8`]: 8_000,
                [`2/${CLUSTER.descriptor}/0`]: deviceTypes(
                    DEVICE_TYPE.onOffPlugInUnit
                ),
                [`2/${CLUSTER.onOff}/0`]: true,
            },
        }
        const devices = mapNode(plug)
        assert.equal(devices.length, 1)
        assert.equal(devices[0]?.id, '4')
        assert.equal(devices[0]?.kind, 'switch')
        assert.equal(devices[0]?.energyEndpointId, 1)
        assert.deepEqual(stateForDevice(devices[0], plug.attributes), {
            state: 'ON',
            power: 8,
        })
    })
})

describe('mapNodeWithFallback', () => {
    it('maps unclassified multi-endpoint nodes as a strip', () => {
        const devices = mapNodeWithFallback({
            nodeId: '56',
            available: false,
            attributes: {
                [`0/${CLUSTER.descriptor}/0`]: deviceTypes(
                    DEVICE_TYPE.rootNode
                ),
                '1/29/0': deviceTypes(DEVICE_TYPE.aggregator),
                '2/29/0': deviceTypes(DEVICE_TYPE.aggregator),
            },
        })
        assert.equal(devices.length, 1)
        assert.equal(devices[0]?.id, '56')
        assert.equal(devices[0]?.kind, 'strip')
        assert.equal(devices[0]?.outlets?.length, 2)
    })
})

describe('collapsedLegacyIds', () => {
    it('lists the old per-outlet and energy sibling ids for a strip', () => {
        assert.deepEqual(collapsedLegacyIds(strip).sort(), [
            '17:1',
            '17:2',
            '17:3',
            '17:4',
        ])
    })

    it('is empty for a node that already used a bare nodeId', () => {
        assert.deepEqual(collapsedLegacyIds(bulb), [])
    })
})

describe('stateForDevice', () => {
    it('nests outlets and folds aggregator energy on a strip', () => {
        const [device] = mapNode(strip)
        assert.ok(device)
        assert.deepEqual(stateForDevice(device, strip.attributes), {
            outlets: [
                { id: '2', name: 'Outlet 1', state: 'ON' },
                { id: '3', name: 'Outlet 2', state: 'OFF' },
                { id: '4', name: 'Outlet 3', state: 'OFF' },
            ],
            power: 12.5,
            voltage: 230.1,
            current: 0.054,
            energy: 1.234,
        })
    })
})

describe('stateForEndpoint', () => {
    it('maps OnOff to state', () => {
        assert.deepEqual(stateForEndpoint(strip.attributes, 2), { state: 'ON' })
        assert.deepEqual(stateForEndpoint(strip.attributes, 3), {
            state: 'OFF',
        })
    })

    it('maps LevelControl to z2m brightness', () => {
        assert.deepEqual(stateForEndpoint(bulb.attributes, 1), {
            state: 'ON',
            brightness: 180,
        })
    })

    it('converts energy attributes to SI units', () => {
        assert.deepEqual(stateForEndpoint(strip.attributes, 1), {
            power: 12.5,
            voltage: 230.1,
            current: 0.054,
            energy: 1.234,
        })
    })
})

describe('deviceDescriptor', () => {
    it('produces a z2m-compatible descriptor with synthesized exposes', () => {
        const [stripDevice] = mapNode(strip)
        assert.ok(stripDevice)
        const descriptor = deviceDescriptor(stripDevice, 'Kitchen strip')
        assert.equal(descriptor.external_id, '17')
        assert.equal(descriptor.ieee_address, '17')
        assert.equal(descriptor.friendly_name, 'Kitchen strip')
        assert.equal(descriptor.type, 'strip')
        const definition = descriptor.definition as {
            exposes: Array<{ type: string }>
        }
        assert.equal(definition.exposes[0]?.type, 'strip')
    })
})

describe('commandsForSet', () => {
    it('maps state ON/OFF to OnOff commands', () => {
        const on = commandsForSet({ state: 'ON' })
        assert.deepEqual(on.actions, [
            { clusterId: CLUSTER.onOff, commandName: 'on', payload: {} },
        ])
        const off = commandsForSet({ state: 'OFF' })
        assert.equal(off.actions[0]?.commandName, 'off')
    })

    it('folds state into moveToLevelWithOnOff when brightness is present', () => {
        const { actions, ignoredKeys } = commandsForSet({
            state: 'ON',
            brightness: 300,
        })
        assert.equal(actions.length, 1)
        assert.equal(actions[0]?.commandName, 'moveToLevelWithOnOff')
        assert.equal((actions[0]?.payload as { level: number }).level, 254)
        assert.deepEqual(ignoredKeys, [])
    })

    it('maps color_temp to moveToColorTemperature', () => {
        const { actions } = commandsForSet({ color_temp: 370 })
        assert.equal(actions[0]?.commandName, 'moveToColorTemperature')
        assert.equal(
            (actions[0]?.payload as { colorTemperatureMireds: number })
                .colorTemperatureMireds,
            370
        )
    })

    it('maps hex color to moveToColor xy', () => {
        const { actions } = commandsForSet({ color: { hex: '#ff0000' } })
        assert.equal(actions[0]?.commandName, 'moveToColor')
        const payload = actions[0]?.payload as {
            colorX: number
            colorY: number
        }
        assert.ok(payload.colorX > 40_000) // red sits at x ≈ 0.64
    })

    it('does not treat outlet as an ignored set key', () => {
        const { actions, ignoredKeys } = commandsForSet({
            outlet: '2',
            state: 'OFF',
        })
        assert.equal(actions[0]?.commandName, 'off')
        assert.deepEqual(ignoredKeys, [])
        assert.equal(outletIdFromSet({ outlet: '2' }), 2)
        assert.equal(outletIdFromSet({ outlet: 3 }), 3)
    })

    it('drops read-only and unknown keys', () => {
        const { actions, ignoredKeys } = commandsForSet({
            power: 12,
            energy: 1,
            frobnicate: true,
        })
        assert.deepEqual(actions, [])
        assert.deepEqual(ignoredKeys.sort(), ['energy', 'frobnicate', 'power'])
    })
})

describe('isStateAttributePath', () => {
    it('accepts state-bearing clusters and rejects diagnostics', () => {
        assert.ok(isStateAttributePath(`2/${CLUSTER.onOff}/0`))
        assert.ok(isStateAttributePath(`1/${CLUSTER.electricalPower}/8`))
        assert.ok(!isStateAttributePath('0/40/5')) // basic information
        assert.ok(!isStateAttributePath('0/51/0')) // general diagnostics
    })
})

describe('hexToXy', () => {
    it('converts primaries to plausible CIE coordinates', () => {
        const red = hexToXy('#ff0000')
        assert.ok(red && red.x > 0.6 && red.y < 0.36)
        const white = hexToXy('#ffffff')
        assert.ok(white && Math.abs(white.x - 0.3127) < 0.01)
        assert.equal(hexToXy('nope'), null)
    })
})
