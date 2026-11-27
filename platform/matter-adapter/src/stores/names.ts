/**
 * Name store: the names Devices were given by rename, by Device ID, in
 * `names.json` under the data directory, written atomically. The file and its
 * shape are the Rust adapter's: `{"names": {"2": "Desk Lamp"}}`.
 */
import { join } from 'node:path'
import type { Log } from '../log.ts'
import { isRecord, loadJsonFile, writeJsonAtomically } from './atomic-json.ts'

export const NAMES_FILE = 'names.json'

export class NameStore {
    #names: Map<string, string>

    private constructor(
        private readonly path: string | undefined,
        names: Map<string, string>,
        private readonly writable: boolean,
        private readonly log?: Log
    ) {
        this.#names = names
    }

    /** Loads `names.json` from the data dir. */
    static load(dataDir: string, log?: Log): NameStore {
        const path = join(dataDir, NAMES_FILE)
        const loaded = loadJsonFile(path, parseNames, () => new Map(), log)
        return new NameStore(path, loaded.value, loaded.writable, log)
    }

    /** A store that keeps nothing on disk. */
    static inMemory(): NameStore {
        return new NameStore(undefined, new Map(), false)
    }

    get(id: string): string | undefined {
        return this.#names.get(id)
    }

    /** Returns once the name is on disk. */
    set(id: string, name: string): void {
        this.#names.set(id, name)
        this.#persist()
    }

    /** Forgets the names of Devices that are no longer in the inventory. */
    retainOnly(keep: ReadonlySet<string>): void {
        let changed = false
        for (const id of [...this.#names.keys()]) {
            if (keep.has(id)) continue
            this.#names.delete(id)
            changed = true
        }
        if (changed) this.#persist()
    }

    #persist(): void {
        if (!this.writable || !this.path) return
        try {
            writeJsonAtomically(this.path, {
                names: Object.fromEntries(this.#names),
            })
        } catch (error) {
            this.log?.warn(`failed to write the name store: ${String(error)}`)
        }
    }
}

function parseNames(value: unknown): Map<string, string> | undefined {
    if (!isRecord(value)) return undefined
    const names = value.names ?? {}
    if (!isRecord(names)) return undefined
    const out = new Map<string, string>()
    for (const [id, name] of Object.entries(names)) {
        if (typeof name === 'string') out.set(id, name)
    }
    return out
}
