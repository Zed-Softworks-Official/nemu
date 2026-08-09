'use client'

import { useController, useDevices } from '@nemu/controller'
import type { Room } from '@nemu/protocol'
import { Badge } from '@nemu/ui/components/badge'
import { Button } from '@nemu/ui/components/button'
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
    ArrowRightIcon,
    CircleGaugeIcon,
    HousePlugIcon,
    PlusIcon,
    RadioTowerIcon,
    RefreshCwIcon,
    ServerOffIcon,
    TriangleAlertIcon,
} from 'lucide-react'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { presentDevice } from '~/lib/device-presentation'
import { DeviceCard } from './device-card'
import { PageHeader } from './page-header'
import { StatCard } from './stat-card'

export function HomeDashboard() {
    const { devices, error, refresh, status } = useDevices()
    const { getRooms, reprobe } = useController()
    const [rooms, setRooms] = useState<Room[]>([])
    const [roomsError, setRoomsError] = useState<Error | null>(null)

    useEffect(() => {
        if (status.mode !== 'lan') {
            setRooms([])
            setRoomsError(null)
            return
        }

        let cancelled = false
        void getRooms()
            .then((next) => {
                if (!cancelled) {
                    setRooms(next)
                    setRoomsError(null)
                }
            })
            .catch((nextError) => {
                if (!cancelled) {
                    setRooms([])
                    setRoomsError(
                        nextError instanceof Error
                            ? nextError
                            : new Error(String(nextError))
                    )
                }
            })

        return () => {
            cancelled = true
        }
    }, [getRooms, status.mode])

    const presentedDevices = useMemo(
        () => devices?.map(presentDevice) ?? [],
        [devices]
    )

    const onlineDevices = presentedDevices.filter((device) => device.online)
    const activeDevices = presentedDevices.filter(
        (device) => device.online && device.enabled
    )

    const roomSections = useMemo(() => {
        if (rooms.length === 0) {
            return [
                {
                    id: 'all',
                    name: 'Devices',
                    devices: presentedDevices.slice(0, 12),
                },
            ]
        }

        const roomIds = new Set(rooms.map((room) => room.id))
        const sortedRooms = [...rooms].sort(
            (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
        )
        const sections = sortedRooms.map((room) => ({
            id: room.id,
            name: room.name,
            devices: presentedDevices
                .filter((device) => device.roomId === room.id)
                .slice(0, 6),
        }))
        const unassigned = presentedDevices.filter(
            (device) => !device.roomId || !roomIds.has(device.roomId)
        )
        if (unassigned.length > 0) {
            sections.push({
                id: 'unassigned',
                name: 'Unassigned',
                devices: unassigned.slice(0, 6),
            })
        }
        return sections.filter((section) => section.devices.length > 0)
    }, [presentedDevices, rooms])

    const greeting = getGreeting()
    const connectionLabel =
        status.mode === 'lan'
            ? 'Home'
            : status.mode === 'relay'
              ? 'Remote'
              : status.mode === 'probing'
                ? 'Connecting'
                : 'Offline'

    if (!devices && error) {
        return (
            <div className="mx-auto flex w-full max-w-7xl flex-col gap-8">
                <PageHeader
                    description="Nemu could not load devices from your controller."
                    title={greeting}
                />
                <Empty className="rounded-xl border">
                    <EmptyHeader>
                        <EmptyMedia variant="icon">
                            <TriangleAlertIcon />
                        </EmptyMedia>
                        <EmptyTitle>Unable to load home</EmptyTitle>
                        <EmptyDescription>{error.message}</EmptyDescription>
                    </EmptyHeader>
                    <EmptyContent>
                        <Button
                            onClick={() => void refresh()}
                            size="sm"
                            variant="outline"
                        >
                            <RefreshCwIcon data-icon="inline-start" />
                            Try again
                        </Button>
                    </EmptyContent>
                </Empty>
            </div>
        )
    }

    if (!devices && status.mode === 'offline') {
        return (
            <div className="mx-auto flex w-full max-w-7xl flex-col gap-8">
                <PageHeader
                    description="Connect to your Nemu controller to control devices."
                    title={greeting}
                />
                <Empty className="rounded-xl border">
                    <EmptyHeader>
                        <EmptyMedia variant="icon">
                            <ServerOffIcon />
                        </EmptyMedia>
                        <EmptyTitle>Controller offline</EmptyTitle>
                        <EmptyDescription>
                            Quick control needs a Home or Remote connection.
                        </EmptyDescription>
                    </EmptyHeader>
                    <EmptyContent>
                        <Button
                            onClick={() => void reprobe()}
                            size="sm"
                            variant="outline"
                        >
                            <RefreshCwIcon data-icon="inline-start" />
                            Reconnect
                        </Button>
                    </EmptyContent>
                </Empty>
            </div>
        )
    }

    if (!devices) {
        return (
            <div className="mx-auto flex w-full max-w-7xl flex-col gap-8">
                <div className="space-y-3">
                    <Skeleton className="h-8 w-48" />
                    <Skeleton className="h-4 w-72 max-w-full" />
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                    <Skeleton className="h-28" />
                    <Skeleton className="h-28" />
                    <Skeleton className="h-28" />
                </div>
                <Skeleton className="h-64" />
            </div>
        )
    }

    return (
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-8">
            <PageHeader
                actions={
                    <Button asChild>
                        <Link href="/devices/add">
                            <PlusIcon data-icon="inline-start" />
                            Add device
                        </Link>
                    </Button>
                }
                description={
                    status.mode === 'lan'
                        ? 'Your home is connected and responding locally.'
                        : status.mode === 'relay'
                          ? 'Controlling your home over the remote relay.'
                          : 'Waiting for a controller connection.'
                }
                eyebrow={formatToday()}
                title={greeting}
            />

            <div className="grid gap-3 sm:grid-cols-3">
                <StatCard
                    detail={`${presentedDevices.length - onlineDevices.length} needs attention`}
                    icon={HousePlugIcon}
                    label="Devices online"
                    value={`${onlineDevices.length} / ${presentedDevices.length}`}
                />
                <StatCard
                    detail={`Across ${rooms.length || 'no'} room${rooms.length === 1 ? '' : 's'}`}
                    icon={CircleGaugeIcon}
                    label="Currently active"
                    value={String(activeDevices.length)}
                />
                <StatCard
                    detail={status.label}
                    icon={RadioTowerIcon}
                    label="Connection"
                    value={connectionLabel}
                />
            </div>

            {roomsError ? (
                <p className="text-muted-foreground text-sm">
                    Rooms could not be loaded. Showing unassigned devices only.
                </p>
            ) : null}

            <section className="space-y-5">
                <div className="flex items-center justify-between gap-4">
                    <div>
                        <h2 className="font-heading font-semibold text-lg">
                            Your rooms
                        </h2>
                        <p className="text-muted-foreground text-sm">
                            Quick control for the devices you use most.
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <Button asChild size="sm" variant="ghost">
                            <Link href="/rooms">Manage rooms</Link>
                        </Button>
                        <Button asChild size="sm" variant="ghost">
                            <Link href="/devices">
                                View all
                                <ArrowRightIcon data-icon="inline-end" />
                            </Link>
                        </Button>
                    </div>
                </div>

                {presentedDevices.length === 0 ? (
                    <Empty className="rounded-xl border border-dashed">
                        <EmptyHeader>
                            <EmptyTitle>No devices yet</EmptyTitle>
                            <EmptyDescription>
                                Add a Zigbee device to start controlling your
                                home.
                            </EmptyDescription>
                        </EmptyHeader>
                        <EmptyContent>
                            <Button asChild size="sm">
                                <Link href="/devices/add">
                                    <PlusIcon data-icon="inline-start" />
                                    Add device
                                </Link>
                            </Button>
                        </EmptyContent>
                    </Empty>
                ) : (
                    <div className="space-y-8">
                        {roomSections.map((room) => (
                            <div className="space-y-3" key={room.id}>
                                <div className="flex items-center gap-2">
                                    <h3 className="font-heading font-medium">
                                        {room.name}
                                    </h3>
                                    <Badge variant="outline">
                                        {room.devices.length}
                                    </Badge>
                                </div>
                                {room.devices.length === 0 ? (
                                    <p className="text-muted-foreground text-sm">
                                        No devices in this room yet.
                                    </p>
                                ) : (
                                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                                        {room.devices.map((device) => (
                                            <DeviceCard
                                                device={device}
                                                key={device.id}
                                            />
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </div>
    )
}

function getGreeting(): string {
    const hour = new Date().getHours()
    if (hour >= 4 && hour < 12) return 'Good morning'
    if (hour >= 12 && hour < 18) return 'Good afternoon'
    return 'Good evening'
}

function formatToday(): string {
    return new Intl.DateTimeFormat('en', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
    }).format(new Date())
}
