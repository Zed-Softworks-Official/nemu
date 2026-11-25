import { useController } from '@nemu/controller'
import type { CommandResult, Device, DeviceState } from '@nemu/protocol'
import { useCallback, useEffect, useRef } from 'react'
import { commandControl, reportsRequested } from '~/lib/command-confirmation'

/** Core marks a Command unconfirmed after 30s; allow for the trip back. */
export const CONFIRMATION_WINDOW_MS = 35_000

type Waiting = {
    payload: DeviceState
    /** The Device as it was when the Command was sent. */
    before: Device
    requestId?: string
    timer?: ReturnType<typeof setTimeout>
    /**
     * Replaced a Command still waiting, so a matching report may predate both.
     * Cleared by a report that does not match.
     */
    ambiguous: boolean
    /** Kept after a failure, so a late report can still withdraw the error. */
    failed?: boolean
}

type Handlers = {
    /** `errorsLeft` is set while another Command has failed. */
    onConfirmed: (payload: DeviceState, errorsLeft: boolean) => void
    onFailure: (error: Error, payload: DeviceState) => void
}

/**
 * Accepting a Command does not confirm it (ADR-0015). Calls `onConfirmed` when
 * the Device reports the requested value, and `onFailure` when the Command
 * fails or the Device does not report that value in time, so the requested
 * value does not stay on screen as if it had happened. Other reports from the
 * Device leave the Command waiting.
 */
export function useCommandConfirmation(
    device: Device | undefined,
    handlers: Handlers
) {
    const { connection } = useController()
    const waiting = useRef(new Map<string, Waiting>())
    const latest = useRef({ device, handlers })
    latest.current = { device, handlers }

    const fail = useCallback((entry: Waiting, error: Error) => {
        clearTimeout(entry.timer)
        entry.failed = true
        latest.current.handlers.onFailure(error, entry.payload)
    }, [])

    const confirmReported = useCallback(() => {
        const { device, handlers } = latest.current
        if (!device) return
        for (const [control, entry] of waiting.current) {
            if (!reportsRequested(entry.payload, device, entry.before)) {
                entry.ambiguous = false
                continue
            }
            if (entry.ambiguous) continue
            clearTimeout(entry.timer)
            waiting.current.delete(control)
            handlers.onConfirmed(
                entry.payload,
                [...waiting.current.values()].some(({ failed }) => failed)
            )
        }
    }, [])

    /** Track a Command from when it is sent. A newer one replaces it. */
    const track = useCallback(
        (payload: DeviceState) => {
            const { device } = latest.current
            const control = commandControl(payload)
            const drop = (key: string) => {
                clearTimeout(waiting.current.get(key)?.timer)
                waiting.current.delete(key)
            }
            const replaced = waiting.current.get(control)
            drop(control)
            // A light that is off need not report the level it was asked for.
            if (control === 'power' && payload.state === 'OFF') {
                drop('brightness')
            }
            const entry: Waiting | undefined = device && {
                payload,
                before: device,
                ambiguous: replaced !== undefined && !replaced.failed,
            }
            if (entry) waiting.current.set(control, entry)
            const current = () =>
                entry !== undefined && waiting.current.get(control) === entry

            return {
                accepted({ requestId }: CommandResult) {
                    if (!entry || !current()) return
                    entry.requestId = requestId
                    entry.timer = setTimeout(() => {
                        // Too late for a report of the replaced Command.
                        entry.ambiguous = false
                        confirmReported()
                        if (!current()) return
                        fail(
                            entry,
                            new Error('The Device did not report the change.')
                        )
                    }, CONFIRMATION_WINDOW_MS)
                    confirmReported()
                },
                failed(error: Error) {
                    if (entry && current()) fail(entry, error)
                },
            }
        },
        [confirmReported, fail]
    )

    useEffect(confirmReported, [device, confirmReported])

    useEffect(
        () =>
            connection.subscribeEvents((event) => {
                if (event.type !== 'commandResult' || event.ok) return
                for (const entry of waiting.current.values()) {
                    if (entry.requestId !== event.requestId) continue
                    fail(
                        entry,
                        new Error(
                            event.error?.message ??
                                'Command failed on the controller'
                        )
                    )
                }
            }),
        [connection, fail]
    )

    const deviceId = device?.id
    useEffect(() => {
        const entries = waiting.current
        return () => {
            for (const { timer } of entries.values()) clearTimeout(timer)
            entries.clear()
        }
    }, [deviceId])

    return track
}
