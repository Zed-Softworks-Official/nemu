import type { PresentedDevice } from './device-presentation'

type MeterValues =
    | { power: number; energy?: number }
    | { power?: undefined; energy: number }

export type MeterReading = MeterValues & {
    id: string
    device: PresentedDevice
    scope: 'Device' | 'Component'
    name: string
    online: boolean
}

export type LivePowerReading = MeterReading & {
    online: true
    power: number
}

export type PowerSample = {
    timestamp: number
    watts: number
}

export type PowerSession = {
    sourceId: string
    samples: PowerSample[]
}

const MAX_POWER_SAMPLES = 120

export function buildMeterReadings(devices: PresentedDevice[]): MeterReading[] {
    const readings: MeterReading[] = []

    for (const device of devices) {
        const deviceValues = readMeterValues(device.power, device.energy)
        if (deviceValues !== undefined) {
            readings.push({
                ...deviceValues,
                id: `device:${device.id}`,
                device,
                scope: 'Device',
                name: device.name,
                online: device.online,
            })
        }

        for (const outlet of device.outlets ?? []) {
            const componentValues = readMeterValues(outlet.power, outlet.energy)
            if (componentValues === undefined) continue

            readings.push({
                ...componentValues,
                id: `component:${device.id}:${outlet.id}`,
                device,
                scope: 'Component',
                name: outlet.name,
                online: device.online,
            })
        }
    }

    return readings.sort((left, right) => {
        if (left.online !== right.online) return left.online ? -1 : 1
        return (
            left.name.localeCompare(right.name) ||
            left.id.localeCompare(right.id)
        )
    })
}

export function isLivePowerReading(
    reading: MeterReading
): reading is LivePowerReading {
    return reading.online && reading.power !== undefined
}

export function appendPowerSample({
    session,
    sourceId,
    watts,
    timestamp,
}: {
    session: PowerSession | undefined
    sourceId: string
    watts: number
    timestamp: number
}): PowerSession {
    if (session?.sourceId !== sourceId) {
        return { sourceId, samples: [{ timestamp, watts }] }
    }

    const latest = session.samples.at(-1)
    if (
        latest !== undefined &&
        latest.watts === watts &&
        timestamp - latest.timestamp < 1_000
    ) {
        return session
    }

    return {
        sourceId,
        samples: [...session.samples, { timestamp, watts }].slice(
            -MAX_POWER_SAMPLES
        ),
    }
}

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

export function formatVoltage(volts: number): string {
    return formatGauge(volts, 'V')
}

export function formatCurrent(amperes: number): string {
    return formatGauge(amperes, 'A')
}

function readMeterValues(
    power: number | undefined,
    energy: number | undefined
): MeterValues | undefined {
    const validPower = isPowerReading(power) ? power : undefined
    const validEnergy = isEnergyReading(energy) ? energy : undefined

    if (validPower !== undefined) {
        return validEnergy === undefined
            ? { power: validPower }
            : { power: validPower, energy: validEnergy }
    }
    if (validEnergy !== undefined) return { energy: validEnergy }
    return undefined
}

function isPowerReading(value: number | undefined): value is number {
    return value !== undefined && Number.isFinite(value)
}

function isEnergyReading(value: number | undefined): value is number {
    return value !== undefined && Number.isFinite(value) && value >= 0
}

function formatGauge(value: number, unit: 'A' | 'V'): string {
    return `${new Intl.NumberFormat('en', {
        maximumFractionDigits: Math.abs(value) >= 10 ? 0 : 2,
    }).format(value)} ${unit}`
}

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

export type HistoryRangeId = '24h' | '7d' | '30d' | '12mo'

export type HistoryResolutionName =
    | 'raw'
    | 'one_minute'
    | 'five_minute'
    | 'fifteen_minute'
    | 'hourly'
    | 'daily'
    | 'monthly'

export type HistoryWindow = {
    start: string
    end: string
    resolution: HistoryResolutionName
}

const HISTORY_RANGES: ReadonlyArray<{
    id: HistoryRangeId
    label: string
    resolution: HistoryResolutionName
}> = [
    { id: '24h', label: '24 hours', resolution: 'one_minute' },
    { id: '7d', label: '7 days', resolution: 'fifteen_minute' },
    { id: '30d', label: '30 days', resolution: 'hourly' },
    { id: '12mo', label: '12 months', resolution: 'daily' },
]

const RESOLUTION_LABELS: Record<HistoryResolutionName, string> = {
    raw: 'Raw',
    one_minute: '1 minute',
    five_minute: '5 minutes',
    fifteen_minute: '15 minutes',
    hourly: 'Hourly',
    daily: 'Daily',
    monthly: 'Monthly',
}

const QUANTITY_ORDER = ['power', 'importedEnergy', 'exportedEnergy'] as const

export type DesignatableKind = (typeof QUANTITY_ORDER)[number]

export type MeterScope = {
    key: string
    label: string
    detail: string
    choices: Array<{
        capabilityId: string
        kind: DesignatableKind
        label: string
    }>
}

type Coverage = { coveredNs: number; elapsedNs: number }

type HistoryPointInput = {
    start: string
    end: string
    value: number
    scale: number
    provenance: 'measured' | 'estimated'
    coverage: Coverage
    partial?: boolean
}

type HistoryIntervalInput = {
    kind: string
    start: string
    end: string
    reason?: string
}

type HistorySeriesInput = {
    capabilityId: string
    label: string
    metric?: 'power' | 'importedEnergy' | 'exportedEnergy'
    resolution: HistoryResolutionName
    sourceResolution: HistoryResolutionName
    provenance: 'measured' | 'estimated'
    coverage: Coverage
    recordingSince: string
    availableSince: string | null
    meterEpochBoundaries: string[]
    designationBoundaries?: string[]
    gaps: HistoryIntervalInput[]
    missing: HistoryIntervalInput[]
    points: HistoryPointInput[]
}

export type PresentedInterval = HistoryIntervalInput & {
    safeLabel: string
    ownerReason?: string
}

export type PresentedHistoryPoint = {
    start: string
    end: string
    value: number | null
    partial: boolean
    provenance: 'measured' | 'estimated'
}

export type PresentedHistorySeries = {
    capabilityId: string
    label: string
    metric: 'power' | 'importedEnergy' | 'exportedEnergy'
    unit: 'W' | 'kWh'
    provenanceLabel: 'Measured' | 'Estimated'
    resolutionLabel: string
    sourceResolutionLabel: string
    coverageLabel: string
    recordingSince: string
    availableSince: string | null
    meterEpochBoundaries: string[]
    designationBoundaries: string[]
    gaps: PresentedInterval[]
    missing: PresentedInterval[]
    points: PresentedHistoryPoint[]
}

export type EnergySummary = {
    kind: 'measured' | 'estimated'
    label: string
    quantityKwh: number | null
    unknown: boolean
    coverageLabel: string
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

export function chartModesForDesignation(
    designation: HomeMeterQuantities
): Array<'power' | 'energy'> {
    const modes: Array<'power' | 'energy'> = []
    if (designation.powerCapabilityId) modes.push('power')
    const plan = energyDirectionPlan(designation)
    if (plan.imported !== 'absent' || plan.exported !== 'absent') {
        modes.push('energy')
    }
    return modes
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
        input.series?.points.filter((point) => pointIsKnown(point.coverage)) ??
        []
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
    return {
        kind,
        label: `${kind === 'measured' ? 'Measured' : 'Estimated'} ${input.direction}`,
        quantityKwh,
        unknown: quantityKwh === null,
        coverageLabel: input.series
            ? coverageLabel(input.series.coverage)
            : 'Unknown',
    }
}

export function historyRangeOptions(): Array<{
    id: HistoryRangeId
    label: string
}> {
    return HISTORY_RANGES.map((range) => ({
        id: range.id,
        label: range.label,
    }))
}

export function historyQueryWindow(
    range: HistoryRangeId,
    now: Date
): HistoryWindow {
    const selected = HISTORY_RANGES.find((item) => item.id === range)
    const resolution = selected?.resolution ?? 'hourly'
    const end = new Date(now.getTime())
    const start = new Date(now.getTime())
    if (range === '24h') start.setTime(end.getTime() - 24 * 60 * 60 * 1000)
    else if (range === '7d') {
        start.setTime(end.getTime() - 7 * 24 * 60 * 60 * 1000)
    } else if (range === '30d') {
        start.setTime(end.getTime() - 30 * 24 * 60 * 60 * 1000)
    } else start.setUTCMonth(start.getUTCMonth() - 12)
    return {
        start: start.toISOString(),
        end: end.toISOString(),
        resolution,
    }
}

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
    resolution: HistoryResolutionName
    breakdown?: boolean
}): {
    scope: { type: 'home' }
    metric: 'power' | 'importedEnergy' | 'exportedEnergy'
    start: string
    end: string
    resolution: HistoryResolutionName
    freshnessLimitMs: number
    maxPoints: number
    breakdown?: boolean
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

export interface ContributorRankingInput {
    capabilityId: string
    label: string
    rank: number | null
    value: number | null
    scale: number
    percentageBasisPoints?: number
}

export interface ContributorBreakdownInput {
    consuming: readonly ContributorRankingInput[]
    producing: readonly ContributorRankingInput[]
    unattributed?: {
        value: number
        scale: number
        percentageBasisPoints?: number
        withinMeterTolerance: boolean
    }
    status:
        | 'rankingsOnly'
        | 'attributed'
        | 'withinMeterTolerance'
        | 'inconsistent'
}

export interface PresentedContributor {
    capabilityId: string
    label: string
    rank: number | null
    quantity: string
    percentage: string | null
}

export interface PresentedContributorBreakdown {
    title: string
    consuming: PresentedContributor[]
    producing: PresentedContributor[]
    unattributed: {
        quantity: string
        percentage: string | null
        withinMeterTolerance: boolean
    } | null
    inconsistent: boolean
}

export function presentContributorBreakdown(
    breakdown: ContributorBreakdownInput | undefined,
    metric: 'power' | 'importedEnergy' | 'exportedEnergy'
): PresentedContributorBreakdown | null {
    if (breakdown === undefined) return null
    const power = metric === 'power'
    const presentRow = (
        row: ContributorRankingInput
    ): PresentedContributor => ({
        capabilityId: row.capabilityId,
        label: row.label,
        rank: row.rank,
        quantity:
            row.value === null
                ? 'Unknown'
                : power
                  ? formatPower(row.value / 10 ** row.scale)
                  : formatEnergy(row.value / 10 ** row.scale / 1000),
        percentage:
            row.percentageBasisPoints === undefined
                ? null
                : formatBasisPoints(row.percentageBasisPoints),
    })
    return {
        title:
            metric === 'power'
                ? 'Power contributors'
                : metric === 'exportedEnergy'
                  ? 'Export contributors'
                  : 'Import contributors',
        consuming: breakdown.consuming.map(presentRow),
        producing: breakdown.producing.map(presentRow),
        unattributed: breakdown.unattributed
            ? {
                  quantity: power
                      ? formatPower(
                            breakdown.unattributed.value /
                                10 ** breakdown.unattributed.scale
                        )
                      : formatEnergy(
                            breakdown.unattributed.value /
                                10 ** breakdown.unattributed.scale /
                                1000
                        ),
                  percentage:
                      breakdown.unattributed.percentageBasisPoints === undefined
                          ? null
                          : formatBasisPoints(
                                breakdown.unattributed.percentageBasisPoints
                            ),
                  withinMeterTolerance:
                      breakdown.unattributed.withinMeterTolerance,
              }
            : null,
        inconsistent: breakdown.status === 'inconsistent',
    }
}

function formatBasisPoints(basisPoints: number): string {
    const percent = basisPoints / 100
    return `${new Intl.NumberFormat('en', {
        maximumFractionDigits: 2,
    }).format(percent)}%`
}

export function presentHistorySeries(
    series: HistorySeriesInput
): PresentedHistorySeries {
    const power = seriesIsPower(series)
    const metric =
        series.metric ??
        (power
            ? 'power'
            : /export/i.test(series.label)
              ? 'exportedEnergy'
              : 'importedEnergy')
    return {
        capabilityId: series.capabilityId,
        label: series.label,
        metric,
        unit: power ? 'W' : 'kWh',
        provenanceLabel:
            series.provenance === 'measured' ? 'Measured' : 'Estimated',
        resolutionLabel: RESOLUTION_LABELS[series.resolution],
        sourceResolutionLabel: RESOLUTION_LABELS[series.sourceResolution],
        coverageLabel: coverageLabel(series.coverage),
        recordingSince: series.recordingSince,
        availableSince: series.availableSince,
        meterEpochBoundaries: series.meterEpochBoundaries,
        designationBoundaries: series.designationBoundaries ?? [],
        gaps: series.gaps.map(presentInterval),
        missing: series.missing.map(presentInterval),
        points: series.points.map((point) => ({
            start: point.start,
            end: point.end,
            value: pointIsKnown(point.coverage)
                ? displayQuantity(
                      canonicalQuantity(point.value, point.scale),
                      power
                  )
                : null,
            partial: point.partial === true,
            provenance: point.provenance,
        })),
    }
}

export function canDesignateHomeMeter(
    role: 'owner' | 'member' | 'unknown'
): boolean {
    return role === 'owner'
}

export function selectableMeterScopes(
    capabilities: readonly {
        capabilityId: string
        kind: DesignatableKind | 'voltage' | 'current'
        device: { protocol: string; externalId: string }
        physicalScope:
            | { kind: 'home' }
            | { kind: 'device' }
            | { kind: 'component'; componentId: string }
    }[],
    devices: readonly {
        name: string
        protocol?: string
        externalId?: string
        outlets?: readonly { id: string; name: string }[]
    }[]
): MeterScope[] {
    const groups = new Map<string, MeterScope>()
    for (const capability of capabilities) {
        if (!isDesignatableKind(capability.kind)) continue
        if (capability.physicalScope.kind === 'home') continue
        const componentId =
            capability.physicalScope.kind === 'component'
                ? capability.physicalScope.componentId
                : ''
        const key = [
            capability.device.protocol,
            capability.device.externalId,
            componentId,
        ].join('\0')
        const device = devices.find(
            (item) =>
                item.protocol === capability.device.protocol &&
                item.externalId === capability.device.externalId
        )
        const outlet = device?.outlets?.find((item) => item.id === componentId)
        const label =
            componentId === ''
                ? (device?.name ?? capability.device.externalId)
                : (outlet?.name ?? componentId)
        const existing = groups.get(key) ?? {
            key,
            label,
            detail:
                componentId === ''
                    ? 'Device'
                    : (device?.name ?? capability.device.externalId),
            choices: [],
        }
        existing.choices.push({
            capabilityId: capability.capabilityId,
            kind: capability.kind,
            label: quantityChoiceLabel(capability.kind),
        })
        groups.set(key, existing)
    }

    return [...groups.values()]
        .map((scope) => ({
            ...scope,
            choices: [...scope.choices].sort(
                (left, right) =>
                    QUANTITY_ORDER.indexOf(left.kind) -
                    QUANTITY_ORDER.indexOf(right.kind)
            ),
        }))
        .sort((left, right) => {
            const leftRank = left.key.endsWith('\0') ? 0 : 1
            const rightRank = right.key.endsWith('\0') ? 0 : 1
            if (leftRank !== rightRank) return leftRank - rightRank
            return (
                left.label.localeCompare(right.label) ||
                left.key.localeCompare(right.key)
            )
        })
}

export function designationSelection(
    choices: readonly { capabilityId: string; kind: DesignatableKind }[],
    selectedIds: readonly string[]
): HomeMeterQuantities | null {
    const selected = new Set(selectedIds)
    const idFor = (kind: DesignatableKind) =>
        choices.find(
            (choice) =>
                choice.kind === kind && selected.has(choice.capabilityId)
        )?.capabilityId ?? null
    const selection = {
        powerCapabilityId: idFor('power'),
        importedEnergyCapabilityId: idFor('importedEnergy'),
        exportedEnergyCapabilityId: idFor('exportedEnergy'),
    }
    if (
        selection.powerCapabilityId === null &&
        selection.importedEnergyCapabilityId === null &&
        selection.exportedEnergyCapabilityId === null
    ) {
        return null
    }
    return selection
}

function directionPlan(
    counterId: string | null,
    powerId: string | null
): EnergyPlan {
    if (counterId) return 'measured'
    if (powerId) return 'estimated'
    return 'absent'
}

function canonicalQuantity(value: number, scale: number): number {
    return value / 10 ** scale
}

function displayQuantity(quantity: number, power: boolean): number {
    return power ? quantity : quantity / 1000
}

function pointIsKnown(coverage: Coverage): boolean {
    if (coverage.elapsedNs <= 0) return true
    return coverage.coveredNs > 0
}

export function coverageLabel(coverage: Coverage): string {
    if (coverage.elapsedNs <= 0) return 'Unknown'
    const percent = Math.round((coverage.coveredNs / coverage.elapsedNs) * 100)
    return `${percent}%`
}

function seriesIsPower(series: HistorySeriesInput): boolean {
    if (series.metric === 'power') return true
    if (
        series.metric === 'importedEnergy' ||
        series.metric === 'exportedEnergy'
    ) {
        return false
    }
    return series.label === 'power' || /\bpower\b/i.test(series.label)
}

function presentInterval(interval: HistoryIntervalInput): PresentedInterval {
    return {
        ...interval,
        safeLabel: safeIntervalLabel(interval.kind),
        ownerReason: ownerReasonLabel(interval.reason),
    }
}

function safeIntervalLabel(kind: string): string {
    if (kind === 'history') return 'Recording was interrupted'
    if (kind === 'stale') return 'The reading became stale'
    if (kind === 'rejected') return 'A reading was rejected'
    if (kind === 'unavailable') return 'The meter was unavailable'
    return 'This period is missing'
}

function ownerReasonLabel(reason: string | undefined): string | undefined {
    if (reason === 'untrusted_time') return 'Untrusted time'
    if (reason === 'storage_failure') return 'Storage failure'
    if (reason === 'queue_loss') return 'Queue loss'
    if (reason === 'disk_floor') return 'Disk floor'
    return undefined
}

function isDesignatableKind(
    kind: DesignatableKind | 'voltage' | 'current'
): kind is DesignatableKind {
    return (
        kind === 'power' ||
        kind === 'importedEnergy' ||
        kind === 'exportedEnergy'
    )
}

function quantityChoiceLabel(kind: DesignatableKind): string {
    if (kind === 'power') return 'Power'
    if (kind === 'importedEnergy') return 'Imported energy'
    return 'Exported energy'
}
