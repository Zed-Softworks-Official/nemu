import type { Device, Room } from '@nemu/protocol'
import { useRouter, useSegments } from 'expo-router'
import { useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native'

import { useControllerSheet } from '~/components/controller-sheet'
import { NewRoomForm, RoomRenameForm } from '~/components/device-setup'
import { useHomeControl } from '~/components/home-control'
import { LevelSlider } from '~/components/level-slider'
import { NativeToggle } from '~/components/native-toggle'
import { Button } from '~/components/ui/button'
import { Text } from '~/components/ui/text'
import type { TrackedCommand } from '~/components/use-command-tracker'
import { colors } from '~/constants/colors'
import {
    capabilitiesForDevice,
    controlsForDevice,
    type DeviceControl,
} from '~/lib/device-control'
import { deviceSheetHref } from '~/lib/tab-routes'

const UNASSIGNED = 'Not in a Room'

/** Says how this phone reaches the Controller and what that means. */
export function ConnectionBanner() {
    const { status, stale, reconnect } = useHomeControl()

    switch (status.mode) {
        case 'lan':
            return (
                <Banner
                    detail="Connected directly on the Home network."
                    title="At home"
                />
            )
        case 'relay':
            return (
                <Banner
                    detail="Connected through the encrypted Relay."
                    title="Away from home"
                />
            )
        case 'probing':
            return (
                <Banner
                    detail={
                        stale
                            ? 'Showing the last state this phone saw. Controls are off until it reconnects.'
                            : 'Looking for the Controller on this network, then through the Relay.'
                    }
                    title="Connecting…"
                />
            )
        default:
            return (
                <View
                    accessibilityRole="alert"
                    className="gap-3 rounded-sm border border-warning/40 bg-warning/10 p-4"
                >
                    <View className="gap-1">
                        <Text className="font-medium text-foreground">
                            Can’t reach the Controller
                        </Text>
                        <Text className="text-muted-foreground text-sm leading-relaxed">
                            {stale
                                ? 'What you see is the last state this phone saw and may be out of date. '
                                : ''}
                            Controls are off. Nothing is saved to send later.
                        </Text>
                    </View>
                    <View className="flex-row">
                        <Button
                            onPress={reconnect}
                            title="Try again"
                            variant="outline"
                        />
                    </View>
                </View>
            )
    }
}

function Banner({ title, detail }: { title: string; detail: string }) {
    return (
        <View
            accessibilityLiveRegion="polite"
            className="gap-1 rounded-sm border border-border p-4"
        >
            <Text className="font-medium text-foreground">{title}</Text>
            <Text className="text-muted-foreground text-sm leading-relaxed">
                {detail}
            </Text>
        </View>
    )
}

type Section = {
    id: string
    title: string
    devices: Device[]
    /** The Room itself, absent for Devices not in a Room. */
    room?: Room
}

export function groupDevicesByRoom(
    devices: readonly Device[],
    rooms: readonly Room[]
): Section[] {
    const sorted = [...rooms].sort(
        (a, b) =>
            (a.sortOrder ?? Number.MAX_SAFE_INTEGER) -
                (b.sortOrder ?? Number.MAX_SAFE_INTEGER) ||
            a.name.localeCompare(b.name)
    )
    const roomIds = new Set(sorted.map((room) => room.id))
    const sections: Section[] = sorted.map((room) => ({
        id: room.id,
        title: room.name,
        room,
        devices: devices.filter((device) => device.roomId === room.id),
    }))
    const unassigned = devices.filter(
        (device) => !device.roomId || !roomIds.has(device.roomId)
    )
    if (unassigned.length > 0) {
        sections.push({
            id: 'unassigned',
            title: UNASSIGNED,
            devices: unassigned,
        })
    }
    return sections
}

/** The Home's Devices in their Rooms, the only control grouping. */
export function RoomsView() {
    const { devices, live, rooms, roomsFailed } = useHomeControl()
    // Without Room names a Device with a Room must not be presented as
    // having none. An older Controller does not answer Rooms over Relay.
    if (rooms === undefined) {
        return (
            <SurfaceBody>
                {live && roomsFailed ? (
                    <Text className="text-muted-foreground text-sm">
                        Rooms couldn’t be loaded from the Controller.
                    </Text>
                ) : null}
                {(devices ?? []).map((device) => (
                    <DeviceCard device={device} key={device.id} />
                ))}
            </SurfaceBody>
        )
    }
    return (
        <SurfaceBody>
            <NewRoomForm />
            {groupDevicesByRoom(devices ?? [], rooms).map((section) => (
                <RoomSection key={section.id} section={section} />
            ))}
        </SurfaceBody>
    )
}

function RoomSection({ section }: { section: Section }) {
    const { live } = useHomeControl()
    const [renaming, setRenaming] = useState(false)
    const { room } = section
    return (
        <View
            accessibilityLabel={`Devices in ${section.title}`}
            className="gap-3"
        >
            <View className="flex-row items-center justify-between gap-3">
                <Text
                    accessibilityRole="header"
                    className="min-w-0 flex-1 font-semibold text-foreground text-lg"
                >
                    {section.title}
                </Text>
                {room && !renaming ? (
                    <Button
                        accessibilityLabel={`Rename ${room.name}`}
                        disabled={!live}
                        onPress={() => setRenaming(true)}
                        size="sm"
                        title="Rename"
                        variant="ghost"
                    />
                ) : null}
            </View>
            {room && renaming ? (
                <RoomRenameForm
                    onClose={() => setRenaming(false)}
                    room={room}
                />
            ) : null}
            {section.devices.length === 0 ? (
                <Text className="text-muted-foreground text-sm">
                    No Devices in this Room.
                </Text>
            ) : (
                section.devices.map((device) => (
                    <DeviceCard device={device} key={device.id} />
                ))
            )}
        </View>
    )
}

export function DevicesView() {
    const { devices } = useHomeControl()
    return (
        <SurfaceBody>
            {(devices ?? []).map((device) => (
                <DeviceCard device={device} key={device.id} />
            ))}
        </SurfaceBody>
    )
}

function SurfaceBody({ children }: { children: React.ReactNode }) {
    const { devices, live, loadFailed, notice, dismissNotice, status } =
        useHomeControl()
    return (
        <ScrollView
            contentContainerClassName="gap-6 pb-8"
            keyboardShouldPersistTaps="handled"
        >
            <ConnectionBanner />
            {notice ? (
                <View
                    accessibilityLiveRegion="polite"
                    className="flex-row items-center justify-between gap-3 rounded-sm border border-border p-3"
                >
                    <Text className="min-w-0 flex-1 text-foreground text-sm">
                        {notice}
                    </Text>
                    <Button
                        onPress={dismissNotice}
                        size="sm"
                        title="Dismiss"
                        variant="ghost"
                    />
                </View>
            ) : null}
            {loadFailed ? (
                <Text
                    accessibilityRole="alert"
                    className="text-muted-foreground text-sm"
                >
                    Connected, but the Controller did not return its Devices.
                </Text>
            ) : null}
            {devices === undefined &&
            !loadFailed &&
            status.mode !== 'offline' ? (
                <ActivityIndicator color={colors.primary} />
            ) : null}
            {live && devices?.length === 0 ? (
                <Text className="text-muted-foreground text-sm">
                    This Home has no Devices yet. Add them from the dashboard.
                </Text>
            ) : null}
            {children}
        </ScrollView>
    )
}

/**
 * One Device in a list. Its power toggle sends the on/off Command right
 * away; the rest of the card opens the Device sheet, which holds every
 * control and the Device's setup. Nothing is edited inline here.
 */
export function DeviceCard({ device }: { device: Device }) {
    const { capabilities, capabilitiesCurrent, commandFor, stale } =
        useHomeControl()
    const router = useRouter()
    const segments = useSegments()
    const controls = controlsForDevice(device)
    const power = controls.find(
        (control): control is ControlOf<'toggle'> =>
            control.kind === 'toggle' && control.key === 'power'
    )
    // Levels are set in the Device sheet; the card only shows them.
    const levels = controls.filter((control) => control.kind === 'level')
    const presented = capabilitiesForDevice(device, capabilities)

    return (
        <View className="rounded-sm border border-border">
            <View className="flex-row items-center">
                <Pressable
                    accessibilityHint="Opens its controls and settings"
                    accessibilityLabel={device.name}
                    accessibilityRole="button"
                    className="min-w-0 flex-1 gap-3 p-4 active:opacity-70"
                    onPress={() =>
                        router.push(deviceSheetHref(segments, device.id))
                    }
                >
                    <View className="flex-row items-center justify-between gap-3">
                        <Text
                            className="min-w-0 flex-1 font-medium text-foreground"
                            numberOfLines={1}
                        >
                            {device.name}
                        </Text>
                        <Text className="text-muted-foreground text-xs">
                            {availabilityLabel(device, stale)}
                        </Text>
                    </View>
                    {levels.map((level) => (
                        <View
                            className="flex-row items-center justify-between gap-3"
                            key={level.key}
                        >
                            <Text className="min-w-0 flex-1 text-muted-foreground text-sm">
                                {level.label}
                            </Text>
                            <Text className="text-foreground text-sm">
                                {level.format(level.value)}
                            </Text>
                        </View>
                    ))}
                    <CapabilityReadings
                        capabilities={presented}
                        current={capabilitiesCurrent}
                    />
                </Pressable>
                {power ? (
                    <View className="pr-4">
                        <ToggleInput control={power} device={device} />
                    </View>
                ) : null}
            </View>
            {power && commandFor(device.id, power.key) ? (
                <View className="px-4 pb-4">
                    <ControlStatus control={power} device={device} />
                </View>
            ) : null}
        </View>
    )
}

/** Whether the Device is reachable, or that what is shown is old. */
export function availabilityLabel(device: Device, stale: boolean): string {
    if (stale) return 'Last known'
    return device.online ? 'Online' : 'Device offline'
}

/** The Device's Capability readings, each marked when it is old. */
export function CapabilityReadings({
    capabilities,
    current,
}: {
    capabilities: ReturnType<typeof capabilitiesForDevice>
    current: boolean
}) {
    return capabilities.map((capability) => (
        <View
            className="flex-row items-center justify-between gap-3"
            key={capability.id}
        >
            <Text className="min-w-0 flex-1 text-muted-foreground text-sm">
                {capability.label}
            </Text>
            <Text className="text-foreground text-sm">
                {capability.reading ?? 'Unavailable'}
                {capability.reading && !current ? ' (last known)' : ''}
            </Text>
        </View>
    ))
}

/** A labelled control with its Command's progress, as in the Device sheet. */
export function ControlRow({
    device,
    control,
}: {
    device: Device
    control: DeviceControl
}) {
    if (control.kind === 'level') {
        return <LevelRow control={control} device={device} />
    }
    return (
        <View className="gap-2">
            <View className="flex-row items-center justify-between gap-3">
                <Text className="min-w-0 flex-1 text-foreground text-sm">
                    {control.label}
                </Text>
                <ToggleInput control={control} device={device} />
            </View>
            <ControlStatus control={control} device={device} />
        </View>
    )
}

/**
 * Sending is allowed only while the Controller is reachable and the Device
 * online, and one Command per control at a time. Inside a `ControllerSheet`
 * this follows the sheet's reachability.
 */
function useControl(device: Device, control: DeviceControl) {
    const { commandFor, sendControl, dismissCommand } = useHomeControl()
    const { reachable } = useControllerSheet()
    const command = commandFor(device.id, control.key)
    const inFlight =
        command?.phase === 'sending' || command?.phase === 'pending'
    const canSend = reachable && device.online
    return {
        command,
        canSend,
        inFlight,
        enabled: canSend && !inFlight,
        name: `${device.name} ${control.label}`,
        send: (desired: boolean | number) => {
            if (canSend) sendControl(device.id, control, desired)
        },
        dismiss: () => dismissCommand(device.id, control.key),
    }
}

type ControlOf<Kind extends DeviceControl['kind']> = Extract<
    DeviceControl,
    { kind: Kind }
>

function ToggleInput({
    device,
    control,
}: {
    device: Device
    control: ControlOf<'toggle'>
}) {
    const { enabled, name, send } = useControl(device, control)
    return (
        <NativeToggle
            disabled={!enabled}
            label={name}
            onValueChange={send}
            // The reported value, not the request: a pending Command has
            // not changed the Device yet.
            value={control.on}
        />
    )
}

function LevelRow({
    device,
    control,
}: {
    device: Device
    control: ControlOf<'level'>
}) {
    const { command, enabled, inFlight, name, send } = useControl(
        device,
        control
    )
    return (
        <View className="gap-2">
            <LevelSlider
                control={control}
                enabled={enabled}
                name={name}
                onRelease={send}
                // While a Command is on its way the slider keeps the chosen
                // value. Any outcome returns it to what the Device reports.
                value={
                    inFlight && command
                        ? (command.desired as number)
                        : control.value
                }
            />
            <ControlStatus control={control} device={device} />
        </View>
    )
}

function ControlStatus({
    device,
    control,
}: {
    device: Device
    control: DeviceControl
}) {
    const { command, canSend, send, dismiss } = useControl(device, control)
    if (!command) return null
    return (
        <CommandStatus
            canRetry={canSend}
            command={command}
            control={control}
            onDismiss={dismiss}
            onRetry={() => send(command.desired)}
        />
    )
}

function desiredLabel(control: DeviceControl, command: TrackedCommand): string {
    if (control.kind === 'toggle') return command.desired ? 'on' : 'off'
    return control.format(command.desired as number)
}

const FINAL_TITLES = {
    rejected: 'Rejected',
    failed: 'Failed',
    unconfirmed: 'Not confirmed',
} as const

function CommandStatus({
    command,
    control,
    canRetry,
    onRetry,
    onDismiss,
}: {
    command: TrackedCommand
    control: DeviceControl
    canRetry: boolean
    onRetry: () => void
    onDismiss: () => void
}) {
    const desired = desiredLabel(control, command)
    switch (command.phase) {
        case 'sending':
            return <StatusLine>Sending {desired}…</StatusLine>
        case 'pending':
            return (
                <StatusLine>
                    Accepted. Waiting for the Device to report {desired}…
                </StatusLine>
            )
        case 'confirmed':
            return <StatusLine>Confirmed: {desired}</StatusLine>
        default:
            return (
                <View
                    accessibilityRole="alert"
                    className="gap-2 rounded-sm bg-destructive/10 p-3"
                >
                    <Text className="font-medium text-foreground text-sm">
                        {FINAL_TITLES[command.phase]}: {desired}
                    </Text>
                    <Text className="text-muted-foreground text-sm leading-relaxed">
                        {command.message}
                    </Text>
                    <View className="flex-row gap-2">
                        <Button
                            disabled={!canRetry}
                            onPress={onRetry}
                            title="Try again"
                            variant="outline"
                        />
                        <Button
                            onPress={onDismiss}
                            title="Dismiss"
                            variant="ghost"
                        />
                    </View>
                </View>
            )
    }
}

function StatusLine({ children }: { children: React.ReactNode }) {
    return (
        <Text
            accessibilityLiveRegion="polite"
            className="text-muted-foreground text-xs"
        >
            {children}
        </Text>
    )
}
