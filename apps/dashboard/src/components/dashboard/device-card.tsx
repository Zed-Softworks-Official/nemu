'use client'

import { useController } from '@nemu/controller'
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
import { useEffect, useState } from 'react'
import { powerPayload } from '~/lib/device-commands'
import type { PresentedDevice } from '~/lib/device-presentation'
import { DeviceIcon } from './device-icon'

export function DeviceCard({ device }: { device: PresentedDevice }) {
    const { sendCommand, status } = useController()
    const [pendingPower, setPendingPower] = useState<boolean | null>(null)
    const [error, setError] = useState<Error | null>(null)
    const checked = pendingPower ?? device.enabled
    const canToggle =
        device.supportsPower &&
        device.online &&
        (status.mode === 'lan' || status.mode === 'relay')

    useEffect(() => {
        setPendingPower(null)
        setError(null)
    }, [device.enabled, device.state])

    async function handleToggle(next: boolean) {
        setPendingPower(next)
        setError(null)
        try {
            const result = await sendCommand({
                deviceId: device.id,
                payload: powerPayload(next),
            })
            if (!result.ok) {
                throw new Error(
                    result.error?.message ?? 'Command failed on the controller'
                )
            }
        } catch (nextError) {
            setPendingPower(null)
            setError(
                nextError instanceof Error
                    ? nextError
                    : new Error(String(nextError))
            )
        }
    }

    return (
        <Card className="transition-colors hover:ring-foreground/20" size="sm">
            <CardHeader>
                <div className="mb-3 flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground group-hover/card:text-foreground">
                    <DeviceIcon category={device.category} />
                </div>
                <CardTitle>{device.name}</CardTitle>
                <CardDescription>{device.summary}</CardDescription>
                {device.supportsPower ? (
                    <CardAction>
                        <Switch
                            aria-label={`Toggle ${device.name}`}
                            checked={checked}
                            disabled={!canToggle}
                            onCheckedChange={(next) => void handleToggle(next)}
                            onClick={(event) => event.stopPropagation()}
                        />
                    </CardAction>
                ) : null}
            </CardHeader>
            <CardContent className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-1">
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
                    {error ? (
                        <p className="text-destructive text-xs" role="alert">
                            {error.message}
                        </p>
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
