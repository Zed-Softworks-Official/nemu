import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { updateStatusResponseSchema } from './api.ts'

describe('update status response', () => {
    it('keeps the current release status payload', () => {
        const parsed = updateStatusResponseSchema.parse({
            platformVersion: '0.4.10',
            channel: 'canary',
            newerReleaseAvailable: true,
            maintenanceMode: true,
            rollbackSnapshotAvailable: true,
            rollbackStuck: false,
        })
        assert.deepEqual(parsed, {
            platformVersion: '0.4.10',
            channel: 'canary',
            newerReleaseAvailable: true,
            maintenanceMode: true,
            rollbackSnapshotAvailable: true,
            rollbackStuck: false,
        })
    })

    it('maps a legacy LAN payload onto the current release status', () => {
        const parsed = updateStatusResponseSchema.parse({
            currentVersion: '0.2.2',
            updateAvailable: true,
            image: 'ghcr.io/zed-softworks-official/nemu-core',
        })
        assert.equal(parsed.platformVersion, '0.2.2')
        assert.equal(parsed.channel, 'stable')
        assert.equal(parsed.newerReleaseAvailable, true)
        assert.equal(parsed.maintenanceMode, false)
        assert.equal(parsed.rollbackSnapshotAvailable, false)
        assert.equal(parsed.rollbackStuck, false)
    })

    it('preserves a legacy updateAvailable of false', () => {
        const parsed = updateStatusResponseSchema.parse({
            currentVersion: '0.2.2',
            updateAvailable: false,
        })
        assert.equal(parsed.newerReleaseAvailable, false)
        assert.equal(parsed.maintenanceMode, false)
        assert.equal(parsed.rollbackSnapshotAvailable, false)
        assert.equal(parsed.rollbackStuck, false)
    })
})
