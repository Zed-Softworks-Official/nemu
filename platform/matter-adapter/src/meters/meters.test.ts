import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import type { AttributeSnapshot } from '../attributes.ts'
import { BULB, HARNESS_PLUG } from '../mapping/fixtures.test-support.ts'
import { mapNode } from '../mapping/index.ts'
import { CapabilityIdStore } from '../stores/capability-id-store.ts'
import { MeterIdentityStore } from '../stores/meter-identity-store.ts'
import { Meters, type MeterUpdate } from './meters.ts'

const NOW = Date.UTC(2026, 9, 9, 12, 0, 0)

function plug(snapshot: AttributeSnapshot = HARNESS_PLUG) {
    const device = mapNode('2', snapshot)[0]
    assert.ok(device)
    return device
}

function clockAt(start = NOW) {
    let now = start
    return () => {
        now += 1000
        return now
    }
}

function published(update: MeterUpdate) {
    assert.equal(update.kind, 'publish')
    return update as Extract<MeterUpdate, { kind: 'publish' }>
}

const ASSIGNED = {
    capabilities: ['power', 'voltage', 'current', 'importedEnergy'].map(
        (kind) => ({
            identity: { kind, physicalScope: { kind: 'device' } },
            capabilityId: `capability-plug-${kind}`,
        })
    ),
}

function withDataDir(run: (dir: string) => void) {
    const dir = mkdtempSync(join(tmpdir(), 'nemu-meters-'))
    try {
        run(dir)
    } finally {
        rmSync(dir, { recursive: true, force: true })
    }
}

describe('Meters', () => {
    it('stamps the first reading from the adapter clock', () => {
        const meters = new Meters(undefined, undefined, () => NOW)
        const update = published(meters.update(plug(), HARNESS_PLUG, false))
        assert.equal(update.report.observedAt, '2026-10-09T12:00:00Z')
        assert.equal(update.report.observationId, `2:${NOW}:1`)
        assert.equal(update.manifest.capabilities.length, 4)
    })

    it('does not republish an unchanged reading that is not fresh', () => {
        const meters = new Meters(undefined, undefined, clockAt())
        published(meters.update(plug(), HARNESS_PLUG, false))
        assert.deepEqual(meters.update(plug(), HARNESS_PLUG, false), {
            kind: 'none',
        })
    })

    it('gives a fresh reading a new observation identity', () => {
        const meters = new Meters(undefined, undefined, clockAt())
        const first = published(meters.update(plug(), HARNESS_PLUG, false))
        const second = published(meters.update(plug(), HARNESS_PLUG, true))
        assert.notEqual(first.report.observationId, second.report.observationId)
        assert.match(second.report.observationId ?? '', /^2:\d+:2$/)
    })

    it('applies assigned Capability IDs from the next fresh reading on', () => {
        const meters = new Meters(undefined, undefined, clockAt())
        published(meters.update(plug(), HARNESS_PLUG, false))
        assert.equal(meters.assign('2', ASSIGNED), true)
        assert.equal(meters.assign('2', ASSIGNED), false, 'unchanged IDs')
        assert.deepEqual(meters.update(plug(), HARNESS_PLUG, false), {
            kind: 'none',
        })
        const loaded = { ...HARNESS_PLUG, '2/144/8': 1_250_000 }
        const next = published(meters.update(plug(loaded), loaded, true))
        assert.deepEqual(
            next.report.observations.map((entry) => entry.capabilityId),
            [
                'capability-plug-power',
                'capability-plug-voltage',
                'capability-plug-current',
                'capability-plug-importedEnergy',
            ]
        )
    })

    it('ignores a capability-ids payload with no IDs', () => {
        const meters = new Meters()
        assert.equal(meters.assign('2', { capabilities: [] }), false)
        assert.equal(meters.assign('2', {}), false)
    })

    it('publishes only the manifest when the clock is unavailable', () => {
        const meters = new Meters(undefined, undefined, () => undefined)
        const update = meters.update(plug(), HARNESS_PLUG, true)
        assert.equal(update.kind, 'manifest')
    })

    it('clears both topics when a Device stops reporting readings', () => {
        const meters = new Meters(undefined, undefined, clockAt())
        published(meters.update(plug(), HARNESS_PLUG, false))
        const bare: Record<string, unknown> = { ...HARNESS_PLUG }
        for (const key of Object.keys(bare))
            if (/^2\/14[45]\//.test(key)) delete bare[key]
        assert.deepEqual(meters.update(plug(), bare, true), { kind: 'clear' })
        assert.deepEqual(meters.update(plug(), bare, true), { kind: 'none' })
    })

    it('publishes nothing for a Device without a meter', () => {
        const bulb = mapNode('3', BULB)[0]
        assert.ok(bulb)
        assert.deepEqual(new Meters().update(bulb, BULB, true), {
            kind: 'none',
        })
    })

    it('keeps observation identity and Capability IDs across a restart', () => {
        withDataDir((dir) => {
            const before = new Meters(
                MeterIdentityStore.load(dir),
                CapabilityIdStore.load(dir),
                clockAt()
            )
            const first = published(before.update(plug(), HARNESS_PLUG, false))
            before.assign('2', ASSIGNED)

            const after = new Meters(
                MeterIdentityStore.load(dir),
                CapabilityIdStore.load(dir),
                clockAt(NOW + 60_000)
            )
            // The same reading after a restart is the same observation.
            assert.deepEqual(after.update(plug(), HARNESS_PLUG, false), {
                kind: 'none',
            })
            const next = published(after.update(plug(), HARNESS_PLUG, true))
            assert.notEqual(
                next.report.observationId,
                first.report.observationId
            )
            assert.match(next.report.observationId ?? '', /:2$/)
            assert.equal(
                next.report.observations[0]?.capabilityId,
                'capability-plug-power'
            )
        })
    })

    it('forgets a removed Device', () => {
        withDataDir((dir) => {
            const meters = new Meters(
                MeterIdentityStore.load(dir),
                CapabilityIdStore.load(dir),
                clockAt()
            )
            published(meters.update(plug(), HARNESS_PLUG, false))
            meters.assign('2', ASSIGNED)
            meters.forget('2')
            assert.deepEqual(CapabilityIdStore.load(dir).get('2'), {})
            assert.equal(MeterIdentityStore.load(dir).get('2'), undefined)
        })
    })
})
