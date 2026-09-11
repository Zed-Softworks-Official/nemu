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
    GaugeIcon,
    HistoryIcon,
    RefreshCwIcon,
    ServerOffIcon,
    ShieldCheckIcon,
    TriangleAlertIcon,
} from 'lucide-react'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { getCategoryLabel, presentDevice } from '~/lib/device-presentation'
import {
    appendPowerSample,
    buildMeterReadings,
    formatEnergy,
    formatPower,
    isLivePowerReading,
    type LivePowerReading,
    type MeterReading,
    type PowerSample,
    type PowerSession,
} from '~/lib/energy-presentation'
import { DeviceIcon } from './device-icon'
import { PageHeader } from './page-header'

const liveChartConfig = {
    watts: {
        label: 'Power (W)',
        color: 'var(--chart-2)',
    },
} satisfies ChartConfig

export function EnergyDashboard() {
    const { devices, error, refresh, status } = useDevices()
    const { reprobe } = useController()
    const presentedDevices = useMemo(
        () => devices?.map(presentDevice) ?? [],
        [devices]
    )
    const meterReadings = useMemo(
        () => buildMeterReadings(presentedDevices),
        [presentedDevices]
    )
    const livePowerReadings = useMemo(
        () => meterReadings.filter(isLivePowerReading),
        [meterReadings]
    )
    const [selectedPowerReadingId, setSelectedPowerReadingId] = useState<
        string | undefined
    >()
    const selectedPowerReading =
        livePowerReadings.find(
            (reading) => reading.id === selectedPowerReadingId
        ) ?? livePowerReadings[0]
    const samples = usePowerSamples(selectedPowerReading)

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

            {meterReadings.length === 0 ? (
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
                <>
                    <Card className="border-dashed bg-muted/20 shadow-none">
                        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center">
                            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                <GaugeIcon className="size-5" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="font-heading font-medium">
                                    Home totals are not shown
                                </p>
                                <p className="mt-1 text-muted-foreground text-sm leading-relaxed">
                                    Nemu has no designated Home meter, so it
                                    keeps every Device and Component reading
                                    separate instead of adding them together.
                                </p>
                            </div>
                            <Badge className="shrink-0" variant="outline">
                                Individual readings only
                            </Badge>
                        </CardContent>
                    </Card>

                    <Card className="min-w-0">
                        <CardHeader>
                            <CardTitle>Session power</CardTitle>
                            <CardDescription>
                                One meter at a time. Reloading or leaving this
                                page clears the chart.
                            </CardDescription>
                            <CardAction className="flex items-center gap-2">
                                {livePowerReadings.length > 1 ? (
                                    <select
                                        aria-label="Power meter"
                                        className="h-8 max-w-52 rounded-md border border-input bg-background px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                                        onChange={(event) =>
                                            setSelectedPowerReadingId(
                                                event.currentTarget.value
                                            )
                                        }
                                        value={selectedPowerReading?.id ?? ''}
                                    >
                                        {livePowerReadings.map((reading) => (
                                            <option
                                                key={reading.id}
                                                value={reading.id}
                                            >
                                                {formatMeterName(reading)}
                                            </option>
                                        ))}
                                    </select>
                                ) : null}
                                <Badge variant="soft">Session only</Badge>
                            </CardAction>
                        </CardHeader>
                        <CardContent>
                            {selectedPowerReading === undefined ? (
                                <ChartEmpty
                                    description="The chart starts when an online meter reports power."
                                    icon={ActivityIcon}
                                    title="Waiting for a live reading"
                                />
                            ) : (
                                <div className="space-y-5">
                                    <div>
                                        <p className="text-muted-foreground text-xs uppercase tracking-wider">
                                            {selectedPowerReading.name}
                                        </p>
                                        <p className="mt-1 font-heading font-semibold text-3xl tracking-tight">
                                            {formatPower(
                                                selectedPowerReading.power
                                            )}
                                        </p>
                                        <p className="mt-1 text-muted-foreground text-xs">
                                            {formatMeterDetail(
                                                selectedPowerReading
                                            )}
                                        </p>
                                    </div>
                                    <ChartContainer
                                        className="aspect-auto h-64 w-full min-w-0"
                                        config={liveChartConfig}
                                        key={selectedPowerReading.id}
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
                                            <CartesianGrid vertical={false} />
                                            <XAxis
                                                axisLine={false}
                                                dataKey="timestamp"
                                                domain={['dataMin', 'dataMax']}
                                                minTickGap={32}
                                                scale="time"
                                                tickFormatter={formatTime}
                                                tickLine={false}
                                                tickMargin={10}
                                                type="number"
                                            />
                                            <YAxis
                                                axisLine={false}
                                                tickFormatter={formatAxisPower}
                                                tickLine={false}
                                                width={42}
                                            />
                                            <ChartTooltip
                                                content={
                                                    <ChartTooltipContent
                                                        indicator="line"
                                                        labelFormatter={(
                                                            _,
                                                            payload
                                                        ) =>
                                                            formatFullTime(
                                                                payload[0]
                                                                    ?.payload
                                                                    ?.timestamp
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

                    <MeterReadingsCard readings={meterReadings} />

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
                                    When History lands, daily and monthly
                                    readings will stay on your controller. This
                                    view does not send energy telemetry to the
                                    cloud.
                                </p>
                            </div>
                            <Badge className="shrink-0" variant="outline">
                                Not recorded yet
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
                description="Review each Device and Component meter separately. Home totals require a designated Home meter."
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
                                    {formatMeterDetail(reading)} ·{' '}
                                    {reading.online ? 'Online' : 'Offline'}
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
            <Skeleton className="h-24" />
            <Skeleton className="h-[26rem]" />
            <Skeleton className="h-64" />
        </div>
    )
}

function usePowerSamples(reading: LivePowerReading | undefined): PowerSample[] {
    const [session, setSession] = useState<PowerSession>()
    const readingId = reading?.id
    const power = reading?.power

    useEffect(() => {
        if (readingId === undefined || power === undefined) {
            setSession(undefined)
            return
        }

        const recordSample = () => {
            setSession((session) =>
                appendPowerSample({
                    session,
                    sourceId: readingId,
                    watts: power,
                    timestamp: Date.now(),
                })
            )
        }

        recordSample()
        const timer = window.setInterval(recordSample, 15_000)
        return () => window.clearInterval(timer)
    }, [power, readingId])

    if (session === undefined || session.sourceId !== readingId) return []
    return session.samples
}

function formatMeterName(reading: MeterReading): string {
    return reading.scope === 'Component'
        ? `${reading.name} · ${reading.device.name}`
        : reading.name
}

function formatMeterDetail(reading: MeterReading): string {
    return reading.scope === 'Device'
        ? getCategoryLabel(reading.device.category)
        : reading.device.name
}

function formatAxisPower(value: number): string {
    if (Math.abs(value) >= 1_000) {
        return `${new Intl.NumberFormat('en', {
            maximumFractionDigits: 1,
        }).format(value / 1_000)}k`
    }
    return new Intl.NumberFormat('en', {
        maximumFractionDigits: 0,
    }).format(value)
}

function formatTime(timestamp: number): string {
    if (!Number.isFinite(timestamp)) return ''

    return new Intl.DateTimeFormat('en', {
        hour: 'numeric',
        minute: '2-digit',
    }).format(timestamp)
}

function formatFullTime(timestamp: unknown): string {
    if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) {
        return 'Latest reading'
    }

    return new Intl.DateTimeFormat('en', {
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
    }).format(timestamp)
}
