import { ApiError } from '@nemu/protocol'
import { b64urlEncode, type Ed25519Signer } from '@nemu/protocol/relay-crypto'
import {
    type AccessClientKeyStore,
    type AccessClientKeys,
    parseEnrollment,
    serializeEnrollment,
} from './access-client-keys.ts'

/**
 * Error code when this browser has no Web Crypto Ed25519 or X25519, so it
 * cannot hold non-extractable Access Client keys and must not pair (ADR-0001).
 */
export const UNSUPPORTED_BROWSER_ERROR_CODE = 'unsupported_browser'

/** The slice of IndexedDB the store uses: one object store, keyed by Home. */
export type AccessClientKeyDatabase = {
    get(controllerId: string): Promise<unknown>
    put(controllerId: string, value: unknown): Promise<void>
    delete(controllerId: string): Promise<void>
}

/** The slice of `navigator.storage` the store uses. */
export type PersistentStorage = {
    persist?(): Promise<boolean>
}

export type WebAccessClientKeyStoreOptions = {
    /** Defaults to IndexedDB database `nemu-access-clients`. */
    database?: AccessClientKeyDatabase
    /** Defaults to `crypto.subtle`; `null` means the browser has none. */
    subtle?: SubtleCrypto | null
    /** Defaults to `navigator.storage`. */
    storage?: PersistentStorage | null
}

type StoredWebRecord = {
    version: 1
    /** Always `non-extractable`. Older builds also wrote `stored-bytes`. */
    protection: 'non-extractable'
    signingPrivateKey: CryptoKey
    encryptionPrivateKey: CryptoKey
    signingKey: Uint8Array
    encryptionKey: Uint8Array
    enrollment: ReturnType<typeof serializeEnrollment>
}

type GeneratedKeys = {
    signingPrivateKey: CryptoKey
    encryptionPrivateKey: CryptoKey
    keys: AccessClientKeys
}

const DATABASE_NAME = 'nemu-access-clients'
const OBJECT_STORE = 'records'

function request<T>(req: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
    })
}

/** IndexedDB, opened on first use so server rendering never touches it. */
export function openIndexedDbKeyDatabase(
    name = DATABASE_NAME
): AccessClientKeyDatabase {
    let opened: Promise<IDBDatabase> | null = null
    const db = () => {
        opened ??= new Promise<IDBDatabase>((resolve, reject) => {
            const open = indexedDB.open(name, 1)
            open.onupgradeneeded = () => {
                open.result.createObjectStore(OBJECT_STORE)
            }
            open.onsuccess = () => resolve(open.result)
            open.onerror = () => {
                opened = null
                reject(open.error)
            }
        })
        return opened
    }
    const run = async <T>(
        mode: IDBTransactionMode,
        work: (store: IDBObjectStore) => IDBRequest<T>
    ): Promise<T> => {
        const tx = (await db()).transaction(OBJECT_STORE, mode)
        const result = await request(work(tx.objectStore(OBJECT_STORE)))
        await new Promise<void>((resolve, reject) => {
            tx.oncomplete = () => resolve()
            tx.onerror = () => reject(tx.error)
            tx.onabort = () => reject(tx.error)
        })
        return result
    }
    return {
        get: (controllerId) =>
            run('readonly', (store) => store.get(controllerId)),
        put: async (controllerId, value) => {
            await run('readwrite', (store) => store.put(value, controllerId))
        },
        delete: async (controllerId) => {
            await run('readwrite', (store) => store.delete(controllerId))
        },
    }
}

function webSigner(subtle: SubtleCrypto, key: CryptoKey): Ed25519Signer {
    return {
        sign: async (message) =>
            new Uint8Array(
                await subtle.sign(
                    { name: 'Ed25519' },
                    key,
                    message as Uint8Array<ArrayBuffer>
                )
            ),
    }
}

async function generateWebKeys(subtle: SubtleCrypto): Promise<GeneratedKeys> {
    const signing = (await subtle.generateKey({ name: 'Ed25519' }, false, [
        'sign',
        'verify',
    ])) as CryptoKeyPair
    const encryption = (await subtle.generateKey({ name: 'X25519' }, false, [
        'deriveBits',
    ])) as CryptoKeyPair
    const signingKey = new Uint8Array(
        await subtle.exportKey('raw', signing.publicKey)
    )
    const encryptionKey = new Uint8Array(
        await subtle.exportKey('raw', encryption.publicKey)
    )
    return {
        signingPrivateKey: signing.privateKey,
        encryptionPrivateKey: encryption.privateKey,
        keys: {
            signingKey,
            encryptionKey,
            signer: webSigner(subtle, signing.privateKey),
        },
    }
}

function isPrivateKey(value: unknown): value is CryptoKey {
    return (
        typeof CryptoKey !== 'undefined' &&
        value instanceof CryptoKey &&
        value.type === 'private'
    )
}

function unsupportedBrowser(): ApiError {
    return new ApiError(
        UNSUPPORTED_BROWSER_ERROR_CODE,
        'This browser has no Web Crypto Ed25519 or X25519, so it cannot pair.'
    )
}

function isKey32(value: unknown): value is Uint8Array {
    return value instanceof Uint8Array && value.length === 32
}

/**
 * The dashboard's Access Client key store. Keys are non-extractable Web
 * Crypto keys kept in IndexedDB, which stores `CryptoKey` objects without
 * exposing their bytes. Saving asks the browser for persistent storage so it
 * does not evict them; if they are lost anyway, the browser pairs again.
 *
 * Browsers without Web Crypto Ed25519 or X25519 cannot pair: `generate`
 * throws `unsupported_browser`, and `supported()` says so up front. A record
 * from older builds that kept key bytes (`stored-bytes`) loads as unpaired and
 * is deleted.
 */
export function createWebAccessClientKeyStore(
    options: WebAccessClientKeyStoreOptions = {}
): AccessClientKeyStore & {
    /** Whether this browser can make non-extractable Ed25519 and X25519 keys. */
    supported(): Promise<boolean>
} {
    let database = options.database ?? null
    const db = () => {
        database ??= openIndexedDbKeyDatabase()
        return database
    }
    const subtle =
        options.subtle !== undefined
            ? options.subtle
            : (globalThis.crypto?.subtle ?? null)
    const storage =
        options.storage !== undefined
            ? options.storage
            : ((
                  globalThis as {
                      navigator?: { storage?: PersistentStorage }
                  }
              ).navigator?.storage ?? null)
    const pending = new Map<string, GeneratedKeys>()
    let askedToPersist = false
    let support: Promise<boolean> | null = null

    const persist = async () => {
        if (askedToPersist) return
        askedToPersist = true
        try {
            await storage?.persist?.()
        } catch {
            // Best effort: without it the browser may evict the keys.
        }
    }

    const readRecord = async (
        controllerId: string
    ): Promise<StoredWebRecord | null> => {
        const value = await db().get(controllerId)
        if (typeof value !== 'object' || value === null) return null
        const v = value as Partial<Record<keyof StoredWebRecord, unknown>>
        if (v.protection === 'stored-bytes') {
            // Keys page script could read: never use them, pair again.
            await db().delete(controllerId)
            return null
        }
        if (
            v.version !== 1 ||
            v.protection !== 'non-extractable' ||
            !isPrivateKey(v.signingPrivateKey) ||
            !isPrivateKey(v.encryptionPrivateKey) ||
            !isKey32(v.signingKey) ||
            !isKey32(v.encryptionKey)
        ) {
            return null
        }
        return v as StoredWebRecord
    }

    return {
        supported() {
            support ??= (async () => {
                if (!subtle) return false
                try {
                    await generateWebKeys(subtle)
                    return true
                } catch {
                    return false
                }
            })()
            return support
        },
        async generate() {
            if (!subtle) throw unsupportedBrowser()
            let generated: GeneratedKeys
            try {
                generated = await generateWebKeys(subtle)
            } catch {
                throw unsupportedBrowser()
            }
            pending.set(b64urlEncode(generated.keys.signingKey), generated)
            return generated.keys
        },
        async save(record) {
            const id = b64urlEncode(record.keys.signingKey)
            let generated = pending.get(id)
            if (!generated) {
                // Keys loaded earlier, saved again with a new enrollment.
                const stored = await readRecord(record.enrollment.controllerId)
                if (stored && b64urlEncode(stored.signingKey) === id) {
                    generated = {
                        signingPrivateKey: stored.signingPrivateKey,
                        encryptionPrivateKey: stored.encryptionPrivateKey,
                        keys: record.keys,
                    }
                }
            }
            if (!generated) {
                throw new Error(
                    'These Access Client keys were not generated by this store'
                )
            }
            const stored: StoredWebRecord = {
                version: 1,
                protection: 'non-extractable',
                signingPrivateKey: generated.signingPrivateKey,
                encryptionPrivateKey: generated.encryptionPrivateKey,
                signingKey: record.keys.signingKey,
                encryptionKey: record.keys.encryptionKey,
                enrollment: serializeEnrollment(record.enrollment),
            }
            await db().put(record.enrollment.controllerId, stored)
            pending.delete(id)
            await persist()
        },
        async load(controllerId) {
            const stored = await readRecord(controllerId)
            if (!stored) return null
            const enrollment = parseEnrollment(stored.enrollment)
            if (!enrollment || enrollment.controllerId !== controllerId) {
                return null
            }
            if (!subtle) return null
            return {
                keys: {
                    signingKey: stored.signingKey,
                    encryptionKey: stored.encryptionKey,
                    signer: webSigner(subtle, stored.signingPrivateKey),
                },
                enrollment,
            }
        },
        async clear(controllerId) {
            await db().delete(controllerId)
        },
    }
}
