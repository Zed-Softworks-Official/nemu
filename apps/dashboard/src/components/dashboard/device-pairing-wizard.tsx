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
    QrCodeIcon,
    RadioTowerIcon,
    RotateCwIcon,
    RouterIcon,
    ScanLineIcon,
    WifiIcon,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { presentDevice } from '~/lib/device-presentation'
import { DeviceIcon } from './device-icon'
import { PageHeader } from './page-header'

const zigbeeStepLabels = ['Prepare', 'Discover', 'Configure'] as const

const MATTER_STAGES = [
    { id: 'looking', label: 'Looking for your device' },
    { id: 'connecting', label: 'Connecting securely' },
    { id: 'wifi', label: 'Sending your Wi-Fi details' },
    { id: 'joining', label: 'Joining your home' },
    { id: 'setting_up', label: 'Setting up the device' },
    { id: 'connected', label: 'Connected' },
] as const

export function DevicePairingWizard() {
    const pairing = useDevicePairing()
    const router = useRouter()
    const [name, setName] = useState('')
    const [roomId, setRoomId] = useState<string | null>(null)
    const [matterCode, setMatterCode] = useState('')
    const [wifiName, setWifiName] = useState('')
    const [wifiPassword, setWifiPassword] = useState('')
    const [useSavedWifi, setUseSavedWifi] = useState(true)
    const [manualCode, setManualCode] = useState(false)
    const [offeredWifi, setOfferedWifi] = useState(false)

    useEffect(() => {
        if (pairing.selectedDevice) {
            setName(pairing.selectedDevice.name)
            setRoomId(pairing.selectedDevice.roomId ?? null)
        }
    }, [pairing.selectedDevice])

    const savedWifi = pairing.savedWifi
    const hasSavedWifi = savedWifi?.configured === true

    async function saveDevice() {
        const trimmedName = name.trim()
        if (!trimmedName) return

        const updated = await pairing.configureDevice({
            name: trimmedName,
            roomId,
        })
        router.push(`/devices/${updated.id}`)
    }

    function startZigbee() {
        void pairing.startDiscovery()
    }

    function beginMatterCommission(includeWifi: boolean) {
        const usingSaved = includeWifi && useSavedWifi && hasSavedWifi
        const typedName = wifiName.trim()
        const sendTyped = includeWifi && !usingSaved && typedName.length > 0
        setOfferedWifi(includeWifi)
        const request = {
            code: matterCode.trim(),
            wifiSsid: sendTyped ? typedName : undefined,
            wifiPassword: sendTyped ? wifiPassword : undefined,
        }
        void pairing.startMatterCommission(request)
    }

    function leaveWizard() {
        pairing.reset()
        router.push('/devices')
    }

    const zigbeeStep =
        pairing.phase === 'idle' || pairing.phase === 'error'
            ? 0
            : pairing.phase === 'discovering'
              ? 1
              : 2

    const pageTitle =
        pairing.pairingKind === 'unset'
            ? 'Add a device'
            : pairing.pairingKind === 'matter'
              ? matterTitle(pairing.matterStep, pairing.phase)
              : getZigbeeTitle(pairing.phase)

    return (
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-8">
            <PageHeader
                actions={
                    <Button onClick={leaveWizard} size="sm" variant="ghost">
                        <ArrowLeftIcon data-icon="inline-start" />
                        Back to devices
                    </Button>
                }
                description="Add a Matter or Zigbee device to this home."
                eyebrow="Add device"
                title={pageTitle}
            />

            {pairing.pairingKind === 'zigbee' && pairing.phase !== 'error' ? (
                <StepIndicator currentStep={zigbeeStep} />
            ) : null}

            {pairing.pairingKind === 'unset' ? (
                <ChooseProtocolStep
                    onChooseMatter={pairing.chooseMatter}
                    onChooseZigbee={pairing.chooseZigbee}
                />
            ) : null}

            {pairing.pairingKind === 'zigbee' && pairing.phase === 'idle' ? (
                <ZigbeePrepareStep
                    connectionLabel={pairing.status.label}
                    isHome={pairing.status.mode === 'lan'}
                    onBack={pairing.reset}
                    onStart={startZigbee}
                />
            ) : null}

            {pairing.pairingKind === 'matter' &&
            pairing.phase === 'idle' &&
            pairing.matterStep === 'ready' ? (
                <MatterReadyStep
                    onBack={pairing.reset}
                    onNext={() => pairing.setMatterStep('scan')}
                />
            ) : null}

            {pairing.pairingKind === 'matter' &&
            pairing.phase === 'idle' &&
            pairing.matterStep === 'scan' ? (
                <MatterScanStep
                    code={matterCode}
                    manual={manualCode}
                    onBack={() => pairing.setMatterStep('ready')}
                    onCodeChange={setMatterCode}
                    onContinue={() => pairing.setMatterStep('wifi')}
                    onManualChange={setManualCode}
                />
            ) : null}

            {pairing.pairingKind === 'matter' &&
            pairing.phase === 'idle' &&
            pairing.matterStep === 'wifi' ? (
                <MatterWifiStep
                    hasSavedWifi={hasSavedWifi}
                    networkName={savedWifi?.networkName}
                    onBack={() => pairing.setMatterStep('scan')}
                    onPasswordChange={setWifiPassword}
                    onSkip={() => beginMatterCommission(false)}
                    onStart={() => beginMatterCommission(true)}
                    onUseSavedChange={setUseSavedWifi}
                    onWifiNameChange={setWifiName}
                    useSaved={useSavedWifi && hasSavedWifi}
                    wifiName={wifiName}
                    wifiPassword={wifiPassword}
                />
            ) : null}

            {pairing.phase === 'discovering' &&
            pairing.pairingKind === 'matter' ? (
                <MatterConnectingStep
                    progress={pairing.commissionProgress}
                    sendingWifi={offeredWifi}
                />
            ) : null}

            {pairing.phase === 'discovering' &&
            pairing.pairingKind === 'zigbee' ? (
                <ZigbeeDiscoverStep
                    devices={pairing.discoveredDevices}
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
                        'Put the device back in pairing mode and try again.'
                    }
                    onReset={pairing.reset}
                    onRetry={() => {
                        if (pairing.pairingKind === 'matter') {
                            beginMatterCommission(true)
                            return
                        }
                        startZigbee()
                    }}
                />
            ) : null}
        </div>
    )
}

function ChooseProtocolStep({
    onChooseMatter,
    onChooseZigbee,
}: {
    onChooseMatter: () => void
    onChooseZigbee: () => void
}) {
    return (
        <div className="grid gap-4 md:grid-cols-2">
            <button
                className="rounded-2xl border bg-card p-8 text-left shadow-sm transition-colors hover:border-primary"
                onClick={onChooseMatter}
                type="button"
            >
                <div className="mb-6 flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <QrCodeIcon className="size-7" />
                </div>
                <h2 className="font-semibold text-2xl">Works with Matter</h2>
                <p className="mt-2 text-muted-foreground leading-relaxed">
                    Look for the Matter logo on the box. Scan a code to add
                    lights, plugs, and power strips.
                </p>
            </button>
            <button
                className="rounded-2xl border bg-card p-8 text-left shadow-sm transition-colors hover:border-primary"
                onClick={onChooseZigbee}
                type="button"
            >
                <div className="mb-6 flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <RadioTowerIcon className="size-7" />
                </div>
                <h2 className="font-semibold text-2xl">Zigbee</h2>
                <p className="mt-2 text-muted-foreground leading-relaxed">
                    The device blinks near the controller while it joins your
                    home.
                </p>
            </button>
        </div>
    )
}

function ZigbeePrepareStep({
    isHome,
    connectionLabel,
    onStart,
    onBack,
}: {
    isHome: boolean
    connectionLabel: string
    onStart: () => void
    onBack: () => void
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
                                        ? 'Keep the device close while it joins.'
                                        : 'Device pairing requires a Home connection to the controller.'}
                                </p>
                            </div>
                        </div>
                    </div>
                </CardContent>
                <CardFooter className="justify-between border-t">
                    <Button onClick={onBack} variant="ghost">
                        Back
                    </Button>
                    <Button disabled={!isHome} onClick={onStart}>
                        <RadioTowerIcon data-icon="inline-start" />
                        Start discovery
                    </Button>
                </CardFooter>
            </Card>
            <ZigbeeTips />
        </div>
    )
}

function MatterReadyStep({
    onNext,
    onBack,
}: {
    onNext: () => void
    onBack: () => void
}) {
    return (
        <Card className="mx-auto w-full max-w-2xl">
            <CardHeader className="text-center">
                <div className="mx-auto mb-5 flex size-16 items-center justify-center rounded-full border bg-muted/40 text-primary">
                    <LightbulbIcon className="size-6" />
                </div>
                <CardTitle className="text-2xl">Get the device ready</CardTitle>
                <CardDescription className="mx-auto max-w-md text-base leading-relaxed">
                    Put the device in pairing mode (usually a reset until a
                    light blinks) and keep it near the controller.
                </CardDescription>
            </CardHeader>
            <CardFooter className="justify-between border-t">
                <Button onClick={onBack} variant="ghost">
                    Back
                </Button>
                <Button onClick={onNext}>Next</Button>
            </CardFooter>
        </Card>
    )
}

function MatterScanStep({
    code,
    manual,
    onCodeChange,
    onManualChange,
    onContinue,
    onBack,
}: {
    code: string
    manual: boolean
    onCodeChange: (code: string) => void
    onManualChange: (manual: boolean) => void
    onContinue: () => void
    onBack: () => void
}) {
    const valid = isValidMatterCode(code)

    return (
        <Card className="mx-auto w-full max-w-2xl">
            <CardHeader className="text-center">
                <div className="mx-auto mb-5 flex size-16 items-center justify-center rounded-full border bg-muted/40 text-primary">
                    <ScanLineIcon className="size-6" />
                </div>
                <CardTitle className="text-2xl">Scan the code</CardTitle>
                <CardDescription className="mx-auto max-w-md text-base leading-relaxed">
                    Point the camera at the Matter QR code on the device or its
                    packaging.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex justify-center">
                    <MatterQrScanButton onCode={onCodeChange} />
                </div>
                {manual ? (
                    <div className="grid gap-2">
                        <label
                            className="font-medium text-sm"
                            htmlFor="matter-code"
                        >
                            Pairing code
                        </label>
                        <Input
                            autoComplete="off"
                            id="matter-code"
                            onChange={(event) =>
                                onCodeChange(event.target.value)
                            }
                            placeholder="11-digit code"
                            value={code}
                        />
                    </div>
                ) : (
                    <div className="text-center">
                        <Button
                            onClick={() => onManualChange(true)}
                            variant="ghost"
                        >
                            Enter a code instead
                        </Button>
                    </div>
                )}
                {code && !valid ? (
                    <p className="text-center text-destructive text-sm">
                        Use the Matter QR code or an 11-digit pairing code.
                    </p>
                ) : null}
                {valid ? (
                    <p className="text-center text-muted-foreground text-sm">
                        Code ready
                    </p>
                ) : null}
            </CardContent>
            <CardFooter className="justify-between border-t">
                <Button onClick={onBack} variant="ghost">
                    Back
                </Button>
                <Button disabled={!valid} onClick={onContinue}>
                    Next
                </Button>
            </CardFooter>
        </Card>
    )
}

function MatterWifiStep({
    hasSavedWifi,
    networkName,
    useSaved,
    wifiName,
    wifiPassword,
    onWifiNameChange,
    onPasswordChange,
    onUseSavedChange,
    onStart,
    onSkip,
    onBack,
}: {
    hasSavedWifi: boolean
    networkName?: string
    useSaved: boolean
    wifiName: string
    wifiPassword: string
    onWifiNameChange: (value: string) => void
    onPasswordChange: (value: string) => void
    onUseSavedChange: (value: boolean) => void
    onStart: () => void
    onSkip: () => void
    onBack: () => void
}) {
    const canStart = useSaved || wifiName.trim().length > 0

    return (
        <Card className="mx-auto w-full max-w-2xl">
            <CardHeader className="text-center">
                <div className="mx-auto mb-5 flex size-16 items-center justify-center rounded-full border bg-muted/40 text-primary">
                    <WifiIcon className="size-6" />
                </div>
                <CardTitle className="text-2xl">Home Wi-Fi</CardTitle>
                <CardDescription className="mx-auto max-w-md text-base leading-relaxed">
                    New devices need the 2.4 GHz home network. Skip this if the
                    device is already on your home network.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {hasSavedWifi ? (
                    <button
                        className={`w-full rounded-xl border p-4 text-left ${
                            useSaved ? 'border-primary bg-primary/5' : ''
                        }`}
                        onClick={() => onUseSavedChange(true)}
                        type="button"
                    >
                        <p className="font-medium">Use saved home Wi-Fi</p>
                        {networkName ? (
                            <p className="mt-1 text-muted-foreground text-sm">
                                {networkName}
                            </p>
                        ) : null}
                    </button>
                ) : null}
                <div className="grid gap-2">
                    {hasSavedWifi ? (
                        <Button
                            onClick={() => onUseSavedChange(false)}
                            variant="ghost"
                        >
                            Use a different network
                        </Button>
                    ) : null}
                    {!useSaved ? (
                        <>
                            <label
                                className="font-medium text-sm"
                                htmlFor="matter-wifi-name"
                            >
                                2.4 GHz home network
                            </label>
                            <Input
                                autoComplete="off"
                                id="matter-wifi-name"
                                onChange={(event) =>
                                    onWifiNameChange(event.target.value)
                                }
                                placeholder="Network name"
                                value={wifiName}
                            />
                            <Input
                                autoComplete="off"
                                id="matter-wifi-password"
                                onChange={(event) =>
                                    onPasswordChange(event.target.value)
                                }
                                placeholder="Password"
                                type="password"
                                value={wifiPassword}
                            />
                        </>
                    ) : null}
                </div>
            </CardContent>
            <CardFooter className="justify-between border-t">
                <Button onClick={onBack} variant="ghost">
                    Back
                </Button>
                <div className="flex gap-2">
                    <Button disabled={!canStart} onClick={onStart}>
                        Connect
                    </Button>
                    <Button onClick={onSkip} variant="ghost">
                        Already on this network
                    </Button>
                </div>
            </CardFooter>
        </Card>
    )
}

function MatterConnectingStep({
    progress,
    sendingWifi,
}: {
    progress: { stage: string; message?: string } | null
    sendingWifi: boolean
}) {
    const current = progress?.stage ?? 'looking'
    const stages = MATTER_STAGES.filter(
        (stage) => stage.id !== 'wifi' || sendingWifi || current === 'wifi'
    )
    const currentIndex = Math.max(
        0,
        stages.findIndex((stage) => stage.id === current)
    )

    return (
        <Card className="mx-auto w-full max-w-2xl">
            <CardHeader className="text-center">
                <CardTitle className="text-2xl">Connecting</CardTitle>
                <CardDescription className="text-base">
                    This can take up to a minute. Keep the device close and
                    powered.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <ol className="space-y-4">
                    {stages.map((stage, index) => {
                        const state =
                            index < currentIndex
                                ? 'done'
                                : index === currentIndex
                                  ? 'active'
                                  : 'pending'
                        return (
                            <li
                                className="flex items-center gap-3"
                                key={stage.id}
                            >
                                {state === 'done' ? (
                                    <CheckIcon className="size-5 text-primary" />
                                ) : state === 'active' ? (
                                    <LoaderCircleIcon className="size-5 animate-spin text-primary" />
                                ) : (
                                    <span className="size-5 rounded-full border border-muted-foreground/40" />
                                )}
                                <span
                                    className={`text-lg ${
                                        state === 'pending'
                                            ? 'text-muted-foreground'
                                            : 'font-medium'
                                    }`}
                                >
                                    {stage.label}
                                </span>
                            </li>
                        )
                    })}
                </ol>
            </CardContent>
        </Card>
    )
}

function StepIndicator({ currentStep }: { currentStep: number }) {
    return (
        <ol className="grid grid-cols-3 gap-2">
            {zigbeeStepLabels.map((label, index) => (
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
                    {index < zigbeeStepLabels.length - 1 ? (
                        <span className="ml-auto h-px flex-1 bg-border" />
                    ) : null}
                </li>
            ))}
        </ol>
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

    const stopScan = useCallbackStable(() => {
        for (const track of streamRef.current?.getTracks() ?? []) {
            track.stop()
        }
        streamRef.current = null
        setScanning(false)
    })

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
                    const match = codes.find((item) =>
                        item.rawValue.toUpperCase().startsWith('MT:')
                    )
                    if (match) {
                        clearInterval(poll)
                        onCode(match.rawValue)
                        stopScan()
                    }
                } catch {
                    // Frame not ready yet.
                }
            }, 300)
        } catch {
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
            const match = codes.find((item) =>
                item.rawValue.toUpperCase().startsWith('MT:')
            )
            if (match) onCode(match.rawValue)
        } catch {
            // Unreadable image.
        }
    }

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
                size="lg"
                type="button"
                variant="outline"
            >
                <ScanLineIcon data-icon="inline-start" />
                {scanning
                    ? 'Stop'
                    : supported
                      ? 'Scan QR code'
                      : 'Choose a photo'}
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

function useCallbackStable(fn: () => void) {
    const ref = useRef(fn)
    ref.current = fn
    return () => ref.current()
}

function ZigbeeDiscoverStep({
    devices,
    secondsRemaining,
    isHome,
    onSelect,
}: {
    devices: Device[]
    secondsRemaining: number
    isHome: boolean
    onSelect: (device: Device) => void
}) {
    return (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(15rem,0.8fr)]">
            <Card className="min-h-96">
                <CardHeader>
                    <CardTitle className="text-lg">Searching nearby</CardTitle>
                    <CardDescription>
                        Keep the device powered and in pairing mode.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                    {!isHome ? (
                        <div className="rounded-lg border border-warning/20 bg-warning/5 p-3 text-sm">
                            Home connection lost. Reconnect before retrying.
                        </div>
                    ) : null}
                    <p className="text-muted-foreground text-xs">
                        Pairing closes in {formatCountdown(secondsRemaining)}
                    </p>
                    {devices.map((device) => (
                        <DiscoveredDevice
                            device={device}
                            key={device.id}
                            onSelect={() => onSelect(device)}
                        />
                    ))}
                </CardContent>
            </Card>
            <ZigbeeTips />
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
    const presented = selectedDevice ? presentDevice(selectedDevice) : null
    const typeLabel =
        presented?.outlets && presented.outlets.length > 0
            ? `Power strip · ${presented.outlets.length} outlets`
            : (selectedDevice?.model ?? selectedDevice?.type)

    return (
        <Card className="mx-auto w-full max-w-2xl">
            <CardHeader>
                <CardTitle>Name and room</CardTitle>
                <CardDescription>
                    Give the device a clear name and choose where it belongs.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
                {selectedDevice && presented ? (
                    <div className="flex items-center gap-3 rounded-lg bg-muted/40 p-3">
                        <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                            <DeviceIcon category={presented.category} />
                        </div>
                        <div>
                            <p className="font-medium text-sm">
                                {selectedDevice.name}
                            </p>
                            <p className="text-muted-foreground text-xs">
                                {typeLabel}
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
                <CardTitle>Could not add the device</CardTitle>
                <CardDescription className="text-base">{message}</CardDescription>
            </CardHeader>
            <CardFooter className="justify-center gap-2 border-t">
                <Button onClick={onReset} variant="ghost">
                    Start over
                </Button>
                <Button onClick={onRetry}>
                    <RotateCwIcon data-icon="inline-start" />
                    Retry
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

function ZigbeeTips() {
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

function isValidMatterCode(code: string): boolean {
    const trimmed = code.trim()
    if (trimmed.toUpperCase().startsWith('MT:')) {
        return trimmed.length > 3
    }
    const digits = trimmed.replace(/\D/g, '')
    return digits.length === 11 || digits.length === 21
}

function matterTitle(
    step: string | null,
    phase: string
): string {
    if (phase === 'error') return 'Pairing needs attention'
    if (phase === 'configuring' || phase === 'saving' || phase === 'success') {
        return 'Finish setting up your device'
    }
    if (step === 'ready') return 'Get the device ready'
    if (step === 'scan') return 'Scan the code'
    if (step === 'wifi') return 'Home Wi-Fi'
    if (step === 'connecting' || phase === 'discovering') return 'Connecting'
    return 'Add a Matter device'
}

function getZigbeeTitle(phase: string): string {
    if (phase === 'discovering') return 'Searching for nearby devices'
    if (phase === 'configuring' || phase === 'saving' || phase === 'success') {
        return 'Finish setting up your device'
    }
    if (phase === 'error') return 'Pairing needs attention'
    return 'Pair a Zigbee device'
}

function formatCountdown(seconds: number): string {
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
}
