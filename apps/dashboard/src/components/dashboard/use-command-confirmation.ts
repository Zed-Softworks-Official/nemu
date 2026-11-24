import { useController } from '@nemu/controller'
import type { CommandResult } from '@nemu/protocol'
import { useCallback, useEffect, useRef } from 'react'

/** Core marks a Command unconfirmed after 30s; allow for the trip back. */
export const CONFIRMATION_WINDOW_MS = 35_000

/**
 * Accepting a Command does not confirm it (ADR-0015). Calls `onFailure` when
 * an accepted Command then fails, or the Device reports nothing in time, so
 * the requested value does not stay on screen as if it had happened.
 */
export function useCommandConfirmation(onFailure: (error: Error) => void) {
    const { connection } = useController()
    const waiting = useRef(new Map<string, ReturnType<typeof setTimeout>>())
    const failed = useRef(onFailure)
    failed.current = onFailure

    /** The Device reported, or the Command was answered another way. */
    const settle = useCallback(() => {
        for (const timer of waiting.current.values()) clearTimeout(timer)
        waiting.current.clear()
    }, [])

    const awaitConfirmation = useCallback(
        ({ requestId, outcome }: CommandResult) => {
            if (outcome === 'confirmed') return
            clearTimeout(waiting.current.get(requestId))
            waiting.current.set(
                requestId,
                setTimeout(() => {
                    settle()
                    failed.current(
                        new Error('The Device did not report the change.')
                    )
                }, CONFIRMATION_WINDOW_MS)
            )
        },
        [settle]
    )

    useEffect(
        () =>
            connection.subscribeEvents((event) => {
                if (event.type !== 'commandResult' || event.ok) return
                if (!waiting.current.has(event.requestId)) return
                settle()
                failed.current(
                    new Error(
                        event.error?.message ??
                            'Command failed on the controller'
                    )
                )
            }),
        [connection, settle]
    )

    useEffect(() => settle, [settle])

    return { awaitConfirmation, settle }
}
