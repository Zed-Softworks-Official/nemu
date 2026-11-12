import type { Device, Room } from '@nemu/protocol'
import { cn } from '@nemu/ui/lib/utils'
import { Minus, Plus } from 'lucide-react-native'
import {
    ActivityIndicator,
    Pressable,
    ScrollView,
    Switch,
    View,
} from 'react-native'

import { useHomeControl } from '~/components/home-control'
import { Button } from '~/components/ui/button'
import { Text } from '~/components/ui/text'
import type { TrackedCommand } from '~/components/use-command-tracker'
import { colors } from '~/constants/colors'
import {
    capabilitiesForDevice,
    controlsForDevice,
    type DeviceControl,
} from '~/lib/device-control'

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

type Section = { id: string; title: string; devices: Device[] }

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
            {groupDevicesByRoom(devices ?? [], rooms).map((section) => (
                <View className="gap-3" key={section.id}>
                    <Text
                        accessibilityRole="header"
                        className="font-semibold text-foreground text-lg"
                    >
                        {section.title}
                    </Text>
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
            ))}
        </SurfaceBody>
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
    const { devices, live, loadFailed, status } = useHomeControl()
    return (
        <ScrollView contentContainerClassName="gap-6 pb-8">
            <ConnectionBanner />
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

export function DeviceCard({ device }: { device: Device }) {
    const { capabilities, capabilitiesCurrent, stale } = useHomeControl()
    const controls = controlsForDevice(device)
    const presented = capabilitiesForDevice(device, capabilities)

    return (
        <View
            accessibilityLabel={device.name}
            className="gap-3 rounded-sm border border-border p-4"
        >
            <View className="flex-row items-center justify-between gap-3">
                <Text
                    className="min-w-0 flex-1 font-medium text-foreground"
                    numberOfLines={1}
                >
                    {device.name}
                </Text>
                <Text className="text-muted-foreground text-xs">
                    {stale
                        ? 'Last known'
                        : device.online
                          ? 'Online'
                          : 'Device offline'}
                </Text>
            </View>
            {controls.map((control) => (
                <ControlRow
                    control={control}
                    device={device}
                    key={control.key}
                />
            ))}
            {presented.map((capability) => (
                <View
                    className="flex-row items-center justify-between gap-3"
                    key={capability.id}
                >
                    <Text className="min-w-0 flex-1 text-muted-foreground text-sm">
                        {capability.label}
                    </Text>
                    <Text className="text-foreground text-sm">
                        {capability.reading ?? 'Unavailable'}
                        {capability.reading && !capabilitiesCurrent
                            ? ' (last known)'
                            : ''}
                    </Text>
                </View>
            ))}
        </View>
    )
}

function ControlRow({
    device,
    control,
}: {
    device: Device
    control: DeviceControl
}) {
    const { live, commandFor, sendControl, dismissCommand } = useHomeControl()
    const command = commandFor(device.id, control.key)
    const inFlight =
        command?.phase === 'sending' || command?.phase === 'pending'
    const canSend = live && device.online
    const enabled = canSend && !inFlight
    const name = `${device.name} ${control.label}`

    return (
        <View className="gap-2">
            <View className="flex-row items-center justify-between gap-3">
                <Text className="min-w-0 flex-1 text-foreground text-sm">
                    {control.label}
                </Text>
                {control.kind === 'toggle' ? (
                    <Switch
                        accessibilityLabel={name}
                        disabled={!enabled}
                        onValueChange={(desired) =>
                            sendControl(device.id, control, desired)
                        }
                        // The reported value, not the request: a pending
                        // Command has not changed the Device yet.
                        value={control.on}
                    />
                ) : (
                    <LevelStepper
                        control={control}
                        enabled={enabled}
                        name={name}
                        onChange={(desired) =>
                            sendControl(device.id, control, desired)
                        }
                    />
                )}
            </View>
            {command ? (
                <CommandStatus
                    canRetry={canSend}
                    command={command}
                    control={control}
                    onDismiss={() => dismissCommand(device.id, control.key)}
                    onRetry={() =>
                        sendControl(device.id, control, command.desired)
                    }
                />
            ) : null}
        </View>
    )
}

function LevelStepper({
    control,
    enabled,
    name,
    onChange,
}: {
    control: Extract<DeviceControl, { kind: 'level' }>
    enabled: boolean
    name: string
    onChange: (desired: number) => void
}) {
    const { value, min, max, step } = control
    const lower = Math.max(min, value - step)
    const higher = Math.min(max, value + step)
    return (
        <View className="flex-row items-center gap-3">
            <StepButton
                disabled={!enabled || lower === value}
                icon={Minus}
                label={`Lower ${name}`}
                onPress={() => onChange(lower)}
            />
            <Text className="min-w-14 text-center text-foreground text-sm">
                {control.format(value)}
            </Text>
            <StepButton
                disabled={!enabled || higher === value}
                icon={Plus}
                label={`Raise ${name}`}
                onPress={() => onChange(higher)}
            />
        </View>
    )
}

function StepButton({
    label,
    icon: Icon,
    disabled,
    onPress,
}: {
    label: string
    icon: typeof Plus
    disabled: boolean
    onPress: () => void
}) {
    return (
        <Pressable
            accessibilityLabel={label}
            accessibilityRole="button"
            accessibilityState={{ disabled }}
            className={cn(
                'size-11 items-center justify-center rounded-sm border border-border active:bg-muted',
                disabled && 'opacity-50'
            )}
            disabled={disabled}
            onPress={onPress}
        >
            <Icon color={colors.foreground} size={18} />
        </Pressable>
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
