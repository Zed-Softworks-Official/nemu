'use client'

import { useController, useDevices } from '@nemu/controller'
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
    ActivityIcon,
    ArrowUpRightIcon,
    ChartNoAxesCombinedIcon,
    GaugeIcon,
    HistoryIcon,
    RadioTowerIcon,
    RefreshCwIcon,
    ServerOffIcon,
    ShieldCheckIcon,
    TriangleAlertIcon,
    ZapIcon,
} from 'lucide-react'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import {
    Area,
    AreaChart,
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    XAxis,
    YAxis,
} from 'recharts'
import {
    formatEnergy,
    formatPower,
    getCategoryLabel,
    type PresentedDevice,
    presentDevice,
} from '~/lib/device-presentation'
import { DeviceIcon } from './device-icon'
import { PageHeader } from './page-header'

const liveChartConfig = {
    watts: {
        label: 'Power (W)',
        color: 'var(--chart-2)',
    },
} satisfies ChartConfig

const breakdownChartConfig = {
    watts: {
        label: 'Power (W)',
        color: 'var(--chart-2)',
    },
} satisfies ChartConfig

const sourceColors = [
    'var(--chart-2)',
    'var(--chart-1)',
    'var(--chart-3)',
    'var(--chart-4)',
    'var(--chart-5)',
]

type PowerSample = {
    timestamp: number
    watts: number
}

type BreakdownSource = {
    id: string
    name: string
    detail: string
    watts: number
}

type MeteredDevice = {
    device: PresentedDevice
    power?: number
    energy?: number
    outletReadingCount: number
}

type EnergySummary = {
    meteredDevices: MeteredDevice[]
    breakdown: BreakdownSource[]
    chartBreakdown: BreakdownSource[]
    currentPower?: number
    cumulativeEnergy?: number
    reportingCount: number
}

export function EnergyDashboard() {
    const { devices, error, refresh, status } = useDevices()
    const { reprobe } = useController()
    const presentedDevices = useMemo(
        () => devices?.map(presentDevice) ?? [],
        [devices]
    )
    const summary = useMemo(
        () => buildEnergySummary(presentedDevices),
        [presentedDevices]
    )
    const samples = usePowerSamples(summary.currentPower)

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
                    description="Connect to your Nemu controller to read live power use."
                    icon={ServerOffIcon}
                    onAction={() => void reprobe()}
                    title="Controller offline"
                />
            </EnergyPageFrame>
        )
    }

    if (!devices) {
        return <EnergySkeleton />
    }

    const topSource = summary.breakdown[0]

    return (
        <EnergyPageFrame>
            {status.mode === 'offline' ? (
                <StatusNotice
                    action="Reconnect"
                    description="Live demand is unavailable. Cumulative values below are the last readings received."
                    icon={ServerOffIcon}
                    onAction={() => void reprobe()}
                    title="Controller is offline"
                />
            ) : null}

            {error ? (
                <StatusNotice
                    action="Retry"
                    description="Some readings may be out of date."
                    icon={TriangleAlertIcon}
                    onAction={() => void refresh()}
                    title="Energy refresh failed"
                    variant="error"
                />
            ) : null}

            {summary.meteredDevices.length === 0 ? (
                <Empty className="min-h-80 rounded-xl border">
                    <EmptyHeader>
                        <EmptyMedia variant="icon">
                            <GaugeIcon />
                        </EmptyMedia>
                        <EmptyTitle>No energy monitors reporting</EmptyTitle>
                        <EmptyDescription>
                            Add a Matter or Zigbee plug, outlet, or power strip
                            that reports power or energy to see household usage
                            here.
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
                <>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <EnergyMetricCard
                            detail={
                                summary.reportingCount === 1
                                    ? '1 device reporting now'
                                    : `${summary.reportingCount} devices reporting now`
                            }
                            icon={ZapIcon}
                            label="Live draw"
                            value={
                                summary.currentPower === undefined
                                    ? '—'
                                    : formatPower(summary.currentPower)
                            }
                        />
                        <EnergyMetricCard
                            detail={
                                topSource
                                    ? formatPower(topSource.watts)
                                    : 'No live power readings'
                            }
                            icon={ActivityIcon}
                            label="Highest load"
                            value={topSource?.name ?? '—'}
                        />
                        <EnergyMetricCard
                            detail={
                                presentedDevices.length === 1
                                    ? 'Of 1 device in this home'
                                    : `Of ${presentedDevices.length} devices in this home`
                            }
                            icon={RadioTowerIcon}
                            label="Energy coverage"
                            value={String(summary.meteredDevices.length)}
                        />
                        <EnergyMetricCard
                            detail={
                                summary.cumulativeEnergy === undefined
                                    ? 'No cumulative counters'
                                    : 'Combined device meter readings'
                            }
                            icon={ChartNoAxesCombinedIcon}
                            label="Meter total"
                            value={
                                summary.cumulativeEnergy === undefined
                                    ? '—'
                                    : formatEnergy(summary.cumulativeEnergy)
                            }
                        />
                    </div>

                    <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(22rem,2fr)]">
                        <Card className="min-w-0">
                            <CardHeader>
                                <CardTitle>Live power</CardTitle>
                                <CardDescription>
                                    A session-only trend from devices reporting
                                    right now.
                                </CardDescription>
                                <CardAction>
                                    <Badge variant="soft">This session</Badge>
                                </CardAction>
                            </CardHeader>
                            <CardContent>
                                {summary.currentPower === undefined ? (
                                    <ChartEmpty
                                        description="Live wattage will appear when a connected meter reports power."
                                        icon={ActivityIcon}
                                        title="Waiting for a live reading"
                                    />
                                ) : (
                                    <div className="space-y-5">
                                        <div>
                                            <p className="text-muted-foreground text-xs uppercase tracking-wider">
                                                Right now
                                            </p>
                                            <p className="mt-1 font-heading font-semibold text-3xl tracking-tight">
                                                {formatPower(
                                                    summary.currentPower
                                                )}
                                            </p>
                                        </div>
                                        <ChartContainer
                                            className="aspect-auto h-64 w-full min-w-0"
                                            config={liveChartConfig}
                                        >
                                            <AreaChart
                                                accessibilityLayer
                                                data={samples}
                                                margin={{
                                                    left: 0,
                                                    right: 8,
                                                    top: 8,
                                                }}
                                            >
                                                <defs>
                                                    <linearGradient
                                                        id="energy-live-fill"
                                                        x1="0"
                                                        x2="0"
                                                        y1="0"
                                                        y2="1"
                                                    >
                                                        <stop
                                                            offset="5%"
                                                            stopColor="var(--color-watts)"
                                                            stopOpacity={0.35}
                                                        />
                                                        <stop
                                                            offset="95%"
                                                            stopColor="var(--color-watts)"
                                                            stopOpacity={0.02}
                                                        />
                                                    </linearGradient>
                                                </defs>
                                                <CartesianGrid
                                                    vertical={false}
                                                />
                                                <XAxis
                                                    axisLine={false}
                                                    dataKey="timestamp"
                                                    domain={[
                                                        'dataMin',
                                                        'dataMax',
                                                    ]}
                                                    minTickGap={32}
                                                    scale="time"
                                                    tickFormatter={formatTime}
                                                    tickLine={false}
                                                    tickMargin={10}
                                                    type="number"
                                                />
                                                <YAxis
                                                    axisLine={false}
                                                    tickFormatter={
                                                        formatAxisPower
                                                    }
                                                    tickLine={false}
                                                    width={42}
                                                />
                                                <ChartTooltip
                                                    content={
                                                        <ChartTooltipContent
                                                            indicator="line"
                                                            labelFormatter={(
                                                                value
                                                            ) =>
                                                                formatFullTime(
                                                                    Number(
                                                                        value
                                                                    )
                                                                )
                                                            }
                                                        />
                                                    }
                                                    cursor={false}
                                                />
                                                <Area
                                                    activeDot={{ r: 4 }}
                                                    dataKey="watts"
                                                    dot={
                                                        samples.length < 3
                                                            ? { r: 3 }
                                                            : false
                                                    }
                                                    fill="url(#energy-live-fill)"
                                                    fillOpacity={1}
                                                    stroke="var(--color-watts)"
                                                    strokeWidth={2}
                                                    type="monotone"
                                                />
                                            </AreaChart>
                                        </ChartContainer>
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        <Card className="min-w-0">
                            <CardHeader>
                                <CardTitle>Where power is going</CardTitle>
                                <CardDescription>
                                    Live draw by reporting device and outlet.
                                </CardDescription>
                                <CardAction>
                                    <Badge variant="outline">
                                        {summary.breakdown.length}{' '}
                                        {summary.breakdown.length === 1
                                            ? 'load'
                                            : 'loads'}
                                    </Badge>
                                </CardAction>
                            </CardHeader>
                            <CardContent>
                                {summary.breakdown.length === 0 ? (
                                    <ChartEmpty
                                        description="Connected energy meters have not reported current wattage yet."
                                        icon={GaugeIcon}
                                        title="No active loads"
                                    />
                                ) : (
                                    <div className="space-y-3">
                                        <ChartContainer
                                            className="aspect-auto min-h-64 w-full min-w-0"
                                            config={breakdownChartConfig}
                                            style={{
                                                height: Math.max(
                                                    256,
                                                    summary.chartBreakdown
                                                        .length * 48
                                                ),
                                            }}
                                        >
                                            <BarChart
                                                accessibilityLayer
                                                data={summary.chartBreakdown}
                                                layout="vertical"
                                                margin={{
                                                    left: 4,
                                                    right: 8,
                                                }}
                                            >
                                                <CartesianGrid
                                                    horizontal={false}
                                                />
                                                <XAxis
                                                    axisLine={false}
                                                    tickFormatter={
                                                        formatAxisPower
                                                    }
                                                    tickLine={false}
                                                    type="number"
                                                />
                                                <YAxis
                                                    axisLine={false}
                                                    dataKey="name"
                                                    tickFormatter={
                                                        truncateSourceName
                                                    }
                                                    tickLine={false}
                                                    type="category"
                                                    width={104}
                                                />
                                                <ChartTooltip
                                                    content={
                                                        <ChartTooltipContent />
                                                    }
                                                    cursor={{
                                                        fill: 'var(--muted)',
                                                        opacity: 0.45,
                                                    }}
                                                />
                                                <Bar
                                                    barSize={20}
                                                    dataKey="watts"
                                                    radius={[0, 6, 6, 0]}
                                                >
                                                    {summary.chartBreakdown.map(
                                                        (source, index) => (
                                                            <Cell
                                                                fill={
                                                                    sourceColors[
                                                                        index %
                                                                            sourceColors.length
                                                                    ]
                                                                }
                                                                key={source.id}
                                                            />
                                                        )
                                                    )}
                                                </Bar>
                                            </BarChart>
                                        </ChartContainer>
                                        <p className="text-muted-foreground text-xs leading-relaxed">
                                            Outlet and strip totals can vary
                                            slightly when their reports arrive
                                            at different times.
                                        </p>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>

                    <MeteredDevicesCard devices={summary.meteredDevices} />

                    <Card className="border-dashed bg-muted/20 shadow-none">
                        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center">
                            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                <HistoryIcon className="size-5" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="font-heading font-medium">
                                    Daily and monthly history is not recorded
                                    yet
                                </p>
                                <p className="mt-1 text-muted-foreground text-sm leading-relaxed">
                                    Future history and cost estimates will stay
                                    on your controller. This view does not send
                                    energy telemetry to the cloud.
                                </p>
                            </div>
                            <Badge className="shrink-0" variant="outline">
                                Local storage required
                            </Badge>
                        </CardContent>
                    </Card>
                </>
            )}
        </EnergyPageFrame>
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
                description="See live demand, find the devices using the most power, and review every available meter in your home."
                eyebrow="Energy management"
                title="Energy"
            />
            {children}
        </div>
    )
}

function EnergyMetricCard({
    label,
    value,
    detail,
    icon: Icon,
}: {
    label: string
    value: string
    detail: string
    icon: typeof ZapIcon
}) {
    return (
        <Card size="sm">
            <CardContent className="flex min-w-0 items-start justify-between gap-4">
                <div className="min-w-0">
                    <p className="text-muted-foreground text-xs">{label}</p>
                    <p
                        className="mt-1 truncate font-heading font-semibold text-2xl tracking-tight"
                        title={value}
                    >
                        {value}
                    </p>
                    <p className="mt-1 truncate text-muted-foreground text-xs">
                        {detail}
                    </p>
                </div>
                <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="size-4" />
                </div>
            </CardContent>
        </Card>
    )
}

function MeteredDevicesCard({ devices }: { devices: MeteredDevice[] }) {
    return (
        <Card>
            <CardHeader className="border-b">
                <CardTitle>Monitored devices</CardTitle>
                <CardDescription>
                    The latest electrical readings available from your
                    controller.
                </CardDescription>
                <CardAction>
                    <Badge variant="outline">
                        {devices.length}{' '}
                        {devices.length === 1 ? 'meter' : 'meters'}
                    </Badge>
                </CardAction>
            </CardHeader>
            <CardContent className="divide-y p-0">
                {devices.map(
                    ({ device, power, energy, outletReadingCount }) => {
                        const electrical = formatElectrical(device)

                        return (
                            <Link
                                className="group flex flex-col gap-4 px-6 py-4 transition-colors hover:bg-muted/40 sm:flex-row sm:items-center"
                                href={`/devices/${encodeURIComponent(device.id)}`}
                                key={device.id}
                            >
                                <div className="flex min-w-0 flex-1 items-center gap-3">
                                    <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary">
                                        <DeviceIcon
                                            category={device.category}
                                        />
                                    </div>
                                    <div className="min-w-0">
                                        <div className="flex min-w-0 items-center gap-2">
                                            <p className="truncate font-heading font-medium">
                                                {device.name}
                                            </p>
                                            <span
                                                aria-hidden="true"
                                                className={`size-1.5 shrink-0 rounded-full ${
                                                    device.online
                                                        ? 'bg-primary'
                                                        : 'bg-muted-foreground/40'
                                                }`}
                                            />
                                        </div>
                                        <p className="truncate text-muted-foreground text-xs">
                                            {getCategoryLabel(device.category)}
                                            {device.online
                                                ? ' · Online'
                                                : ' · Offline'}
                                            {outletReadingCount > 0
                                                ? ` · ${outletReadingCount} outlet ${
                                                      outletReadingCount === 1
                                                          ? 'meter'
                                                          : 'meters'
                                                  }`
                                                : ''}
                                        </p>
                                    </div>
                                </div>
                                <div className="grid grid-cols-3 gap-5 sm:w-[25rem] sm:shrink-0">
                                    <Reading
                                        label={
                                            device.online
                                                ? 'Power'
                                                : 'Last power'
                                        }
                                        value={
                                            power === undefined
                                                ? '—'
                                                : formatPower(power)
                                        }
                                    />
                                    <Reading
                                        label="Energy"
                                        value={
                                            energy === undefined
                                                ? '—'
                                                : formatEnergy(energy)
                                        }
                                    />
                                    <Reading
                                        label="Electrical"
                                        value={electrical}
                                    />
                                </div>
                                <ArrowUpRightIcon className="group-hover:-translate-y-0.5 hidden size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 sm:block" />
                            </Link>
                        )
                    }
                )}
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
    icon: Icon,
}: {
    title: string
    description: string
    icon: typeof ActivityIcon
}) {
    return (
        <div className="flex min-h-80 flex-col items-center justify-center px-6 text-center">
            <div className="flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <Icon className="size-5" />
            </div>
            <p className="mt-4 font-heading font-medium">{title}</p>
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
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {Array.from({ length: 4 }).map((_, index) => (
                    <Skeleton className="h-28" key={index} />
                ))}
            </div>
            <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(22rem,2fr)]">
                <Skeleton className="h-[26rem]" />
                <Skeleton className="h-[26rem]" />
            </div>
        </div>
    )
}

function buildEnergySummary(devices: PresentedDevice[]): EnergySummary {
    const meteredDevices = devices
        .filter(hasEnergyData)
        .map((device) => ({
            device,
            power: getDevicePower(device),
            energy: getDeviceEnergy(device),
            outletReadingCount:
                device.outlets?.filter(
                    (outlet) =>
                        isReading(outlet.power) || isReading(outlet.energy)
                ).length ?? 0,
        }))
        .sort((a, b) => {
            const aPower = a.device.online ? (a.power ?? -1) : -1
            const bPower = b.device.online ? (b.power ?? -1) : -1
            return bPower - aPower || a.device.name.localeCompare(b.device.name)
        })

    const reportingDevices = meteredDevices.filter(
        ({ device, power }) => device.online && power !== undefined
    )
    const breakdown = buildBreakdown(reportingDevices)
    const energyReadings = meteredDevices
        .map(({ energy }) => energy)
        .filter(isReading)

    return {
        meteredDevices,
        breakdown,
        chartBreakdown: groupChartSources(breakdown),
        currentPower:
            reportingDevices.length === 0
                ? undefined
                : reportingDevices.reduce(
                      (total, { power }) => total + (power ?? 0),
                      0
                  ),
        cumulativeEnergy:
            energyReadings.length === 0
                ? undefined
                : energyReadings.reduce((total, energy) => total + energy, 0),
        reportingCount: reportingDevices.length,
    }
}

function buildBreakdown(devices: MeteredDevice[]): BreakdownSource[] {
    const sources: BreakdownSource[] = []

    for (const { device, power } of devices) {
        const outletReadings =
            device.outlets?.filter((outlet) => isReading(outlet.power)) ?? []

        if (outletReadings.length === 0) {
            sources.push({
                id: device.id,
                name: device.name,
                detail: getCategoryLabel(device.category),
                watts: power ?? 0,
            })
            continue
        }

        let outletTotal = 0
        for (const outlet of outletReadings) {
            const watts = outlet.power ?? 0
            outletTotal += watts
            sources.push({
                id: `${device.id}:${outlet.id}`,
                name: outlet.name,
                detail: device.name,
                watts,
            })
        }

        if (isReading(device.power)) {
            const remainder = device.power - outletTotal
            if (remainder > Math.max(1, device.power * 0.02)) {
                sources.push({
                    id: `${device.id}:other`,
                    name: `Other on ${device.name}`,
                    detail: device.name,
                    watts: remainder,
                })
            }
        }
    }

    return sources.sort(
        (a, b) => b.watts - a.watts || a.name.localeCompare(b.name)
    )
}

function groupChartSources(sources: BreakdownSource[]): BreakdownSource[] {
    if (sources.length <= 6) return sources

    const visible = sources.slice(0, 5)
    const remaining = sources.slice(5)
    return [
        ...visible,
        {
            id: 'other-loads',
            name: `${remaining.length} other loads`,
            detail: 'Combined',
            watts: remaining.reduce((total, source) => total + source.watts, 0),
        },
    ]
}

function hasEnergyData(device: PresentedDevice): boolean {
    return (
        isReading(device.power) ||
        isReading(device.energy) ||
        isReading(device.voltage) ||
        isReading(device.current) ||
        (device.outlets?.some(
            (outlet) => isReading(outlet.power) || isReading(outlet.energy)
        ) ??
            false)
    )
}

function getDevicePower(device: PresentedDevice): number | undefined {
    if (isReading(device.power)) return device.power

    const outletReadings =
        device.outlets?.map((outlet) => outlet.power).filter(isReading) ?? []
    if (outletReadings.length === 0) return undefined
    return outletReadings.reduce((total, reading) => total + reading, 0)
}

function getDeviceEnergy(device: PresentedDevice): number | undefined {
    if (isReading(device.energy)) return device.energy

    const outletReadings =
        device.outlets?.map((outlet) => outlet.energy).filter(isReading) ?? []
    if (outletReadings.length === 0) return undefined
    return outletReadings.reduce((total, reading) => total + reading, 0)
}

function isReading(value: number | undefined): value is number {
    return value !== undefined && Number.isFinite(value) && value >= 0
}

function usePowerSamples(power: number | undefined): PowerSample[] {
    const [samples, setSamples] = useState<PowerSample[]>([])

    useEffect(() => {
        if (power === undefined) {
            setSamples((current) => (current.length === 0 ? current : []))
            return
        }

        const recordSample = () => {
            const timestamp = Date.now()
            setSamples((current) => {
                const latest = current.at(-1)
                if (
                    latest &&
                    latest.watts === power &&
                    timestamp - latest.timestamp < 1_000
                ) {
                    return current
                }
                return [...current, { timestamp, watts: power }].slice(-120)
            })
        }

        recordSample()
        const timer = window.setInterval(recordSample, 15_000)
        return () => window.clearInterval(timer)
    }, [power])

    return samples
}

function formatElectrical(device: PresentedDevice): string {
    const readings: string[] = []
    if (isReading(device.voltage)) {
        readings.push(`${formatDecimal(device.voltage)} V`)
    }
    if (isReading(device.current)) {
        readings.push(`${formatDecimal(device.current)} A`)
    }
    return readings.length === 0 ? '—' : readings.join(' · ')
}

function formatDecimal(value: number): string {
    return new Intl.NumberFormat('en', {
        maximumFractionDigits: value >= 10 ? 0 : 2,
    }).format(value)
}

function formatAxisPower(value: number): string {
    if (value >= 1_000) {
        return `${new Intl.NumberFormat('en', {
            maximumFractionDigits: 1,
        }).format(value / 1_000)}k`
    }
    return new Intl.NumberFormat('en', {
        maximumFractionDigits: 0,
    }).format(value)
}

function formatTime(timestamp: number): string {
    return new Intl.DateTimeFormat('en', {
        hour: 'numeric',
        minute: '2-digit',
    }).format(timestamp)
}

function formatFullTime(timestamp: number): string {
    return new Intl.DateTimeFormat('en', {
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
    }).format(timestamp)
}

function truncateSourceName(name: string): string {
    return name.length > 16 ? `${name.slice(0, 15)}…` : name
}
