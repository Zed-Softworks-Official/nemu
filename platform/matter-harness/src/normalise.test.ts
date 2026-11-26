import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isRecordedTopic, normaliseStep, renameNodeId } from './normalise.ts'

const names = { '2': 'plug', '3': 'light' }

test('node IDs become Device names in topics and ID fields', () => {
    assert.equal(renameNodeId('2', names), '<plug>')
    assert.equal(renameNodeId('3:1', names), '<light>:1')
    assert.equal(renameNodeId('2#4', names), '<plug>#4')
    assert.equal(renameNodeId('2/availability', names), '<plug>/availability')
    assert.equal(renameNodeId('22', names), '22')
    assert.equal(renameNodeId('Harness Plug', names), 'Harness Plug')
})

test('records only the contract topics', () => {
    assert.ok(isRecordedTopic('bridge/devices', '[]'))
    assert.ok(isRecordedTopic('bridge/response/health/check', '{}'))
    assert.ok(isRecordedTopic('2', '{}'))
    assert.ok(isRecordedTopic('2/availability', '{}'))
    assert.ok(isRecordedTopic('2/capabilities', '{}'))
    assert.ok(isRecordedTopic('2/observations', '{}'))
    assert.ok(
        isRecordedTopic('bridge/event', '{"type":"command_failed","data":{}}')
    )
    assert.ok(
        !isRecordedTopic(
            'bridge/event',
            '{"type":"commission_progress","data":{}}'
        )
    )
    assert.ok(!isRecordedTopic('bridge/state', '{"state":"online"}'))
    assert.ok(!isRecordedTopic('bridge/request/commission', '{}'))
    assert.ok(!isRecordedTopic('2/set', '{}'))
    assert.ok(!isRecordedTopic('2/capability-ids', '{}'))
})

test('per-run values are replaced and keys sorted', () => {
    const record = normaliseStep(
        [
            {
                topic: '2/observations',
                payload: JSON.stringify({
                    observationId: '2:1795732804754:1',
                    observedAt: '2026-11-26T22:40:04Z',
                    observations: [
                        {
                            identity: {
                                device: { externalId: '2', protocol: 'matter' },
                            },
                        },
                    ],
                }),
            },
        ],
        names
    )
    assert.deepEqual(record, {
        '<plug>/observations': [
            {
                observationId: '<observationId>',
                observations: [
                    {
                        identity: {
                            device: {
                                externalId: '<plug>',
                                protocol: 'matter',
                            },
                        },
                    },
                ],
                observedAt: '<timestamp>',
            },
        ],
    })
    assert.deepEqual(
        Object.keys((record['<plug>/observations'] ?? [])[0] as object),
        ['observationId', 'observations', 'observedAt']
    )
})

test('bridge/devices is sorted by external_id', () => {
    const record = normaliseStep(
        [
            {
                topic: 'bridge/devices',
                payload: JSON.stringify([
                    { external_id: '3' },
                    { external_id: '2' },
                ]),
            },
        ],
        names
    )
    assert.deepEqual(record['bridge/devices'], [
        [{ external_id: '<light>' }, { external_id: '<plug>' }],
    ])
})

test('consecutive repeats collapse on retained topics but not on responses', () => {
    const on = JSON.stringify({ state: 'ON' })
    const off = JSON.stringify({ state: 'OFF' })
    const ok = JSON.stringify({ status: 'ok', transaction: 't' })
    const record = normaliseStep(
        [
            { topic: '2', payload: off },
            { topic: '2', payload: off },
            { topic: '2', payload: on },
            { topic: '2', payload: on },
            { topic: '2', payload: off },
            { topic: 'bridge/response/health/check', payload: ok },
            { topic: 'bridge/response/health/check', payload: ok },
        ],
        names
    )
    assert.deepEqual(record['<plug>'], [
        { state: 'OFF' },
        { state: 'ON' },
        { state: 'OFF' },
    ])
    assert.equal(record['bridge/response/health/check']?.length, 2)
})

test('an empty retained payload records a cleared topic', () => {
    const record = normaliseStep(
        [{ topic: '3/availability', payload: '' }],
        names
    )
    assert.deepEqual(record, { '<light>/availability': [null] })
})

test('a response echoes the Device ID as id', () => {
    const record = normaliseStep(
        [
            {
                topic: 'bridge/response/device/remove',
                payload: '{"status":"ok","data":{"id":"3"}}',
            },
        ],
        names
    )
    assert.deepEqual(record['bridge/response/device/remove'], [
        { data: { id: '<light>' }, status: 'ok' },
    ])
})

test('an outlet id in Device state is not a node ID', () => {
    const record = normaliseStep(
        [{ topic: '2', payload: '{"outlets":[{"id":"2","name":"Outlet 1"}]}' }],
        names
    )
    assert.deepEqual(record['<plug>'], [
        { outlets: [{ id: '2', name: 'Outlet 1' }] },
    ])
})
