import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

/**
 * Nemu-owned friendly names keyed by external id (`nodeId` or
 * `nodeId:endpoint`). Matter has no bridge-side friendly-name sync, so renames
 * live here, persisted in the sidecar's data volume.
 */
export class NameStore {
    private names = new Map<string, string>()
    private readonly path: string

    constructor(dataDir: string) {
        this.path = join(dataDir, 'names.json')
        try {
            const raw = JSON.parse(readFileSync(this.path, 'utf8')) as Record<
                string,
                string
            >
            for (const [id, name] of Object.entries(raw)) {
                if (typeof name === 'string') this.names.set(id, name)
            }
        } catch {
            // First run or unreadable file: start empty.
        }
    }

    get(id: string): string | undefined {
        return this.names.get(id)
    }

    set(id: string, name: string): void {
        this.names.set(id, name)
        this.persist()
    }

    /** Drop names for ids no longer present (called after node removal). */
    retainOnly(ids: Set<string>): void {
        let changed = false
        for (const id of this.names.keys()) {
            if (!ids.has(id)) {
                this.names.delete(id)
                changed = true
            }
        }
        if (changed) this.persist()
    }

    private persist(): void {
        try {
            mkdirSync(dirname(this.path), { recursive: true })
            writeFileSync(
                this.path,
                JSON.stringify(Object.fromEntries(this.names), null, 2)
            )
        } catch (error) {
            console.error('failed to persist names store', error)
        }
    }
}
