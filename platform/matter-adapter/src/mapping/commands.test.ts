import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { CLUSTER_ON_OFF } from './clusters.ts'
import { commandsForSet, targetEndpoints } from './commands.ts'
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
})
