import { useDevicePairing } from '@nemu/controller'
import type { Device } from '@nemu/protocol'
import { useRouter, useSegments } from 'expo-router'
import { type ComponentType, useState } from 'react'
import { TextInput, View } from 'react-native'

import { DevicesView } from '~/components/control-surface'
import {
    ControllerSheet,
    useControllerSheet,
} from '~/components/controller-sheet'
import { DeviceNameAndRoom } from '~/components/device-setup'
import { useHomeControl } from '~/components/home-control'
import { Button } from '~/components/ui/button'
import { Text } from '~/components/ui/text'
import { colors } from '~/constants/colors'
import { readMatterCode } from '~/lib/matter-code'
import { addDeviceHref } from '~/lib/tab-routes'

/**
 * Reads QR codes for the Matter step. The app passes the camera; tests pass
 * a stand-in. Without one, the Matter step takes a typed code only.
 */
export type CodeScanner = ComponentType<{ onCode: (data: string) => void }>

/**
 * The Devices tab: the Device list, and adding a Device whenever the phone
 * reaches the Controller. Every Membership may commission, with Matter only
 * on the Home network for now (ADR-0034). Adding opens as a sheet above the list.
 */
export function DevicesTab() {
    const { live } = useHomeControl()
    const router = useRouter()
    const segments = useSegments()

    return (
        <View className="min-h-0 flex-1 gap-4">
            {live ? (
                <View className="flex-row">
                    <Button
                        onPress={() => router.push(addDeviceHref(segments))}
                        title="Add a Device"
                        variant="outline"
                    />
                </View>
            ) : null}
            <View className="min-h-0 flex-1">
                <DevicesView />
            </View>
        </View>
    )
}

const MATTER_STAGES: Record<string, string> = {
    looking: 'Looking for your Device',
    wifi: 'Sending your Wi‑Fi details',
    joining: 'Joining your Home',
    setting_up: 'Setting up the Device',
    connected: 'Connected',
}

/**
 * Commission a Matter or Zigbee Device, then name it and choose its Room.
 * The phone hands the pairing code to the Controller, which stays the Matter
 * commissioner and fabric authority. Cancelling, or closing the sheet, stops
 * it on the Controller.
 *
 * The sheet stays open while the connection is re-checked, moves between LAN
 * and Relay, or drops, so commissioning the Controller already started is
 * picked up again once it is back.
 */
export function AddDeviceSheet({
    Scanner,
    onClose,
}: {
    Scanner?: CodeScanner
    /** Unmounts this sheet, which stops commissioning on the Controller. */
    onClose: () => void
}) {
    const { status } = useHomeControl()

    return (
        <ControllerSheet
            detail={
                status.mode === 'probing'
                    ? 'Reconnecting to your Home…'
                    : undefined
            }
            onClose={onClose}
            title="Add a Device"
        >
            <AddDeviceSteps onClose={onClose} Scanner={Scanner} />
        </ControllerSheet>
    )
}

function AddDeviceSteps({
    Scanner,
    onClose,
}: {
    Scanner?: CodeScanner
    onClose: () => void
}) {
    const { reachable } = useControllerSheet()
    const pairing = useDevicePairing()
    const { showNotice } = useHomeControl()
    const [notice, setNotice] = useState<string | null>(null)

    function cancel() {
        pairing.reset()
        setNotice('Cancelled. Nothing was added.')
    }

    function finished(name: string) {
        showNotice(`Added ${name}.`)
        onClose()
    }

    const step = (() => {
        const { phase, pairingKind, selectedDevice } = pairing
        if (
            selectedDevice &&
            (phase === 'configuring' ||
                phase === 'saving' ||
                phase === 'success')
        ) {
            return (
                <NameNewDevice device={selectedDevice} onFinished={finished} />
            )
        }
        if (phase === 'error') {
            return (
                <View accessibilityRole="alert" className="gap-3">
                    <Text className="font-medium text-foreground">
                        The Device wasn’t added
                    </Text>
                    <Text className="text-muted-foreground text-sm leading-relaxed">
                        {pairing.error?.message ??
                            'Put the Device back in pairing mode and try again.'}
                    </Text>
                    <View className="flex-row">
                        <Button
                            disabled={!reachable}
                            onPress={pairing.reset}
                            title="Start over"
                        />
                    </View>
                </View>
            )
        }
        if (phase === 'discovering' && pairingKind === 'matter') {
            const progress = pairing.commissionProgress
            return (
                <Working
                    detail="Keep the Device powered and near the Controller."
                    onCancel={cancel}
                    title={
                        progress?.message ??
                        (progress
                            ? (MATTER_STAGES[progress.stage] ?? progress.stage)
                            : 'Starting…')
                    }
                />
            )
        }
        if (phase === 'discovering' && pairingKind === 'zigbee') {
            return (
                <ZigbeeSearch
                    devices={pairing.discoveredDevices}
                    onCancel={cancel}
                    onSelect={(device) => void pairing.selectDevice(device)}
                    secondsRemaining={pairing.secondsRemaining}
                />
            )
        }
        if (pairingKind === 'matter' && pairing.matterNeedsHomeNetwork) {
            // Also reached when the phone leaves the Home network mid-flow.
            return (
                <View className="gap-3">
                    <MatterNeedsHomeNetwork />
                    <View className="flex-row">
                        <Button
                            onPress={pairing.reset}
                            title="Back"
                            variant="outline"
                        />
                    </View>
                </View>
            )
        }
        if (pairingKind === 'matter') {
            return (
                <MatterCodeStep
                    onCode={(code) => {
                        setNotice(null)
                        void pairing.startMatterCommission({ code })
                    }}
                    Scanner={Scanner}
                    wifiConfigured={pairing.savedWifi?.configured}
                />
            )
        }
        if (pairingKind === 'zigbee') {
            return (
                <View className="gap-3">
                    <Text className="text-muted-foreground text-sm leading-relaxed">
                        Reset the Device until its light blinks, and keep it
                        near the Controller while it joins.
                    </Text>
                    <View className="flex-row">
                        <Button
                            disabled={!reachable}
                            onPress={() => {
                                setNotice(null)
                                void pairing.startDiscovery()
                            }}
                            title="Start searching"
                        />
                    </View>
                </View>
            )
        }
        return (
            <View className="gap-3">
                <Text className="text-muted-foreground text-sm leading-relaxed">
                    What kind of Device is it? Look for the Matter logo on the
                    Device or its box.
                </Text>
                <View className="flex-row gap-3">
                    <Button
                        disabled={!reachable || pairing.matterNeedsHomeNetwork}
                        onPress={() => {
                            setNotice(null)
                            pairing.chooseMatter()
                        }}
                        title="Matter"
                        variant="outline"
                    />
                    <Button
                        disabled={!reachable}
                        onPress={() => {
                            setNotice(null)
                            pairing.chooseZigbee()
                        }}
                        title="Zigbee"
                        variant="outline"
                    />
                </View>
                {pairing.matterNeedsHomeNetwork ? (
                    <MatterNeedsHomeNetwork />
                ) : null}
            </View>
        )
    })()

    return (
        <>
            {notice ? (
                <Text
                    accessibilityLiveRegion="polite"
                    className="text-muted-foreground text-sm"
                >
                    {notice}
                </Text>
            ) : null}
            {step}
        </>
    )
}

/** Pairing codes and Wi-Fi credentials never cross Relay (ADR-0034, NEM-63). */
function MatterNeedsHomeNetwork() {
    return (
        <Text accessibilityRole="alert" className="text-sm leading-relaxed">
            Matter Devices can only be added on your Home network, because the
            pairing code isn’t sent over Relay. Connect this phone to your Home
            network to add one.
        </Text>
    )
}

function MatterCodeStep({
    Scanner,
    wifiConfigured,
    onCode,
}: {
    Scanner?: CodeScanner
    wifiConfigured: boolean | undefined
    onCode: (code: string) => void
}) {
    const { reachable } = useControllerSheet()
    const [typing, setTyping] = useState(Scanner === undefined)
    const [entry, setEntry] = useState('')
    const [scanProblem, setScanProblem] = useState<string | null>(null)
    const typed = readMatterCode(entry)

    function scanned(data: string) {
        // The camera keeps reading; nothing scanned now is sent later.
        if (!reachable) return
        const reading = readMatterCode(data)
        if (reading.ok) onCode(reading.code)
        else setScanProblem(reading.problem)
    }

    return (
        <View className="gap-4">
            <Text className="text-muted-foreground text-sm leading-relaxed">
                Put the Device in pairing mode, then scan its Matter QR code or
                type the 11-digit pairing code.
            </Text>
            {wifiConfigured === false ? (
                <Text className="text-muted-foreground text-xs leading-relaxed">
                    Wi‑Fi Devices need the Home Wi‑Fi saved on the Controller
                    first. An Owner can save it on the dashboard.
                </Text>
            ) : null}
            {Scanner && !typing ? (
                <View className="gap-3">
                    <Scanner onCode={scanned} />
                    {scanProblem ? (
                        <Text
                            accessibilityRole="alert"
                            className="text-destructive text-sm"
                        >
                            {scanProblem}
                        </Text>
                    ) : null}
                    <View className="flex-row">
                        <Button
                            disabled={!reachable}
                            onPress={() => setTyping(true)}
                            title="Enter the code instead"
                            variant="ghost"
                        />
                    </View>
                </View>
            ) : (
                <View className="gap-3">
                    <TextInput
                        accessibilityLabel="Pairing code"
                        autoCorrect={false}
                        className="h-11 rounded-sm border border-border px-3 text-foreground"
                        editable={reachable}
                        inputMode="numeric"
                        onChangeText={setEntry}
                        placeholder="11-digit code"
                        placeholderTextColor={colors.mutedForeground}
                        value={entry}
                    />
                    {!typed.ok && typed.problem ? (
                        <Text className="text-destructive text-sm">
                            {typed.problem}
                        </Text>
                    ) : null}
                    <View className="flex-row gap-3">
                        <Button
                            disabled={!reachable || !typed.ok}
                            onPress={() => typed.ok && onCode(typed.code)}
                            title="Add Device"
                        />
                        {Scanner ? (
                            <Button
                                disabled={!reachable}
                                onPress={() => setTyping(false)}
                                title="Scan instead"
                                variant="ghost"
                            />
                        ) : null}
                    </View>
                </View>
            )}
        </View>
    )
}

function Working({
    title,
    detail,
    onCancel,
}: {
    title: string
    detail: string
    onCancel: () => void
}) {
    const { reachable } = useControllerSheet()

    return (
        <View className="gap-3">
            <Text
                accessibilityLiveRegion="polite"
                className="font-medium text-foreground"
            >
                {title}
            </Text>
            <Text className="text-muted-foreground text-sm leading-relaxed">
                {detail}
            </Text>
            <View className="flex-row">
                <Button
                    disabled={!reachable}
                    onPress={onCancel}
                    title="Cancel"
                    variant="outline"
                />
            </View>
        </View>
    )
}

function ZigbeeSearch({
    devices,
    secondsRemaining,
    onSelect,
    onCancel,
}: {
    devices: Device[]
    secondsRemaining: number
    onSelect: (device: Device) => void
    onCancel: () => void
}) {
    const { reachable } = useControllerSheet()

    return (
        <View className="gap-4">
            <Working
                detail={
                    secondsRemaining > 0
                        ? `The Controller accepts new Zigbee Devices for ${formatCountdown(secondsRemaining)}.`
                        : 'Opening the Controller to new Zigbee Devices.'
                }
                onCancel={onCancel}
                title="Searching for Devices…"
            />
            {devices.map((device) => (
                <View
                    className="flex-row items-center justify-between gap-3 rounded-sm border border-border p-3"
                    key={device.id}
                >
                    <Text className="min-w-0 flex-1 text-foreground">
                        {device.name}
                    </Text>
                    <Button
                        accessibilityLabel={`Set up ${device.name}`}
                        disabled={!reachable}
                        onPress={() => onSelect(device)}
                        title="Set up"
                    />
                </View>
            ))}
        </View>
    )
}

function NameNewDevice({
    device,
    onFinished,
}: {
    device: Device
    onFinished: (name: string) => void
}) {
    return (
        <View className="gap-3">
            <Text className="text-foreground">
                The Device joined your Home. Name it and choose its Room.
            </Text>
            <DeviceNameAndRoom
                device={device}
                onSaved={({ name }) => onFinished(name)}
                saveTitle="Finish"
            />
        </View>
    )
}

function formatCountdown(seconds: number): string {
    const minutes = Math.floor(seconds / 60)
    const rest = seconds % 60
    return `${minutes}:${rest.toString().padStart(2, '0')}`
}
