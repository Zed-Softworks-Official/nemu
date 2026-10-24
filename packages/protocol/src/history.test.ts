import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { clientWsMessageSchema } from './events.ts'
import {
    designateHomeMeterMessageSchema,
    getHomeMeterDesignationMessageSchema,
    historyQueryMessageSchema,
    historyQueryRestartSchema,
    historyQueryResultSchema,
    homeMeterDesignationResultSchema,
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
    incomplete: false,
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
        if (
            lan.type === 'historyQuery' &&
            relay.message.type === 'historyQuery' &&
            'scope' in lan &&
            'scope' in relay.message
        ) {
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
                relay.message.series[0]?.missing.map(
                    (interval) => interval.kind
                ),
                ['missing', 'stale', 'rejected', 'unavailable']
            )
        }
    })

    it('accepts home scope and rejects point counts above 1000', () => {
        const home = historyQueryMessageSchema.parse({
            ...query,
            scope: { type: 'home' },
        })
        assert.equal(home.scope.type, 'home')
        const lan = clientWsMessageSchema.parse({
            ...query,
            scope: { type: 'home' },
            requestId: 'req-home',
        })
        const relay = relayToControllerEnvelopeSchema.parse({
            requestId: 'req-home',
            clientToken: 'token',
            message: { ...query, scope: { type: 'home' } },
        })
        assert.equal(lan.type, 'historyQuery')
        assert.equal(relay.message.type, 'historyQuery')
        assert.throws(() =>
            historyQueryMessageSchema.parse({
                ...query,
                maxPoints: 1001,
            })
        )
    })

    it('uses the same Home meter designation messages on LAN and Relay', () => {
        const selection = {
            type: 'designateHomeMeter' as const,
            powerCapabilityId: capabilityId,
            importedEnergyCapabilityId: null,
            exportedEnergyCapabilityId: null,
        }
        const lan = clientWsMessageSchema.parse({
            ...selection,
            requestId: 'req-designate',
        })
        const relay = relayToControllerEnvelopeSchema.parse({
            requestId: 'req-designate',
            clientToken: 'token',
            message: selection,
        })
        assert.equal(lan.type, 'designateHomeMeter')
        assert.equal(relay.message.type, 'designateHomeMeter')
        designateHomeMeterMessageSchema.parse(selection)
        getHomeMeterDesignationMessageSchema.parse({
            type: 'getHomeMeterDesignation',
        })
        const read = clientWsMessageSchema.parse({
            type: 'getHomeMeterDesignation',
            requestId: 'req-read',
        })
        assert.equal(read.type, 'getHomeMeterDesignation')
        const result = homeMeterDesignationResultSchema.parse({
            type: 'homeMeterDesignation',
            requestId: 'req-read',
            designation: {
                id: deviceId,
                effectiveFrom: '2026-10-19T01:00:00.000Z',
                effectiveUntil: null,
                powerCapabilityId: capabilityId,
                importedEnergyCapabilityId: null,
                exportedEnergyCapabilityId: null,
                protocol: 'matter',
                deviceExternalId: 'meter-a',
                componentPath: [],
                physicalScopeKind: 'device',
                physicalScopeComponentId: '',
            },
        })
        assert.equal(result.designation?.powerCapabilityId, capabilityId)
        const relayResult = relayToClientEnvelopeSchema.parse({
            requestId: 'req-read',
            signature: 'signed',
            message: result,
        })
        assert.equal(relayResult.message.type, 'homeMeterDesignation')
        assert.throws(() =>
            designateHomeMeterMessageSchema.parse({
                type: 'designateHomeMeter',
                powerCapabilityId: 'not-a-uuid',
            })
        )
    })

    it('keeps one history query and marks a partial page incomplete', () => {
        const page = {
            ...memberResult,
            incomplete: true,
            nextCursor: 'hqc_opaque',
        }
        const parsed = historyQueryResultSchema.parse(page)
        assert.equal(parsed.incomplete, true)
        assert.equal(parsed.nextCursor, 'hqc_opaque')
        assert.equal(parsed.series.length <= 20, true)
        const continued = {
            ...query,
            cursor: parsed.nextCursor,
        }
        const lan = clientWsMessageSchema.parse({
            ...continued,
            requestId: 'req-2',
        })
        const relay = relayToControllerEnvelopeSchema.parse({
            requestId: 'req-2',
            clientToken: 'token',
            message: continued,
        })
        assert.equal(lan.type, 'historyQuery')
        assert.equal(relay.message.type, 'historyQuery')
        const cursorOnly = {
            type: 'historyQuery' as const,
            cursor: 'hqc_opaque',
        }
        clientWsMessageSchema.parse({ ...cursorOnly, requestId: 'req-3' })
        relayToControllerEnvelopeSchema.parse({
            requestId: 'req-3',
            clientToken: 'token',
            message: cursorOnly,
        })
        const monthly = historyQueryResultSchema.parse({
            ...memberResult,
            incomplete: false,
            series: [
                {
                    ...memberResult.series[0],
                    resolution: 'monthly',
                    sourceResolution: 'daily',
                },
            ],
        })
        assert.equal(monthly.series[0]?.resolution, 'monthly')
        assert.equal(monthly.series[0]?.sourceResolution, 'daily')
        assert.equal(monthly.nextCursor, undefined)
    })

    it('returns an explicit restart instead of another page', () => {
        const restart = {
            type: 'historyQueryRestart' as const,
            requestId: 'req-1',
            reason: 'cursor_expired' as const,
        }
        const parsed = historyQueryRestartSchema.parse(restart)
        const relay = relayToClientEnvelopeSchema.parse({
            requestId: 'req-1',
            signature: 'signed',
            message: restart,
        })
        assert.equal(parsed.reason, 'cursor_expired')
        assert.equal('series' in parsed, false)
        assert.equal(relay.message.type, 'historyQueryRestart')
        assert.throws(() => historyQueryResultSchema.parse(restart))

        const rankingsOnly = historyQueryResultSchema.parse({
            ...memberResult,
            breakdown: {
                consuming: [
                    {
                        capabilityId,
                        label: 'Oven',
                        rank: 1,
                        value: 40,
                        scale: 0,
                    },
                ],
                producing: [],
                status: 'rankingsOnly',
            },
        })
        assert.equal(rankingsOnly.breakdown?.status, 'rankingsOnly')
        assert.equal(rankingsOnly.breakdown?.unattributed, undefined)
        assert.equal(
            rankingsOnly.breakdown?.consuming[0]?.percentageBasisPoints,
            undefined
        )
        const withShare = {
            ...memberResult,
            breakdown: {
                consuming: [
                    {
                        capabilityId,
                        label: 'Oven',
                        rank: 1,
                        value: 40,
                        scale: 0,
                        percentageBasisPoints: 4000,
                    },
                ],
                producing: [
                    {
                        capabilityId: deviceId,
                        label: 'Solar',
                        rank: 1,
                        value: -20,
                        scale: 0,
                    },
                ],
                unattributed: {
                    value: 60,
                    scale: 0,
                    percentageBasisPoints: 6000,
                    withinMeterTolerance: false,
                },
                status: 'attributed',
            },
        }
        const lanBreakdown = clientWsMessageSchema.parse({
            ...query,
            scope: { type: 'home' as const },
            breakdown: true,
            requestId: 'req-breakdown',
        })
        const relayBreakdown = relayToControllerEnvelopeSchema.parse({
            requestId: 'req-breakdown',
            clientToken: 'token',
            message: {
                ...query,
                scope: { type: 'home' as const },
                breakdown: true,
            },
        })
        assert.equal(lanBreakdown.type, 'historyQuery')
        assert.equal(relayBreakdown.message.type, 'historyQuery')
        if (
            lanBreakdown.type === 'historyQuery' &&
            relayBreakdown.message.type === 'historyQuery' &&
            'breakdown' in lanBreakdown &&
            'breakdown' in relayBreakdown.message
        ) {
            assert.equal(lanBreakdown.breakdown, true)
            assert.equal(relayBreakdown.message.breakdown, true)
        }
        const relayResult = relayToClientEnvelopeSchema.parse({
            requestId: 'req-breakdown',
            signature: 'signed',
            message: withShare,
        })
        assert.equal(relayResult.message.type, 'historyQueryResult')
        if (relayResult.message.type === 'historyQueryResult') {
            assert.equal(
                relayResult.message.breakdown?.consuming[0]
                    ?.percentageBasisPoints,
                4000
            )
            assert.equal(relayResult.message.breakdown?.unattributed?.value, 60)
        }
        const inconsistent = historyQueryResultSchema.parse({
            ...memberResult,
            breakdown: {
                consuming: [
                    {
                        capabilityId,
                        label: 'Oven',
                        rank: 1,
                        value: 200,
                        scale: 0,
                        percentageBasisPoints: 20000,
                    },
                ],
                producing: [],
                status: 'inconsistent',
            },
        })
        assert.equal(inconsistent.breakdown?.unattributed, undefined)
        assert.equal(inconsistent.breakdown?.status, 'inconsistent')
        assert.throws(() =>
            historyQueryResultSchema.parse({
                ...memberResult,
                incomplete: true,
                series: Array.from(
                    { length: 21 },
                    () => memberResult.series[0]
                ),
            })
        )
    })
})
