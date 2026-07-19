import { Button } from '@nemu/ui/components/button'
import {
    Card,
    CardAction,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@nemu/ui/components/card'
import { Switch } from '@nemu/ui/components/switch'
import { ArrowUpRightIcon, BatteryMediumIcon } from 'lucide-react'
import Link from 'next/link'
import type { DashboardDevice } from '~/lib/dashboard-data'
import { DeviceIcon } from './device-icon'

export function DeviceCard({ device }: { device: DashboardDevice }) {
    return (
        <Card className="transition-colors hover:ring-foreground/20" size="sm">
            <CardHeader>
                <div className="mb-3 flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground group-hover/card:text-foreground">
                    <DeviceIcon category={device.category} />
                </div>
                <CardTitle>{device.name}</CardTitle>
                <CardDescription>{device.summary}</CardDescription>
                <CardAction>
                    <Switch
                        aria-label={`Toggle ${device.name}`}
                        defaultChecked={device.enabled}
                        disabled={!device.online}
                    />
                </CardAction>
            </CardHeader>
            <CardContent className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2 text-muted-foreground text-xs">
                    <span
                        className={`size-1.5 shrink-0 rounded-full ${
                            device.online
                                ? 'bg-primary'
                                : 'bg-muted-foreground/50'
                        }`}
                    />
                    <span>{device.online ? 'Online' : 'Offline'}</span>
                    {device.battery ? (
                        <>
                            <span aria-hidden="true">·</span>
                            <BatteryMediumIcon className="size-3.5" />
                            <span>{device.battery}%</span>
                        </>
                    ) : null}
                </div>
                <Button asChild size="icon-xs" variant="ghost">
                    <Link
                        aria-label={`Open ${device.name}`}
                        href={`/devices/${device.id}`}
                    >
                        <ArrowUpRightIcon />
                    </Link>
                </Button>
            </CardContent>
        </Card>
    )
}
