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
import { Separator } from '@nemu/ui/components/separator'
import { Switch } from '@nemu/ui/components/switch'
import {
    BatteryMediumIcon,
    Clock3Icon,
    MoreHorizontalIcon,
    PencilIcon,
    RadioTowerIcon,
} from 'lucide-react'
import { notFound } from 'next/navigation'
import { DeviceIcon } from '~/components/dashboard/device-icon'
import { PageHeader } from '~/components/dashboard/page-header'
import { getDevice, getRoom } from '~/lib/dashboard-data'

export default async function DeviceDetailPage({
    params,
}: {
    params: Promise<{ id: string }>
}) {
    const { id } = await params
    const device = getDevice(id)

    if (!device) {
        notFound()
    }

    const room = getRoom(device.roomId)

    return (
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
            <PageHeader
                actions={
                    <>
                        <Button size="sm" variant="outline">
                            <PencilIcon data-icon="inline-start" />
                            Edit
                        </Button>
                        <Button
                            aria-label="More actions"
                            size="icon-sm"
                            variant="ghost"
                        >
                            <MoreHorizontalIcon />
                        </Button>
                    </>
                }
                description={`${device.type} · ${room?.name ?? 'Unassigned'}`}
                title={device.name}
            />

            <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(16rem,0.65fr)]">
                <div className="space-y-5">
                    <Card>
                        <CardHeader>
                            <div className="mb-4 flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                                <DeviceIcon
                                    category={device.category}
                                    className="size-6"
                                />
                            </div>
                            <CardTitle>Device control</CardTitle>
                            <CardDescription>{device.summary}</CardDescription>
                            <CardAction>
                                <Switch
                                    aria-label={`Toggle ${device.name}`}
                                    defaultChecked={device.enabled}
                                    disabled={!device.online}
                                />
                            </CardAction>
                        </CardHeader>
                        <CardContent className="space-y-5">
                            {device.level !== undefined ? (
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="font-medium">
                                            Brightness
                                        </span>
                                        <span className="text-muted-foreground">
                                            {device.level}%
                                        </span>
                                    </div>
                                    <progress
                                        aria-label={`Brightness ${device.level}%`}
                                        className="h-1.5 w-full overflow-hidden rounded-full bg-muted [&::-moz-progress-bar]:bg-primary [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:bg-primary"
                                        max={100}
                                        value={device.level}
                                    />
                                </div>
                            ) : (
                                <div className="rounded-lg bg-muted/50 p-4">
                                    <p className="font-medium text-sm">
                                        Live readings
                                    </p>
                                    <p className="mt-1 text-muted-foreground text-sm">
                                        {device.summary}
                                    </p>
                                </div>
                            )}
                            <Separator />
                            <div className="flex flex-wrap gap-2">
                                <Button size="sm" variant="secondary">
                                    25%
                                </Button>
                                <Button size="sm" variant="secondary">
                                    50%
                                </Button>
                                <Button size="sm" variant="secondary">
                                    100%
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Recent activity</CardTitle>
                            <CardDescription>
                                A preview of the local event history for this
                                device.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <ActivityRow
                                detail="Today at 3:02 PM"
                                label="State updated"
                            />
                            <Separator />
                            <ActivityRow
                                detail="Today at 2:47 PM"
                                label={
                                    device.enabled ? 'Turned on' : 'Turned off'
                                }
                            />
                            <Separator />
                            <ActivityRow
                                detail="Today at 11:18 AM"
                                label="Seen on network"
                            />
                        </CardContent>
                    </Card>
                </div>

                <div className="space-y-5">
                    <Card>
                        <CardHeader>
                            <CardTitle>Status</CardTitle>
                            <CardAction>
                                <Badge
                                    variant={
                                        device.online ? 'soft' : 'secondary'
                                    }
                                >
                                    {device.online ? 'Online' : 'Offline'}
                                </Badge>
                            </CardAction>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <MetadataRow
                                label="Room"
                                value={room?.name ?? 'Unassigned'}
                            />
                            <MetadataRow label="Type" value={device.type} />
                            <MetadataRow
                                label="Manufacturer"
                                value={device.manufacturer}
                            />
                            <MetadataRow
                                label="Model"
                                value={device.model ?? 'Unknown'}
                            />
                            <MetadataRow
                                label="Last seen"
                                value={device.lastSeen}
                            />
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Network</CardTitle>
                            <CardDescription>
                                Connected directly through your Nemu controller.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3 text-sm">
                            <div className="flex items-center gap-2 text-muted-foreground">
                                <RadioTowerIcon className="size-4" />
                                <span>Zigbee mesh · Strong signal</span>
                            </div>
                            {device.battery ? (
                                <div className="flex items-center gap-2 text-muted-foreground">
                                    <BatteryMediumIcon className="size-4" />
                                    <span>Battery · {device.battery}%</span>
                                </div>
                            ) : null}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    )
}

function MetadataRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground text-sm">{label}</span>
            <span className="text-right font-medium text-sm">{value}</span>
        </div>
    )
}

function ActivityRow({ label, detail }: { label: string; detail: string }) {
    return (
        <div className="flex items-center gap-3">
            <div className="flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <Clock3Icon className="size-4" />
            </div>
            <div>
                <p className="font-medium text-sm">{label}</p>
                <p className="text-muted-foreground text-xs">{detail}</p>
            </div>
        </div>
    )
}
