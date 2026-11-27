import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
    BULB,
    HARNESS_PLUG,
    PLUG_WITH_AGGREGATOR_METER,
} from './fixtures.test-support.ts'
import { mapNode } from './node.ts'
import { listEndpoints } from './snapshot.ts'

describe('mapping a node to Devices', () => {
    it('lists the non-root endpoints', () => {
        assert.deepEqual(listEndpoints(HARNESS_PLUG), [1, 2])
    })

    it('gives a single-endpoint plug the bare node ID', () => {
        assert.deepEqual(mapNode('2', HARNESS_PLUG), [
            {
                id: '2',
                nodeId: '2',
                endpoint: 1,
                energyEndpoint: 2,
                kind: 'switch',
                defaultName: 'Harness Plug',
                model: 'Harness Plug',
                description: 'Matter on/off plug-in unit (Nemu Harness)',
            },
        ])
    })

    it('folds an aggregator meter endpoint onto a single plug', () => {
        const [device, ...rest] = mapNode('4', PLUG_WITH_AGGREGATOR_METER)
        assert.equal(rest.length, 0)
        assert.equal(device?.kind, 'switch')
        assert.equal(device?.endpoint, 2)
        assert.equal(device?.energyEndpoint, 1)
        assert.equal(device?.description, 'Matter on/off plug-in unit')
    })

    it('classifies a light by its device type', () => {
        const [device] = mapNode('9', BULB)
        assert.equal(device?.id, '9')
        assert.equal(device?.kind, 'light')
        assert.equal(device?.defaultName, 'Bulb A19')
    })

    it('prefers the NodeLabel, then the ProductName, for the name', () => {
        const labelled = { ...HARNESS_PLUG, '0/40/5': ' Kettle ' }
        assert.equal(mapNode('2', labelled)[0]?.defaultName, 'Kettle')
        const unnamed = { ...HARNESS_PLUG, '0/40/3': '', '0/40/5': '' }
        assert.equal(mapNode('2', unnamed)[0]?.defaultName, 'Matter 2')
        assert.equal(mapNode('2', unnamed)[0]?.model, 'Matter device')
    })

    it('gives each endpoint of a light-and-plug node its own Device ID', () => {
        const mixed = {
            ...BULB,
            '2/29/0': [{ deviceType: 266, revision: 1 }],
            '2/6/0': false,
        }
        assert.deepEqual(
            mapNode('5', mixed).map((device) => [
                device.id,
                device.defaultName,
            ]),
            [
                ['5:1', 'Bulb A19 · 1'],
                ['5:2', 'Bulb A19 · Outlet 2'],
            ]
        )
    })

    it('maps nothing from a node without a controllable endpoint', () => {
        assert.deepEqual(mapNode('3', { '0/40/3': 'Bridge' }), [])
    })
})
