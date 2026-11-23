/**
 * Home energy logic shared by every Control surface, so the dashboard and
 * mobile show the same figures for the same Home and day. Pure functions over
 * the History query and Home-meter designation operations; nothing here is
 * stored or leaves the Controller session.
 */
import {
    type CapabilityCurrentState,
    canonicalQuantity as canonicalStateQuantity,
    type HistoryQuery,
    type HistoryQueryRead,
    type HistoryQueryResult,
    type HistoryResolution,
} from '@nemu/protocol'

/** Readings closer than this display as 0.0 W when no resolution is known. */
const DISPLAY_IDLE_WATTS = 0.05

export type LivePowerFlow = 'importing' | 'exporting' | 'idle'

export type HomeMeterQuantities = {
    powerCapabilityId: string | null
    importedEnergyCapabilityId: string | null
    exportedEnergyCapabilityId: string | null
}

export type EnergyPlan = 'measured' | 'estimated' | 'absent'

export type EnergyDirection = 'imported' | 'exported'

export type HistoryWindow = {
    start: string
    end: string
    resolution: HistoryResolution
}

export type Coverage = { coveredNs: number; elapsedNs: number }

export type HistoryPointInput = {
    start: string
    end: string
    value: number
    scale: number
    provenance: 'measured' | 'estimated'
    coverage: Coverage
    partial?: boolean
}

export type EnergySummary = {
    kind: 'measured' | 'estimated'
    label: string
    /** Sum of the known periods only. Null when no period is known. */
    quantityKwh: number | null
    unknown: boolean
    coverageLabel: string
    /** History covers the whole elapsed period, with no gaps. */
    coverageComplete: boolean
}

export type TodayEnergy = {
    imported: EnergySummary | null
    exported: EnergySummary | null
}

type QueryHistory = (query: HistoryQuery) => Promise<HistoryQueryRead>

export function formatPower(watts: number): string {
    return `${new Intl.NumberFormat('en', {
        maximumFractionDigits: Math.abs(watts) >= 10 ? 0 : 1,
    }).format(watts)} W`
}

export function formatEnergy(kwh: number): string {
    return `${new Intl.NumberFormat('en', {
        maximumFractionDigits: 3,
    }).format(kwh)} kWh`
}

/**
 * Positive power is import and negative power is export, matching the
 * Controller. A zero reading, a value inside the meter's resolution, or a
 * reading that displays as 0.0 W is Idle.
 */
export function livePowerFlow(
    watts: number,
    resolutionWatts = 0
): LivePowerFlow | undefined {
    if (!Number.isFinite(watts)) return undefined
    const resolution =
        Number.isFinite(resolutionWatts) && resolutionWatts > 0
            ? resolutionWatts
            : 0
    const idle =
        watts === 0 ||
        (resolution > 0
            ? Math.abs(watts) <= resolution
            : Math.abs(watts) < DISPLAY_IDLE_WATTS)
    if (idle) return 'idle'
    return watts > 0 ? 'importing' : 'exporting'
}

export function livePowerFlowLabel(flow: LivePowerFlow): string {
    if (flow === 'importing') return 'Importing'
    if (flow === 'exporting') return 'Exporting'
    return 'Idle'
}

/** Current Home power from the designated power Capability, if it is available. */
export function liveDesignatedPower(
    capabilities: readonly CapabilityCurrentState[] | undefined,
    capabilityId: string | null
): { watts: number; flow: LivePowerFlow } | null {
    if (!capabilityId) return null
    const capability = capabilities?.find(
        (item) => item.capabilityId === capabilityId
    )
    if (
        capability?.availability.status !== 'available' ||
        capability.value === undefined
    ) {
        return null
    }
    const watts = canonicalStateQuantity(capability.value)
    const flow = livePowerFlow(watts)
    if (flow === undefined) return null
    return { watts, flow }
}

export function energyDirectionPlan(designation: HomeMeterQuantities): {
    imported: EnergyPlan
    exported: EnergyPlan
} {
    return {
        imported: directionPlan(
            designation.importedEnergyCapabilityId,
            designation.powerCapabilityId
        ),
        exported: directionPlan(
            designation.exportedEnergyCapabilityId,
            designation.powerCapabilityId
        ),
    }
}

export function presentEnergySummary(input: {
    direction: EnergyDirection
    plan: EnergyPlan
    series: {
        provenance: 'measured' | 'estimated'
        coverage: Coverage
        points: HistoryPointInput[]
    } | null
}): EnergySummary | null {
    if (input.plan === 'absent') return null
    const known =
        input.series?.points.filter((point) =>
            historyPointIsKnown(point.coverage)
        ) ?? []
    const quantityKwh =
        known.length === 0
            ? null
            : known.reduce(
                  (total, point) =>
                      total +
                      canonicalQuantity(point.value, point.scale) / 1000,
                  0
              )
    const kind = input.plan
    const coverage = input.series?.coverage
    return {
        kind,
        label: `${kind === 'measured' ? 'Measured' : 'Estimated'} ${input.direction}`,
        quantityKwh,
        unknown: quantityKwh === null,
        coverageLabel: coverage ? coverageLabel(coverage) : 'Unknown',
        coverageComplete:
            coverage !== undefined &&
            coverage.elapsedNs > 0 &&
            coverage.coveredNs >= coverage.elapsedNs,
    }
}

/** From local midnight until now, so "today" is the same on every surface. */
export function todayHistoryWindow(now: Date): HistoryWindow {
    const start = new Date(now)
    start.setHours(0, 0, 0, 0)
    if (start.getTime() >= now.getTime()) {
        start.setTime(now.getTime() - 60_000)
    }
    return {
        start: start.toISOString(),
        end: now.toISOString(),
        resolution: 'fifteen_minute',
    }
}

export function homeHistoryQuery(input: {
    metric: 'power' | 'importedEnergy' | 'exportedEnergy'
    start: string
    end: string
    resolution: HistoryResolution
    breakdown?: boolean
}): HistoryQuery & {
    scope: { type: 'home' }
    metric: 'power' | 'importedEnergy' | 'exportedEnergy'
} {
    return {
        scope: { type: 'home' },
        metric: input.metric,
        start: input.start,
        end: input.end,
        resolution: input.resolution,
        freshnessLimitMs: 60_000,
        maxPoints: 1000,
        ...(input.breakdown ? { breakdown: true } : {}),
    }
}

/** Reads every page of a History query, restarting once if a cursor expires. */
export async function collectHistory(
    queryHistory: QueryHistory,
    query: HistoryQuery
): Promise<HistoryQueryResult> {
    let cursor: string | undefined
    let merged: HistoryQueryResult | null = null
    let restarts = 0
    for (let page = 0; page < 20; page += 1) {
        const read = await queryHistory(
            cursor === undefined ? query : { ...query, cursor }
        )
        if (read.type === 'historyQueryRestart') {
            restarts += 1
            if (restarts > 1) {
                throw new Error(
                    'This History view expired. Refresh to load it again.'
                )
            }
            cursor = undefined
            merged = null
            continue
        }
        merged = merged === null ? read : mergeHistory(merged, read)
        if (read.nextCursor === undefined) {
            if (read.incomplete) {
                throw new Error('The History response was incomplete.')
            }
            return merged
        }
        cursor = read.nextCursor
    }
    throw new Error('The History response was incomplete.')
}

export function summarizeDirection(
    direction: EnergyDirection,
    plan: EnergyPlan,
    series: HistoryQueryResult['series']
): EnergySummary | null {
    if (plan === 'absent') return null
    if (series.length === 0) {
        return presentEnergySummary({ direction, plan, series: null })
    }
    const elapsedNs = series[0]?.coverage.elapsedNs ?? 0
    const coveredNs = Math.min(
        elapsedNs,
        series.reduce((total, item) => total + item.coverage.coveredNs, 0)
    )
    return presentEnergySummary({
        direction,
        plan,
        series: {
            provenance: plan === 'estimated' ? 'estimated' : 'measured',
            coverage: { coveredNs, elapsedNs },
            points: series.flatMap((item) => item.points),
        },
    })
}

/** Today's Imported and Exported energy from the Home meter, kept separate. */
export async function loadTodayEnergy(input: {
    designation: HomeMeterQuantities
    queryHistory: QueryHistory
    now: Date
}): Promise<TodayEnergy> {
    const plan = energyDirectionPlan(input.designation)
    const window = todayHistoryWindow(input.now)
    const read = async (metric: 'importedEnergy' | 'exportedEnergy') =>
        (
            await collectHistory(
                input.queryHistory,
                homeHistoryQuery({ metric, ...window })
            )
        ).series
    const [imported, exported] = await Promise.all([
        plan.imported === 'absent' ? [] : read('importedEnergy'),
        plan.exported === 'absent' ? [] : read('exportedEnergy'),
    ])
    return {
        imported: summarizeDirection('imported', plan.imported, imported),
        exported: summarizeDirection('exported', plan.exported, exported),
    }
}

export function historyPointIsKnown(coverage: Coverage): boolean {
    if (coverage.elapsedNs <= 0) return true
    return coverage.coveredNs > 0
}

export function coverageLabel(coverage: Coverage): string {
    if (coverage.elapsedNs <= 0) return 'Unknown'
    const percent = Math.round((coverage.coveredNs / coverage.elapsedNs) * 100)
    return `${percent}%`
}

export function canonicalQuantity(value: number, scale: number): number {
    return value / 10 ** scale
}

function directionPlan(
    counterId: string | null,
    powerId: string | null
): EnergyPlan {
    if (counterId) return 'measured'
    if (powerId) return 'estimated'
    return 'absent'
}

function mergeHistory(
    current: HistoryQueryResult,
    page: HistoryQueryResult
): HistoryQueryResult {
    const series = current.series.map((item) => ({
        ...item,
        points: [...item.points],
        gaps: [...item.gaps],
        missing: [...item.missing],
    }))
    for (const next of page.series) {
        const existing = series.find(
            (item) =>
                item.capabilityId === next.capabilityId &&
                item.label === next.label
        )
        if (!existing) {
            series.push(next)
            continue
        }
        const seen = new Set(existing.points.map((point) => point.start))
        existing.points.push(
            ...next.points.filter((point) => !seen.has(point.start))
        )
        existing.gaps.push(...next.gaps)
        existing.missing.push(...next.missing)
    }
    return {
        ...page,
        series,
        breakdown: page.breakdown ?? current.breakdown,
    }
}
