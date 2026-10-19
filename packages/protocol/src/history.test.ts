import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { clientWsMessageSchema } from './events.ts'
import {
    historyQueryMessageSchema,
    historyQueryResultSchema,
} from './history.ts'
import {
    relayToClientEnvelopeSchema,
    relayToControllerEnvelopeSchema,
} from './relay.ts'

const deviceId = '6f1d7c6a-6a2e-4d0a-9c3e-3d6c1b9a4e21'
const capabilityId = '2b7e1c4a-8f3d-4a6b-9c1e-5d8a7b6c4e32'

const query = {
    type: 'historyQuery' as const,
    scope: { type: 'device' as const, deviceId },
    metric: 'importedEnergy' as const,
    start: '2026-10-01T00:00:00.000Z',
    end: '2026-10-02T00:00:00.000Z',
    resolution: 'fifteen_minute' as const,
    freshnessLimitMs: 60_000,
    maxPoints: 1000,
}

const memberResult = {
    type: 'historyQueryResult' as const,
    requestId: 'req-1',
    asOf: '2026-10-02T00:00:01.000Z',
    reasons: ['gap', 'coverage'],
    series: [
        {
            capabilityId,
            label: `importedEnergy ${capabilityId}`,
            resolution: 'fifteen_minute',
            sourceResolution: 'fifteen_minute',
            provenance: 'measured',
            coverage: { coveredNs: 1, elapsedNs: 2 },
            recordingSince: '2020-01-01T00:00:00.000Z',
            availableSince: '2024-06-01T00:00:00.000Z',
            meterEpochBoundaries: ['2026-10-01T12:00:00.000Z'],
            gaps: [
                {
                    kind: 'history',
                    start: '2026-10-01T01:00:00.000Z',
                    end: '2026-10-01T02:00:00.000Z',
                },
            ],
            missing: [
                {
                    kind: 'missing',
                    start: '2026-10-01T02:00:00.000Z',
                    end: '2026-10-01T03:00:00.000Z',
                },
                {
                    kind: 'stale',
                    start: '2026-10-01T03:00:00.000Z',
                    end: '2026-10-01T04:00:00.000Z',
                },
                {
                    kind: 'rejected',
                    start: '2026-10-01T04:00:00.000Z',
                    end: '2026-10-01T05:00:00.000Z',
                },
                {
                    kind: 'unavailable',
                    start: '2026-10-01T05:00:00.000Z',
                    end: '2026-10-01T06:00:00.000Z',
                },
            ],
            points: [
                {
                    start: '2026-10-01T00:00:00.000Z',
                    end: '2026-10-01T00:15:00.000Z',
                    value: 15,
                    scale: 0,
                    provenance: 'measured',
                    coverage: { coveredNs: 1, elapsedNs: 1 },
                },
            ],
        },
    ],
}

describe('history query messages', () => {
    it('uses the same query on LAN and Relay', () => {
        const lan = clientWsMessageSchema.parse({
            ...query,
            requestId: 'req-1',
        })
        const relay = relayToControllerEnvelopeSchema.parse({
            requestId: 'req-1',
            clientToken: 'token',
            message: query,
        })
        assert.equal(lan.type, 'historyQuery')
        assert.equal(relay.message.type, 'historyQuery')
        if (lan.type === 'historyQuery' && relay.message.type === 'historyQuery') {
            assert.deepEqual(lan.scope, relay.message.scope)
            assert.equal(lan.metric, relay.message.metric)
            assert.equal(lan.resolution, relay.message.resolution)
            assert.equal(lan.maxPoints, relay.message.maxPoints)
        }
        historyQueryMessageSchema.parse(query)
    })

    it('parses a member result without operational health', () => {
        const parsed = historyQueryResultSchema.parse(memberResult)
        const relay = relayToClientEnvelopeSchema.parse({
            requestId: 'req-1',
            signature: 'signed',
            message: memberResult,
        })
        assert.equal(parsed.health, undefined)
        assert.equal('health' in memberResult, false)
        assert.equal('queue' in memberResult, false)
        assert.deepEqual(parsed.reasons, ['gap', 'coverage'])
        assert.equal(relay.message.type, 'historyQueryResult')
        if (relay.message.type === 'historyQueryResult') {
            assert.equal(relay.message.series[0]?.points.length, 1)
            assert.deepEqual(
                relay.message.series[0]?.missing.map((interval) => interval.kind),
                ['missing', 'stale', 'rejected', 'unavailable']
            )
        }
    })

    it('rejects home scope and point counts above 1000', () => {
        assert.throws(() =>
            historyQueryMessageSchema.parse({
                ...query,
                scope: { type: 'home' },
            })
        )
        assert.throws(() =>
            historyQueryMessageSchema.parse({
                ...query,
                maxPoints: 1001,
            })
        )
    })
})
