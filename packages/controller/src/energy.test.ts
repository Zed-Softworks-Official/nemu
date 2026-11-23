import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type {
    HistoryQuery,
    HistoryQueryRead,
    HistoryQueryResult,
} from '@nemu/protocol'
import { loadTodayEnergy, presentEnergySummary } from './energy.ts'

const powerId = '2b7e1c4a-8f3d-4a6b-9c1e-5d8a7b6c4e32'
const importedId = '6f1d7c6a-6a2e-4d0a-9c3e-3d6c1b9a4e21'
const exportedId = '8a4c2e10-1b2c-4d3e-9f01-223344556677'
const NOW = new Date('2026-11-22T15:00:00.000Z')

type Series = HistoryQueryResult['series'][number]

function series(
    overrides: Partial<Series> & { points: Series['points'] }
): Series {
    return {
        capabilityId: importedId,
        label: 'importedEnergy',
        resolution: 'fifteen_minute',
        sourceResolution: 'fifteen_minute',
        provenance: 'measured',
        coverage: { coveredNs: 10, elapsedNs: 10 },
        recordingSince: '2026-01-01T00:00:00.000Z',
        availableSince: '2026-01-01T00:00:00.000Z',
        meterEpochBoundaries: [],
        designationBoundaries: [],
        gaps: [],
        missing: [],
        ...overrides,
    }
}

function point(
    start: string,
    value: number,
    coverage = { coveredNs: 1, elapsedNs: 1 }
): Series['points'][number] {
    return {
        start,
        end: start,
        value,
        scale: 0,
        provenance: 'measured',
        coverage,
    }
}

function result(
    seriesList: Series[],
    extra: Partial<HistoryQueryResult> = {}
): HistoryQueryRead {
    return {
        type: 'historyQueryResult',
        requestId: 'r',
        asOf: NOW.toISOString(),
        incomplete: false,
        series: seriesList,
        reasons: [],
        ...extra,
    }
}

function history(
    pages: Record<string, HistoryQueryRead[]>
): (query: HistoryQuery) => Promise<HistoryQueryRead> {
    const served: Record<string, number> = {}
    return async (query) => {
        const index = served[query.metric] ?? 0
        served[query.metric] = index + 1
        const page = pages[query.metric]?.[index]
        if (!page) throw new Error(`No History scripted for ${query.metric}`)
        return page
    }
}

const BOTH_COUNTERS = {
    powerCapabilityId: powerId,
    importedEnergyCapabilityId: importedId,
    exportedEnergyCapabilityId: exportedId,
}

describe('today energy from the Home meter', () => {
    it('sums Imported and Exported separately across pages', async () => {
        const today = await loadTodayEnergy({
            designation: BOTH_COUNTERS,
            now: NOW,
            queryHistory: history({
                importedEnergy: [
                    result(
                        [
                            series({
                                points: [point('2026-11-22T00:00:00Z', 1200)],
                            }),
                        ],
                        { nextCursor: 'next' }
                    ),
                    result([
                        series({
                            points: [point('2026-11-22T00:15:00Z', 300)],
                        }),
                    ]),
                ],
                exportedEnergy: [
                    result([
                        series({
                            capabilityId: exportedId,
                            label: 'exportedEnergy',
                            points: [point('2026-11-22T00:00:00Z', 250)],
                        }),
                    ]),
                ],
            }),
        })

        assert.equal(today.imported?.quantityKwh, 1.5)
        assert.equal(today.imported?.label, 'Measured imported')
        assert.equal(today.imported?.coverageComplete, true)
        assert.equal(today.exported?.quantityKwh, 0.25)
        assert.equal(today.exported?.label, 'Measured exported')
    })

    it('asks for Home scope from local midnight until now', async () => {
        const queries: HistoryQuery[] = []
        await loadTodayEnergy({
            designation: {
                powerCapabilityId: null,
                importedEnergyCapabilityId: importedId,
                exportedEnergyCapabilityId: null,
            },
            now: NOW,
            queryHistory: async (query) => {
                queries.push(query)
                return result([])
            },
        })

        assert.equal(queries.length, 1)
        assert.equal(queries[0]?.metric, 'importedEnergy')
        assert.deepEqual(queries[0]?.scope, { type: 'home' })
        assert.equal(queries[0]?.end, NOW.toISOString())
        const midnight = new Date(NOW)
        midnight.setHours(0, 0, 0, 0)
        assert.equal(queries[0]?.start, midnight.toISOString())
    })

    it('flags incomplete coverage and leaves missing periods out of the sum', async () => {
        const today = await loadTodayEnergy({
            designation: BOTH_COUNTERS,
            now: NOW,
            queryHistory: history({
                importedEnergy: [
                    result([
                        series({
                            coverage: { coveredNs: 1, elapsedNs: 2 },
                            missing: [
                                {
                                    kind: 'missing',
                                    start: '2026-11-22T00:15:00Z',
                                    end: '2026-11-22T00:30:00Z',
                                },
                            ],
                            points: [
                                point('2026-11-22T00:00:00Z', 1500),
                                point('2026-11-22T00:15:00Z', 0, {
                                    coveredNs: 0,
                                    elapsedNs: 1,
                                }),
                            ],
                        }),
                    ]),
                ],
                exportedEnergy: [result([])],
            }),
        })

        assert.equal(today.imported?.quantityKwh, 1.5)
        assert.equal(today.imported?.coverageComplete, false)
        assert.equal(today.imported?.coverageLabel, '50%')
    })

    it('never turns a day with only gaps, or no series, into zero', async () => {
        const today = await loadTodayEnergy({
            designation: BOTH_COUNTERS,
            now: NOW,
            queryHistory: history({
                importedEnergy: [
                    result([
                        series({
                            coverage: { coveredNs: 0, elapsedNs: 2 },
                            points: [
                                point('2026-11-22T00:00:00Z', 0, {
                                    coveredNs: 0,
                                    elapsedNs: 2,
                                }),
                            ],
                        }),
                    ]),
                ],
                exportedEnergy: [result([])],
            }),
        })

        assert.equal(today.imported?.quantityKwh, null)
        assert.equal(today.imported?.unknown, true)
        assert.equal(today.imported?.coverageComplete, false)
        assert.equal(today.exported?.quantityKwh, null)
        assert.equal(today.exported?.unknown, true)
        assert.equal(today.exported?.coverageComplete, false)
    })

    it('estimates a direction from power and skips one the meter cannot supply', async () => {
        const estimated = await loadTodayEnergy({
            designation: {
                powerCapabilityId: powerId,
                importedEnergyCapabilityId: null,
                exportedEnergyCapabilityId: null,
            },
            now: NOW,
            queryHistory: history({
                importedEnergy: [result([])],
                exportedEnergy: [result([])],
            }),
        })
        assert.equal(estimated.imported?.kind, 'estimated')
        assert.equal(estimated.exported?.label, 'Estimated exported')

        const importOnly = await loadTodayEnergy({
            designation: {
                powerCapabilityId: null,
                importedEnergyCapabilityId: importedId,
                exportedEnergyCapabilityId: null,
            },
            now: NOW,
            queryHistory: history({ importedEnergy: [result([])] }),
        })
        assert.equal(importOnly.exported, null)
    })

    it('fails rather than show a partial day when History stays incomplete', async () => {
        await assert.rejects(
            loadTodayEnergy({
                designation: BOTH_COUNTERS,
                now: NOW,
                queryHistory: history({
                    importedEnergy: [result([], { incomplete: true })],
                    exportedEnergy: [result([])],
                }),
            }),
            /incomplete/
        )
    })
})

describe('energy summary coverage', () => {
    it('is complete only when History covers the whole elapsed period', () => {
        const summary = (coveredNs: number, elapsedNs: number) =>
            presentEnergySummary({
                direction: 'imported',
                plan: 'measured',
                series: {
                    provenance: 'measured',
                    coverage: { coveredNs, elapsedNs },
                    points: [],
                },
            })?.coverageComplete
        assert.equal(summary(10, 10), true)
        assert.equal(summary(9, 10), false)
        assert.equal(summary(0, 0), false)
    })
})
