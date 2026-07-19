'use client'

import { useController, useDevices } from '@nemu/controller'
import { Badge } from '@nemu/ui/components/badge'
import { Button } from '@nemu/ui/components/button'
import { Card, CardContent } from '@nemu/ui/components/card'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@nemu/ui/components/dropdown-menu'
import {
    Empty,
    EmptyContent,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
} from '@nemu/ui/components/empty'
import { Input } from '@nemu/ui/components/input'
import { Skeleton } from '@nemu/ui/components/skeleton'
import {
    ArrowUpRightIcon,
    ListFilterIcon,
    RadioTowerIcon,
    RefreshCwIcon,
    SearchIcon,
    SearchXIcon,
    ServerOffIcon,
    TriangleAlertIcon,
} from 'lucide-react'
import Link from 'next/link'
import { useDeferredValue, useMemo, useState } from 'react'
import {
    type DeviceCategory,
    getCategoryLabel,
    presentDevice,
} from '~/lib/device-presentation'
import { DeviceIcon } from './device-icon'

type StatusFilter = 'all' | 'online' | 'offline'
type CategoryFilter = 'all' | DeviceCategory

const categories: DeviceCategory[] = ['light', 'climate', 'sensor', 'outlet']

export function DevicesList() {
    const { devices, error, refresh, status } = useDevices()
    const { reprobe } = useController()
    const [query, setQuery] = useState('')
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
    const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all')
    const deferredQuery = useDeferredValue(query)

    const presentedDevices = useMemo(
        () => devices?.map(presentDevice),
        [devices]
    )
    const filteredDevices = useMemo(() => {
        const normalizedQuery = deferredQuery.trim().toLowerCase()

        return (presentedDevices ?? []).filter((device) => {
            const matchesSearch =
                normalizedQuery.length === 0 ||
                [device.name, device.type, device.model, device.id].some(
                    (value) => value?.toLowerCase().includes(normalizedQuery)
                )
            const matchesStatus =
                statusFilter === 'all' ||
                device.online === (statusFilter === 'online')
            const matchesCategory =
                categoryFilter === 'all' || device.category === categoryFilter

            return matchesSearch && matchesStatus && matchesCategory
        })
    }, [presentedDevices, deferredQuery, statusFilter, categoryFilter])

    const activeFilterCount =
        Number(statusFilter !== 'all') + Number(categoryFilter !== 'all')
    const hasFilters =
        query.length > 0 || statusFilter !== 'all' || categoryFilter !== 'all'

    function clearFilters() {
        setQuery('')
        setStatusFilter('all')
        setCategoryFilter('all')
    }

    return (
        <div className="space-y-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="relative flex-1">
                    <SearchIcon className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 size-4 text-muted-foreground" />
                    <Input
                        aria-label="Search devices"
                        className="pl-9"
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Search devices"
                        value={query}
                    />
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        onClick={clearFilters}
                        size="sm"
                        variant="secondary"
                    >
                        All devices
                        <Badge className="ml-1" variant="outline">
                            {presentedDevices
                                ? `${filteredDevices.length}/${presentedDevices.length}`
                                : '—'}
                        </Badge>
                    </Button>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button size="sm" variant="ghost">
                                <ListFilterIcon data-icon="inline-start" />
                                Filter
                                {activeFilterCount > 0 ? (
                                    <Badge variant="soft">
                                        {activeFilterCount}
                                    </Badge>
                                ) : null}
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52">
                            <DropdownMenuLabel>Status</DropdownMenuLabel>
                            <DropdownMenuRadioGroup
                                onValueChange={(value) =>
                                    setStatusFilter(value as StatusFilter)
                                }
                                value={statusFilter}
                            >
                                <DropdownMenuRadioItem value="all">
                                    Any status
                                </DropdownMenuRadioItem>
                                <DropdownMenuRadioItem value="online">
                                    Online
                                </DropdownMenuRadioItem>
                                <DropdownMenuRadioItem value="offline">
                                    Offline
                                </DropdownMenuRadioItem>
                            </DropdownMenuRadioGroup>
                            <DropdownMenuSeparator />
                            <DropdownMenuLabel>Type</DropdownMenuLabel>
                            <DropdownMenuRadioGroup
                                onValueChange={(value) =>
                                    setCategoryFilter(value as CategoryFilter)
                                }
                                value={categoryFilter}
                            >
                                <DropdownMenuRadioItem value="all">
                                    Any type
                                </DropdownMenuRadioItem>
                                {categories.map((category) => (
                                    <DropdownMenuRadioItem
                                        key={category}
                                        value={category}
                                    >
                                        {getCategoryLabel(category)}
                                    </DropdownMenuRadioItem>
                                ))}
                            </DropdownMenuRadioGroup>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>

            {status.mode === 'offline' && presentedDevices ? (
                <StatusNotice
                    action="Reconnect"
                    description="Showing the last available device snapshot."
                    icon={ServerOffIcon}
                    onAction={() => void reprobe()}
                    title="Controller is offline"
                />
            ) : null}
            {error && presentedDevices ? (
                <StatusNotice
                    action="Retry"
                    description="The current list may be out of date."
                    icon={TriangleAlertIcon}
                    onAction={() => void refresh()}
                    title="Device refresh failed"
                    variant="error"
                />
            ) : null}

            {renderDeviceContent({
                devices: filteredDevices,
                error,
                hasFilters,
                hasLoaded: presentedDevices !== undefined,
                isEmpty: presentedDevices?.length === 0,
                isOffline: status.mode === 'offline',
                onClearFilters: clearFilters,
                onRefresh: refresh,
                onReprobe: reprobe,
            })}
        </div>
    )
}

function renderDeviceContent({
    devices,
    error,
    hasFilters,
    hasLoaded,
    isEmpty,
    isOffline,
    onClearFilters,
    onRefresh,
    onReprobe,
}: {
    devices: ReturnType<typeof presentDevice>[]
    error: Error | null
    hasFilters: boolean
    hasLoaded: boolean
    isEmpty: boolean
    isOffline: boolean
    onClearFilters: () => void
    onRefresh: () => Promise<void>
    onReprobe: () => Promise<void>
}) {
    if (!hasLoaded && error) {
        return (
            <DeviceState
                action="Try again"
                description="Nemu could not load devices from your controller."
                icon={TriangleAlertIcon}
                onAction={() => void onRefresh()}
                title="Unable to load devices"
            />
        )
    }

    if (!hasLoaded && isOffline) {
        return (
            <DeviceState
                action="Reconnect"
                description="Connect to your Nemu controller to view its devices."
                icon={ServerOffIcon}
                onAction={() => void onReprobe()}
                title="Controller offline"
            />
        )
    }

    if (!hasLoaded) {
        return <DevicesSkeleton />
    }

    if (isEmpty) {
        return (
            <DeviceState
                action="Refresh"
                description="Paired devices will appear here as soon as the controller reports them."
                icon={RadioTowerIcon}
                onAction={() => void onRefresh()}
                title="No devices yet"
            />
        )
    }

    if (devices.length === 0 && hasFilters) {
        return (
            <DeviceState
                action="Clear filters"
                description="Try a different name, status, or device type."
                icon={SearchXIcon}
                onAction={onClearFilters}
                title="No matching devices"
            />
        )
    }

    return <DevicesTable devices={devices} />
}

function DevicesTable({
    devices,
}: {
    devices: ReturnType<typeof presentDevice>[]
}) {
    return (
        <Card className="gap-0 py-0">
            <div className="hidden grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto] gap-4 border-b px-5 py-3 text-muted-foreground text-xs md:grid">
                <span>Device</span>
                <span>Model</span>
                <span>Status</span>
                <span className="sr-only">Open</span>
            </div>
            <CardContent className="divide-y p-0">
                {devices.map((device) => (
                    <div
                        className="grid gap-3 px-4 py-4 transition-colors hover:bg-muted/30 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-center md:gap-4 md:px-5"
                        key={device.id}
                    >
                        <div className="flex min-w-0 items-center gap-3">
                            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                                <DeviceIcon category={device.category} />
                            </div>
                            <div className="min-w-0">
                                <p className="truncate font-medium">
                                    {device.name}
                                </p>
                                <p className="truncate text-muted-foreground text-xs">
                                    {device.type}
                                </p>
                            </div>
                        </div>
                        <p className="truncate text-muted-foreground text-sm">
                            {device.model ?? 'Unknown model'}
                        </p>
                        <div className="flex items-center gap-2">
                            <span
                                className={`size-1.5 rounded-full ${
                                    device.online
                                        ? 'bg-primary'
                                        : 'bg-muted-foreground/50'
                                }`}
                            />
                            <div>
                                <p className="text-sm">{device.summary}</p>
                                <p className="text-muted-foreground text-xs">
                                    {device.lastSeen}
                                </p>
                            </div>
                        </div>
                        <Button asChild size="icon-sm" variant="ghost">
                            <Link
                                aria-label={`Open ${device.name}`}
                                href={`/devices/${device.id}`}
                            >
                                <ArrowUpRightIcon />
                            </Link>
                        </Button>
                    </div>
                ))}
            </CardContent>
        </Card>
    )
}

function DevicesSkeleton() {
    return (
        <Card className="gap-0 py-0">
            <CardContent className="divide-y p-0">
                {Array.from({ length: 5 }, (_, index) => (
                    <div
                        className="grid grid-cols-[auto_1fr] items-center gap-3 px-4 py-4 md:grid-cols-[auto_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto] md:px-5"
                        key={index}
                    >
                        <Skeleton className="size-9" />
                        <div className="space-y-2">
                            <Skeleton className="h-4 w-28" />
                            <Skeleton className="h-3 w-20" />
                        </div>
                        <Skeleton className="hidden h-4 w-24 md:block" />
                        <Skeleton className="hidden h-4 w-32 md:block" />
                        <Skeleton className="hidden size-8 md:block" />
                    </div>
                ))}
            </CardContent>
        </Card>
    )
}

function DeviceState({
    title,
    description,
    action,
    icon: Icon,
    onAction,
}: {
    title: string
    description: string
    action: string
    icon: typeof RadioTowerIcon
    onAction: () => void
}) {
    return (
        <Card>
            <Empty>
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
        </Card>
    )
}

function StatusNotice({
    title,
    description,
    action,
    icon: Icon,
    onAction,
    variant = 'default',
}: {
    title: string
    description: string
    action: string
    icon: typeof RadioTowerIcon
    onAction: () => void
    variant?: 'default' | 'error'
}) {
    return (
        <div
            className={`flex flex-col gap-3 rounded-lg border px-4 py-3 text-sm sm:flex-row sm:items-center ${
                variant === 'error'
                    ? 'border-destructive/20 bg-destructive/5'
                    : 'bg-muted/30'
            }`}
            role={variant === 'error' ? 'alert' : 'status'}
        >
            <Icon
                className={`size-4 shrink-0 ${
                    variant === 'error'
                        ? 'text-destructive'
                        : 'text-muted-foreground'
                }`}
            />
            <div className="min-w-0 flex-1">
                <span className="font-medium">{title}. </span>
                <span className="text-muted-foreground">{description}</span>
            </div>
            <Button onClick={onAction} size="xs" variant="ghost">
                {action}
            </Button>
        </div>
    )
}
