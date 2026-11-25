import { useController } from '@nemu/controller'
import type { Device } from '@nemu/protocol'
import { useEffect, useState } from 'react'
import { ActivityIndicator, View } from 'react-native'

import {
    availabilityLabel,
    CapabilityReadings,
    ControlRow,
    LoadErrorBanner,
} from '~/components/control-surface'
import {
    ControllerSheet,
    SheetSection,
    useControllerSheet,
} from '~/components/controller-sheet'
import {
    RoomChoice,
    SetupStatus,
    SetupTextInput,
    useSetupAction,
} from '~/components/device-setup'
import { useHomeControl } from '~/components/home-control'
import { Button } from '~/components/ui/button'
import { Text } from '~/components/ui/text'
import { colors } from '~/constants/colors'
import {
    capabilitiesForDevice,
    controlsForDevice,
    stateReadingsForDevice,
} from '~/lib/device-control'

/**
 * Everything about one Device: every control it supports, and an Edit
 * section to rename it, change its Room, or remove it. Renames and Room
 * changes apply at once; removing asks first.
 */
export function DeviceSheet({
    deviceId,
    onClose,
}: {
    deviceId: string
    onClose: () => void
}) {
    const {
        devices,
        status,
        stale,
        loadFailed,
        capabilities,
        capabilitiesCurrent,
        setSetupState,
    } = useHomeControl()
    const device = devices?.find((candidate) => candidate.id === deviceId)

    // Outcomes from an earlier opening don't belong to this one.
    useEffect(() => {
        for (const subject of ['rename', 'device-room', 'remove']) {
            setSetupState(`${subject}:${deviceId}`, { phase: 'idle' })
        }
    }, [deviceId, setSetupState])

    if (!device) {
        return (
            <ControllerSheet onClose={onClose} title="Device">
                <LoadErrorBanner />
                {loadFailed ? null : devices === undefined &&
                  status.mode !== 'offline' ? (
                    <ActivityIndicator color={colors.primary} />
                ) : (
                    <Text className="text-muted-foreground text-sm">
                        {devices === undefined
                            ? 'This Device can’t be shown until the Controller is reached.'
                            : 'This Device is no longer in this Home.'}
                    </Text>
                )}
            </ControllerSheet>
        )
    }

    const controls = controlsForDevice(device)
    const measurements = capabilitiesForDevice(device, capabilities)
    const readings = stateReadingsForDevice(device)
    const reports =
        controls.length > 0 || measurements.length > 0 || readings.length > 0

    return (
        <ControllerSheet
            detail={availabilityLabel(device, stale)}
            onClose={onClose}
            title={device.name}
        >
            <LoadErrorBanner />
            {controls.length > 0 ? (
                <SheetSection title="Controls">
                    {controls.map((control) => (
                        <ControlRow
                            control={control}
                            device={device}
                            key={control.key}
                        />
                    ))}
                </SheetSection>
            ) : null}
            {measurements.length > 0 || readings.length > 0 ? (
                <SheetSection title="Readings">
                    <CapabilityReadings
                        capabilities={readings}
                        current={!stale}
                    />
                    <CapabilityReadings
                        capabilities={measurements}
                        current={capabilitiesCurrent}
                    />
                </SheetSection>
            ) : null}
            {reports ? null : (
                <Text className="text-muted-foreground text-sm leading-relaxed">
                    {hasState(device)
                        ? 'This Device reports nothing this app can show yet.'
                        : 'This Device hasn’t reported its state to the Controller yet. It appears here as soon as it does.'}
                </Text>
            )}
            <SheetSection title="Edit">
                <DeviceRename device={device} />
                <DeviceRoom device={device} />
                <DeviceRemoval device={device} onRemoved={onClose} />
            </SheetSection>
        </ControllerSheet>
    )
}

function hasState(device: Device): boolean {
    return Object.keys(device.state ?? {}).length > 0
}

function DeviceRename({ device }: { device: Device }) {
    const { renameDevice } = useController()
    const { reachable } = useControllerSheet()
    const { state, run, dismiss, busy } = useSetupAction(`rename:${device.id}`)
    const [name, setName] = useState(device.name)
    const trimmed = name.trim()
    const enabled = reachable && !busy

    return (
        <View className="gap-2">
            <SetupTextInput
                editable={enabled}
                label="Device name"
                onChangeText={setName}
                value={name}
            />
            <View className="flex-row">
                <Button
                    disabled={
                        !enabled || trimmed === '' || trimmed === device.name
                    }
                    onPress={() =>
                        run(
                            () =>
                                renameDevice({
                                    deviceId: device.id,
                                    name: trimmed,
                                }),
                            `Renamed to ${trimmed}`
                        )
                    }
                    title="Save name"
                    variant="outline"
                />
            </View>
            <SetupStatus onDismiss={dismiss} state={state} />
        </View>
    )
}

/** Device-level Room only; Component Rooms stay on the dashboard. */
function DeviceRoom({ device }: { device: Device }) {
    const { rooms } = useHomeControl()
    const { assignRoom } = useController()
    const { reachable } = useControllerSheet()
    const { state, run, dismiss, busy } = useSetupAction(
        `device-room:${device.id}`
    )
    const current = device.roomId ?? null

    function choose(roomId: string | null) {
        if (roomId === current) return
        const room = rooms?.find((candidate) => candidate.id === roomId)
        void run(
            () => assignRoom({ deviceId: device.id, roomId }),
            room ? `Moved to ${room.name}` : 'Moved out of its Room'
        )
    }

    return (
        <View className="gap-2">
            <RoomChoice
                enabled={reachable && !busy}
                onChange={choose}
                rooms={rooms}
                selected={current}
            />
            <SetupStatus onDismiss={dismiss} state={state} />
        </View>
    )
}

function DeviceRemoval({
    device,
    onRemoved,
}: {
    device: Device
    onRemoved: () => void
}) {
    const { removeDevice } = useController()
    const { showNotice } = useHomeControl()
    const { reachable } = useControllerSheet()
    const { state, run, dismiss, busy } = useSetupAction(`remove:${device.id}`)
    const [confirming, setConfirming] = useState(false)

    async function remove() {
        const removed = await run(
            () => removeDevice(device.id),
            `Removed ${device.name}.`
        )
        if (removed) {
            showNotice(`Removed ${device.name}.`)
            onRemoved()
        } else {
            setConfirming(false)
        }
    }

    return (
        <View className="gap-3">
            {confirming ? (
                <View className="gap-3">
                    <Text className="text-foreground text-sm leading-relaxed">
                        Remove {device.name} from this Home? It will need to be
                        set up again before you can use it.
                    </Text>
                    <View className="flex-row gap-3">
                        <Button
                            disabled={!reachable || busy}
                            onPress={remove}
                            title={`Remove ${device.name}`}
                            variant="destructive"
                        />
                        <Button
                            disabled={busy}
                            onPress={() => setConfirming(false)}
                            title="Cancel"
                            variant="ghost"
                        />
                    </View>
                </View>
            ) : (
                <View className="flex-row">
                    <Button
                        disabled={!reachable || busy}
                        onPress={() => setConfirming(true)}
                        title="Remove Device"
                        variant="destructive"
                    />
                </View>
            )}
            <SetupStatus onDismiss={dismiss} state={state} />
        </View>
    )
}
