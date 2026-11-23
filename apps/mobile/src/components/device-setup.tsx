import { useController } from '@nemu/controller'
import type { Device, Room } from '@nemu/protocol'
import { cn } from '@nemu/ui/lib/utils'
import { useCallback, useState } from 'react'
import { Pressable, TextInput, View } from 'react-native'

import { type SetupState, useHomeControl } from '~/components/home-control'
import { Button } from '~/components/ui/button'
import { Text } from '~/components/ui/text'
import { colors } from '~/constants/colors'

/**
 * Runs one Device or Room setup action against the Controller and reloads
 * the Room and Device lists afterwards. Only runs while LAN or Relay reaches
 * the Controller; nothing is kept to send later.
 *
 * The phone does not know its Membership role. Whatever the Controller
 * refuses is shown as the Controller gave it.
 */
export function useSetupAction(key: string) {
    const { live, refreshInventory, setupState, setSetupState } =
        useHomeControl()
    const state = setupState(key)
    const setState = useCallback(
        (next: SetupState) => setSetupState(key, next),
        [key, setSetupState]
    )

    const run = useCallback(
        async (apply: () => Promise<unknown>, done: string) => {
            if (!live) return false
            setState({ phase: 'saving' })
            try {
                await apply()
            } catch (cause) {
                setState({ phase: 'failed', message: describeRefusal(cause) })
                await refreshInventory()
                return false
            }
            await refreshInventory()
            setState({ phase: 'done', message: done })
            return true
        },
        [live, refreshInventory, setState]
    )

    const dismiss = useCallback(() => setState({ phase: 'idle' }), [setState])

    return { state, run, dismiss, busy: state.phase === 'saving', live }
}

function describeRefusal(cause: unknown): string {
    if (cause instanceof Error && cause.message) return cause.message
    return 'The Controller did not accept the change.'
}

/** Command-style feedback for one setup action. */
export function SetupStatus({
    state,
    onDismiss,
}: {
    state: SetupState
    onDismiss: () => void
}) {
    switch (state.phase) {
        case 'idle':
            return null
        case 'saving':
            return <StatusLine>Saving…</StatusLine>
        case 'done':
            return <StatusLine>{state.message}</StatusLine>
        default:
            return (
                <View
                    accessibilityRole="alert"
                    className="gap-2 rounded-sm bg-destructive/10 p-3"
                >
                    <Text className="font-medium text-foreground text-sm">
                        Not saved
                    </Text>
                    <Text className="text-muted-foreground text-sm leading-relaxed">
                        {state.message}
                    </Text>
                    <View className="flex-row">
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

export function SetupTextInput({
    label,
    value,
    onChangeText,
    editable,
    placeholder,
}: {
    label: string
    value: string
    onChangeText: (value: string) => void
    editable: boolean
    placeholder?: string
}) {
    return (
        <TextInput
            accessibilityLabel={label}
            autoCapitalize="words"
            className={cn(
                'h-11 rounded-sm border border-border px-3 text-foreground',
                !editable && 'opacity-50'
            )}
            editable={editable}
            onChangeText={onChangeText}
            placeholder={placeholder}
            placeholderTextColor={colors.mutedForeground}
            value={value}
        />
    )
}

/**
 * Name a Device and choose its Room, saved together. Room assignment here is
 * Device level only; Component Rooms stay on the dashboard.
 *
 * Shared by Device setup and the end of commissioning.
 */
export function DeviceNameAndRoom({
    device,
    onSaved,
    saveTitle = 'Save',
}: {
    device: Device
    /** Called with what was saved. */
    onSaved?: (saved: { name: string; roomId: string | null }) => void
    saveTitle?: string
}) {
    const { rooms } = useHomeControl()
    const { renameDevice, assignRoom } = useController()
    const { state, run, dismiss, busy, live } = useSetupAction(
        `device:${device.id}`
    )
    const [name, setName] = useState(device.name)
    const [roomId, setRoomId] = useState<string | null>(device.roomId ?? null)
    const enabled = live && !busy

    async function save() {
        const trimmed = name.trim()
        const saved = await run(async () => {
            if (trimmed !== device.name) {
                await renameDevice({ deviceId: device.id, name: trimmed })
            }
            if (rooms !== undefined && roomId !== (device.roomId ?? null)) {
                await assignRoom({ deviceId: device.id, roomId })
            }
        }, 'Saved')
        if (saved) onSaved?.({ name: trimmed, roomId })
    }

    return (
        <View className="gap-3">
            <SetupTextInput
                editable={enabled}
                label="Device name"
                onChangeText={setName}
                value={name}
            />
            <RoomChoice
                enabled={enabled}
                onChange={setRoomId}
                rooms={rooms}
                selected={roomId}
            />
            <View className="flex-row">
                <Button
                    disabled={!enabled || name.trim() === ''}
                    onPress={save}
                    title={saveTitle}
                />
            </View>
            <SetupStatus onDismiss={dismiss} state={state} />
        </View>
    )
}

function RoomChoice({
    rooms,
    selected,
    enabled,
    onChange,
}: {
    rooms: Room[] | undefined
    selected: string | null
    enabled: boolean
    onChange: (roomId: string | null) => void
}) {
    if (rooms === undefined) {
        return (
            <Text className="text-muted-foreground text-sm">
                Rooms couldn’t be loaded, so the Room can’t be changed right
                now.
            </Text>
        )
    }
    const choices: Array<{ id: string | null; name: string }> = [
        ...rooms,
        { id: null, name: 'Not in a Room' },
    ]
    return (
        <View accessibilityLabel="Room" className="gap-2">
            <Text className="text-muted-foreground text-sm">Room</Text>
            <View className="flex-row flex-wrap gap-2">
                {choices.map((choice) => {
                    const isSelected = choice.id === selected
                    return (
                        <Pressable
                            accessibilityLabel={choice.name}
                            accessibilityRole="button"
                            accessibilityState={{
                                selected: isSelected,
                                disabled: !enabled,
                            }}
                            className={cn(
                                'h-9 justify-center rounded-sm border px-3',
                                isSelected
                                    ? 'border-primary bg-primary/10'
                                    : 'border-border',
                                !enabled && 'opacity-50'
                            )}
                            disabled={!enabled}
                            key={choice.id ?? 'none'}
                            onPress={() => onChange(choice.id)}
                        >
                            <Text className="text-foreground text-sm">
                                {choice.name}
                            </Text>
                        </Pressable>
                    )
                })}
            </View>
        </View>
    )
}

/** Device setup: name and Room, and removing the Device after confirming. */
export function DeviceSetupPanel({ device }: { device: Device }) {
    const { removeDevice } = useController()
    const { showNotice } = useHomeControl()
    const { state, run, dismiss, busy, live } = useSetupAction(
        `remove:${device.id}`
    )
    const [confirming, setConfirming] = useState(false)

    async function remove() {
        const removed = await run(
            () => removeDevice(device.id),
            `Removed ${device.name}.`
        )
        if (removed) showNotice(`Removed ${device.name}.`)
        else setConfirming(false)
    }

    return (
        <View className="gap-4 border-border border-t pt-3">
            <DeviceNameAndRoom device={device} />
            {confirming ? (
                <View className="gap-3">
                    <Text className="text-foreground text-sm leading-relaxed">
                        Remove {device.name} from this Home? It will need to be
                        set up again before you can use it.
                    </Text>
                    <View className="flex-row gap-3">
                        <Button
                            disabled={!live || busy}
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
                        disabled={!live || busy}
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

/** Create a Room. */
export function NewRoomForm() {
    const { createRoom } = useController()
    const { state, run, dismiss, busy, live } = useSetupAction('new-room')
    const [name, setName] = useState('')
    const enabled = live && !busy

    async function create() {
        const trimmed = name.trim()
        const created = await run(
            () => createRoom({ name: trimmed }),
            `Created ${trimmed}`
        )
        if (created) setName('')
    }

    return (
        <View className="gap-2">
            <View className="flex-row items-center gap-2">
                <View className="min-w-0 flex-1">
                    <SetupTextInput
                        editable={enabled}
                        label="New Room name"
                        onChangeText={setName}
                        placeholder="New Room"
                        value={name}
                    />
                </View>
                <Button
                    disabled={!enabled || name.trim() === ''}
                    onPress={create}
                    title="Create Room"
                    variant="outline"
                />
            </View>
            <SetupStatus onDismiss={dismiss} state={state} />
        </View>
    )
}

/** Rename a Room. Deleting one stays on the dashboard. */
export function RoomRenameForm({
    room,
    onClose,
}: {
    room: Room
    onClose: () => void
}) {
    const { renameRoom } = useController()
    const { state, run, dismiss, busy, live } = useSetupAction(
        `room:${room.id}`
    )
    const [name, setName] = useState(room.name)
    const enabled = live && !busy

    return (
        <View className="gap-2 rounded-sm border border-border p-3">
            <SetupTextInput
                editable={enabled}
                label="Room name"
                onChangeText={setName}
                value={name}
            />
            <View className="flex-row gap-3">
                <Button
                    accessibilityLabel="Save Room name"
                    disabled={!enabled || name.trim() === ''}
                    onPress={() =>
                        run(
                            () =>
                                renameRoom({
                                    roomId: room.id,
                                    name: name.trim(),
                                }),
                            'Saved'
                        )
                    }
                    title="Save"
                />
                <Button onPress={onClose} title="Done" variant="ghost" />
            </View>
            <SetupStatus onDismiss={dismiss} state={state} />
            <Text className="text-muted-foreground text-xs leading-relaxed">
                To delete a Room, use the dashboard. It asks you to move the
                Room’s Devices first.
            </Text>
        </View>
    )
}
