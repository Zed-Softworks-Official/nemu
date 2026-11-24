import { useController } from '@nemu/controller'
import {
    type Device,
    devicesInRoom,
    type Room,
    roomDeletionSummary,
} from '@nemu/protocol'
import { useEffect, useState } from 'react'
import { ActivityIndicator, View } from 'react-native'

import { availabilityLabel } from '~/components/control-surface'
import {
    ControllerSheet,
    SheetSection,
    useControllerSheet,
} from '~/components/controller-sheet'
import {
    SetupStatus,
    SetupTextInput,
    useSetupAction,
} from '~/components/device-setup'
import { useHomeControl } from '~/components/home-control'
import { NativePicker } from '~/components/native-picker'
import { Button } from '~/components/ui/button'
import { Text } from '~/components/ui/text'
import { colors } from '~/constants/colors'
import { roomDeletedNotice, sortRooms } from '~/lib/room-presentation'

const NO_ROOM = 'No Room'
/** No Room's picker value; Room IDs are never empty. */
const NO_ROOM_VALUE = ''

/**
 * Everything about one Room: its name, the Devices in it, and deleting it.
 * Renames apply at once; deleting asks where its Devices go first.
 */
export function RoomSheet({
    roomId,
    onClose,
}: {
    roomId: string
    onClose: () => void
}) {
    const { rooms, roomsFailed, devices, status, setSetupState } =
        useHomeControl()
    const room = rooms?.find((candidate) => candidate.id === roomId)

    // Outcomes from an earlier opening don't belong to this one.
    useEffect(() => {
        for (const subject of ['room-rename', 'room-delete']) {
            setSetupState(`${subject}:${roomId}`, { phase: 'idle' })
        }
    }, [roomId, setSetupState])

    if (!room) {
        const loading =
            rooms === undefined && !roomsFailed && status.mode !== 'offline'
        return (
            <ControllerSheet onClose={onClose} title="Room">
                {loading ? (
                    <ActivityIndicator color={colors.primary} />
                ) : (
                    <Text className="text-muted-foreground text-sm">
                        {rooms === undefined
                            ? 'This Room couldn’t be loaded from the Controller.'
                            : 'This Room is no longer in this Home.'}
                    </Text>
                )}
            </ControllerSheet>
        )
    }

    const contents = devices ? devicesInRoom(devices, room.id) : undefined

    return (
        <ControllerSheet onClose={onClose} title={room.name}>
            <SheetSection title="Devices">
                <RoomDevices contents={contents} room={room} />
            </SheetSection>
            <SheetSection title="Edit">
                <RoomRename room={room} />
                <RoomDeletion
                    contents={contents}
                    onDeleted={onClose}
                    room={room}
                />
            </SheetSection>
        </ControllerSheet>
    )
}

function RoomDevices({
    room,
    contents,
}: {
    room: Room
    contents: Device[] | undefined
}) {
    const { stale } = useHomeControl()
    if (contents === undefined) {
        return (
            <Text className="text-muted-foreground text-sm">
                Devices haven’t been loaded from the Controller.
            </Text>
        )
    }
    if (contents.length === 0) {
        return (
            <Text className="text-muted-foreground text-sm">
                No Devices in this Room.
            </Text>
        )
    }
    return contents.map((device) => (
        <View
            className="flex-row items-center justify-between gap-3"
            key={device.id}
        >
            <View className="min-w-0 flex-1">
                <Text className="text-foreground text-sm">{device.name}</Text>
                {device.roomId === room.id ? null : (
                    <Text className="text-muted-foreground text-xs">
                        Only some of its Components are in this Room
                    </Text>
                )}
            </View>
            <Text className="text-muted-foreground text-xs">
                {availabilityLabel(device, stale)}
            </Text>
        </View>
    ))
}

function RoomRename({ room }: { room: Room }) {
    const { renameRoom } = useController()
    const { reachable } = useControllerSheet()
    const { state, run, dismiss, busy } = useSetupAction(
        `room-rename:${room.id}`
    )
    const [name, setName] = useState(room.name)
    const trimmed = name.trim()
    const enabled = reachable && !busy

    return (
        <View className="gap-2">
            <SetupTextInput
                editable={enabled}
                label="Room name"
                onChangeText={setName}
                value={name}
            />
            <View className="flex-row">
                <Button
                    disabled={
                        !enabled || trimmed === '' || trimmed === room.name
                    }
                    onPress={() =>
                        run(
                            () =>
                                renameRoom({ roomId: room.id, name: trimmed }),
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

/**
 * Deletes the Room after asking where its Devices go. The Controller moves
 * everything and deletes the Room in one step, or changes nothing.
 */
function RoomDeletion({
    room,
    contents,
    onDeleted,
}: {
    room: Room
    contents: Device[] | undefined
    onDeleted: () => void
}) {
    const { rooms, showNotice } = useHomeControl()
    const { deleteRoom } = useController()
    const { reachable } = useControllerSheet()
    const { state, run, dismiss, busy } = useSetupAction(
        `room-delete:${room.id}`
    )
    const [confirming, setConfirming] = useState(false)
    const [chosen, setChosen] = useState(NO_ROOM_VALUE)
    // Without the Devices the confirmation can't say what will move.
    const enabled = reachable && !busy && contents !== undefined

    if (!confirming || contents === undefined) {
        return (
            <View className="flex-row">
                <Button
                    disabled={!enabled}
                    onPress={() => {
                        setChosen(NO_ROOM_VALUE)
                        setConfirming(true)
                    }}
                    title="Delete Room"
                    variant="destructive"
                />
            </View>
        )
    }

    const options = [
        { value: NO_ROOM_VALUE, label: NO_ROOM },
        ...sortRooms(rooms ?? [])
            .filter((other) => other.id !== room.id)
            .map((other) => ({ value: other.id, label: other.name })),
    ]
    // A chosen Room that has since been deleted falls back to No Room, so
    // what is shown is always what is sent.
    const destination = options.find((option) => option.value === chosen)
    const destinationId = destination?.value || null
    const destinationName = destination?.label ?? NO_ROOM
    const count = contents.length

    async function remove() {
        const message = roomDeletedNotice(room.name, count, destinationName)
        const deleted = await run(
            () => deleteRoom(room.id, destinationId),
            message
        )
        if (deleted) {
            showNotice(message)
            onDeleted()
        }
    }

    return (
        <View className="gap-3">
            <Text className="font-medium text-foreground text-sm">
                Delete {room.name}?
            </Text>
            {count > 0 ? (
                <NativePicker
                    disabled={!enabled}
                    label="Move Devices to"
                    onChange={setChosen}
                    options={options}
                    selected={destinationId ?? NO_ROOM_VALUE}
                />
            ) : null}
            <Text
                accessibilityLiveRegion="polite"
                className="text-foreground text-sm leading-relaxed"
            >
                {roomDeletionSummary(count, destinationName)}
            </Text>
            <View className="flex-row gap-3">
                <Button
                    disabled={!enabled}
                    onPress={remove}
                    title={`Delete ${room.name}`}
                    variant="destructive"
                />
                <Button
                    disabled={busy}
                    onPress={() => {
                        dismiss()
                        setConfirming(false)
                    }}
                    title="Cancel"
                    variant="ghost"
                />
            </View>
            <SetupStatus onDismiss={dismiss} state={state} />
        </View>
    )
}

/** Names and creates a Room, then closes. */
export function CreateRoomSheet({ onClose }: { onClose: () => void }) {
    const { setSetupState } = useHomeControl()

    useEffect(() => {
        setSetupState('new-room', { phase: 'idle' })
    }, [setSetupState])

    return (
        <ControllerSheet onClose={onClose} title="New Room">
            <NewRoom onCreated={onClose} />
        </ControllerSheet>
    )
}

function NewRoom({ onCreated }: { onCreated: () => void }) {
    const { createRoom } = useController()
    const { showNotice } = useHomeControl()
    const { reachable } = useControllerSheet()
    const { state, run, dismiss, busy } = useSetupAction('new-room')
    const [name, setName] = useState('')
    const trimmed = name.trim()
    const enabled = reachable && !busy

    async function create() {
        const message = `Created ${trimmed}.`
        const created = await run(() => createRoom({ name: trimmed }), message)
        if (created) {
            showNotice(message)
            onCreated()
        }
    }

    return (
        <View className="gap-2">
            <SetupTextInput
                editable={enabled}
                label="New Room name"
                onChangeText={setName}
                placeholder="New Room"
                value={name}
            />
            <View className="flex-row">
                <Button
                    disabled={!enabled || trimmed === ''}
                    onPress={create}
                    title="Create Room"
                />
            </View>
            <SetupStatus onDismiss={dismiss} state={state} />
        </View>
    )
}
