import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseIncoming, SUBSCRIPTIONS } from './topics.ts'

const parse = (topic: string, payload: unknown) =>
    parseIncoming('matter', `matter/${topic}`, JSON.stringify(payload))

describe('incoming topics', () => {
    it('subscribes to requests, sets and Capability IDs', () => {
        assert.deepEqual(SUBSCRIPTIONS('matter'), [
            'matter/bridge/request/#',
            'matter/+/set',
            'matter/+/capability-ids',
        ])
    })

    it('reads bridge requests', () => {
        assert.deepEqual(parse('bridge/request/commission', { code: '1' }), {
            kind: 'commission',
            payload: { code: '1' },
        })
        assert.deepEqual(parse('bridge/request/commission/cancel', {}), {
            kind: 'cancel',
            payload: {},
        })
        assert.deepEqual(parse('bridge/request/device/remove', { id: '2' }), {
            kind: 'remove',
            payload: { id: '2' },
        })
        assert.deepEqual(
            parse('bridge/request/device/rename', { from: '2', to: 'A' }),
            { kind: 'rename', payload: { from: '2', to: 'A' } }
        )
        assert.deepEqual(
            parse('bridge/request/health/check', { transaction: 't' }),
            { kind: 'health', payload: { transaction: 't' } }
        )
    })

    it('reads a set and Capability IDs for a Device ID', () => {
        assert.deepEqual(parse('2/set', { state: 'ON' }), {
            kind: 'set',
            deviceId: '2',
            payload: { state: 'ON' },
        })
        assert.deepEqual(parse('2:1/capability-ids', { capabilities: [] }), {
            kind: 'capabilityIds',
            deviceId: '2:1',
            payload: { capabilities: [] },
        })
    })

    it('treats a payload that is not a JSON object as empty', () => {
        assert.deepEqual(
            parseIncoming('matter', 'matter/bridge/request/commission', 'nope'),
            { kind: 'commission', payload: {} }
        )
        assert.deepEqual(parse('2/set', [1, 2]), {
            kind: 'set',
            deviceId: '2',
            payload: {},
        })
    })

    it('ignores what it does not handle', () => {
        assert.equal(parse('bridge/request/unknown', {}), undefined)
        assert.equal(parse('2/availability', {}), undefined)
        assert.equal(parse('a/b/set', {}), undefined)
        assert.equal(
            parseIncoming('zigbee2mqtt', 'matter/2/set', '{}'),
            undefined
        )
    })
})
