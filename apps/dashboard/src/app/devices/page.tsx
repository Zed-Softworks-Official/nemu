import { Badge } from '@nemu/ui/components/badge'
import { Button } from '@nemu/ui/components/button'
import { Card, CardContent } from '@nemu/ui/components/card'
import { Input } from '@nemu/ui/components/input'
import {
    ArrowUpRightIcon,
    ListFilterIcon,
    PlusIcon,
    SearchIcon,
} from 'lucide-react'
import Link from 'next/link'
import { DeviceIcon } from '~/components/dashboard/device-icon'
import { PageHeader } from '~/components/dashboard/page-header'
import { devices, getRoom } from '~/lib/dashboard-data'

export default function DevicesPage() {
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
                description="View status, organize rooms, and manage every device connected to Nemu."
                title="Devices"
            />

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="relative flex-1">
                    <SearchIcon className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 size-4 text-muted-foreground" />
                    <Input
                        aria-label="Search devices"
                        className="pl-9"
                        placeholder="Search devices"
                    />
                </div>
                <div className="flex items-center gap-2">
                    <Button size="sm" variant="secondary">
                        All devices
                        <Badge className="ml-1" variant="outline">
                            {devices.length}
                        </Badge>
                    </Button>
                    <Button size="sm" variant="ghost">
                        <ListFilterIcon data-icon="inline-start" />
                        Filter
                    </Button>
                </div>
            </div>

            <Card className="gap-0 py-0">
                <div className="hidden grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto] gap-4 border-b px-5 py-3 text-muted-foreground text-xs md:grid">
                    <span>Device</span>
                    <span>Room</span>
                    <span>Status</span>
                    <span className="sr-only">Open</span>
                </div>
                <CardContent className="divide-y p-0">
                    {devices.map((device) => {
                        const room = getRoom(device.roomId)

                        return (
                            <div
                                className="grid gap-3 px-4 py-4 transition-colors hover:bg-muted/30 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-center md:gap-4 md:px-5"
                                key={device.id}
                            >
                                <div className="flex min-w-0 items-center gap-3">
                                    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                                        <DeviceIcon
                                            category={device.category}
                                        />
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
                                <p className="text-muted-foreground text-sm">
                                    {room?.name ?? 'Unassigned'}
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
                                        <p className="text-sm">
                                            {device.online
                                                ? device.summary
                                                : 'Offline'}
                                        </p>
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
                        )
                    })}
                </CardContent>
            </Card>
        </div>
    )
}
