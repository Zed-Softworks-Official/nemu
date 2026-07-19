'use client'

import { useDevicePairing } from '@nemu/controller'
import type { Device, Room } from '@nemu/protocol'
import { Badge } from '@nemu/ui/components/badge'
import { Button } from '@nemu/ui/components/button'
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from '@nemu/ui/components/card'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuTrigger,
} from '@nemu/ui/components/dropdown-menu'
import { Input } from '@nemu/ui/components/input'
import { Separator } from '@nemu/ui/components/separator'
import {
    ArrowLeftIcon,
    CheckIcon,
    ChevronDownIcon,
    CircleAlertIcon,
    LightbulbIcon,
    LoaderCircleIcon,
    RadioTowerIcon,
    RotateCwIcon,
    RouterIcon,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { presentDevice } from '~/lib/device-presentation'
import { DeviceIcon } from './device-icon'
import { PageHeader } from './page-header'

const stepLabels = ['Prepare', 'Discover', 'Configure'] as const

export function DevicePairingWizard() {
    const pairing = useDevicePairing()
    const router = useRouter()
    const [name, setName] = useState('')
    const [roomId, setRoomId] = useState<string | null>(null)

    useEffect(() => {
        if (pairing.selectedDevice) {
            setName(pairing.selectedDevice.name)
            setRoomId(pairing.selectedDevice.roomId ?? null)
        }
    }, [pairing.selectedDevice])

    const currentStep =
        pairing.phase === 'idle' || pairing.phase === 'error'
            ? 0
            : pairing.phase === 'discovering'
              ? 1
              : 2

    async function saveDevice() {
        const trimmedName = name.trim()
        if (!trimmedName) return

        const updated = await pairing.configureDevice({
            name: trimmedName,
            roomId,
        })
        router.push(`/devices/${updated.id}`)
    }

    return (
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-8">
            <PageHeader
                actions={
                    <Button asChild size="sm" variant="ghost">
                        <Link href="/devices">
                            <ArrowLeftIcon data-icon="inline-start" />
                            Back to devices
                        </Link>
                    </Button>
                }
                description="Pair Zigbee devices directly with your Nemu controller."
                eyebrow="Add device"
                title={getPageTitle(pairing.phase)}
            />

            <StepIndicator currentStep={currentStep} />

            {pairing.phase === 'idle' ? (
                <PrepareStep
                    connectionLabel={pairing.status.label}
                    isHome={pairing.status.mode === 'lan'}
                    onStart={() => void pairing.startDiscovery()}
                />
            ) : null}

            {pairing.phase === 'discovering' ? (
                <DiscoverStep
                    devices={pairing.discoveredDevices}
                    interviews={pairing.interviews}
                    isHome={pairing.status.mode === 'lan'}
                    onSelect={(device) => void pairing.selectDevice(device)}
                    secondsRemaining={pairing.secondsRemaining}
                />
            ) : null}

            {pairing.phase === 'configuring' ||
            pairing.phase === 'saving' ||
            pairing.phase === 'success' ? (
                <ConfigureStep
                    error={pairing.error}
                    isSaving={pairing.phase === 'saving'}
                    name={name}
                    onNameChange={setName}
                    onRoomChange={setRoomId}
                    onSave={() => void saveDevice()}
                    roomId={roomId}
                    rooms={pairing.rooms}
                    roomsError={pairing.roomsError}
                    roomsLoading={pairing.roomsLoading}
                    selectedDevice={pairing.selectedDevice}
                />
            ) : null}

            {pairing.phase === 'error' ? (
                <ErrorStep
                    message={
                        pairing.error?.message ??
                        'Nemu could not start device pairing.'
                    }
                    onReset={pairing.reset}
                    onRetry={() => void pairing.startDiscovery()}
                />
            ) : null}
        </div>
    )
}

function StepIndicator({ currentStep }: { currentStep: number }) {
    return (
        <ol className="grid grid-cols-3 gap-2">
            {stepLabels.map((label, index) => (
                <li className="flex items-center gap-2" key={label}>
                    <span
                        className={`flex size-7 shrink-0 items-center justify-center rounded-full border text-xs ${
                            index < currentStep
                                ? 'border-primary bg-primary text-primary-foreground'
                                : index === currentStep
                                  ? 'border-primary text-primary'
                                  : 'border-border text-muted-foreground'
                        }`}
                    >
                        {index < currentStep ? (
                            <CheckIcon className="size-3.5" />
                        ) : (
                            index + 1
                        )}
                    </span>
                    <span
                        className={`hidden text-sm sm:inline ${
                            index > currentStep
                                ? 'text-muted-foreground'
                                : 'font-medium'
                        }`}
                    >
                        {label}
                    </span>
                    {index < stepLabels.length - 1 ? (
                        <span className="ml-auto h-px flex-1 bg-border" />
                    ) : null}
                </li>
            ))}
        </ol>
    )
}

function PrepareStep({
    isHome,
    connectionLabel,
    onStart,
}: {
    isHome: boolean
    connectionLabel: string
    onStart: () => void
}) {
    return (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(15rem,0.8fr)]">
            <Card className="min-h-80 justify-between">
                <CardHeader className="text-center">
                    <div className="mx-auto mb-5 flex size-16 items-center justify-center rounded-full border bg-muted/40 text-primary">
                        <RadioTowerIcon className="size-6" />
                    </div>
                    <CardTitle className="text-lg">Ready your device</CardTitle>
                    <CardDescription className="mx-auto max-w-sm leading-relaxed">
                        Reset the device until its status light blinks, then
                        keep it close to your Nemu controller.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div
                        className={`rounded-lg border p-4 ${
                            isHome
                                ? 'bg-muted/30'
                                : 'border-warning/20 bg-warning/5'
                        }`}
                    >
                        <div className="flex items-start gap-3">
                            <RouterIcon
                                className={`mt-0.5 size-4 ${
                                    isHome ? 'text-primary' : 'text-warning'
                                }`}
                            />
                            <div>
                                <p className="font-medium text-sm">
                                    {isHome
                                        ? 'Home connection ready'
                                        : `Connected — ${connectionLabel}`}
                                </p>
                                <p className="mt-1 text-muted-foreground text-xs">
                                    {isHome
                                        ? 'Pairing traffic will stay on your local network.'
                                        : 'Device pairing requires a Home connection to the controller.'}
                                </p>
                            </div>
                        </div>
                    </div>
                </CardContent>
                <CardFooter className="justify-center border-t">
                    <Button disabled={!isHome} onClick={onStart}>
                        <RadioTowerIcon data-icon="inline-start" />
                        Start discovery
                    </Button>
                </CardFooter>
            </Card>

            <PairingTips />
        </div>
    )
}

function DiscoverStep({
    devices,
    interviews,
    secondsRemaining,
    isHome,
    onSelect,
}: {
    devices: Device[]
    interviews: Array<{
        ieeeAddress: string
        status: 'started' | 'successful' | 'failed'
    }>
    secondsRemaining: number
    isHome: boolean
    onSelect: (device: Device) => void
}) {
    return (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(15rem,0.8fr)]">
            <Card className="min-h-96">
                <CardHeader className="text-center">
                    <div className="relative mx-auto mb-5 flex size-20 items-center justify-center rounded-full border bg-muted/40 text-primary">
                        <span className="absolute inset-2 animate-pulse rounded-full border border-primary/30" />
                        <RadioTowerIcon className="size-7" />
                    </div>
                    <CardTitle className="text-lg">Searching nearby</CardTitle>
                    <CardDescription>
                        Pairing closes in{' '}
                        <span className="font-mono text-foreground">
                            {formatCountdown(secondsRemaining)}
                        </span>
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                    {!isHome ? (
                        <div className="rounded-lg border border-warning/20 bg-warning/5 p-3 text-sm">
                            Home connection lost. Reconnect before retrying.
                        </div>
                    ) : null}
                    {devices.length === 0 && interviews.length === 0 ? (
                        <div className="rounded-lg border border-dashed p-5 text-center">
                            <p className="font-medium text-sm">
                                Waiting for a device
                            </p>
                            <p className="mt-1 text-muted-foreground text-xs">
                                Keep it powered and in pairing mode.
                            </p>
                        </div>
                    ) : null}
                    {interviews.map((interview) => (
                        <InterviewRow
                            interview={interview}
                            key={interview.ieeeAddress}
                        />
                    ))}
                    {devices.map((device) => (
                        <DiscoveredDevice
                            device={device}
                            key={device.id}
                            onSelect={() => onSelect(device)}
                        />
                    ))}
                </CardContent>
            </Card>

            <PairingTips />
        </div>
    )
}

function ConfigureStep({
    selectedDevice,
    rooms,
    roomsLoading,
    roomsError,
    name,
    roomId,
    isSaving,
    error,
    onNameChange,
    onRoomChange,
    onSave,
}: {
    selectedDevice: Device | null
    rooms: Room[]
    roomsLoading: boolean
    roomsError: Error | null
    name: string
    roomId: string | null
    isSaving: boolean
    error: Error | null
    onNameChange: (name: string) => void
    onRoomChange: (roomId: string | null) => void
    onSave: () => void
}) {
    const selectedRoom = rooms.find((room) => room.id === roomId)

    return (
        <Card className="mx-auto w-full max-w-2xl">
            <CardHeader>
                <CardTitle>Configure device</CardTitle>
                <CardDescription>
                    Give the device a clear name and choose where it belongs.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
                {selectedDevice ? (
                    <div className="flex items-center gap-3 rounded-lg bg-muted/40 p-3">
                        <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                            <DeviceIcon
                                category={
                                    presentDevice(selectedDevice).category
                                }
                            />
                        </div>
                        <div>
                            <p className="font-medium text-sm">
                                {selectedDevice.name}
                            </p>
                            <p className="text-muted-foreground text-xs">
                                {selectedDevice.model ?? selectedDevice.type}
                            </p>
                        </div>
                        <Badge className="ml-auto" variant="soft">
                            Joined
                        </Badge>
                    </div>
                ) : null}

                <div className="grid gap-2">
                    <label
                        className="font-medium text-sm"
                        htmlFor="device-name"
                    >
                        Device name
                    </label>
                    <Input
                        disabled={isSaving}
                        id="device-name"
                        onChange={(event) => onNameChange(event.target.value)}
                        value={name}
                    />
                </div>

                <div className="grid gap-2">
                    <span className="font-medium text-sm">Room</span>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                                className="w-full justify-between"
                                disabled={roomsLoading || isSaving}
                                variant="outline"
                            >
                                {roomsLoading
                                    ? 'Loading rooms…'
                                    : (selectedRoom?.name ?? 'Unassigned')}
                                <ChevronDownIcon />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                            align="start"
                            className="w-(--radix-dropdown-menu-trigger-width)"
                        >
                            <DropdownMenuLabel>Assign room</DropdownMenuLabel>
                            <DropdownMenuRadioGroup
                                onValueChange={(value) =>
                                    onRoomChange(
                                        value === 'unassigned' ? null : value
                                    )
                                }
                                value={roomId ?? 'unassigned'}
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
                    {roomsError ? (
                        <p className="text-destructive text-xs">
                            Rooms could not be loaded. You can save the device
                            unassigned.
                        </p>
                    ) : null}
                </div>

                {error ? (
                    <div
                        className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm"
                        role="alert"
                    >
                        {error.message}
                    </div>
                ) : null}
            </CardContent>
            <CardFooter className="justify-end border-t">
                <Button disabled={!name.trim() || isSaving} onClick={onSave}>
                    {isSaving ? (
                        <LoaderCircleIcon
                            className="animate-spin"
                            data-icon="inline-start"
                        />
                    ) : (
                        <CheckIcon data-icon="inline-start" />
                    )}
                    {isSaving ? 'Saving…' : 'Save device'}
                </Button>
            </CardFooter>
        </Card>
    )
}

function ErrorStep({
    message,
    onRetry,
    onReset,
}: {
    message: string
    onRetry: () => void
    onReset: () => void
}) {
    return (
        <Card className="mx-auto w-full max-w-2xl">
            <CardHeader className="items-center text-center">
                <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                    <CircleAlertIcon className="size-5" />
                </div>
                <CardTitle>Pairing stopped</CardTitle>
                <CardDescription>{message}</CardDescription>
            </CardHeader>
            <CardFooter className="justify-center gap-2 border-t">
                <Button onClick={onReset} variant="ghost">
                    Back
                </Button>
                <Button onClick={onRetry}>
                    <RotateCwIcon data-icon="inline-start" />
                    Try again
                </Button>
            </CardFooter>
        </Card>
    )
}

function DiscoveredDevice({
    device,
    onSelect,
}: {
    device: Device
    onSelect: () => void
}) {
    const presented = presentDevice(device)

    return (
        <div className="flex items-center gap-3 rounded-lg border p-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <DeviceIcon category={presented.category} />
            </div>
            <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-sm">{device.name}</p>
                <p className="truncate text-muted-foreground text-xs">
                    {device.model ?? device.type}
                </p>
            </div>
            <Button onClick={onSelect} size="sm">
                Configure
            </Button>
        </div>
    )
}

function InterviewRow({
    interview,
}: {
    interview: {
        ieeeAddress: string
        status: 'started' | 'successful' | 'failed'
    }
}) {
    return (
        <div className="flex items-center gap-3 rounded-lg bg-muted/40 p-3">
            {interview.status === 'failed' ? (
                <CircleAlertIcon className="size-4 text-destructive" />
            ) : interview.status === 'successful' ? (
                <CheckIcon className="size-4 text-primary" />
            ) : (
                <LoaderCircleIcon className="size-4 animate-spin text-primary" />
            )}
            <div className="min-w-0">
                <p className="font-medium text-sm">
                    {interview.status === 'failed'
                        ? 'Interview failed'
                        : interview.status === 'successful'
                          ? 'Interview complete'
                          : 'Interviewing device'}
                </p>
                <p className="truncate font-mono text-muted-foreground text-xs">
                    {interview.ieeeAddress}
                </p>
            </div>
        </div>
    )
}

function PairingTips() {
    return (
        <div className="space-y-5">
            <Card>
                <CardHeader>
                    <CardTitle>Before you begin</CardTitle>
                    <CardDescription>
                        A few steps help devices join reliably.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <Tip
                        detail="Follow its reset instructions until the status light starts blinking."
                        number="1"
                        title="Reset the device"
                    />
                    <Separator />
                    <Tip
                        detail="Place it within a few feet of your Nemu controller for pairing."
                        number="2"
                        title="Bring it nearby"
                    />
                    <Separator />
                    <Tip
                        detail="Leave the device powered while Nemu finishes configuration."
                        number="3"
                        title="Keep it awake"
                    />
                </CardContent>
            </Card>

            <Card size="sm">
                <CardContent className="flex items-start gap-3">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <LightbulbIcon className="size-4" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <p className="font-medium text-sm">
                                Supported devices
                            </p>
                            <Badge variant="outline">Zigbee</Badge>
                        </div>
                        <p className="mt-1 text-muted-foreground text-xs leading-relaxed">
                            Lights, plugs, switches, and sensors from common
                            Zigbee manufacturers.
                        </p>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}

function Tip({
    number,
    title,
    detail,
}: {
    number: string
    title: string
    detail: string
}) {
    return (
        <div className="flex gap-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted font-medium text-xs">
                {number}
            </span>
            <div>
                <p className="font-medium text-sm">{title}</p>
                <p className="mt-0.5 text-muted-foreground text-xs leading-relaxed">
                    {detail}
                </p>
            </div>
        </div>
    )
}

function getPageTitle(phase: string): string {
    if (phase === 'discovering') return 'Searching for nearby devices'
    if (phase === 'configuring' || phase === 'saving' || phase === 'success') {
        return 'Finish setting up your device'
    }
    if (phase === 'error') return 'Pairing needs attention'
    return 'Pair a new device'
}

function formatCountdown(seconds: number): string {
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
}
