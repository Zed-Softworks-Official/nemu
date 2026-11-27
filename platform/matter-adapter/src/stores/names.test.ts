import assert from 'node:assert/strict'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'
import type { Log } from '../log.ts'
import { NAMES_FILE, NameStore } from './names.ts'

const quiet: Log = { info() {}, warn() {}, error() {} }

describe('NameStore', () => {
    let dir: string
    beforeEach(async () => {
        dir = await mkdtemp(join(tmpdir(), 'nemu-names-'))
    })
    afterEach(async () => {
        await rm(dir, { recursive: true, force: true })
    })

    it('starts empty without a file', () => {
        assert.equal(NameStore.load(dir, quiet).get('2'), undefined)
    })

    it('keeps a name across a reload', () => {
        NameStore.load(dir, quiet).set('2', 'Desk Lamp')
        assert.equal(NameStore.load(dir, quiet).get('2'), 'Desk Lamp')
    })

    it('writes the Rust adapter file shape and leaves no temporary file', async () => {
        NameStore.load(dir, quiet).set('2', 'Desk Lamp')
        assert.deepEqual(
            JSON.parse(await readFile(join(dir, NAMES_FILE), 'utf8')),
            { names: { '2': 'Desk Lamp' } }
        )
        assert.deepEqual(await readdir(dir), [NAMES_FILE])
    })

    it('reads a file the Rust adapter wrote', async () => {
        await writeFile(join(dir, NAMES_FILE), '{"names":{"3:1":"Outlet A"}}')
        assert.equal(NameStore.load(dir, quiet).get('3:1'), 'Outlet A')
    })

    it('forgets names of Devices no longer in the inventory', () => {
        const names = NameStore.load(dir, quiet)
        names.set('2', 'Desk Lamp')
        names.set('3', 'Kettle')
        names.retainOnly(new Set(['3']))
        const reloaded = NameStore.load(dir, quiet)
        assert.equal(reloaded.get('2'), undefined)
        assert.equal(reloaded.get('3'), 'Kettle')
    })

    it('leaves a malformed file untouched', async () => {
        await writeFile(join(dir, NAMES_FILE), '{not json')
        const names = NameStore.load(dir, quiet)
        names.set('2', 'Desk Lamp')
        assert.equal(names.get('2'), 'Desk Lamp')
        assert.equal(await readFile(join(dir, NAMES_FILE), 'utf8'), '{not json')
    })

    it('keeps nothing on disk in memory', async () => {
        NameStore.inMemory().set('2', 'Desk Lamp')
        assert.deepEqual(await readdir(dir), [])
    })
})
