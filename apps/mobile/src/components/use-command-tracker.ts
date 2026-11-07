import type { CommandResult, Device, DeviceCommand } from '@nemu/protocol'
import { useCallback, useEffect, useRef, useState } from 'react'

import {
    answerFromError,
    answerFromResult,
    type CommandAnswer,
    type CommandFinalFailure,
    UNCONFIRMED_MESSAGE,
} from '~/lib/command-outcome'
import { controlsForDevice, type DeviceControl } from '~/lib/device-control'

export type TrackedCommand = {
    desired: boolean | number
} & (
    | { phase: 'sending' | 'pending' | 'confirmed' }
    | { phase: CommandFinalFailure; message: string }
)

/** Core marks a Command unconfirmed after 30s; allow for the trip back. */
export const CONFIRMATION_WINDOW_MS = 35_000
const CONFIRMED_DISPLAY_MS = 2_500
const LEVEL_TOLERANCE = 1

function commandKey(deviceId: string, controlKey: string): string {
    return `${deviceId}/${controlKey}`
}

/** Only a value the Device reports confirms a Command. */
function deviceReports(
    device: Device | undefined,
    controlKey: string,
    desired: boolean | number
): boolean {
    const control = device
        ? controlsForDevice(device).find((item) => item.key === controlKey)
        : undefined
    if (!control) return false
    return control.kind === 'toggle'
        ? control.on === desired
        : Math.abs(control.value - (desired as number)) <= LEVEL_TOLERANCE
}

function splitKey(key: string): [string, string] {
    const slash = key.indexOf('/')
    return [key.slice(0, slash), key.slice(slash + 1)]
}

/**
 * Tracks each control's Command in memory while it is on its way. Commands
 * are never stored or resent: `send` does nothing unless the Controller is
 * reachable right now.
 */
export function useCommandTracker(options: {
    devices: Device[] | undefined
    live: boolean
    sendCommand: (command: DeviceCommand) => Promise<CommandResult>
    confirmationWindowMs: number
}) {
    const { devices, live, sendCommand, confirmationWindowMs } = options
    const [commands, setCommands] = useState<Record<string, TrackedCommand>>({})
    const commandsRef = useRef(commands)
    commandsRef.current = commands
    const devicesRef = useRef(devices)
    devicesRef.current = devices
    const liveRef = useRef(live)
    liveRef.current = live
    const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

    const clearTimer = useCallback((key: string) => {
        const timer = timers.current.get(key)
        if (timer) clearTimeout(timer)
        timers.current.delete(key)
    }, [])

    const clear = useCallback(
        (key: string) => {
            clearTimer(key)
            setCommands((current) => {
                const { [key]: _removed, ...rest } = current
                return rest
            })
        },
        [clearTimer]
    )

    const update = useCallback((key: string, next: TrackedCommand) => {
        commandsRef.current = { ...commandsRef.current, [key]: next }
        setCommands((current) => ({ ...current, [key]: next }))
    }, [])

    const confirm = useCallback(
        (key: string, desired: boolean | number) => {
            clearTimer(key)
            update(key, { phase: 'confirmed', desired })
            timers.current.set(
                key,
                setTimeout(() => clear(key), CONFIRMED_DISPLAY_MS)
            )
        },
        [clear, clearTimer, update]
    )

    const applyAnswer = useCallback(
        (key: string, desired: boolean | number, answer: CommandAnswer) => {
            if (answer.phase === 'confirmed') {
                confirm(key, desired)
                return
            }
            if (answer.phase !== 'pending') {
                update(key, { ...answer, desired })
                return
            }
            const device = devicesRef.current?.find(
                (item) => item.id === splitKey(key)[0]
            )
            if (deviceReports(device, splitKey(key)[1], desired)) {
                confirm(key, desired)
                return
            }
            update(key, { phase: 'pending', desired })
            timers.current.set(
                key,
                setTimeout(() => {
                    timers.current.delete(key)
                    update(key, {
                        phase: 'unconfirmed',
                        message: UNCONFIRMED_MESSAGE,
                        desired,
                    })
                }, confirmationWindowMs)
            )
        },
        [confirm, confirmationWindowMs, update]
    )

    // Resolve pending Commands from the state Devices report.
    useEffect(() => {
        for (const [key, command] of Object.entries(commandsRef.current)) {
            if (command.phase !== 'pending') continue
            const [deviceId, controlKey] = splitKey(key)
            const device = devices?.find((item) => item.id === deviceId)
            if (deviceReports(device, controlKey, command.desired)) {
                confirm(key, command.desired)
            }
        }
    }, [devices, confirm])

    const mounted = useRef(true)
    useEffect(() => {
        mounted.current = true
        const active = timers.current
        return () => {
            mounted.current = false
            for (const timer of active.values()) clearTimeout(timer)
            active.clear()
        }
    }, [])

    const send = useCallback(
        async <T extends DeviceControl>(
            deviceId: string,
            control: T,
            desired: boolean | number
        ) => {
            const key = commandKey(deviceId, control.key)
            const existing = commandsRef.current[key]
            if (
                !liveRef.current ||
                existing?.phase === 'sending' ||
                existing?.phase === 'pending'
            ) {
                return
            }
            clearTimer(key)
            update(key, { phase: 'sending', desired })
            const payload =
                control.kind === 'toggle'
                    ? control.payload(desired as boolean)
                    : control.payload(desired as number)
            let answer: CommandAnswer
            try {
                answer = answerFromResult(
                    await sendCommand({ deviceId, payload })
                )
            } catch (error) {
                answer = answerFromError(error)
            }
            if (mounted.current) applyAnswer(key, desired, answer)
        },
        [applyAnswer, clearTimer, sendCommand, update]
    )

    const commandFor = useCallback(
        (deviceId: string, controlKey: string): TrackedCommand | undefined =>
            commands[commandKey(deviceId, controlKey)],
        [commands]
    )

    const dismiss = useCallback(
        (deviceId: string, controlKey: string) =>
            clear(commandKey(deviceId, controlKey)),
        [clear]
    )

    return { commandFor, send, dismiss }
}
