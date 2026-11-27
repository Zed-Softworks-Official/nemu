/**
 * Store files under the data directory. Every write lands whole or not at all
 * (temporary file, fsync, rename, fsync of the directory). A copy of the data
 * directory taken at any moment, including while the adapter is paused for a
 * Home backup (ADR-0013), holds each store from before or after a change and
 * never half of one.
 */
import { mkdir, open, readFile, rename, rm } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import type { Log } from '../log.ts'

export async function writeAtomically(
    path: string,
    text: string
): Promise<void> {
    const dir = dirname(path)
    await mkdir(dir, { recursive: true })
    const temporary = join(dir, `.${basename(path)}.tmp`)
    try {
        const file = await open(temporary, 'w')
        try {
            await file.writeFile(text, 'utf8')
            await file.sync()
        } finally {
            await file.close()
        }
        await rename(temporary, path)
    } catch (error) {
        await rm(temporary, { force: true }).catch(() => {})
        throw error
    }
    await syncDirectory(dir)
}

/** Makes a rename durable. Not every platform can fsync a directory. */
async function syncDirectory(dir: string): Promise<void> {
    try {
        const handle = await open(dir, 'r')
        try {
            await handle.sync()
        } finally {
            await handle.close()
        }
    } catch {}
}

export interface Loaded<T> {
    value: T | undefined
    /**
     * False when the file exists but cannot be read or parsed. The store then
     * leaves it on disk untouched rather than overwrite what it cannot read, as
     * the Rust adapter's stores do.
     */
    writable: boolean
}

export async function loadJson<T>(
    path: string,
    label: string,
    parse: (value: unknown) => T | undefined,
    log: Log
): Promise<Loaded<T>> {
    let raw: string
    try {
        raw = await readFile(path, 'utf8')
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT')
            return { value: undefined, writable: true }
        log.warn(`cannot read the ${label} at ${path}; preserving it on disk`)
        return { value: undefined, writable: false }
    }
    let value: T | undefined
    try {
        value = parse(JSON.parse(raw))
    } catch {
        value = undefined
    }
    if (value === undefined) {
        log.warn(`the ${label} at ${path} is malformed; preserving it on disk`)
        return { value: undefined, writable: false }
    }
    return { value, writable: true }
}
