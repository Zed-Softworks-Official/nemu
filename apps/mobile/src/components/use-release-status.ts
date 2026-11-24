import { useController } from '@nemu/controller'
import type { UpdateStatusResponse } from '@nemu/protocol'
import { useEffect, useState } from 'react'
import { errorMessage, isConnected } from '~/lib/connection'

/**
 * Release status, read again when the transport changes or an update this
 * phone started finishes. The last read stays while the Controller is
 * unreachable, so the screen keeps its layout.
 */
export function useReleaseStatus(): {
    release: UpdateStatusResponse | null
    error: string | null
} {
    const { status, getReleaseStatus, releaseUpdate } = useController()
    const live = isConnected(status)
    const updating = releaseUpdate?.phase === 'updating'
    const [release, setRelease] = useState<UpdateStatusResponse | null>(null)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        // The connection reads it for an update it is following.
        if (!live || updating) return
        let current = true
        getReleaseStatus().then(
            (read) => {
                if (!current) return
                setRelease(read)
                setError(null)
            },
            (cause: unknown) => {
                if (!current) return
                setError(
                    errorMessage(cause, 'Could not read the installed Release')
                )
            }
        )
        return () => {
            current = false
        }
    }, [live, updating, getReleaseStatus, status.mode])

    return { release, error }
}
