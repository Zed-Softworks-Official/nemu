/**
 * Retires a data directory the Rust adapter left (NEM-121). matter.js starts a
 * new fabric, so the Rust adapter's Matter Devices are gone from the Home: on
 * the first start over such a directory the adapter names every Device ID the
 * Rust stores hold, publishes `device_leave` for each so Core tombstones them,
 * and keeps the Rust files in `rust-adapter-archive/` for inspection.
 *
 * A directory is Rust-era only when matter.js storage (`matter/`) doesn't exist
 * yet and a Rust store does. Rust and matter.js share `names.json` and
 * `meter-observations.json` (same names, same shapes), but matter.js writes
 * them only for nodes on its own fabric, so without `matter/` they can only be
 * Rust's. Archiving them before matter.js starts means a fresh node, which
 * matter.js numbers from 1 again, never inherits an old ID's name or meter
 * envelope.
 *
 * Crash safety: the IDs are written to `pending-device-leaves.json` in the
 * archive before any file moves, and that file is deleted only once the
 * leaves are published. A start that finds it publishes them again; Core
 * ignores a leave for an ID it no longer has.
 */
import {
    existsSync,
    mkdirSync,
    readFileSync,
    renameSync,
    rmSync,
} from 'node:fs'
import { join } from 'node:path'
import type { Log } from '../log.ts'
import { isRecord, writeJsonAtomically } from './atomic-json.ts'
import { METER_IDENTITY_FILE } from './meter-identity-store.ts'
import { NAMES_FILE } from './names.ts'
import { rustFabricNodeIds } from './rust-fabric.ts'

export const RUST_ARCHIVE_DIR = 'rust-adapter-archive'
export const PENDING_LEAVES_FILE = 'pending-device-leaves.json'
/** Where matter.js keeps its fabric and nodes (`storage.path`). */
export const MATTERJS_STORAGE_DIR = 'matter'

/** The Rust adapter's files, by its config.rs names. */
export const RUST_FABRIC_FILE = 'controller-state.bin'
export const RUST_ADOPTED_FILE = 'adopted-nodes.json'
const RUST_FILES = [
    RUST_FABRIC_FILE,
    RUST_ADOPTED_FILE,
    NAMES_FILE,
    METER_IDENTITY_FILE,
] as const

export class RustAdapterArchive {
    private constructor(
        private readonly dataDir: string,
        readonly pendingDeviceIds: readonly string[],
        private readonly log?: Log
    ) {}

    /**
     * Archives a Rust-era data directory, if this is one, and loads the
     * Device IDs still to be announced as gone. Call before matter.js starts,
     * since starting creates its storage.
     */
    static prepare(dataDir: string, log?: Log): RustAdapterArchive {
        const archive = join(dataDir, RUST_ARCHIVE_DIR)
        const pending = new Set(readPending(archive, log))
        const present = RUST_FILES.filter((file) =>
            existsSync(join(dataDir, file))
        )
        const rustEra =
            !existsSync(join(dataDir, MATTERJS_STORAGE_DIR)) &&
            present.length > 0
        if (rustEra) {
            for (const file of present)
                for (const id of deviceIdsIn(join(dataDir, file), file, log))
                    pending.add(id)
            mkdirSync(archive, { recursive: true })
            writeJsonAtomically(join(archive, PENDING_LEAVES_FILE), {
                deviceIds: [...pending],
            })
            for (const file of present)
                renameSync(join(dataDir, file), freePath(archive, file))
            log?.info(
                `archived the Rust adapter's ${present.join(', ')} in ${RUST_ARCHIVE_DIR}; ${pending.size} old Device(s) leave the Home`
            )
        }
        return new RustAdapterArchive(dataDir, [...pending], log)
    }

    /** The leaves are published: forget them, so they go out once. */
    announced(): void {
        if (this.pendingDeviceIds.length === 0) return
        rmSync(join(this.dataDir, RUST_ARCHIVE_DIR, PENDING_LEAVES_FILE), {
            force: true,
        })
        this.log?.info(
            `announced ${this.pendingDeviceIds.length} Rust-era Device(s) as gone`
        )
    }
}

function readPending(archive: string, log?: Log): string[] {
    const path = join(archive, PENDING_LEAVES_FILE)
    if (!existsSync(path)) return []
    try {
        const raw: unknown = JSON.parse(readFileSync(path, 'utf8'))
        if (isRecord(raw) && Array.isArray(raw.deviceIds))
            return raw.deviceIds.filter(
                (id): id is string => typeof id === 'string'
            )
    } catch {}
    log?.warn(`malformed ${path}; ignoring it`)
    return []
}

/**
 * The Device IDs a Rust store names. A store that can't be read names none,
 * but it is still archived.
 */
function deviceIdsIn(path: string, file: string, log?: Log): string[] {
    try {
        if (file === RUST_FABRIC_FILE)
            return rustFabricNodeIds(readFileSync(path))
        const raw: unknown = JSON.parse(readFileSync(path, 'utf8'))
        if (!isRecord(raw)) throw new Error('not an object')
        if (file === RUST_ADOPTED_FILE)
            return Array.isArray(raw.node_ids)
                ? raw.node_ids
                      .filter((id) => Number.isSafeInteger(id))
                      .map(String)
                : []
        if (file === NAMES_FILE)
            // A strip outlet's name is keyed `{nodeId}#{endpoint}`; its
            // Device is `{nodeId}`.
            return isRecord(raw.names)
                ? Object.keys(raw.names).map((key) => key.split('#')[0] ?? key)
                : []
        return isRecord(raw.publications) ? Object.keys(raw.publications) : []
    } catch (error) {
        log?.warn(
            `could not read the Rust adapter's ${file}; archiving it anyway: ${String(error)}`
        )
        return []
    }
}

/** `dir/file`, or `dir/file.N` when an earlier archive already holds it. */
function freePath(dir: string, file: string): string {
    let path = join(dir, file)
    for (let n = 1; existsSync(path); n++) path = join(dir, `${file}.${n}`)
    return path
}
