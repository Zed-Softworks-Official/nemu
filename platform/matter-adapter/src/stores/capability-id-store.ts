/**
 * The assigned-Capability-ID store: the Capability IDs Core assigned over
 * `{id}/capability-ids`, per Device, keyed by Capability identity
 * (`kind|scopeKind|componentId`). Persisted so History, Automations and
 * Home-meter designations keep pointing at the same Capability after an
 * adapter restart or Controller update.
 *
 * The Rust adapter kept these in memory only; this file is new.
 */
import { join } from 'node:path'
import type { Log } from '../log.ts'
import { isRecord, loadJsonFile, writeJsonAtomically } from './atomic-json.ts'

export const CAPABILITY_ID_FILE = 'capability-ids.json'

/** Capability identity key to the Capability ID Core assigned. */
export type AssignedIds = Readonly<Record<string, string>>

interface CapabilityIdFile {
    devices: Record<string, Record<string, string>>
}

export class CapabilityIdStore {
    #devices: Map<string, Record<string, string>>

    private constructor(
        private readonly path: string | undefined,
        file: CapabilityIdFile,
        private readonly writable: boolean,
        private readonly log?: Log
    ) {
        this.#devices = new Map(Object.entries(file.devices))
    }

    /** Loads `capability-ids.json` from the data dir. */
    static load(dataDir: string, log?: Log): CapabilityIdStore {
        const path = join(dataDir, CAPABILITY_ID_FILE)
        const loaded = loadJsonFile(path, parseFile, emptyFile, log)
        return new CapabilityIdStore(path, loaded.value, loaded.writable, log)
    }

    /** A store that keeps nothing on disk. */
    static inMemory(): CapabilityIdStore {
        return new CapabilityIdStore(undefined, emptyFile(), false)
    }

    get(deviceId: string): AssignedIds {
        return this.#devices.get(deviceId) ?? {}
    }

    /** Replaces a Device's IDs. False (and no write) when they are unchanged. */
    set(deviceId: string, assigned: AssignedIds): boolean {
        if (sameIds(this.#devices.get(deviceId), assigned)) return false
        this.#devices.set(deviceId, { ...assigned })
        this.#persist()
        return true
    }

    remove(deviceId: string): void {
        if (this.#devices.delete(deviceId)) this.#persist()
    }

    #persist(): void {
        if (!this.path || !this.writable) return
        try {
            writeJsonAtomically(this.path, {
                devices: Object.fromEntries(this.#devices),
            } satisfies CapabilityIdFile)
        } catch (error) {
            this.log?.warn(`failed to write Capability IDs: ${String(error)}`)
        }
    }
}

function sameIds(current: AssignedIds | undefined, next: AssignedIds): boolean {
    if (!current) return false
    const keys = Object.keys(next)
    return (
        keys.length === Object.keys(current).length &&
        keys.every((key) => current[key] === next[key])
    )
}

function emptyFile(): CapabilityIdFile {
    return { devices: {} }
}

function parseFile(raw: unknown): CapabilityIdFile | undefined {
    if (!isRecord(raw)) return undefined
    const devices = raw.devices ?? {}
    if (!isRecord(devices)) return undefined
    const out: CapabilityIdFile['devices'] = {}
    for (const [deviceId, ids] of Object.entries(devices)) {
        if (!isRecord(ids)) return undefined
        const entry: Record<string, string> = {}
        for (const [key, id] of Object.entries(ids)) {
            if (typeof id !== 'string') return undefined
            entry[key] = id
        }
        out[deviceId] = entry
    }
    return { devices: out }
}
