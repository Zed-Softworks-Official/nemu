'use client'

import { useController, useDevices } from '@nemu/controller'
import type { DeviceState, Room } from '@nemu/protocol'
import {
    AlertDialog,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogMedia,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '@nemu/ui/components/alert-dialog'
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
import { Separator } from '@nemu/ui/components/separator'
import { Skeleton } from '@nemu/ui/components/skeleton'
import { Switch } from '@nemu/ui/components/switch'
import {
    ArrowLeftIcon,
    BatteryMediumIcon,
    ChevronDownIcon,
    CircleOffIcon,
    LoaderCircleIcon,
    RadioTowerIcon,
    RefreshCwIcon,
    ServerOffIcon,
    Trash2Icon,
    TriangleAlertIcon,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
    brightnessPercentToPayload,
    colorHexPayload,
    colorTempPayload,
    normalizeHex,
    powerPayload,
} from '~/lib/device-commands'
import {
    COLOR_TEMP_MAX_MIREDS,
    COLOR_TEMP_MIN_MIREDS,
    colorTempLabel,
    presentDevice,
} from '~/lib/device-presentation'
import { DeviceControlSlider } from './device-control-slider'
import { DeviceIcon } from './device-icon'
import { PageHeader } from './page-header'

export function DeviceDetail({ deviceId }: { deviceId: string }) {
    const { devices, error, refresh, status } = useDevices()
    const { reprobe, forgetDevice, sendCommand, getRooms, patchDevice } =
        useController()
    const router = useRouter()
    const [forgetOpen, setForgetOpen] = useState(false)
    const [forgetting, setForgetting] = useState(false)
    const [forgetError, setForgetError] = useState<Error | null>(null)
    const [commandError, setCommandError] = useState<Error | null>(null)
    const [pendingPower, setPendingPower] = useState<boolean | null>(null)
    const [rooms, setRooms] = useState<Room[]>([])
    const [roomsLoading, setRoomsLoading] = useState(false)
    const [roomsError, setRoomsError] = useState<Error | null>(null)
    const [roomPatching, setRoomPatching] = useState(false)
    const [roomError, setRoomError] = useState<Error | null>(null)
    const [colorDraft, setColorDraft] = useState('#FFFFFF')
    const device = devices?.find((candidate) => candidate.id === deviceId)
    const commitOnRelease = status.mode === 'relay'
    const controlsDisabled =
        status.mode === 'offline' || status.mode === 'probing'

    useEffect(() => {
        if (status.mode !== 'lan') {
            setRooms([])
            setRoomsError(null)
            setRoomsLoading(false)
            return
        }

        let cancelled = false
        setRoomsLoading(true)
        void getRooms()
            .then((next) => {
                if (!cancelled) {
                    setRooms(next)
                    setRoomsError(null)
                }
            })
            .catch((nextError) => {
                if (!cancelled) {
                    setRoomsError(
                        nextError instanceof Error
                            ? nextError
                            : new Error(String(nextError))
                    )
                }
            })
            .finally(() => {
                if (!cancelled) setRoomsLoading(false)
            })

        return () => {
            cancelled = true
        }
    }, [getRooms, status.mode])

    useEffect(() => {
        setPendingPower(null)
        setCommandError(null)
    }, [device?.state, device?.online])

    useEffect(() => {
        if (!device) return
        const presented = presentDevice(device)
        if (presented.colorHex) {
            setColorDraft(presented.colorHex)
        }
    }, [device])

    if (!devices && error) {
        return (
            <DetailState
                action="Try again"
                description="Nemu could not load this device from your controller."
                icon={TriangleAlertIcon}
                onAction={() => void refresh()}
                title="Unable to load device"
            />
        )
    }

    if (!devices && status.mode === 'offline') {
        return (
            <DetailState
                action="Reconnect"
                description="Connect to your Nemu controller to view this device."
                icon={ServerOffIcon}
                onAction={() => void reprobe()}
                title="Controller offline"
            />
        )
    }

    if (!devices) {
        return <DeviceDetailSkeleton />
    }

    if (!device) {
        return (
            <DetailState
                action="Back to devices"
                description="It may have been removed or may no longer be reported by this controller."
                href="/devices"
                icon={CircleOffIcon}
                title="Device not found"
            />
        )
    }

    const presented = presentDevice(device)
    const stateEntries = Object.entries(device.state ?? {}).slice(0, 6)
    const powerChecked = pendingPower ?? presented.enabled
    const selectedRoom = rooms.find((room) => room.id === presented.roomId)
    const isMatter = device.protocol === 'matter'
    const protocolLabel = isMatter ? 'Matter' : 'Zigbee'

    async function runCommand(payload: DeviceState) {
        setCommandError(null)
        try {
            const result = await sendCommand({ deviceId, payload })
            if (!result.ok) {
                throw new Error(
                    result.error?.message ?? 'Command failed on the controller'
                )
            }
        } catch (nextError) {
            setPendingPower(null)
            setCommandError(
                nextError instanceof Error
                    ? nextError
                    : new Error(String(nextError))
            )
        }
    }

    async function handlePowerChange(next: boolean) {
        setPendingPower(next)
        await runCommand(powerPayload(next))
    }

    async function handleRoomChange(nextRoomId: string | null) {
        setRoomPatching(true)
        setRoomError(null)
        try {
            await patchDevice(deviceId, { roomId: nextRoomId })
            await refresh()
        } catch (nextError) {
            setRoomError(
                nextError instanceof Error
                    ? nextError
                    : new Error(String(nextError))
            )
        } finally {
            setRoomPatching(false)
        }
    }

    async function forgetCurrentDevice() {
        setForgetting(true)
        setForgetError(null)
        try {
            await forgetDevice(deviceId)
            setForgetOpen(false)
            router.push('/devices')
        } catch (nextError) {
            setForgetError(
                nextError instanceof Error
                    ? nextError
                    : new Error(String(nextError))
            )
        } finally {
            setForgetting(false)
        }
    }

    return (
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
            <PageHeader
                actions={
                    <Button asChild size="sm" variant="ghost">
                        <Link href="/devices">
                            <ArrowLeftIcon data-icon="inline-start" />
                            All devices
                        </Link>
                    </Button>
                }
                description={`${presented.type} · ${presented.model ?? 'Unknown model'}`}
                title={presented.name}
            />

            {status.mode === 'offline' ? (
                <DetailNotice
                    description="Showing the last available device snapshot."
                    icon={ServerOffIcon}
                    title="Controller is offline"
                />
            ) : null}
            {error ? (
                <DetailNotice
                    description="This device may not reflect its latest state."
                    icon={TriangleAlertIcon}
                    title="Refresh failed"
                    variant="error"
                />
            ) : null}

            <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(16rem,0.65fr)]">
                <div className="space-y-5">
                    <Card>
                        <CardHeader>
                            <div className="mb-4 flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                                <DeviceIcon
                                    category={presented.category}
                                    className="size-6"
                                />
                            </div>
                            <CardTitle>Device control</CardTitle>
                            <CardDescription>
                                {presented.summary}
                            </CardDescription>
                            {presented.supportsPower ? (
                                <CardAction className="flex items-center gap-3">
                                    <Switch
                                        aria-label={`${presented.name} power`}
                                        checked={powerChecked}
                                        disabled={controlsDisabled}
                                        onCheckedChange={(next) =>
                                            void handlePowerChange(next)
                                        }
                                    />
                                </CardAction>
                            ) : null}
                        </CardHeader>
                        <CardContent className="space-y-5">
                            {presented.supportsBrightness &&
                            presented.level !== undefined ? (
                                <DeviceControlSlider
                                    ariaLabel={`Brightness ${presented.level}%`}
                                    commitOnRelease={commitOnRelease}
                                    disabled={controlsDisabled}
                                    formatValue={(value) => `${value}%`}
                                    label="Brightness"
                                    max={100}
                                    min={0}
                                    onCommit={(value) =>
                                        void runCommand(
                                            brightnessPercentToPayload(value)
                                        )
                                    }
                                    value={presented.level}
                                />
                            ) : null}

                            {presented.supportsColorTemp &&
                            presented.colorTemp !== undefined ? (
                                <DeviceControlSlider
                                    ariaLabel={`Color temperature ${colorTempLabel(presented.colorTemp)}`}
                                    commitOnRelease={commitOnRelease}
                                    disabled={controlsDisabled}
                                    formatValue={colorTempLabel}
                                    label="Color temperature"
                                    max={COLOR_TEMP_MAX_MIREDS}
                                    min={COLOR_TEMP_MIN_MIREDS}
                                    onCommit={(value) =>
                                        void runCommand(colorTempPayload(value))
                                    }
                                    value={presented.colorTemp}
                                />
                            ) : null}

                            {presented.supportsColor ? (
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="font-medium">
                                            Color
                                        </span>
                                        <span className="text-muted-foreground">
                                            {colorDraft}
                                        </span>
                                    </div>
                                    <input
                                        aria-label={`${presented.name} color`}
                                        className="h-10 w-full cursor-pointer rounded-lg border bg-transparent p-1 disabled:cursor-not-allowed disabled:opacity-50"
                                        disabled={controlsDisabled}
                                        onBlur={() => {
                                            if (!commitOnRelease) return
                                            const normalized =
                                                normalizeHex(colorDraft)
                                            if (normalized) {
                                                void runCommand(
                                                    colorHexPayload(normalized)
                                                )
                                            }
                                        }}
                                        onChange={(event) => {
                                            const next = event.target.value
                                            setColorDraft(next)
                                            if (!commitOnRelease) {
                                                void runCommand(
                                                    colorHexPayload(next)
                                                )
                                            }
                                        }}
                                        type="color"
                                        value={
                                            normalizeHex(colorDraft) ??
                                            '#FFFFFF'
                                        }
                                    />
                                </div>
                            ) : null}

                            {!presented.supportsBrightness &&
                            !presented.supportsColorTemp &&
                            !presented.supportsColor ? (
                                <div className="rounded-lg bg-muted/50 p-4">
                                    <p className="font-medium text-sm">
                                        Current reading
                                    </p>
                                    <p className="mt-1 text-muted-foreground text-sm">
                                        {presented.summary}
                                    </p>
                                </div>
                            ) : null}

                            {commandError ? (
                                <div
                                    className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-destructive text-sm"
                                    role="alert"
                                >
                                    {commandError.message}
                                </div>
                            ) : null}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Current state</CardTitle>
                            <CardDescription>
                                Latest values reported by the controller.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {stateEntries.length > 0 ? (
                                stateEntries.map(([key, value], index) => (
                                    <div key={key}>
                                        {index > 0 ? (
                                            <Separator className="mb-4" />
                                        ) : null}
                                        <MetadataRow
                                            label={formatStateKey(key)}
                                            value={formatStateValue(value)}
                                        />
                                    </div>
                                ))
                            ) : (
                                <p className="text-muted-foreground text-sm">
                                    No state values have been reported yet.
                                </p>
                            )}
                        </CardContent>
                    </Card>
                </div>

                <div className="space-y-5">
                    <Card>
                        <CardHeader>
                            <CardTitle>Status</CardTitle>
                            <CardAction className="flex items-center gap-2">
                                <Badge variant="outline">{protocolLabel}</Badge>
                                <Badge
                                    variant={
                                        presented.online ? 'soft' : 'secondary'
                                    }
                                >
                                    {presented.online ? 'Online' : 'Offline'}
                                </Badge>
                            </CardAction>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <MetadataRow label="Type" value={presented.type} />
                            <MetadataRow
                                label="Protocol"
                                value={protocolLabel}
                            />
                            <MetadataRow
                                label="Model"
                                value={presented.model ?? 'Unknown'}
                            />
                            <MetadataRow
                                label="Manufacturer"
                                value={presented.manufacturer}
                            />
                            <div className="space-y-2">
                                <span className="text-muted-foreground text-sm">
                                    Room
                                </span>
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button
                                            className="w-full justify-between"
                                            disabled={
                                                status.mode !== 'lan' ||
                                                roomsLoading ||
                                                roomPatching
                                            }
                                            size="sm"
                                            variant="outline"
                                        >
                                            {status.mode !== 'lan'
                                                ? (selectedRoom?.name ??
                                                  presented.roomId ??
                                                  'Unassigned')
                                                : roomsLoading
                                                  ? 'Loading rooms…'
                                                  : roomPatching
                                                    ? 'Saving…'
                                                    : (selectedRoom?.name ??
                                                      'Unassigned')}
                                            <ChevronDownIcon />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent
                                        align="start"
                                        className="w-(--radix-dropdown-menu-trigger-width)"
                                    >
                                        <DropdownMenuLabel>
                                            Assign room
                                        </DropdownMenuLabel>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuRadioGroup
                                            onValueChange={(value) =>
                                                void handleRoomChange(
                                                    value === 'unassigned'
                                                        ? null
                                                        : value
                                                )
                                            }
                                            value={
                                                presented.roomId ?? 'unassigned'
                                            }
                                        >
                                            <DropdownMenuRadioItem value="unassigned">
                                                Unassigned
                                            </DropdownMenuRadioItem>
                                            {rooms.map((room) => (
                                                <DropdownMenuRadioItem
                                                    key={room.id}
                                                    value={room.id}
                                                >
                                                    {room.name}
                                                </DropdownMenuRadioItem>
                                            ))}
                                        </DropdownMenuRadioGroup>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                                {status.mode !== 'lan' ? (
                                    <p className="text-muted-foreground text-xs">
                                        Changing rooms requires a Home
                                        connection.
                                    </p>
                                ) : null}
                                {roomsError ? (
                                    <p className="text-destructive text-xs">
                                        {roomsError.message}
                                    </p>
                                ) : null}
                                {roomError ? (
                                    <p className="text-destructive text-xs">
                                        {roomError.message}
                                    </p>
                                ) : null}
                            </div>
                            <MetadataRow
                                label="Device ID"
                                value={presented.id}
                            />
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Connection</CardTitle>
                            <CardDescription>
                                Data path between this dashboard and your
                                controller.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3 text-sm">
                            <div className="flex items-center gap-2 text-muted-foreground">
                                <RadioTowerIcon className="size-4" />
                                <span>
                                    {status.label} · {presented.lastSeen}
                                </span>
                            </div>
                            {presented.battery !== undefined ? (
                                <div className="flex items-center gap-2 text-muted-foreground">
                                    <BatteryMediumIcon className="size-4" />
                                    <span>Battery · {presented.battery}%</span>
                                </div>
                            ) : null}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Forget device</CardTitle>
                            <CardDescription>
                                {isMatter
                                    ? 'Unpair this device from your Matter fabric and Nemu controller.'
                                    : 'Remove this device from your Zigbee network and Nemu controller.'}
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <AlertDialog
                                onOpenChange={(open) => {
                                    if (!forgetting) {
                                        setForgetOpen(open)
                                        if (!open) setForgetError(null)
                                    }
                                }}
                                open={forgetOpen}
                            >
                                <AlertDialogTrigger asChild>
                                    <Button
                                        disabled={status.mode !== 'lan'}
                                        size="sm"
                                        variant="destructive"
                                    >
                                        <Trash2Icon data-icon="inline-start" />
                                        Forget device
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogMedia>
                                            <Trash2Icon />
                                        </AlertDialogMedia>
                                        <AlertDialogTitle>
                                            Forget {presented.name}?
                                        </AlertDialogTitle>
                                        <AlertDialogDescription>
                                            {isMatter
                                                ? 'Nemu will unpair the device from your Matter fabric. For multi-outlet devices like power strips, this removes the entire device — every outlet, not just this one.'
                                                : 'Nemu will ask the device to leave this Zigbee network. Battery-powered devices may need to be awake for the request to succeed.'}
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    {forgetError ? (
                                        <div
                                            className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-destructive text-sm"
                                            role="alert"
                                        >
                                            {forgetError.message}
                                        </div>
                                    ) : null}
                                    <AlertDialogFooter>
                                        <AlertDialogCancel
                                            disabled={forgetting}
                                        >
                                            Cancel
                                        </AlertDialogCancel>
                                        <Button
                                            disabled={forgetting}
                                            onClick={() =>
                                                void forgetCurrentDevice()
                                            }
                                            variant="destructive"
                                        >
                                            {forgetting ? (
                                                <LoaderCircleIcon
                                                    className="animate-spin"
                                                    data-icon="inline-start"
                                                />
                                            ) : (
                                                <Trash2Icon data-icon="inline-start" />
                                            )}
                                            {forgetting
                                                ? 'Forgetting…'
                                                : 'Forget device'}
                                        </Button>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                            {status.mode !== 'lan' ? (
                                <p className="mt-2 text-muted-foreground text-xs">
                                    Forgetting a device requires a Home
                                    connection.
                                </p>
                            ) : null}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    )
}

function DeviceDetailSkeleton() {
    return (
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
            <div className="space-y-3">
                <Skeleton className="h-8 w-56" />
                <Skeleton className="h-4 w-72 max-w-full" />
            </div>
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(16rem,0.65fr)]">
                <Skeleton className="h-80" />
                <Skeleton className="h-64" />
            </div>
        </div>
    )
}

function DetailState({
    title,
    description,
    action,
    icon: Icon,
    href,
    onAction,
}: {
    title: string
    description: string
    action: string
    icon: typeof RadioTowerIcon
    href?: string
    onAction?: () => void
}) {
    const actionButton = href ? (
        <Button asChild size="sm" variant="outline">
            <Link href={href}>
                <ArrowLeftIcon data-icon="inline-start" />
                {action}
            </Link>
        </Button>
    ) : (
        <Button onClick={onAction} size="sm" variant="outline">
            <RefreshCwIcon data-icon="inline-start" />
            {action}
        </Button>
    )

    return (
        <Card className="mx-auto w-full max-w-3xl">
            <Empty>
                <EmptyHeader>
                    <EmptyMedia variant="icon">
                        <Icon />
                    </EmptyMedia>
                    <EmptyTitle>{title}</EmptyTitle>
                    <EmptyDescription>{description}</EmptyDescription>
                </EmptyHeader>
                <EmptyContent>{actionButton}</EmptyContent>
            </Empty>
        </Card>
    )
}

function DetailNotice({
    title,
    description,
    icon: Icon,
    variant = 'default',
}: {
    title: string
    description: string
    icon: typeof RadioTowerIcon
    variant?: 'default' | 'error'
}) {
    return (
        <div
            className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-sm ${
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
            <div>
                <span className="font-medium">{title}. </span>
                <span className="text-muted-foreground">{description}</span>
            </div>
        </div>
    )
}

function MetadataRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-start justify-between gap-4">
            <span className="shrink-0 text-muted-foreground text-sm">
                {label}
            </span>
            <span className="min-w-0 break-all text-right font-medium text-sm">
                {value}
            </span>
        </div>
    )
}

function formatStateKey(key: string): string {
    return key
        .replaceAll(/([a-z])([A-Z])/g, '$1 $2')
        .replaceAll('_', ' ')
        .replace(/^./, (character) => character.toUpperCase())
}

function formatStateValue(value: unknown): string {
    if (value === null) {
        return 'None'
    }

    if (
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean'
    ) {
        return String(value)
    }

    if (Array.isArray(value)) {
        return `${value.length} values`
    }

    return 'Structured value'
}
