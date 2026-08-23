'use client'

import { type PairingInterview, useDevicePairing } from '@nemu/controller'
import type { Device, DeviceProtocol, Room } from '@nemu/protocol'
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
    QrCodeIcon,
    RadioTowerIcon,
    RotateCwIcon,
    RouterIcon,
    ScanLineIcon,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { presentDevice } from '~/lib/device-presentation'
import { DeviceIcon } from './device-icon'
import { PageHeader } from './page-header'

const stepLabels = ['Prepare', 'Discover', 'Configure'] as const

export function DevicePairingWizard() {
    const pairing = useDevicePairing()
    const router = useRouter()
    const [name, setName] = useState('')
    const [roomId, setRoomId] = useState<string | null>(null)
    const [protocolChoice, setProtocolChoice] =
        useState<DeviceProtocol>('zigbee')
    const [matterCode, setMatterCode] = useState('')
    const [wifiSsid, setWifiSsid] = useState('')
    const [wifiPassword, setWifiPassword] = useState('')

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

    function startPairing() {
        if (protocolChoice === 'matter') {
            void pairing.startMatterCommission({
                code: matterCode.trim(),
                wifiSsid: wifiSsid.trim() || undefined,
                wifiPassword: wifiSsid.trim() ? wifiPassword : undefined,
            })
        } else {
            void pairing.startDiscovery()
        }
    }

    function leaveWizard() {
        pairing.reset()
        router.push('/devices')
    }

    return (
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-8">
            <PageHeader
                actions={
                    <Button onClick={leaveWizard} size="sm" variant="ghost">
                        <ArrowLeftIcon data-icon="inline-start" />
                        Back to devices
                    </Button>
                }
                description="Pair Zigbee and Matter devices directly with your Nemu controller."
                eyebrow="Add device"
                title={
                    pairing.phase === 'discovering' &&
                    pairing.protocol === 'matter'
                        ? 'Setting up your device'
                        : getPageTitle(pairing.phase)
                }
            />

            <StepIndicator currentStep={currentStep} />

            {pairing.phase === 'idle' ? (
                <PrepareStep
                    connectionLabel={pairing.status.label}
                    isHome={pairing.status.mode === 'lan'}
                    matterCode={matterCode}
                    onMatterCodeChange={setMatterCode}
                    onProtocolChange={setProtocolChoice}
                    onStart={startPairing}
                    onWifiPasswordChange={setWifiPassword}
                    onWifiSsidChange={setWifiSsid}
                    protocol={protocolChoice}
                    wifiPassword={wifiPassword}
                    wifiSsid={wifiSsid}
                />
            ) : null}

            {pairing.phase === 'discovering' ? (
                <DiscoverStep
                    devices={pairing.discoveredDevices}
                    interviews={pairing.interviews}
                    isHome={pairing.status.mode === 'lan'}
                    onSelect={(device) => void pairing.selectDevice(device)}
                    protocol={pairing.protocol}
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
                    onRetry={startPairing}
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
    protocol,
    matterCode,
    wifiSsid,
    wifiPassword,
    onProtocolChange,
    onMatterCodeChange,
    onWifiSsidChange,
    onWifiPasswordChange,
    onStart,
}: {
    isHome: boolean
    connectionLabel: string
    protocol: DeviceProtocol
    matterCode: string
    wifiSsid: string
    wifiPassword: string
    onProtocolChange: (protocol: DeviceProtocol) => void
    onMatterCodeChange: (code: string) => void
    onWifiSsidChange: (ssid: string) => void
    onWifiPasswordChange: (password: string) => void
    onStart: () => void
}) {
    const isMatter = protocol === 'matter'
    const canStart = isHome && (!isMatter || matterCode.trim().length > 0)

    return (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(15rem,0.8fr)]">
            <Card className="min-h-80 justify-between">
                <CardHeader className="text-center">
                    <div className="mx-auto mb-5 flex size-16 items-center justify-center rounded-full border bg-muted/40 text-primary">
                        {isMatter ? (
                            <QrCodeIcon className="size-6" />
                        ) : (
                            <RadioTowerIcon className="size-6" />
                        )}
                    </div>
                    <CardTitle className="text-lg">
                        {isMatter
                            ? 'Enter the pairing code'
                            : 'Ready your device'}
                    </CardTitle>
                    <CardDescription className="mx-auto max-w-sm leading-relaxed">
                        {isMatter
                            ? 'Scan the Matter QR code on the device or enter its 11-digit pairing code.'
                            : 'Reset the device until its status light blinks, then keep it close to your Nemu controller.'}
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <ProtocolToggle
                        onChange={onProtocolChange}
                        protocol={protocol}
                    />

                    {isMatter ? (
                        <MatterPrepareFields
                            code={matterCode}
                            onCodeChange={onMatterCodeChange}
                            onWifiPasswordChange={onWifiPasswordChange}
                            onWifiSsidChange={onWifiSsidChange}
                            wifiPassword={wifiPassword}
                            wifiSsid={wifiSsid}
                        />
                    ) : null}

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
                    <Button disabled={!canStart} onClick={onStart}>
                        <RadioTowerIcon data-icon="inline-start" />
                        {isMatter ? 'Pair device' : 'Start discovery'}
                    </Button>
                </CardFooter>
            </Card>

            <PairingTips protocol={protocol} />
        </div>
    )
}

function ProtocolToggle({
    protocol,
    onChange,
}: {
    protocol: DeviceProtocol
    onChange: (protocol: DeviceProtocol) => void
}) {
    return (
        <div className="grid grid-cols-2 gap-1 rounded-lg border bg-muted/30 p-1">
            {(['zigbee', 'matter'] as const).map((option) => (
                <button
                    className={`rounded-md px-3 py-1.5 font-medium text-sm transition-colors ${
                        protocol === option
                            ? 'bg-background text-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground'
                    }`}
                    key={option}
                    onClick={() => onChange(option)}
                    type="button"
                >
                    {option === 'zigbee' ? 'Zigbee' : 'Matter'}
                </button>
            ))}
        </div>
    )
}

function MatterPrepareFields({
    code,
    wifiSsid,
    wifiPassword,
    onCodeChange,
    onWifiSsidChange,
    onWifiPasswordChange,
}: {
    code: string
    wifiSsid: string
    wifiPassword: string
    onCodeChange: (code: string) => void
    onWifiSsidChange: (ssid: string) => void
    onWifiPasswordChange: (password: string) => void
}) {
    return (
        <div className="space-y-4">
            <div className="grid gap-2">
                <label className="font-medium text-sm" htmlFor="matter-code">
                    Pairing code
                </label>
                <div className="flex gap-2">
                    <Input
                        autoComplete="off"
                        id="matter-code"
                        onChange={(event) => onCodeChange(event.target.value)}
                        placeholder="MT:… or 749-701-1233"
                        value={code}
                    />
                    <MatterQrScanButton onCode={onCodeChange} />
                </div>
            </div>

            <div className="grid gap-2">
                <label className="font-medium text-sm" htmlFor="matter-ssid">
                    Wi-Fi network{' '}
                    <span className="font-normal text-muted-foreground">
                        (optional)
                    </span>
                </label>
                <Input
                    autoComplete="off"
                    id="matter-ssid"
                    onChange={(event) => onWifiSsidChange(event.target.value)}
                    placeholder="Network name (SSID)"
                    value={wifiSsid}
                />
                <Input
                    autoComplete="off"
                    id="matter-wifi-password"
                    onChange={(event) =>
                        onWifiPasswordChange(event.target.value)
                    }
                    placeholder="Wi-Fi password"
                    type="password"
                    value={wifiPassword}
                />
                <p className="text-muted-foreground text-xs leading-relaxed">
                    Fill this in if the device needs to join Wi-Fi during
                    pairing (most bulbs, plugs, and strips). Skip it if the
                    device is already on this LAN or uses Ethernet. Use 2.4 GHz.
                    Credentials go only to the controller. After a failed
                    attempt, put the device back in pairing mode before
                    retrying.
                </p>
            </div>
        </div>
    )
}

type BarcodeDetectorLike = {
    detect: (
        source: CanvasImageSource | ImageBitmap
    ) => Promise<Array<{ rawValue: string }>>
}

type BarcodeDetectorConstructor = new (options?: {
    formats?: string[]
}) => BarcodeDetectorLike

function getBarcodeDetector(): BarcodeDetectorConstructor | null {
    if (typeof window === 'undefined') return null
    const ctor = (window as { BarcodeDetector?: BarcodeDetectorConstructor })
        .BarcodeDetector
    return ctor ?? null
}

/**
 * Camera QR scan via BarcodeDetector where available, with a photo-upload
 * fallback (`<input capture>`); hidden entirely when neither path can work.
 */
function MatterQrScanButton({ onCode }: { onCode: (code: string) => void }) {
    const [scanning, setScanning] = useState(false)
    const [supported, setSupported] = useState(false)
    const [cameraSupported, setCameraSupported] = useState(false)
    const videoRef = useRef<HTMLVideoElement | null>(null)
    const streamRef = useRef<MediaStream | null>(null)
    const fileInputRef = useRef<HTMLInputElement | null>(null)

    useEffect(() => {
        setSupported(getBarcodeDetector() !== null)
        setCameraSupported(
            getBarcodeDetector() !== null &&
                typeof navigator !== 'undefined' &&
                !!navigator.mediaDevices?.getUserMedia
        )
    }, [])

    const stopScan = useCallback(() => {
        for (const track of streamRef.current?.getTracks() ?? []) {
            track.stop()
        }
        streamRef.current = null
        setScanning(false)
    }, [])

    useEffect(() => stopScan, [stopScan])

    async function startCameraScan() {
        const Detector = getBarcodeDetector()
        if (!Detector) return
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment' },
            })
            streamRef.current = stream
            setScanning(true)

            // Wait a tick for the video element to mount.
            await new Promise((resolve) => setTimeout(resolve, 50))
            const video = videoRef.current
            if (!video) {
                stopScan()
                return
            }
            video.srcObject = stream
            await video.play()

            const detector = new Detector({ formats: ['qr_code'] })
            const poll = setInterval(async () => {
                if (!streamRef.current) {
                    clearInterval(poll)
                    return
                }
                try {
                    const codes = await detector.detect(video)
                    const match = codes.find((c) =>
                        c.rawValue.startsWith('MT:')
                    )
                    if (match) {
                        clearInterval(poll)
                        onCode(match.rawValue)
                        stopScan()
                    }
                } catch {
                    // Frame not ready yet; keep polling.
                }
            }, 300)
        } catch {
            // Camera denied/unavailable — fall back to photo upload.
            stopScan()
            fileInputRef.current?.click()
        }
    }

    async function scanFile(file: File) {
        const Detector = getBarcodeDetector()
        if (!Detector) return
        try {
            const bitmap = await createImageBitmap(file)
            const detector = new Detector({ formats: ['qr_code'] })
            const codes = await detector.detect(bitmap)
            const match = codes.find((c) => c.rawValue.startsWith('MT:'))
            if (match) onCode(match.rawValue)
        } catch {
            // Unreadable image; user can retry or type the code.
        }
    }

    if (!supported) return null

    return (
        <>
            <Button
                onClick={() => {
                    if (scanning) {
                        stopScan()
                    } else if (cameraSupported) {
                        void startCameraScan()
                    } else {
                        fileInputRef.current?.click()
                    }
                }}
                type="button"
                variant="outline"
            >
                <ScanLineIcon data-icon="inline-start" />
                {scanning ? 'Stop' : 'Scan'}
            </Button>
            <input
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(event) => {
                    const file = event.target.files?.[0]
                    if (file) void scanFile(file)
                    event.target.value = ''
                }}
                ref={fileInputRef}
                type="file"
            />
            {scanning ? (
                <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/80 p-6">
                    <video
                        className="max-h-[70vh] w-full max-w-md rounded-lg"
                        muted
                        playsInline
                        ref={videoRef}
                    />
                    <p className="text-sm text-white">
                        Point the camera at the Matter QR code
                    </p>
                    <Button onClick={stopScan} variant="secondary">
                        Cancel
                    </Button>
                </div>
            ) : null}
        </>
    )
}

function DiscoverStep({
    devices,
    interviews,
    secondsRemaining,
    isHome,
    protocol,
    onSelect,
}: {
    devices: Device[]
    interviews: PairingInterview[]
    secondsRemaining: number
    isHome: boolean
    protocol: DeviceProtocol
    onSelect: (device: Device) => void
}) {
    const isMatter = protocol === 'matter'
    const steps = pairingChecklist(protocol, interviews, devices)
    const visibleInterviews = interviews.filter(
        (item) => item.externalId !== 'commissioning'
    )
    const showDevices = !isMatter || devices.length !== 1

    return (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(15rem,0.8fr)]">
            <Card className="min-h-96">
                <CardHeader>
                    <CardTitle className="text-lg">
                        {isMatter
                            ? 'Setting up your device'
                            : 'Searching nearby'}
                    </CardTitle>
                    <CardDescription>
                        {isMatter
                            ? 'This can take a few minutes. Keep the device close and powered.'
                            : 'Keep the device powered and in pairing mode.'}
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                    {!isHome ? (
                        <div className="rounded-lg border border-warning/20 bg-warning/5 p-3 text-sm">
                            Home connection lost. Reconnect before retrying.
                        </div>
                    ) : null}
                    <PairingChecklist steps={steps} />
                    <p className="text-muted-foreground text-xs">
                        {isMatter
                            ? 'This can keep going for a few minutes · '
                            : 'Pairing closes in '}
                        {formatCountdown(secondsRemaining)}
                    </p>
                    {visibleInterviews.map((interview) => (
                        <InterviewRow
                            interview={interview}
                            key={interview.externalId}
                        />
                    ))}
                    {showDevices
                        ? devices.map((device) => (
                              <DiscoveredDevice
                                  device={device}
                                  key={device.id}
                                  onSelect={() => onSelect(device)}
                              />
                          ))
                        : null}
                </CardContent>
            </Card>

            <PairingTips protocol={protocol} />
        </div>
    )
}

type ChecklistStep = {
    label: string
    state: 'done' | 'active' | 'pending'
}

function pairingChecklist(
    protocol: DeviceProtocol,
    interviews: PairingInterview[],
    devices: Device[]
): ChecklistStep[] {
    const found = devices.length > 0
    const connecting = interviews.some((item) => {
        const message = (item.message ?? '').toLowerCase()
        return (
            message.includes('connecting') ||
            message.includes('waiting for the controller')
        )
    })
    const adding = interviews.some((item) =>
        (item.message ?? '').toLowerCase().includes('adding it to your home')
    )
    const joined =
        found ||
        interviews.some(
            (item) =>
                item.externalId !== 'commissioning' &&
                item.status === 'successful'
        )

    if (protocol === 'matter') {
        const lookingDone = connecting || adding || joined
        const connectingDone = adding || joined
        return [
            {
                label: 'Looking for your device',
                state: lookingDone ? 'done' : 'active',
            },
            {
                label: 'Connecting to your device',
                state: connectingDone
                    ? 'done'
                    : connecting
                      ? 'active'
                      : 'pending',
            },
            {
                label: 'Adding it to your home',
                state: found
                    ? 'done'
                    : adding || connectingDone
                      ? 'active'
                      : 'pending',
            },
        ]
    }

    return [
        {
            label: 'Listening for nearby devices',
            state: found || interviews.length > 0 ? 'done' : 'active',
        },
        {
            label: 'Found a device',
            state: found
                ? 'done'
                : interviews.length > 0
                  ? 'active'
                  : 'pending',
        },
    ]
}

function PairingChecklist({ steps }: { steps: ChecklistStep[] }) {
    return (
        <ol className="space-y-3">
            {steps.map((step) => (
                <li className="flex items-center gap-3" key={step.label}>
                    {step.state === 'done' ? (
                        <CheckIcon className="size-4 text-primary" />
                    ) : step.state === 'active' ? (
                        <LoaderCircleIcon className="size-4 animate-spin text-primary" />
                    ) : (
                        <span className="size-4 rounded-full border border-muted-foreground/40" />
                    )}
                    <span
                        className={`text-sm ${
                            step.state === 'pending'
                                ? 'text-muted-foreground'
                                : 'font-medium'
                        }`}
                    >
                        {step.label}
                    </span>
                </li>
            ))}
        </ol>
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

function InterviewRow({ interview }: { interview: PairingInterview }) {
    const title =
        interview.status === 'failed'
            ? 'Could not add this device'
            : interview.status === 'successful'
              ? 'Device added'
              : (interview.message ?? 'Setting up your device')

    return (
        <div className="flex items-center gap-3 rounded-lg bg-muted/40 p-3">
            {interview.status === 'failed' ? (
                <CircleAlertIcon className="size-4 text-destructive" />
            ) : interview.status === 'successful' ? (
                <CheckIcon className="size-4 text-primary" />
            ) : (
                <LoaderCircleIcon className="size-4 animate-spin text-primary" />
            )}
            <p className="min-w-0 font-medium text-sm">{title}</p>
        </div>
    )
}

function PairingTips({ protocol }: { protocol: DeviceProtocol }) {
    const isMatter = protocol === 'matter'

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
                        detail={
                            isMatter
                                ? 'Find the QR code or 11-digit pairing code on the device or its packaging.'
                                : 'Follow its reset instructions until the status light starts blinking.'
                        }
                        number="1"
                        title={
                            isMatter
                                ? 'Locate the pairing code'
                                : 'Reset the device'
                        }
                    />
                    <Separator />
                    <Tip
                        detail={
                            isMatter
                                ? 'New Wi-Fi devices pair over Bluetooth — keep them close to the controller. Devices already on the LAN or Ethernet do not need to be nearby.'
                                : 'Place it within a few feet of your Nemu controller for pairing.'
                        }
                        number="2"
                        title="Bring it nearby"
                    />
                    <Separator />
                    <Tip
                        detail={
                            isMatter
                                ? 'Leave it powered. If it must join Wi-Fi, enter the 2.4 GHz network above; skip that if it is already on this network.'
                                : 'Leave the device powered while Nemu finishes configuration.'
                        }
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
                            <Badge variant="outline">Matter</Badge>
                        </div>
                        <p className="mt-1 text-muted-foreground text-xs leading-relaxed">
                            Lights, plugs, power strips, switches, and sensors
                            over Zigbee or Matter Wi-Fi.
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
