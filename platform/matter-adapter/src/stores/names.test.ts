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

    it('starts empty without a file', async () => {
        const names = await NameStore.load(dir, quiet)
        assert.equal(names.get('2'), undefined)
    })

    it('keeps a name across a reload', async () => {
        const names = await NameStore.load(dir, quiet)
        await names.set('2', 'Desk Lamp')
        const reloaded = await NameStore.load(dir, quiet)
        assert.equal(reloaded.get('2'), 'Desk Lamp')
    })

    it('writes the Rust adapter file shape and leaves no temporary file', async () => {
        const names = await NameStore.load(dir, quiet)
        await names.set('2', 'Desk Lamp')
        assert.deepEqual(
            JSON.parse(await readFile(join(dir, NAMES_FILE), 'utf8')),
            { names: { '2': 'Desk Lamp' } }
        )
        assert.deepEqual(await readdir(dir), [NAMES_FILE])
    })

    it('reads a file the Rust adapter wrote', async () => {
        await writeFile(join(dir, NAMES_FILE), '{"names":{"3:1":"Outlet A"}}')
        const names = await NameStore.load(dir, quiet)
        assert.equal(names.get('3:1'), 'Outlet A')
    })

    it('ends with the latest name when renames overlap', async () => {
        const names = await NameStore.load(dir, quiet)
        void names.set('2', 'First')
        await names.set('2', 'Second')
        const reloaded = await NameStore.load(dir, quiet)
        assert.equal(reloaded.get('2'), 'Second')
    })

    it('forgets names of Devices no longer in the inventory', async () => {
        const names = await NameStore.load(dir, quiet)
        await names.set('2', 'Desk Lamp')
        await names.set('3', 'Kettle')
        await names.retainOnly(new Set(['3']))
        const reloaded = await NameStore.load(dir, quiet)
        assert.equal(reloaded.get('2'), undefined)
        assert.equal(reloaded.get('3'), 'Kettle')
    })

    it('leaves a malformed file untouched', async () => {
        await writeFile(join(dir, NAMES_FILE), '{not json')
        const names = await NameStore.load(dir, quiet)
        await names.set('2', 'Desk Lamp')
        assert.equal(names.get('2'), 'Desk Lamp')
        assert.equal(await readFile(join(dir, NAMES_FILE), 'utf8'), '{not json')
    })
})
