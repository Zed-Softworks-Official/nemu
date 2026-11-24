import { useController } from '@nemu/controller'
import type { Device, Room } from '@nemu/protocol'
import { cn } from '@nemu/ui/lib/utils'
import { useCallback, useState } from 'react'
import { TextInput, View } from 'react-native'

import { useControllerSheet } from '~/components/controller-sheet'
import { type SetupState, useHomeControl } from '~/components/home-control'
import { NativePicker } from '~/components/native-picker'
import { Button } from '~/components/ui/button'
import { Text } from '~/components/ui/text'
import { colors } from '~/constants/colors'

/**
 * Runs one Device or Room setup action against the Controller and reloads
 * the Room and Device lists afterwards. Only runs while LAN or Relay reaches
 * the Controller (inside a `ControllerSheet`, while the sheet's Controller
 * is reachable); nothing is kept to send later.
 *
 * The phone does not know its Membership role. Whatever the Controller
 * refuses is shown as the Controller gave it.
 */
export function useSetupAction(key: string) {
    const { refreshInventory, setupState, setSetupState } = useHomeControl()
    const { reachable: live } = useControllerSheet()
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

/** The picker value for no Room; Room IDs are never empty. */
const NO_ROOM = ''

export function RoomChoice({
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
    return (
        <NativePicker
            disabled={!enabled}
            label="Room"
            onChange={(value) => onChange(value === NO_ROOM ? null : value)}
            options={[
                ...rooms.map((room) => ({ value: room.id, label: room.name })),
                { value: NO_ROOM, label: 'Not in a Room' },
            ]}
            selected={selected ?? NO_ROOM}
        />
    )
}
