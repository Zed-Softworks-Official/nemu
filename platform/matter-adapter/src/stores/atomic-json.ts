/**
 * A small JSON file under the data dir, read once at start and replaced
 * atomically on every write: the new body goes to a hidden temp file beside it,
 * is synced, then renamed over the old one. A crash mid-write leaves the old
 * file whole. Home backup copies the data dir, so these files travel with it.
 *
 * Ported from the Rust adapter's `store.rs`. A file that exists but cannot be
 * read or parsed is left on disk untouched, and the store runs in memory for
 * the rest of the process, so a bad file is never overwritten with defaults.
 */
import {
    closeSync,
    fsyncSync,
    mkdirSync,
    openSync,
    readFileSync,
    renameSync,
    rmSync,
    writeSync,
} from 'node:fs'
import { basename, dirname, join } from 'node:path'
import type { Log } from '../log.ts'

export interface Loaded<T> {
    value: T
    /** False when the file on disk is unreadable and must be preserved. */
    writable: boolean
}

/**
 * Reads `path`. A missing file gives `fallback()`. `parse` returns undefined
 * for a body it does not accept, which counts as unreadable.
 */
export function loadJsonFile<T>(
    path: string,
    parse: (raw: unknown) => T | undefined,
    fallback: () => T,
    log?: Log
): Loaded<T> {
    let text: string
    try {
        text = readFileSync(path, 'utf8')
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT')
            return { value: fallback(), writable: true }
        log?.warn(
            `failed to read ${path}; preserving it on disk: ${String(error)}`
        )
        return { value: fallback(), writable: false }
    }
    let parsed: T | undefined
    try {
        parsed = parse(JSON.parse(text))
    } catch {
        parsed = undefined
    }
    if (parsed === undefined) {
        log?.warn(`malformed ${path}; preserving it on disk`)
        return { value: fallback(), writable: false }
    }
    return { value: parsed, writable: true }
}

/** Writes `value` as JSON to `path`, atomically. Creates the folder. */
export function writeJsonAtomically(path: string, value: unknown): void {
    mkdirSync(dirname(path), { recursive: true })
    const tmp = join(dirname(path), `.${basename(path)}.tmp`)
    try {
        const fd = openSync(tmp, 'w')
        try {
            writeSync(fd, `${JSON.stringify(value, null, 2)}\n`)
            fsyncSync(fd)
        } finally {
            closeSync(fd)
        }
        renameSync(tmp, path)
    } catch (error) {
        rmSync(tmp, { force: true })
        throw error
    }
}

/** A plain JSON object (not an array or null). */
export function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
}
