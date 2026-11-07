import type { Device, Room } from '@nemu/protocol'
import { ActivityIndicator, ScrollView, Switch, View } from 'react-native'

import { useHomeControl } from '~/components/home-control'
import { Button } from '~/components/ui/button'
import { Text } from '~/components/ui/text'
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
    const { devices, rooms } = useHomeControl()
    return (
        <SurfaceBody>
            {groupDevicesByRoom(devices ?? [], rooms ?? []).map((section) => (
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
                <ControlRow control={control} key={control.key} />
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

function ControlRow({ control }: { control: DeviceControl }) {
    return (
        <View className="flex-row items-center justify-between gap-3">
            <Text className="min-w-0 flex-1 text-foreground text-sm">
                {control.label}
            </Text>
            {control.kind === 'toggle' ? (
                <Switch disabled value={control.on} />
            ) : (
                <Text className="text-foreground text-sm">
                    {control.format(control.value)}
                </Text>
            )}
        </View>
    )
}
