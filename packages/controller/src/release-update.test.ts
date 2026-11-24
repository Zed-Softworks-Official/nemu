import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { UpdateStatusResponse } from '@nemu/protocol'
import {
    RELEASE_UPDATE_START_GRACE_MS,
    type ReleaseUpdateProgress,
    releaseUpdateOutcome,
} from './release-update.ts'

const BEFORE: UpdateStatusResponse = {
    platformVersion: '0.4.9',
    channel: 'stable',
    newerReleaseAvailable: true,
    maintenanceMode: false,
    rollbackSnapshotAvailable: false,
    rollbackStuck: false,
}

function outcome(
    progress: Partial<ReleaseUpdateProgress>,
    status: Partial<UpdateStatusResponse>
) {
    const before = progress.before ?? BEFORE
    return releaseUpdateOutcome(
        {
            kind: 'install',
            before,
            sawMaintenance: false,
            lostConnection: false,
            quietMs: 0,
            ...progress,
        },
        { ...before, ...status }
    )
}

describe('the outcome of a Release update', () => {
    it('waits for an update that has not entered maintenance yet', () => {
        assert.equal(outcome({}, {}), null)
        assert.equal(outcome({ lostConnection: true }, {}), null)
    })

    it('waits for maintenance to end, even once the version changed', () => {
        assert.equal(
            outcome({}, { platformVersion: '0.4.10', maintenanceMode: true }),
            null
        )
    })

    it('is installed or rolled back when the version changed', () => {
        assert.equal(outcome({}, { platformVersion: '0.4.10' }), 'installed')
        assert.equal(
            outcome({ kind: 'rollback' }, { platformVersion: '0.4.8' }),
            'rolledBack'
        )
    })

    it('is rolled back when a failed install restored its snapshot', () => {
        assert.equal(
            outcome(
                { sawMaintenance: true },
                { rollbackSnapshotAvailable: true }
            ),
            'rolledBack'
        )
    })

    it('did not complete when a snapshot from before may have been kept', () => {
        const before = { ...BEFORE, rollbackSnapshotAvailable: true }
        for (const progress of [
            { before, sawMaintenance: true },
            {
                before,
                lostConnection: true,
                quietMs: RELEASE_UPDATE_START_GRACE_MS,
            },
        ]) {
            assert.equal(outcome(progress, {}), 'notCompleted')
        }
        // The install cleared the snapshot and stopped before replacing anything.
        assert.equal(
            outcome(
                { before, sawMaintenance: true },
                { rollbackSnapshotAvailable: false }
            ),
            'notApplied'
        )
    })

    it('is not applied when the Updater refused it', () => {
        assert.equal(outcome({ sawMaintenance: true }, {}), 'notApplied')
        assert.equal(
            outcome(
                { quietMs: RELEASE_UPDATE_START_GRACE_MS },
                { rollbackSnapshotAvailable: true }
            ),
            'notApplied'
        )
        assert.equal(
            outcome(
                { kind: 'rollback', quietMs: RELEASE_UPDATE_START_GRACE_MS },
                {}
            ),
            'notApplied'
        )
    })

    it('follows a stuck rollback, and a retry until it leaves maintenance', () => {
        const stuck = { maintenanceMode: true, rollbackStuck: true }
        assert.equal(outcome({ kind: 'rollback' }, stuck), 'rollbackStuck')
        const before = { ...BEFORE, ...stuck }
        assert.equal(outcome({ kind: 'rollback', before }, stuck), null)
        assert.equal(
            outcome(
                { kind: 'rollback', before },
                { maintenanceMode: false, rollbackStuck: false }
            ),
            'rolledBack'
        )
    })
})
