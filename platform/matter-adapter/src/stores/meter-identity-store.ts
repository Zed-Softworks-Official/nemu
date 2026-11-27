/**
 * The meter-identity store: per Device, the last observation envelope the
 * adapter published (its reading fingerprint, `observedAt` and
 * `observationId`), plus a sequence that keeps observation IDs unique across
 * restarts. An unchanged reading after a restart reuses the stored envelope
 * instead of looking like a new observation.
 *
 * Same file and shape as the Rust adapter (`meter-observations.json`).
 */
import { join } from 'node:path'
import type { Log } from '../log.ts'
import { isRecord, loadJsonFile, writeJsonAtomically } from './atomic-json.ts'

export const METER_IDENTITY_FILE = 'meter-observations.json'

export interface PublishedMeter {
    fingerprint: string
    observedAt: string
    observationId: string
}

interface MeterIdentityFile {
    sequence: number
    publications: Record<string, PublishedMeter>
}

export class MeterIdentityStore {
    #sequence: number
    #publications: Map<string, PublishedMeter>

    private constructor(
        private readonly path: string | undefined,
        file: MeterIdentityFile,
        private readonly writable: boolean,
        private readonly log?: Log
    ) {
        this.#sequence = Math.max(1, file.sequence)
        this.#publications = new Map(Object.entries(file.publications))
    }

    /** Loads `meter-observations.json` from the data dir. */
    static load(dataDir: string, log?: Log): MeterIdentityStore {
        const path = join(dataDir, METER_IDENTITY_FILE)
        const loaded = loadJsonFile(path, parseFile, emptyFile, log)
        return new MeterIdentityStore(path, loaded.value, loaded.writable, log)
    }

    /** A store that keeps nothing on disk. */
    static inMemory(): MeterIdentityStore {
        return new MeterIdentityStore(undefined, emptyFile(), false)
    }

    get(deviceId: string): PublishedMeter | undefined {
        return this.#publications.get(deviceId)
    }

    /** The next observation sequence. Persisted with the next insert. */
    nextSequence(): number {
        const sequence = this.#sequence
        this.#sequence = Math.min(this.#sequence + 1, Number.MAX_SAFE_INTEGER)
        return sequence
    }

    insert(deviceId: string, published: PublishedMeter): void {
        this.#publications.set(deviceId, { ...published })
        this.#persist()
    }

    remove(deviceId: string): void {
        if (this.#publications.delete(deviceId)) this.#persist()
    }

    #persist(): void {
        if (!this.path || !this.writable) return
        const body: MeterIdentityFile = {
            sequence: this.#sequence,
            publications: Object.fromEntries(this.#publications),
        }
        try {
            writeJsonAtomically(this.path, body)
        } catch (error) {
            this.log?.warn(`failed to write meter identities: ${String(error)}`)
        }
    }
}

function emptyFile(): MeterIdentityFile {
    return { sequence: 1, publications: {} }
}

function parseFile(raw: unknown): MeterIdentityFile | undefined {
    if (!isRecord(raw)) return undefined
    const sequence = raw.sequence ?? 1
    if (!Number.isSafeInteger(sequence) || (sequence as number) < 0)
        return undefined
    const publications: Record<string, PublishedMeter> = {}
    const entries = raw.publications ?? {}
    if (!isRecord(entries)) return undefined
    for (const [deviceId, entry] of Object.entries(entries)) {
        if (
            !isRecord(entry) ||
            typeof entry.fingerprint !== 'string' ||
            typeof entry.observedAt !== 'string' ||
            typeof entry.observationId !== 'string'
        )
            return undefined
        publications[deviceId] = {
            fingerprint: entry.fingerprint,
            observedAt: entry.observedAt,
            observationId: entry.observationId,
        }
    }
    return { sequence: sequence as number, publications }
}
