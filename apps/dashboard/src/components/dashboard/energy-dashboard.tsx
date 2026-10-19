'use client'

import { useUser } from '@clerk/nextjs'
import { useCapabilityState, useController, useDevices } from '@nemu/controller'
import type {
    CapabilityCurrentState,
    HistoryQuery,
    HistoryQueryRead,
    HistoryQueryResult,
    HomeMeterDesignation,
} from '@nemu/protocol'
import { canonicalQuantity } from '@nemu/protocol'
import { Badge } from '@nemu/ui/components/badge'
import { Button } from '@nemu/ui/components/button'
import {
    Card,
    CardAction,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@nemu/ui/components/card'
import {
    type ChartConfig,
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
} from '@nemu/ui/components/chart'
import {
    Empty,
    EmptyContent,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
} from '@nemu/ui/components/empty'
import { Skeleton } from '@nemu/ui/components/skeleton'
import {
    ArrowUpRightIcon,
    GaugeIcon,
    RefreshCwIcon,
    ServerOffIcon,
    ShieldCheckIcon,
    TriangleAlertIcon,
} from 'lucide-react'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts'
import { getCategoryLabel, presentDevice } from '~/lib/device-presentation'
import {
    buildMeterReadings,
    canDesignateHomeMeter,
    chartModesForDesignation,
    designationSelection,
    type EnergySummary,
    energyDirectionPlan,
    formatEnergy,
    formatPower,
    type HistoryRangeId,
    historyQueryWindow,
    historyRangeOptions,
    homeHistoryQuery,
    livePowerFlow,
    livePowerFlowLabel,
    type MeterReading,
    type MeterScope,
    type PresentedHistorySeries,
    presentEnergySummary,
    presentHistorySeries,
    selectableMeterScopes,
    todayHistoryWindow,
} from '~/lib/energy-presentation'
import { DeviceIcon } from './device-icon'
import { PageHeader } from './page-header'

const powerChartConfig = {
    power: { label: 'Power (W)', color: 'var(--chart-2)' },
} satisfies ChartConfig

const energyChartConfig = {
    imported: { label: 'Imported (kWh)', color: 'var(--chart-2)' },
    exported: { label: 'Exported (kWh)', color: 'var(--chart-4)' },
} satisfies ChartConfig

type HouseholdRole = 'owner' | 'member' | 'unknown'

export function EnergyDashboard() {
    const { devices, error, refresh, status } = useDevices()
    const { view } = useCapabilityState()
    const {
        reprobe,
        queryHistory,
        getHomeMeterDesignation,
        designateHomeMeter,
        getMembers,
    } = useController()
    const { user, isLoaded: userLoaded } = useUser()
    const userId = user?.id
    const userEmail = user?.primaryEmailAddress?.emailAddress
    const connected = status.mode === 'lan' || status.mode === 'relay'
    const presentedDevices = useMemo(
        () =>
            devices?.map((device) =>
                presentDevice(device, view?.capabilities)
            ) ?? [],
        [devices, view]
    )
    const meterReadings = useMemo(
        () => buildMeterReadings(presentedDevices),
        [presentedDevices]
    )
    const [designation, setDesignation] = useState<
        HomeMeterDesignation | null | undefined
    >(undefined)
    const [designationError, setDesignationError] = useState<string | null>(
        null
    )
    const [role, setRole] = useState<HouseholdRole | undefined>(undefined)
    const [roleError, setRoleError] = useState<string | null>(null)
    const [roleAttempt, setRoleAttempt] = useState(0)
    const [designationAttempt, setDesignationAttempt] = useState(0)

    useEffect(() => {
        if (!connected) {
            setDesignation(undefined)
            return
        }
        let cancelled = false
        setDesignation(undefined)
        setDesignationError(null)
        void getHomeMeterDesignation()
            .then((next) => {
                if (!cancelled) setDesignation(next)
            })
            .catch((err: unknown) => {
                if (cancelled) return
                setDesignationError(
                    err instanceof Error
                        ? err.message
                        : 'Unable to load the Home meter'
                )
            })
        return () => {
            cancelled = true
        }
    }, [connected, designationAttempt, getHomeMeterDesignation])

    useEffect(() => {
        if (!connected || !userLoaded) {
            setRole(undefined)
            return
        }
        let cancelled = false
        setRole(undefined)
        setRoleError(null)
        void getMembers()
            .then((members) => {
                if (cancelled) return
                const email = userEmail?.toLowerCase()
                const me = members.find(
                    (member) =>
                        member.userId === userId ||
                        member.email.toLowerCase() === email
                )
                setRole(me?.role ?? 'unknown')
            })
            .catch((err: unknown) => {
                if (cancelled) return
                setRole('unknown')
                setRoleError(
                    err instanceof Error
                        ? err.message
                        : 'Unable to load household role'
                )
            })
        return () => {
            cancelled = true
        }
    }, [connected, getMembers, roleAttempt, userEmail, userId, userLoaded])

    if (!devices && error) {
        return (
            <EnergyPageFrame>
                <EnergyState
                    action="Try again"
                    description="Nemu could not load energy-capable devices from your controller."
                    icon={TriangleAlertIcon}
                    onAction={() => void refresh()}
                    title="Unable to load energy data"
                />
            </EnergyPageFrame>
        )
    }

    if (!devices && status.mode === 'offline') {
        return (
            <EnergyPageFrame>
                <EnergyState
                    action="Reconnect"
                    description="Connect to your Nemu controller to read Home energy."
                    icon={ServerOffIcon}
                    onAction={() => void reprobe()}
                    title="Controller offline"
                />
            </EnergyPageFrame>
        )
    }

    if (
        !devices ||
        (connected && designation === undefined && !designationError)
    ) {
        return <EnergySkeleton />
    }

    return (
        <EnergyPageFrame>
            {status.mode === 'offline' ? (
                <StatusNotice
                    action="Reconnect"
                    description="The controller is offline, so live power and History cannot refresh."
                    icon={ServerOffIcon}
                    onAction={() => void reprobe()}
                    title="Controller is offline"
                />
            ) : null}
            {error ? (
                <StatusNotice
                    action="Retry"
                    description="Some device readings may be out of date."
                    icon={TriangleAlertIcon}
                    onAction={() => void refresh()}
                    title="Energy refresh failed"
                    variant="error"
                />
            ) : null}
            {designationError ? (
                <StatusNotice
                    action="Retry"
                    description={designationError}
                    icon={TriangleAlertIcon}
                    onAction={() =>
                        setDesignationAttempt((attempt) => attempt + 1)
                    }
                    title="Home meter could not be loaded"
                    variant="error"
                />
            ) : null}
            {designation ? (
                <HomeEnergy
                    capabilities={view?.capabilities}
                    designation={designation}
                    queryHistory={queryHistory}
                />
            ) : designationError || !connected ? null : (
                <NoHomeMeter
                    devices={presentedDevices}
                    onRetryRole={() => setRoleAttempt((attempt) => attempt + 1)}
                    onSaved={setDesignation}
                    readings={meterReadings}
                    role={role}
                    roleError={roleError}
                    saveDesignation={designateHomeMeter}
                />
            )}
        </EnergyPageFrame>
    )
}

function HomeEnergy({
    designation,
    capabilities,
    queryHistory,
}: {
    designation: HomeMeterDesignation
    capabilities: readonly CapabilityCurrentState[] | undefined
    queryHistory: (query: HistoryQuery) => Promise<HistoryQueryRead>
}) {
    const quantities = {
        powerCapabilityId: designation.powerCapabilityId,
        importedEnergyCapabilityId: designation.importedEnergyCapabilityId,
        exportedEnergyCapabilityId: designation.exportedEnergyCapabilityId,
    }
    const plan = energyDirectionPlan(quantities)
    const modes = chartModesForDesignation(quantities)
    const [range, setRange] = useState<HistoryRangeId>('24h')
    const [preferredMode, setPreferredMode] = useState<'power' | 'energy'>(
        'power'
    )
    const mode = modes.includes(preferredMode)
        ? preferredMode
        : (modes[0] ?? 'energy')
    const [today, setToday] = useState<{
        designationId: string
        imported: EnergySummary | null
        exported: EnergySummary | null
    } | null>(null)
    const [chart, setChart] = useState<{
        key: string
        series: PresentedHistorySeries[]
    } | null>(null)
    const [historyError, setHistoryError] = useState<string | null>(null)
    const [attempt, setAttempt] = useState(0)
    const chartKey = `${designation.id}:${range}:${mode}`
    const visibleChart = chart?.key === chartKey ? chart.series : null
    const visibleToday = today?.designationId === designation.id ? today : null
    const live = liveDesignatedPower(
        capabilities,
        designation.powerCapabilityId
    )

    useEffect(() => {
        let cancelled = false
        setHistoryError(null)
        const queryWindow = todayHistoryWindow(new Date())
        void (async () => {
            try {
                const [imported, exported] = await Promise.all([
                    plan.imported === 'absent'
                        ? Promise.resolve([])
                        : readMetric(
                              queryHistory,
                              'importedEnergy',
                              queryWindow
                          ),
                    plan.exported === 'absent'
                        ? Promise.resolve([])
                        : readMetric(
                              queryHistory,
                              'exportedEnergy',
                              queryWindow
                          ),
                ])
                if (cancelled) return
                setToday({
                    designationId: designation.id,
                    imported: summarizeDirection(
                        'imported',
                        plan.imported,
                        imported
                    ),
                    exported: summarizeDirection(
                        'exported',
                        plan.exported,
                        exported
                    ),
                })
            } catch (err) {
                if (cancelled) return
                setHistoryError(
                    err instanceof Error
                        ? err.message
                        : 'Unable to load today’s energy'
                )
            }
        })()
        return () => {
            cancelled = true
        }
    }, [attempt, designation.id, plan.exported, plan.imported, queryHistory])

    useEffect(() => {
        if (modes.length === 0) return
        let cancelled = false
        const queryWindow = historyQueryWindow(range, new Date())
        void (async () => {
            try {
                const loaded: PresentedHistorySeries[] = []
                if (mode === 'power' && quantities.powerCapabilityId) {
                    const series = await readMetric(
                        queryHistory,
                        'power',
                        queryWindow
                    )
                    loaded.push(
                        ...series.map((item) =>
                            presentHistorySeries({ ...item, metric: 'power' })
                        )
                    )
                }
                if (mode === 'energy') {
                    if (plan.imported !== 'absent') {
                        const series = await readMetric(
                            queryHistory,
                            'importedEnergy',
                            queryWindow
                        )
                        loaded.push(
                            ...series.map((item) =>
                                presentHistorySeries({
                                    ...item,
                                    metric: 'importedEnergy',
                                })
                            )
                        )
                    }
                    if (plan.exported !== 'absent') {
                        const series = await readMetric(
                            queryHistory,
                            'exportedEnergy',
                            queryWindow
                        )
                        loaded.push(
                            ...series.map((item) =>
                                presentHistorySeries({
                                    ...item,
                                    metric: 'exportedEnergy',
                                })
                            )
                        )
                    }
                }
                if (!cancelled) {
                    setChart({ key: chartKey, series: loaded })
                    setHistoryError(null)
                }
            } catch (err) {
                if (cancelled) return
                setHistoryError(
                    err instanceof Error
                        ? err.message
                        : 'Unable to load Energy History'
                )
            }
        })()
        return () => {
            cancelled = true
        }
    }, [
        attempt,
        chartKey,
        mode,
        plan.exported,
        plan.imported,
        quantities.powerCapabilityId,
        queryHistory,
        range,
    ])

    return (
        <>
            <div className="grid gap-4 md:grid-cols-3">
                {quantities.powerCapabilityId ? (
                    <Card>
                        <CardHeader>
                            <CardDescription>Live power</CardDescription>
                            <CardTitle>
                                {live?.flow
                                    ? livePowerFlowLabel(live.flow)
                                    : 'Unavailable'}
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="font-heading font-semibold text-3xl tracking-tight">
                                {live?.watts === undefined
                                    ? 'Unknown'
                                    : formatPower(live.watts)}
                            </p>
                            <p className="mt-2 text-muted-foreground text-sm">
                                Positive power is importing. Negative power is
                                exporting. A zero or near-zero reading is idle.
                            </p>
                        </CardContent>
                    </Card>
                ) : null}
                <TodayCard summary={visibleToday?.imported ?? null} />
                <TodayCard summary={visibleToday?.exported ?? null} />
            </div>
            {historyError ? (
                <StatusNotice
                    action="Retry"
                    description={historyError}
                    icon={TriangleAlertIcon}
                    onAction={() => setAttempt((value) => value + 1)}
                    title="History could not be loaded"
                    variant="error"
                />
            ) : null}
            {modes.length === 0 ? null : (
                <Card className="min-w-0">
                    <CardHeader>
                        <CardTitle>
                            {mode === 'power' ? 'Power' : 'Energy'}
                        </CardTitle>
                        <CardDescription>
                            {mode === 'power'
                                ? 'Home power from the designated meter.'
                                : 'Imported and exported energy stay separate.'}
                        </CardDescription>
                        <CardAction className="flex flex-wrap items-center gap-2">
                            {modes.length > 1
                                ? modes.map((item) => (
                                      <Button
                                          key={item}
                                          onClick={() => setPreferredMode(item)}
                                          size="sm"
                                          variant={
                                              item === mode
                                                  ? 'default'
                                                  : 'outline'
                                          }
                                      >
                                          {item === 'power'
                                              ? 'Power'
                                              : 'Energy'}
                                      </Button>
                                  ))
                                : null}
                            {historyRangeOptions().map((item) => (
                                <Button
                                    key={item.id}
                                    onClick={() => setRange(item.id)}
                                    size="sm"
                                    variant={
                                        item.id === range
                                            ? 'default'
                                            : 'outline'
                                    }
                                >
                                    {item.label}
                                </Button>
                            ))}
                        </CardAction>
                    </CardHeader>
                    <CardContent className="space-y-5">
                        {visibleChart === null ? (
                            <Skeleton className="h-64" />
                        ) : (
                            <HistoryChart
                                mode={mode}
                                range={range}
                                series={visibleChart}
                            />
                        )}
                    </CardContent>
                </Card>
            )}
        </>
    )
}

function TodayCard({ summary }: { summary: EnergySummary | null }) {
    if (summary === null) return null
    return (
        <Card>
            <CardHeader>
                <CardDescription>Today</CardDescription>
                <CardTitle>{summary.label}</CardTitle>
            </CardHeader>
            <CardContent>
                <p className="font-heading font-semibold text-3xl tracking-tight">
                    {summary.unknown || summary.quantityKwh === null
                        ? 'Unknown'
                        : formatEnergy(summary.quantityKwh)}
                </p>
                <p className="mt-2 text-muted-foreground text-sm">
                    Coverage {summary.coverageLabel}. Missing periods stay
                    unknown.
                </p>
            </CardContent>
        </Card>
    )
}

function HistoryChart({
    series,
    mode,
    range,
}: {
    series: PresentedHistorySeries[]
    mode: 'power' | 'energy'
    range: HistoryRangeId
}) {
    const rows = chartRows(series, mode)
    const config = mode === 'power' ? powerChartConfig : energyChartConfig
    const keys =
        mode === 'power'
            ? (['power'] as const)
            : (['imported', 'exported'] as const).filter((key) =>
                  series.some((item) =>
                      key === 'imported'
                          ? item.metric === 'importedEnergy'
                          : item.metric === 'exportedEnergy'
                  )
              )
    return (
        <div className="space-y-5">
            {series.map((item) => (
                <SeriesFacts
                    item={item}
                    key={`${item.capabilityId}:${item.label}`}
                />
            ))}
            {rows.length === 0 ? (
                <ChartEmpty
                    description="Nothing retained falls in this range. Missing periods stay unknown."
                    title="No History in this range"
                />
            ) : (
                <ChartContainer
                    className="aspect-auto h-64 w-full min-w-0"
                    config={config}
                >
                    <LineChart
                        accessibilityLayer
                        data={rows}
                        margin={{ left: 0, right: 8, top: 8 }}
                    >
                        <CartesianGrid vertical={false} />
                        <XAxis
                            axisLine={false}
                            dataKey="start"
                            domain={['dataMin', 'dataMax']}
                            minTickGap={32}
                            scale="time"
                            tickFormatter={(value: number) =>
                                formatAxis(value, range)
                            }
                            tickLine={false}
                            tickMargin={10}
                            type="number"
                        />
                        <YAxis
                            axisLine={false}
                            tickFormatter={(value: number) =>
                                mode === 'power'
                                    ? formatAxisPower(value)
                                    : formatAxisEnergy(value)
                            }
                            tickLine={false}
                            width={48}
                        />
                        <ChartTooltip
                            content={
                                <ChartTooltipContent
                                    indicator="line"
                                    labelFormatter={(_, payload) =>
                                        formatFullTime(
                                            payload[0]?.payload?.start
                                        )
                                    }
                                />
                            }
                            cursor={false}
                        />
                        {keys.map((key) => (
                            <Line
                                connectNulls={false}
                                dataKey={key}
                                dot={false}
                                key={key}
                                stroke={`var(--color-${key})`}
                                strokeWidth={2}
                                type="monotone"
                            />
                        ))}
                    </LineChart>
                </ChartContainer>
            )}
        </div>
    )
}

function SeriesFacts({ item }: { item: PresentedHistorySeries }) {
    const partial =
        item.points.some((point) => point.partial) ||
        item.designationBoundaries.length > 0
    return (
        <div className="space-y-3 text-sm">
            <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{item.provenanceLabel}</Badge>
                <Badge variant="outline">{item.resolutionLabel}</Badge>
                {item.sourceResolutionLabel !== item.resolutionLabel ? (
                    <Badge variant="outline">
                        Source {item.sourceResolutionLabel}
                    </Badge>
                ) : null}
                <Badge variant="outline">Coverage {item.coverageLabel}</Badge>
            </div>
            <p className="text-muted-foreground">
                Recording since {formatInstant(item.recordingSince)}. Available
                since{' '}
                {item.availableSince
                    ? formatInstant(item.availableSince)
                    : 'unknown'}
                .
            </p>
            {partial ? (
                <p className="text-muted-foreground">
                    A designation or timezone boundary makes part of this range
                    partial.
                </p>
            ) : null}
            <BoundaryList
                label="Designation boundaries"
                values={item.designationBoundaries}
            />
            <BoundaryList
                label="Meter epoch boundaries"
                values={item.meterEpochBoundaries}
            />
            <IntervalList intervals={item.gaps} title="History gaps" />
            <IntervalList intervals={item.missing} title="Missing periods" />
        </div>
    )
}

function BoundaryList({ label, values }: { label: string; values: string[] }) {
    if (values.length === 0) return null
    return (
        <p className="text-muted-foreground">
            {label}: {values.map((value) => formatInstant(value)).join(', ')}
        </p>
    )
}

function IntervalList({
    title,
    intervals,
}: {
    title: string
    intervals: PresentedHistorySeries['gaps']
}) {
    if (intervals.length === 0) return null
    return (
        <div>
            <p className="font-medium">{title}</p>
            <ul className="mt-1 space-y-1 text-muted-foreground">
                {intervals.map((interval) => (
                    <li
                        key={`${interval.kind}:${interval.start}:${interval.end}`}
                    >
                        {interval.safeLabel}
                        {interval.ownerReason
                            ? ` · ${interval.ownerReason}`
                            : ''}{' '}
                        ({formatInstant(interval.start)} –{' '}
                        {formatInstant(interval.end)})
                    </li>
                ))}
            </ul>
        </div>
    )
}

function NoHomeMeter({
    role,
    roleError,
    readings,
    devices,
    onSaved,
    onRetryRole,
    saveDesignation,
}: {
    role: HouseholdRole | undefined
    roleError: string | null
    readings: ReturnType<typeof buildMeterReadings>
    devices: ReturnType<typeof presentDevice>[]
    onSaved: (designation: HomeMeterDesignation) => void
    onRetryRole: () => void
    saveDesignation: (
        selection: NonNullable<ReturnType<typeof designationSelection>>
    ) => Promise<HomeMeterDesignation>
}) {
    const { view } = useCapabilityState()
    const scopes = useMemo(
        () => selectableMeterScopes(view?.capabilities ?? [], devices),
        [devices, view?.capabilities]
    )
    return (
        <>
            <Card className="border-dashed bg-muted/20 shadow-none">
                <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <GaugeIcon className="size-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="font-heading font-medium">
                            No Home meter is designated
                        </p>
                        <p className="mt-1 text-muted-foreground text-sm leading-relaxed">
                            Nemu is not showing a Home total. Device and
                            Component readings stay separate.
                        </p>
                    </div>
                </CardContent>
            </Card>
            {roleError ? (
                <StatusNotice
                    action="Retry"
                    description={roleError}
                    icon={TriangleAlertIcon}
                    onAction={onRetryRole}
                    title="Household role could not be loaded"
                    variant="error"
                />
            ) : null}
            {role === undefined ? (
                <Skeleton className="h-40" />
            ) : canDesignateHomeMeter(role) ? (
                <OwnerSetup
                    onSaved={onSaved}
                    saveDesignation={saveDesignation}
                    scopes={scopes}
                />
            ) : (
                <Card>
                    <CardHeader>
                        <CardTitle>An Owner chooses the Home meter</CardTitle>
                        <CardDescription>
                            Members can review individual meters. Only an Owner
                            can designate the meter that measures the Home.
                        </CardDescription>
                    </CardHeader>
                </Card>
            )}
            {readings.length === 0 ? (
                <Empty className="min-h-80 rounded-xl border">
                    <EmptyHeader>
                        <EmptyMedia variant="icon">
                            <GaugeIcon />
                        </EmptyMedia>
                        <EmptyTitle>No energy monitors reporting</EmptyTitle>
                        <EmptyDescription>
                            Add a Matter or Zigbee plug, outlet, or power strip
                            that reports power or energy to see its individual
                            readings here.
                        </EmptyDescription>
                    </EmptyHeader>
                    <EmptyContent>
                        <Button asChild size="sm" variant="outline">
                            <Link href="/devices">
                                View devices
                                <ArrowUpRightIcon data-icon="inline-end" />
                            </Link>
                        </Button>
                    </EmptyContent>
                </Empty>
            ) : (
                <MeterReadingsCard readings={readings} />
            )}
        </>
    )
}

function OwnerSetup({
    scopes,
    onSaved,
    saveDesignation,
}: {
    scopes: MeterScope[]
    onSaved: (designation: HomeMeterDesignation) => void
    saveDesignation: (
        selection: NonNullable<ReturnType<typeof designationSelection>>
    ) => Promise<HomeMeterDesignation>
}) {
    const [scopeKey, setScopeKey] = useState(scopes[0]?.key)
    const scope = scopes.find((item) => item.key === scopeKey) ?? scopes[0]
    const [selectedIds, setSelectedIds] = useState<string[]>(
        scope?.choices.map((choice) => choice.capabilityId) ?? []
    )
    const [error, setError] = useState<string | null>(null)
    const [saving, setSaving] = useState(false)
    const selection = scope
        ? designationSelection(scope.choices, selectedIds)
        : null

    if (scopes.length === 0 || scope === undefined) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Designate a Home meter</CardTitle>
                    <CardDescription>
                        No power or energy Capability is available to designate
                        yet. Voltage and current are not Home-meter quantities.
                    </CardDescription>
                </CardHeader>
            </Card>
        )
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Designate a Home meter</CardTitle>
                <CardDescription>
                    Choose the meter that measures this Home. At least one of
                    power, imported energy, or exported energy is required.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <label className="block space-y-2 text-sm">
                    <span className="text-muted-foreground">Meter</span>
                    <select
                        aria-label="Home meter"
                        className="h-9 w-full max-w-md rounded-md border border-input bg-background px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                        onChange={(event) => {
                            const next = scopes.find(
                                (item) => item.key === event.currentTarget.value
                            )
                            setScopeKey(event.currentTarget.value)
                            setSelectedIds(
                                next?.choices.map(
                                    (choice) => choice.capabilityId
                                ) ?? []
                            )
                        }}
                        value={scope.key}
                    >
                        {scopes.map((item) => (
                            <option key={item.key} value={item.key}>
                                {item.label}
                                {item.detail === 'Device'
                                    ? ''
                                    : ` · ${item.detail}`}
                            </option>
                        ))}
                    </select>
                </label>
                <fieldset className="space-y-2">
                    <legend className="text-muted-foreground text-sm">
                        Quantities
                    </legend>
                    {(
                        ['power', 'importedEnergy', 'exportedEnergy'] as const
                    ).map((kind) => (
                        <QuantityChoices
                            choices={scope.choices.filter(
                                (choice) => choice.kind === kind
                            )}
                            key={kind}
                            onChange={setSelectedIds}
                            selectedIds={selectedIds}
                        />
                    ))}
                </fieldset>
                {error ? (
                    <p className="text-destructive text-sm" role="alert">
                        {error}
                    </p>
                ) : null}
                <Button
                    disabled={selection === null || saving}
                    onClick={() => {
                        if (selection === null) return
                        setSaving(true)
                        setError(null)
                        void saveDesignation(selection)
                            .then(onSaved)
                            .catch((err: unknown) => {
                                setError(
                                    err instanceof Error
                                        ? err.message
                                        : 'The Home meter was not saved'
                                )
                            })
                            .finally(() => setSaving(false))
                    }}
                    size="sm"
                >
                    {saving ? 'Saving…' : 'Save Home meter'}
                </Button>
            </CardContent>
        </Card>
    )
}

function QuantityChoices({
    choices,
    selectedIds,
    onChange,
}: {
    choices: MeterScope['choices']
    selectedIds: string[]
    onChange: (ids: string[]) => void
}) {
    if (choices.length === 0) return null
    if (choices.length === 1) {
        const choice = choices[0]
        if (choice === undefined) return null
        const checked = selectedIds.includes(choice.capabilityId)
        return (
            <label className="flex items-center gap-2 text-sm">
                <input
                    checked={checked}
                    onChange={() =>
                        onChange(
                            checked
                                ? selectedIds.filter(
                                      (id) => id !== choice.capabilityId
                                  )
                                : [...selectedIds, choice.capabilityId]
                        )
                    }
                    type="checkbox"
                />
                {choice.label}
            </label>
        )
    }
    return (
        <div className="space-y-1">
            {choices.map((choice) => (
                <label
                    className="flex items-center gap-2 text-sm"
                    key={choice.capabilityId}
                >
                    <input
                        checked={selectedIds.includes(choice.capabilityId)}
                        name={choice.kind}
                        onChange={() =>
                            onChange([
                                ...selectedIds.filter(
                                    (id) =>
                                        !choices.some(
                                            (item) => item.capabilityId === id
                                        )
                                ),
                                choice.capabilityId,
                            ])
                        }
                        type="radio"
                    />
                    {choice.label}
                </label>
            ))}
        </div>
    )
}

function EnergyPageFrame({ children }: { children: React.ReactNode }) {
    return (
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
            <PageHeader
                actions={
                    <Badge variant="outline">
                        <ShieldCheckIcon data-icon="inline-start" />
                        Local-only data
                    </Badge>
                }
                description="Home energy stays on your controller. A designated meter supplies only the quantities it supports."
                eyebrow="Energy management"
                title="Energy"
            />
            {children}
        </div>
    )
}

function MeterReadingsCard({ readings }: { readings: MeterReading[] }) {
    return (
        <Card>
            <CardHeader className="border-b">
                <CardTitle>Individual meter readings</CardTitle>
                <CardDescription>
                    Direct Device and Component values. Nemu does not add them
                    together.
                </CardDescription>
                <CardAction>
                    <Badge variant="outline">
                        {readings.length}{' '}
                        {readings.length === 1 ? 'meter' : 'meters'}
                    </Badge>
                </CardAction>
            </CardHeader>
            <CardContent className="divide-y p-0">
                {readings.map((reading) => (
                    <Link
                        className="group flex flex-col gap-4 px-6 py-4 transition-colors hover:bg-muted/40 sm:flex-row sm:items-center"
                        href={`/devices/${encodeURIComponent(reading.device.id)}`}
                        key={reading.id}
                    >
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary">
                                <DeviceIcon
                                    category={reading.device.category}
                                />
                            </div>
                            <div className="min-w-0">
                                <div className="flex min-w-0 items-center gap-2">
                                    <p className="truncate font-heading font-medium">
                                        {reading.name}
                                    </p>
                                    <span
                                        aria-hidden="true"
                                        className={`size-1.5 shrink-0 rounded-full ${
                                            reading.online
                                                ? 'bg-primary'
                                                : 'bg-muted-foreground/40'
                                        }`}
                                    />
                                </div>
                                <p className="truncate text-muted-foreground text-xs">
                                    {reading.scope} ·{' '}
                                    {reading.scope === 'Device'
                                        ? getCategoryLabel(
                                              reading.device.category
                                          )
                                        : reading.device.name}{' '}
                                    · {reading.online ? 'Online' : 'Offline'}
                                </p>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-5 sm:w-64 sm:shrink-0">
                            <Reading
                                label={reading.online ? 'Power' : 'Last power'}
                                value={
                                    reading.power === undefined
                                        ? '—'
                                        : formatPower(reading.power)
                                }
                            />
                            <Reading
                                label="Energy counter"
                                value={
                                    reading.energy === undefined
                                        ? '—'
                                        : formatEnergy(reading.energy)
                                }
                            />
                        </div>
                        <ArrowUpRightIcon className="group-hover:-translate-y-0.5 hidden size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 sm:block" />
                    </Link>
                ))}
            </CardContent>
        </Card>
    )
}

function Reading({ label, value }: { label: string; value: string }) {
    return (
        <div className="min-w-0">
            <p className="text-muted-foreground text-xs">{label}</p>
            <p className="mt-1 truncate font-medium text-sm tabular-nums">
                {value}
            </p>
        </div>
    )
}

function ChartEmpty({
    title,
    description,
}: {
    title: string
    description: string
}) {
    return (
        <div className="flex min-h-64 flex-col items-center justify-center px-6 text-center">
            <p className="font-heading font-medium">{title}</p>
            <p className="mt-1 max-w-sm text-muted-foreground text-sm leading-relaxed">
                {description}
            </p>
        </div>
    )
}

function EnergyState({
    title,
    description,
    action,
    onAction,
    icon: Icon,
}: {
    title: string
    description: string
    action: string
    onAction: () => void
    icon: typeof TriangleAlertIcon
}) {
    return (
        <Empty className="min-h-80 rounded-xl border">
            <EmptyHeader>
                <EmptyMedia variant="icon">
                    <Icon />
                </EmptyMedia>
                <EmptyTitle>{title}</EmptyTitle>
                <EmptyDescription>{description}</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
                <Button onClick={onAction} size="sm" variant="outline">
                    <RefreshCwIcon data-icon="inline-start" />
                    {action}
                </Button>
            </EmptyContent>
        </Empty>
    )
}

function StatusNotice({
    title,
    description,
    action,
    onAction,
    icon: Icon,
    variant = 'default',
}: {
    title: string
    description: string
    action: string
    onAction: () => void
    icon: typeof TriangleAlertIcon
    variant?: 'default' | 'error'
}) {
    return (
        <div
            className={`flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center ${
                variant === 'error'
                    ? 'border-destructive/20 bg-destructive/5'
                    : 'bg-muted/30'
            }`}
        >
            <Icon
                className={`size-5 shrink-0 ${
                    variant === 'error'
                        ? 'text-destructive'
                        : 'text-muted-foreground'
                }`}
            />
            <div className="min-w-0 flex-1">
                <p className="font-medium text-sm">{title}</p>
                <p className="text-muted-foreground text-sm">{description}</p>
            </div>
            <Button onClick={onAction} size="sm" variant="outline">
                <RefreshCwIcon data-icon="inline-start" />
                {action}
            </Button>
        </div>
    )
}

function EnergySkeleton() {
    return (
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
            <div className="space-y-3">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-9 w-44" />
                <Skeleton className="h-4 w-[34rem] max-w-full" />
            </div>
            <Skeleton className="h-24" />
            <Skeleton className="h-[26rem]" />
        </div>
    )
}

function liveDesignatedPower(
    capabilities: readonly CapabilityCurrentState[] | undefined,
    capabilityId: string | null
): {
    watts: number
    flow: NonNullable<ReturnType<typeof livePowerFlow>>
} | null {
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
    const watts = canonicalQuantity(capability.value)
    const flow = livePowerFlow(watts)
    if (flow === undefined) return null
    return { watts, flow }
}

async function readMetric(
    queryHistory: (query: HistoryQuery) => Promise<HistoryQueryRead>,
    metric: 'power' | 'importedEnergy' | 'exportedEnergy',
    queryWindow: {
        start: string
        end: string
        resolution: HistoryRangeResolution
    }
): Promise<HistoryQueryResult['series']> {
    const result = await collectHistory(
        queryHistory,
        homeHistoryQuery({
            metric,
            start: queryWindow.start,
            end: queryWindow.end,
            resolution: queryWindow.resolution,
        })
    )
    return result.series
}

type HistoryRangeResolution = ReturnType<
    typeof historyQueryWindow
>['resolution']

function summarizeDirection(
    direction: 'imported' | 'exported',
    plan: 'measured' | 'estimated' | 'absent',
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

async function collectHistory(
    queryHistory: (query: HistoryQuery) => Promise<HistoryQueryRead>,
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
    return { ...page, series }
}

function chartRows(
    series: PresentedHistorySeries[],
    mode: 'power' | 'energy'
): Array<{
    start: number
    partial: boolean
    power: number | null
    imported: number | null
    exported: number | null
}> {
    const relevant = series.filter((item) =>
        mode === 'power' ? item.metric === 'power' : item.unit === 'kWh'
    )
    const byStart = new Map<
        number,
        {
            start: number
            partial: boolean
            power: number | null
            imported: number | null
            exported: number | null
        }
    >()
    const ensure = (start: number) => {
        const existing = byStart.get(start)
        if (existing) return existing
        const row = {
            start,
            partial: false,
            power: null,
            imported: null,
            exported: null,
        }
        byStart.set(start, row)
        return row
    }
    for (const item of relevant) {
        const key =
            item.metric === 'exportedEnergy'
                ? 'exported'
                : item.metric === 'power'
                  ? 'power'
                  : 'imported'
        for (const point of item.points) {
            const start = Date.parse(point.start)
            if (!Number.isFinite(start)) continue
            const row = ensure(start)
            if (point.value !== null && row[key] === null)
                row[key] = point.value
            row.partial = row.partial || point.partial
        }
        for (const interval of [...item.gaps, ...item.missing]) {
            const start = Date.parse(interval.start)
            if (!Number.isFinite(start)) continue
            ensure(start)
        }
    }
    return [...byStart.values()].sort((left, right) => left.start - right.start)
}

function formatAxis(timestamp: number, range: HistoryRangeId): string {
    if (!Number.isFinite(timestamp)) return ''
    if (range === '24h') {
        return new Intl.DateTimeFormat('en', {
            hour: 'numeric',
            minute: '2-digit',
        }).format(timestamp)
    }
    if (range === '12mo') {
        return new Intl.DateTimeFormat('en', {
            month: 'short',
            year: '2-digit',
        }).format(timestamp)
    }
    return new Intl.DateTimeFormat('en', {
        month: 'short',
        day: 'numeric',
    }).format(timestamp)
}

function formatAxisPower(value: number): string {
    if (Math.abs(value) >= 1_000) {
        return `${new Intl.NumberFormat('en', {
            maximumFractionDigits: 1,
        }).format(value / 1_000)}k`
    }
    return new Intl.NumberFormat('en', { maximumFractionDigits: 0 }).format(
        value
    )
}

function formatAxisEnergy(value: number): string {
    return new Intl.NumberFormat('en', { maximumFractionDigits: 1 }).format(
        value
    )
}

function formatFullTime(timestamp: unknown): string {
    if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) {
        return 'Unknown period'
    }
    return new Intl.DateTimeFormat('en', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    }).format(timestamp)
}

function formatInstant(iso: string): string {
    const date = new Date(iso)
    if (Number.isNaN(date.getTime())) return iso
    return new Intl.DateTimeFormat('en', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    }).format(date)
}
