import {
    ApiError,
    type ApplyUpdateResponse,
    type UpdateStatusResponse,
} from '@nemu/protocol'

export type ReleaseUpdateKind = 'install' | 'rollback'

/**
 * - `installed`: the Home runs the newer Release.
 * - `rolledBack`: the Home runs the previous Release.
 * - `notCompleted`: the update ended on the installed Release, and whether
 *   anything was replaced first is not known.
 * - `notApplied`: the Updater refused or never started; nothing changed.
 * - `rollbackStuck`: a rollback could not finish and can be retried.
 * - `unknown`: the Controller did not report an outcome to this client.
 */
export type ReleaseUpdateOutcome =
    | 'installed'
    | 'rolledBack'
    | 'notCompleted'
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

export type ReleaseUpdateController = {
    getReleaseStatus: () => Promise<UpdateStatusResponse>
    installRelease: (platformVersion?: string) => Promise<ApplyUpdateResponse>
    rollbackRelease: () => Promise<ApplyUpdateResponse>
    /** Find the Controller again, over LAN or Relay. */
    reconnect: () => Promise<void>
    /** Undo a reconnect that finished after the connection was stopped. */
    abandonReconnect: () => void
}

/**
 * Runs one install or rollback at a time and follows it across the
 * Controller's restart.
 */
export class ReleaseUpdateFollower {
    private readonly controller: ReleaseUpdateController
    private update: ReleaseUpdate | null = null
    private run: { cancelled: boolean } | null = null
    private timer: ReturnType<typeof setTimeout> | null = null
    private readonly listeners = new Set<
        (update: ReleaseUpdate | null) => void
    >()

    constructor(controller: ReleaseUpdateController) {
        this.controller = controller
    }

    current(): ReleaseUpdate | null {
        return this.update
    }

    subscribe(cb: (update: ReleaseUpdate | null) => void): () => void {
        this.listeners.add(cb)
        cb(this.update)
        return () => {
            this.listeners.delete(cb)
        }
    }

    /** Forget a finished update's outcome. A running one is kept. */
    dismiss(): void {
        if (this.update?.phase === 'finished') this.set(null)
    }

    stop(): void {
        if (this.run) this.run.cancelled = true
        this.run = null
        if (this.timer) clearTimeout(this.timer)
        this.timer = null
        this.set(null)
    }

    /** @see ControllerConnection.startReleaseUpdate */
    async start(
        kind: ReleaseUpdateKind,
        confirmedVersion?: string
    ): Promise<void> {
        if (this.run) {
            throw new ApiError(
                'update_in_progress',
                'An update is already running'
            )
        }
        const run = { cancelled: false }
        this.run = run
        try {
            const before = await this.controller.getReleaseStatus()
            const retry = kind === 'rollback' && before.rollbackStuck
            if (before.maintenanceMode && !retry) {
                throw new ApiError(
                    'in_maintenance',
                    'The Controller is already updating'
                )
            }
            // Controllers that predate confirmed versions ignore the one sent.
            if (
                kind === 'install' &&
                confirmedVersion !== undefined &&
                before.availableRelease?.platformVersion !== confirmedVersion
            ) {
                throw new ApiError(
                    'release_changed',
                    'A different Release is available now. Check it before installing.'
                )
            }
            const { started } =
                kind === 'install'
                    ? await this.controller.installRelease(confirmedVersion)
                    : await this.controller.rollbackRelease()
            if (!started) {
                throw new ApiError(
                    'update_not_started',
                    'The Controller did not start the update'
                )
            }
            if (run.cancelled) return
            this.set({ phase: 'updating', kind, reconnecting: false })
            void this.follow(run, kind, before)
        } catch (error) {
            if (this.run === run) this.run = null
            throw error
        }
    }

    private async follow(
        run: { cancelled: boolean },
        kind: ReleaseUpdateKind,
        before: UpdateStatusResponse
    ): Promise<void> {
        const startedAt = Date.now()
        let quietSince = startedAt
        const progress: ReleaseUpdateProgress = {
            kind,
            before,
            sawMaintenance: false,
            lostConnection: false,
            quietMs: 0,
        }

        while (Date.now() - startedAt < RELEASE_UPDATE_TIMEOUT_MS) {
            await new Promise<void>((resolve) => {
                this.timer = setTimeout(resolve, RELEASE_UPDATE_POLL_MS)
            })
            if (run.cancelled) return
            try {
                const status = await this.controller.getReleaseStatus()
                if (run.cancelled) return
                this.setReconnecting(false)
                if (status.maintenanceMode) progress.sawMaintenance = true
                progress.quietMs = Date.now() - quietSince
                const outcome = releaseUpdateOutcome(progress, status)
                if (outcome) {
                    this.finish(kind, outcome, status)
                    return
                }
            } catch (error) {
                if (run.cancelled) return
                if (releaseUpdateIsCutOff(error)) {
                    this.finish(kind, 'unknown', null)
                    return
                }
                // Core is up but its Updater isn't yet, or is restarting.
                if (controllerAnswered(error)) {
                    this.setReconnecting(false)
                    continue
                }
                progress.lostConnection = true
                this.setReconnecting(true)
                await this.controller.reconnect()
                if (run.cancelled) {
                    this.controller.abandonReconnect()
                    return
                }
                quietSince = Date.now()
            }
        }
        this.finish(kind, 'unknown', null)
    }

    private finish(
        kind: ReleaseUpdateKind,
        outcome: ReleaseUpdateOutcome,
        release: UpdateStatusResponse | null
    ): void {
        this.run = null
        this.set({ phase: 'finished', kind, outcome, release })
    }

    private setReconnecting(value: boolean): void {
        const current = this.update
        if (current?.phase === 'updating' && current.reconnecting !== value) {
            this.set({ ...current, reconnecting: value })
        }
    }

    private set(update: ReleaseUpdate | null): void {
        this.update = update
        for (const listener of this.listeners) listener(update)
    }
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
    const ran =
        kind === 'install' &&
        (progress.sawMaintenance || progress.lostConnection)
    if (!ran || !status.rollbackSnapshotAvailable) return 'notApplied'
    // An install replaces the snapshot just before it replaces anything else.
    // One that was already there says nothing about this install.
    return before.rollbackSnapshotAvailable ? 'notCompleted' : 'rolledBack'
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
