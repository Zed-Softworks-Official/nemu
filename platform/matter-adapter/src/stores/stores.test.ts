import assert from 'node:assert/strict'
import {
    mkdtempSync,
    readdirSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { isRecord, loadJsonFile, writeJsonAtomically } from './atomic-json.ts'
import { CAPABILITY_ID_FILE, CapabilityIdStore } from './capability-id-store.ts'
import {
    METER_IDENTITY_FILE,
    MeterIdentityStore,
} from './meter-identity-store.ts'

let dir: string
beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'nemu-stores-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const parseSample = (raw: unknown) =>
    isRecord(raw) && typeof raw.value === 'number'
        ? { value: raw.value }
        : undefined

describe('atomic JSON file', () => {
    it('round-trips and leaves no temp file behind', () => {
        const path = join(dir, 'nested', 'sample.json')
        writeJsonAtomically(path, { value: 7 })
        assert.deepEqual(
            loadJsonFile(path, parseSample, () => ({ value: 0 })),
            { value: { value: 7 }, writable: true }
        )
        assert.deepEqual(readdirSync(join(dir, 'nested')), ['sample.json'])
    })

    it('treats a missing file as empty and writable', () => {
        assert.deepEqual(
            loadJsonFile(join(dir, 'missing.json'), parseSample, () => ({
                value: 0,
            })),
            { value: { value: 0 }, writable: true }
        )
    })

    it('keeps a malformed file and does not write over it', () => {
        const path = join(dir, 'bad.json')
        writeFileSync(path, '{not json')
        assert.deepEqual(
            loadJsonFile(path, parseSample, () => ({ value: 0 })),
            { value: { value: 0 }, writable: false }
        )
        writeFileSync(path, '{"value":"seven"}')
        assert.equal(
            loadJsonFile(path, parseSample, () => ({ value: 0 })).writable,
            false
        )
    })
})

describe('MeterIdentityStore', () => {
    it('survives a restart', () => {
        const store = MeterIdentityStore.load(dir)
        const sequence = store.nextSequence()
        store.insert('plug-1', {
            fingerprint: 'power|device|=60000',
            observedAt: '2026-10-09T12:00:00Z',
            observationId: `plug-1:1:${sequence}`,
        })
        const loaded = MeterIdentityStore.load(dir)
        assert.equal(loaded.get('plug-1')?.observationId, 'plug-1:1:1')
        assert.equal(loaded.nextSequence(), 2)
    })

    it('uses the Rust adapter file name and shape', () => {
        const store = MeterIdentityStore.load(dir)
        store.nextSequence()
        store.insert('2', {
            fingerprint: 'f',
            observedAt: '2026-10-09T12:00:00Z',
            observationId: '2:1:1',
        })
        assert.deepEqual(
            JSON.parse(readFileSync(join(dir, METER_IDENTITY_FILE), 'utf8')),
            {
                sequence: 2,
                publications: {
                    '2': {
                        fingerprint: 'f',
                        observedAt: '2026-10-09T12:00:00Z',
                        observationId: '2:1:1',
                    },
                },
            }
        )
    })

    it('does not overwrite a malformed file', () => {
        const path = join(dir, METER_IDENTITY_FILE)
        writeFileSync(path, '[]')
        const store = MeterIdentityStore.load(dir)
        store.insert('2', {
            fingerprint: 'f',
            observedAt: '2026-10-09T12:00:00Z',
            observationId: '2:1:1',
        })
        assert.equal(readFileSync(path, 'utf8'), '[]')
    })
})

describe('CapabilityIdStore', () => {
    it('survives a restart', () => {
        const store = CapabilityIdStore.load(dir)
        assert.equal(store.set('2', { 'power|device|': 'cap-1' }), true)
        assert.equal(store.set('2', { 'power|device|': 'cap-1' }), false)
        assert.deepEqual(CapabilityIdStore.load(dir).get('2'), {
            'power|device|': 'cap-1',
        })
    })

    it('removes a Device', () => {
        const store = CapabilityIdStore.load(dir)
        store.set('2', { 'power|device|': 'cap-1' })
        store.remove('2')
        assert.deepEqual(
            JSON.parse(readFileSync(join(dir, CAPABILITY_ID_FILE), 'utf8')),
            { devices: {} }
        )
    })

    it('does not overwrite a malformed file', () => {
        const path = join(dir, CAPABILITY_ID_FILE)
        writeFileSync(path, '{"devices":{"2":{"power|device|":7}}}')
        const store = CapabilityIdStore.load(dir)
        assert.deepEqual(store.get('2'), {})
        store.set('2', { 'power|device|': 'cap-1' })
        assert.equal(
            readFileSync(path, 'utf8'),
            '{"devices":{"2":{"power|device|":7}}}'
        )
    })
})
