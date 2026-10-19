import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
    canDesignateHomeMeter,
    chartModesForDesignation,
    energyDirectionPlan,
    historyQueryWindow,
    historyRangeOptions,
    homeHistoryQuery,
    livePowerFlow,
    presentEnergySummary,
    presentHistorySeries,
    selectableMeterScopes,
    todayHistoryWindow,
} from './energy-presentation.ts'

const powerId = '2b7e1c4a-8f3d-4a6b-9c1e-5d8a7b6c4e32'
const importedId = '6f1d7c6a-6a2e-4d0a-9c3e-3d6c1b9a4e21'
const exportedId = '8a4c2e10-1b2c-4d3e-9f01-223344556677'

describe('live Home power', () => {
    it('uses positive import, negative export, and near-zero idle', () => {
        assert.equal(livePowerFlow(120), 'importing')
        assert.equal(livePowerFlow(-40), 'exporting')
        assert.equal(livePowerFlow(0), 'idle')
        assert.equal(livePowerFlow(0.04), 'idle')
        assert.equal(livePowerFlow(-0.04), 'idle')
        assert.equal(livePowerFlow(0.5, 1), 'idle')
        assert.equal(livePowerFlow(-0.5, 1), 'idle')
        assert.equal(livePowerFlow(1.5, 1), 'importing')
        assert.equal(livePowerFlow(-1.5, 1), 'exporting')
        assert.equal(livePowerFlow(Number.NaN), undefined)
    })
})

describe('today energy', () => {
    it('measures a designated counter and estimates only the undesignated direction', () => {
        assert.deepEqual(
            energyDirectionPlan({
                powerCapabilityId: powerId,
                importedEnergyCapabilityId: importedId,
                exportedEnergyCapabilityId: null,
            }),
            { imported: 'measured', exported: 'estimated' }
        )
        assert.deepEqual(
            energyDirectionPlan({
                powerCapabilityId: null,
                importedEnergyCapabilityId: importedId,
                exportedEnergyCapabilityId: exportedId,
            }),
            { imported: 'measured', exported: 'measured' }
        )
        assert.deepEqual(
            energyDirectionPlan({
                powerCapabilityId: powerId,
                importedEnergyCapabilityId: null,
                exportedEnergyCapabilityId: null,
            }),
            { imported: 'estimated', exported: 'estimated' }
        )
        assert.deepEqual(
            energyDirectionPlan({
                powerCapabilityId: null,
                importedEnergyCapabilityId: null,
                exportedEnergyCapabilityId: null,
            }),
            { imported: 'absent', exported: 'absent' }
        )
    })

    it('keeps incomplete measured energy and never presents a net', () => {
        const summary = presentEnergySummary({
            direction: 'imported',
            plan: 'measured',
            series: {
                provenance: 'measured',
                coverage: { coveredNs: 1, elapsedNs: 2 },
                points: [
                    point({
                        value: 1500,
                        scale: 0,
                        coveredNs: 1,
                        elapsedNs: 1,
                    }),
                    point({
                        value: 0,
                        scale: 0,
                        coveredNs: 0,
                        elapsedNs: 1,
                    }),
                ],
            },
        })
        assert.equal(summary?.kind, 'measured')
        assert.equal(summary?.label, 'Measured imported')
        assert.equal(summary?.quantityKwh, 1.5)
        assert.equal(summary?.unknown, false)
        assert.equal(summary?.coverageLabel, '50%')
        assert.ok(summary)
        assert.equal('net' in summary, false)
        assert.equal(JSON.stringify(summary).includes('consumption'), false)

        const unknown = presentEnergySummary({
            direction: 'exported',
            plan: 'measured',
            series: {
                provenance: 'measured',
                coverage: { coveredNs: 0, elapsedNs: 2 },
                points: [
                    point({ value: 0, scale: 0, coveredNs: 0, elapsedNs: 2 }),
                ],
            },
        })
        assert.equal(unknown?.kind, 'measured')
        assert.equal(unknown?.quantityKwh, null)
        assert.equal(unknown?.unknown, true)

        const estimated = presentEnergySummary({
            direction: 'exported',
            plan: 'estimated',
            series: {
                provenance: 'estimated',
                coverage: { coveredNs: 9, elapsedNs: 10 },
                points: [
                    point({
                        value: 250,
                        scale: 0,
                        coveredNs: 9,
                        elapsedNs: 10,
                        provenance: 'estimated',
                    }),
                ],
            },
        })
        assert.equal(estimated?.kind, 'estimated')
        assert.equal(estimated?.label, 'Estimated exported')
        assert.equal(estimated?.quantityKwh, 0.25)
        assert.equal(
            presentEnergySummary({
                direction: 'imported',
                plan: 'absent',
                series: null,
            }),
            null
        )
    })
})

describe('history ranges', () => {
    it('offers 24-hour, 7-day, 30-day, and 12-month windows', () => {
        assert.deepEqual(
            historyRangeOptions().map((range) => range.id),
            ['24h', '7d', '30d', '12mo']
        )
        const now = new Date('2026-10-18T15:00:00.000Z')
        const day = historyQueryWindow('24h', now)
        const week = historyQueryWindow('7d', now)
        const month = historyQueryWindow('30d', now)
        const year = historyQueryWindow('12mo', now)
        assert.equal(day.end, now.toISOString())
        assert.equal(
            Date.parse(day.end) - Date.parse(day.start),
            24 * 60 * 60 * 1000
        )
        assert.equal(
            Date.parse(week.end) - Date.parse(week.start),
            7 * 24 * 60 * 60 * 1000
        )
        assert.equal(
            Date.parse(month.end) - Date.parse(month.start),
            30 * 24 * 60 * 60 * 1000
        )
        assert.equal(year.start, '2025-10-18T15:00:00.000Z')
        assert.equal(day.resolution, 'one_minute')
        assert.equal(week.resolution, 'fifteen_minute')
        assert.equal(month.resolution, 'hourly')
        assert.equal(year.resolution, 'daily')

        const today = todayHistoryWindow(now)
        assert.equal(today.resolution, 'fifteen_minute')
        assert.ok(Date.parse(today.start) < Date.parse(today.end))
    })

    it('queries Home scope through the controller client shape', () => {
        const query = homeHistoryQuery({
            metric: 'importedEnergy',
            start: '2026-10-18T00:00:00.000Z',
            end: '2026-10-18T15:00:00.000Z',
            resolution: 'fifteen_minute',
        })
        assert.deepEqual(query.scope, { type: 'home' })
        assert.equal(query.metric, 'importedEnergy')
        assert.equal(query.maxPoints, 1000)
        assert.equal(query.freshnessLimitMs, 60_000)
        assert.equal('cursor' in query, false)
    })
})

describe('partial designation', () => {
    it('offers Power or Energy only when the designation supports them', () => {
        assert.deepEqual(
            chartModesForDesignation({
                powerCapabilityId: powerId,
                importedEnergyCapabilityId: null,
                exportedEnergyCapabilityId: null,
            }),
            ['power', 'energy']
        )
        assert.deepEqual(
            chartModesForDesignation({
                powerCapabilityId: null,
                importedEnergyCapabilityId: importedId,
                exportedEnergyCapabilityId: null,
            }),
            ['energy']
        )
        assert.deepEqual(
            chartModesForDesignation({
                powerCapabilityId: null,
                importedEnergyCapabilityId: null,
                exportedEnergyCapabilityId: null,
            }),
            []
        )
    })
})

describe('history chart facts', () => {
    it('keeps missing periods unknown and reports coverage, provenance, and bounds', () => {
        const presented = presentHistorySeries({
            capabilityId: importedId,
            label: 'imported',
            resolution: 'hourly',
            sourceResolution: 'hourly',
            provenance: 'measured',
            coverage: { coveredNs: 1, elapsedNs: 4 },
            recordingSince: '2020-01-01T00:00:00.000Z',
            availableSince: '2024-06-01T00:00:00.000Z',
            meterEpochBoundaries: ['2026-10-18T12:00:00.000Z'],
            designationBoundaries: ['2026-10-18T06:00:00.000Z'],
            gaps: [
                {
                    kind: 'history',
                    start: '2026-10-18T01:00:00.000Z',
                    end: '2026-10-18T02:00:00.000Z',
                    reason: 'storage_failure',
                },
            ],
            missing: [
                {
                    kind: 'unavailable',
                    start: '2026-10-18T02:00:00.000Z',
                    end: '2026-10-18T03:00:00.000Z',
                },
            ],
            points: [
                point({
                    value: 500,
                    scale: 0,
                    coveredNs: 1,
                    elapsedNs: 1,
                    partial: true,
                }),
                point({
                    start: '2026-10-18T01:00:00.000Z',
                    end: '2026-10-18T02:00:00.000Z',
                    value: 0,
                    scale: 0,
                    coveredNs: 0,
                    elapsedNs: 1,
                }),
            ],
        })

        assert.equal(presented.provenanceLabel, 'Measured')
        assert.equal(presented.resolutionLabel, 'Hourly')
        assert.equal(presented.coverageLabel, '25%')
        assert.equal(presented.recordingSince, '2020-01-01T00:00:00.000Z')
        assert.equal(presented.availableSince, '2024-06-01T00:00:00.000Z')
        assert.equal(presented.points[0]?.value, 0.5)
        assert.equal(presented.points[0]?.partial, true)
        assert.equal(presented.points[1]?.value, null)
        assert.equal(presented.gaps[0]?.safeLabel, 'Recording was interrupted')
        assert.equal(presented.gaps[0]?.ownerReason, 'Storage failure')
        assert.equal(
            presented.missing[0]?.safeLabel,
            'The meter was unavailable'
        )
        assert.deepEqual(presented.designationBoundaries, [
            '2026-10-18T06:00:00.000Z',
        ])
        assert.deepEqual(presented.meterEpochBoundaries, [
            '2026-10-18T12:00:00.000Z',
        ])
        assert.equal('showsVoltage' in presented, false)
        assert.equal('showsCost' in presented, false)
    })

    it('describes a missing availableSince as unknown', () => {
        const presented = presentHistorySeries({
            capabilityId: powerId,
            label: 'power',
            resolution: 'one_minute',
            sourceResolution: 'one_minute',
            provenance: 'measured',
            coverage: { coveredNs: 0, elapsedNs: 0 },
            recordingSince: '2026-10-18T00:00:00.000Z',
            availableSince: null,
            meterEpochBoundaries: [],
            designationBoundaries: [],
            gaps: [],
            missing: [],
            points: [
                point({
                    value: -2500,
                    scale: 0,
                    coveredNs: 1,
                    elapsedNs: 1,
                }),
            ],
        })
        assert.equal(presented.availableSince, null)
        assert.equal(presented.coverageLabel, 'Unknown')
        assert.equal(presented.points[0]?.value, -2500)
        assert.equal(presented.unit, 'W')
    })
})

describe('Home meter setup', () => {
    it('lets an Owner save a designation and keeps a Member from saving one', () => {
        assert.equal(canDesignateHomeMeter('owner'), true)
        assert.equal(canDesignateHomeMeter('member'), false)
        assert.equal(canDesignateHomeMeter('unknown'), false)
    })

    it('lists power and energy counters on one scope and omits voltage and current', () => {
        const scopes = selectableMeterScopes(
            [
                capability({
                    capabilityId: powerId,
                    kind: 'power',
                    componentId: undefined,
                }),
                capability({
                    capabilityId: importedId,
                    kind: 'importedEnergy',
                    componentId: undefined,
                }),
                capability({
                    capabilityId: '11111111-1111-4111-8111-111111111111',
                    kind: 'voltage',
                    componentId: undefined,
                }),
                capability({
                    capabilityId: '22222222-2222-4222-8222-222222222222',
                    kind: 'current',
                    componentId: 'outlet-1',
                }),
                capability({
                    capabilityId: exportedId,
                    kind: 'exportedEnergy',
                    componentId: 'outlet-1',
                }),
            ],
            [
                {
                    name: 'Panel',
                    protocol: 'matter',
                    externalId: 'device-1',
                    outlets: [{ id: 'outlet-1', name: 'Garage' }],
                },
            ]
        )
        assert.equal(scopes.length, 2)
        assert.deepEqual(
            scopes[0]?.choices.map((choice) => choice.kind),
            ['power', 'importedEnergy']
        )
        assert.equal(scopes[0]?.label, 'Panel')
        assert.deepEqual(
            scopes[1]?.choices.map((choice) => choice.kind),
            ['exportedEnergy']
        )
        assert.equal(scopes[1]?.label, 'Garage')
        assert.equal(
            scopes.some((scope) =>
                scope.choices.some((choice) => {
                    const kind: string = choice.kind
                    return kind === 'voltage' || kind === 'current'
                })
            ),
            false
        )
    })
})

function point({
    value,
    scale,
    coveredNs,
    elapsedNs,
    partial,
    provenance = 'measured',
    start = '2026-10-18T00:00:00.000Z',
    end = '2026-10-18T01:00:00.000Z',
}: {
    value: number
    scale: number
    coveredNs: number
    elapsedNs: number
    partial?: boolean
    provenance?: 'measured' | 'estimated'
    start?: string
    end?: string
}) {
    return {
        start,
        end,
        value,
        scale,
        provenance,
        coverage: { coveredNs, elapsedNs },
        partial,
    }
}

function capability({
    capabilityId,
    kind,
    componentId,
}: {
    capabilityId: string
    kind: 'power' | 'importedEnergy' | 'exportedEnergy' | 'voltage' | 'current'
    componentId: string | undefined
}) {
    return {
        capabilityId,
        kind,
        device: { protocol: 'matter', externalId: 'device-1' },
        physicalScope:
            componentId === undefined
                ? { kind: 'device' as const }
                : { kind: 'component' as const, componentId },
    }
}
