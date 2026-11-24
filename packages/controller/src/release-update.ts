import { ApiError, type UpdateStatusResponse } from '@nemu/protocol'

export type ReleaseUpdateKind = 'install' | 'rollback'

/**
 * - `installed`: the Home runs the newer Release.
 * - `rolledBack`: the Home runs the previous Release.
 * - `notApplied`: the Updater refused or never started; nothing changed.
 * - `rollbackStuck`: a rollback could not finish and can be retried.
 * - `unknown`: the Controller did not report an outcome to this client.
 */
export type ReleaseUpdateOutcome =
    | 'installed'
    | 'rolledBack'
    | 'notApplied'
    | 'rollbackStuck'
    | 'unknown'

/** An install or rollback this client started. The restart is expected. */
export type ReleaseUpdate =
    | {
          phase: 'updating'
          kind: ReleaseUpdateKind
          /** The Controller is not answering, as it won't while it restarts. */
          reconnecting: boolean
      }
    | {
          phase: 'finished'
          kind: ReleaseUpdateKind
          outcome: ReleaseUpdateOutcome
          /** Release status after the update; `null` when it is unknown. */
          release: UpdateStatusResponse | null
      }

/** Each read makes the Updater fetch the channel manifest, so not too often. */
export const RELEASE_UPDATE_POLL_MS = 5_000
/** How long an unchanged Release may still mean the update is starting. */
export const RELEASE_UPDATE_START_GRACE_MS = 90_000
/** Longer than a snapshot, a failed health gate and its rollback. */
export const RELEASE_UPDATE_TIMEOUT_MS = 45 * 60_000

export type ReleaseUpdateProgress = {
    kind: ReleaseUpdateKind
    /** Release status read just before the update started. */
    before: UpdateStatusResponse
    sawMaintenance: boolean
    lostConnection: boolean
    /** Time since the update started or the connection was last lost. */
    quietMs: number
}

/** The outcome `status` shows, or `null` while the update is still running. */
export function releaseUpdateOutcome(
    progress: ReleaseUpdateProgress,
    status: UpdateStatusResponse
): ReleaseUpdateOutcome | null {
    const { kind, before } = progress
    if (status.maintenanceMode) {
        // A retried rollback starts out stuck, so it can't end there.
        return status.rollbackStuck && !before.rollbackStuck
            ? 'rollbackStuck'
            : null
    }
    if (status.platformVersion !== before.platformVersion) {
        return kind === 'install' ? 'installed' : 'rolledBack'
    }
    if (before.rollbackStuck) {
        // The retry restored the previous Release and left maintenance.
        return 'rolledBack'
    }
    const settled =
        progress.sawMaintenance ||
        progress.quietMs >= RELEASE_UPDATE_START_GRACE_MS
    if (!settled) return null
    const restored =
        kind === 'install' &&
        (progress.sawMaintenance || progress.lostConnection) &&
        status.rollbackSnapshotAvailable
    return restored ? 'rolledBack' : 'notApplied'
}

/** The Controller no longer accepts this client, so it can't be followed. */
export function releaseUpdateIsCutOff(error: unknown): boolean {
    return (
        error instanceof ApiError &&
        (error.code === 'unauthorized' || error.code === 'inactive_membership')
    )
}

/** The Controller answered, so the connection is not what failed. */
export function controllerAnswered(error: unknown): boolean {
    return (
        error instanceof ApiError &&
        !['network_error', 'timeout', 'unknown', 'http_error'].includes(
            error.code
        )
    )
}
