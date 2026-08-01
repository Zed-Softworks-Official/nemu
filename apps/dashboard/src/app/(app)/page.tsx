import { Badge } from '@nemu/ui/components/badge'
import { Button } from '@nemu/ui/components/button'
import {
    ArrowRightIcon,
    CircleGaugeIcon,
    HousePlugIcon,
    PlusIcon,
    RadioTowerIcon,
} from 'lucide-react'
import Link from 'next/link'
import { DeviceCard } from '~/components/dashboard/device-card'
import { PageHeader } from '~/components/dashboard/page-header'
import { StatCard } from '~/components/dashboard/stat-card'
import { devices, rooms } from '~/lib/dashboard-data'

export default function DashboardPage() {
    const onlineDevices = devices.filter((device) => device.online).length
    const activeDevices = devices.filter((device) => device.enabled).length

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
                description="Your home is connected and responding locally."
                eyebrow="Sunday, July 19"
                title="Good afternoon"
            />

            <div className="grid gap-3 sm:grid-cols-3">
                <StatCard
                    detail={`${devices.length - onlineDevices} needs attention`}
                    icon={HousePlugIcon}
                    label="Devices online"
                    value={`${onlineDevices} / ${devices.length}`}
                />
                <StatCard
                    detail="Across 3 rooms"
                    icon={CircleGaugeIcon}
                    label="Currently active"
                    value={String(activeDevices)}
                />
                <StatCard
                    detail="Direct to nemu.local"
                    icon={RadioTowerIcon}
                    label="Connection"
                    value="Home"
                />
            </div>

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
                    <Button asChild size="sm" variant="ghost">
                        <Link href="/devices">
                            View all
                            <ArrowRightIcon data-icon="inline-end" />
                        </Link>
                    </Button>
                </div>

                <div className="space-y-8">
                    {rooms.map((room) => {
                        const roomDevices = devices
                            .filter((device) => device.roomId === room.id)
                            .slice(0, 3)

                        return (
                            <div className="space-y-3" key={room.id}>
                                <div className="flex items-center gap-2">
                                    <h3 className="font-heading font-medium">
                                        {room.name}
                                    </h3>
                                    <Badge variant="outline">
                                        {roomDevices.length}
                                    </Badge>
                                    <span className="hidden text-muted-foreground text-xs sm:inline">
                                        {room.description}
                                    </span>
                                </div>
                                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                                    {roomDevices.map((device) => (
                                        <DeviceCard
                                            device={device}
                                            key={device.id}
                                        />
                                    ))}
                                </div>
                            </div>
                        )
                    })}
                </div>
            </section>
        </div>
    )
}
