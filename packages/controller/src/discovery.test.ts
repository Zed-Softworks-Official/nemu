import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { isLocalDevDashboard, lanDiscoveryCandidates } from './discovery.ts'

const globals = globalThis as { window?: unknown }

describe('discovery on React Native', () => {
    afterEach(() => {
        delete globals.window
    })

    it('treats a window without location as not the local dashboard', () => {
        // React Native defines `window` but not `window.location`.
        globals.window = {}
        assert.equal(isLocalDevDashboard(), false)
        assert.doesNotThrow(() =>
            lanDiscoveryCandidates(['https://home.lan.nemu.sh:6368'])
        )
    })
})
