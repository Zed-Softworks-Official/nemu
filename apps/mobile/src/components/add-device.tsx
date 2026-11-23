import { useDevicePairing } from '@nemu/controller'
import type { Device } from '@nemu/protocol'
import { type ComponentType, useEffect, useState } from 'react'
import { ScrollView, TextInput, View } from 'react-native'

import { DevicesView } from '~/components/control-surface'
import { DeviceNameAndRoom } from '~/components/device-setup'
import { useHomeControl } from '~/components/home-control'
import { Button } from '~/components/ui/button'
import { Text } from '~/components/ui/text'
import { colors } from '~/constants/colors'
import { readMatterCode } from '~/lib/matter-code'

/**
 * Reads QR codes for the Matter step. The app passes the camera; tests pass
 * a stand-in. Without one, the Matter step takes a typed code only.
 */
export type CodeScanner = ComponentType<{ onCode: (data: string) => void }>

/**
 * The Devices tab: the Device list, and adding a Device when the phone is on
 * the Home network. Commissioning is LAN-only (ADR-0030).
 *
 * Adding stays mounted while the connection is re-checked (`probing`), so a
 * brief blip does not cancel commissioning. It stops only when the person
 * cancels or the connection settles on Relay or offline.
 */
export function DevicesTab({ Scanner }: { Scanner?: CodeScanner }) {
    const { status } = useHomeControl()
    const [adding, setAdding] = useState(false)
    const [stopped, setStopped] = useState(false)
    const settledAway = status.mode === 'relay' || status.mode === 'offline'

    useEffect(() => {
        if (adding && settledAway) {
            // Unmounting AddDevice stops commissioning on the Controller.
            setAdding(false)
            setStopped(true)
        }
    }, [adding, settledAway])

    if (adding && !settledAway) {
        return (
            <AddDevice
                onClose={() => setAdding(false)}
                Scanner={Scanner}
                waiting={status.mode !== 'lan'}
            />
        )
    }

    return (
        <View className="min-h-0 flex-1 gap-4">
            {stopped ? (
                <Text
                    accessibilityRole="alert"
                    className="text-muted-foreground text-sm leading-relaxed"
                >
                    Adding a Device stopped because this phone left the Home
                    network. Nothing new was added.
                </Text>
            ) : null}
            {status.mode === 'lan' ? (
                <View className="flex-row">
                    <Button
                        onPress={() => {
                            setStopped(false)
                            setAdding(true)
                        }}
                        title="Add a Device"
                        variant="outline"
                    />
                </View>
            ) : status.mode === 'relay' ? (
                <Text className="text-muted-foreground text-sm leading-relaxed">
                    {LAN_ONLY}
                </Text>
            ) : null}
            <View className="min-h-0 flex-1">
                <DevicesView />
            </View>
        </View>
    )
}

const LAN_ONLY =
    'Adding a Device needs this phone on the Home network. Join your Home’s Wi‑Fi, then try again.'

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
 * commissioner and fabric authority. Cancelling stops it on the Controller.
 */
export function AddDevice({
    Scanner,
    onClose,
    waiting = false,
}: {
    Scanner?: CodeScanner
    onClose: () => void
    /** The connection is being re-checked; the Controller keeps going. */
    waiting?: boolean
}) {
    const pairing = useDevicePairing()
    const { showNotice } = useHomeControl()
    const [notice, setNotice] = useState<string | null>(null)

    function cancel() {
        pairing.reset()
        setNotice('Cancelled. Nothing was added.')
    }

    function close() {
        pairing.reset()
        onClose()
    }

    function finished(name: string) {
        showNotice(`Added ${name}.`)
        close()
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
                        <Button onPress={pairing.reset} title="Start over" />
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
                        onPress={() => {
                            setNotice(null)
                            pairing.chooseMatter()
                        }}
                        title="Matter"
                        variant="outline"
                    />
                    <Button
                        onPress={() => {
                            setNotice(null)
                            pairing.chooseZigbee()
                        }}
                        title="Zigbee"
                        variant="outline"
                    />
                </View>
            </View>
        )
    })()

    const busy = pairing.phase === 'discovering'

    return (
        <ScrollView
            contentContainerClassName="gap-6 pb-8"
            keyboardShouldPersistTaps="handled"
        >
            <View className="flex-row items-center justify-between gap-3">
                <Text className="font-semibold text-foreground text-lg">
                    Add a Device
                </Text>
                {busy ? null : (
                    <Button onPress={close} title="Back" variant="ghost" />
                )}
            </View>
            {waiting ? (
                <Text
                    accessibilityLiveRegion="polite"
                    className="text-muted-foreground text-sm"
                >
                    Reconnecting to your Home network…
                </Text>
            ) : null}
            {notice ? (
                <Text
                    accessibilityLiveRegion="polite"
                    className="text-muted-foreground text-sm"
                >
                    {notice}
                </Text>
            ) : null}
            {step}
        </ScrollView>
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
    const [typing, setTyping] = useState(Scanner === undefined)
    const [entry, setEntry] = useState('')
    const [scanProblem, setScanProblem] = useState<string | null>(null)
    const typed = readMatterCode(entry)

    function scanned(data: string) {
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
                            disabled={!typed.ok}
                            onPress={() => typed.ok && onCode(typed.code)}
                            title="Add Device"
                        />
                        {Scanner ? (
                            <Button
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
                <Button onPress={onCancel} title="Cancel" variant="outline" />
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
