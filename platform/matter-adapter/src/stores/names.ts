/**
 * Name store: the names Devices were given by rename, by Device ID, in
 * `names.json` under the data directory. The file and its shape are the Rust
 * adapter's: `{"names": {"2": "Desk Lamp"}}`.
 */
import { join } from 'node:path'
import type { Log } from '../log.ts'
import { loadJson, writeAtomically } from './file.ts'

export const NAMES_FILE = 'names.json'

export class NameStore {
    #names: Map<string, string>
    /** Writes run one after another, so the file ends with the latest names. */
    #writing: Promise<void> = Promise.resolve()

    private constructor(
        private readonly path: string,
        names: Map<string, string>,
        private readonly writable: boolean,
        private readonly log: Log
    ) {
        this.#names = names
    }

    static async load(dataDir: string, log: Log): Promise<NameStore> {
        const path = join(dataDir, NAMES_FILE)
        const loaded = await loadJson(path, 'name store', parseNames, log)
        return new NameStore(
            path,
            loaded.value ?? new Map(),
            loaded.writable,
            log
        )
    }

    get(id: string): string | undefined {
        return this.#names.get(id)
    }

    /** Resolves once the name is on disk. */
    set(id: string, name: string): Promise<void> {
        this.#names.set(id, name)
        return this.#persist()
    }

    /** Forgets the names of Devices that are no longer in the inventory. */
    retainOnly(keep: ReadonlySet<string>): Promise<void> {
        let changed = false
        for (const id of [...this.#names.keys()]) {
            if (keep.has(id)) continue
            this.#names.delete(id)
            changed = true
        }
        return changed ? this.#persist() : this.#writing
    }

    #persist(): Promise<void> {
        if (!this.writable) return this.#writing
        const text = `${JSON.stringify({ names: Object.fromEntries(this.#names) }, null, 2)}\n`
        this.#writing = this.#writing
            .then(() => writeAtomically(this.path, text))
            .catch((error: unknown) =>
                this.log.warn(`writing the name store failed: ${String(error)}`)
            )
        return this.#writing
    }
}

function parseNames(value: unknown): Map<string, string> | undefined {
    if (value === null || typeof value !== 'object' || Array.isArray(value))
        return undefined
    const names = (value as { names?: unknown }).names ?? {}
    if (names === null || typeof names !== 'object' || Array.isArray(names))
        return undefined
    const out = new Map<string, string>()
    for (const [id, name] of Object.entries(names)) {
        if (typeof name === 'string') out.set(id, name)
    }
    return out
}
