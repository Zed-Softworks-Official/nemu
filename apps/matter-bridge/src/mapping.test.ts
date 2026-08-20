import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
    CLUSTER,
    commandsForSet,
    DEVICE_TYPE,
    deviceDescriptor,
    hexToXy,
    isStateAttributePath,
    listEndpoints,
    mapNode,
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
    it('splits a power strip into one device per outlet plus an energy sibling', () => {
        const devices = mapNode(strip)
        assert.deepEqual(
            devices.map((d) => [d.id, d.kind, d.defaultName]),
            [
                ['17:2', 'switch', 'Kitchen strip · Outlet 1'],
                ['17:3', 'switch', 'Kitchen strip · Outlet 2'],
                ['17:4', 'switch', 'Kitchen strip · Outlet 3'],
                ['17:1', 'energy', 'Kitchen strip · All outlets'],
            ]
        )
        assert.ok(devices.every((d) => d.model === 'Power Strip S3'))
    })

    it('keeps a bare nodeId for single-endpoint nodes', () => {
        const devices = mapNode(bulb)
        assert.equal(devices.length, 1)
        assert.equal(devices[0]?.id, '9')
        assert.equal(devices[0]?.kind, 'light')
        assert.equal(devices[0]?.defaultName, 'Bulb A19')
    })

    it('skips the energy sibling when an outlet carries the measurement clusters', () => {
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
        assert.deepEqual(
            devices.map((d) => d.id),
            ['17:2', '17:3', '17:4']
        )
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
        const [outlet] = mapNode(strip)
        assert.ok(outlet)
        const descriptor = deviceDescriptor(outlet, 'Coffee maker')
        assert.equal(descriptor.external_id, '17:2')
        assert.equal(descriptor.ieee_address, '17:2')
        assert.equal(descriptor.friendly_name, 'Coffee maker')
        assert.equal(descriptor.type, 'switch')
        const definition = descriptor.definition as {
            exposes: Array<{ type: string }>
        }
        assert.equal(definition.exposes[0]?.type, 'switch')
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
