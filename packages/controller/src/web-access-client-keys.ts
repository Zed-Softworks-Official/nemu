import {
    b64urlEncode,
    type Ed25519Signer,
    ed25519PublicKey,
    ed25519Signer,
    x25519PublicKey,
} from '@nemu/protocol/relay-crypto'
import {
    type AccessClientKeyStore,
    type AccessClientKeys,
    parseEnrollment,
    randomSecret,
    serializeEnrollment,
} from './access-client-keys.ts'

/**
 * How a stored record holds its private keys.
 *
 * - `non-extractable`: Web Crypto `CryptoKey`s created with
 *   `extractable: false`. Page script can sign with them but can never read
 *   them (ADR-0001).
 * - `stored-bytes`: the browser has no Web Crypto Ed25519 or X25519 (older
 *   Safari and Firefox), so the key bytes are kept in IndexedDB and the crypto
 *   runs in JS. Script on the page could read them. This is the fallback, not
 *   the goal.
 */
export type WebKeyProtection = 'non-extractable' | 'stored-bytes'

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
    /** Defaults to `crypto.subtle`. */
    subtle?: SubtleCrypto
    /** Defaults to `navigator.storage`. */
    storage?: PersistentStorage | null
}

type PrivateKey = CryptoKey | Uint8Array

type StoredWebRecord = {
    version: 1
    protection: WebKeyProtection
    signingPrivateKey: PrivateKey
    encryptionPrivateKey: PrivateKey
    signingKey: Uint8Array
    encryptionKey: Uint8Array
    enrollment: ReturnType<typeof serializeEnrollment>
}

type GeneratedKeys = {
    protection: WebKeyProtection
    signingPrivateKey: PrivateKey
    encryptionPrivateKey: PrivateKey
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

function signerFor(subtle: SubtleCrypto, key: PrivateKey): Ed25519Signer {
    return key instanceof Uint8Array
        ? ed25519Signer(key)
        : webSigner(subtle, key)
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
        protection: 'non-extractable',
        signingPrivateKey: signing.privateKey,
        encryptionPrivateKey: encryption.privateKey,
        keys: {
            signingKey,
            encryptionKey,
            signer: webSigner(subtle, signing.privateKey),
        },
    }
}

function generateByteKeys(): GeneratedKeys {
    const signingSecret = randomSecret()
    const encryptionSecret = randomSecret()
    return {
        protection: 'stored-bytes',
        signingPrivateKey: signingSecret,
        encryptionPrivateKey: encryptionSecret,
        keys: {
            signingKey: ed25519PublicKey(signingSecret),
            encryptionKey: x25519PublicKey(encryptionSecret),
            signer: ed25519Signer(signingSecret),
        },
    }
}

function isPrivateKey(value: unknown): value is PrivateKey {
    if (value instanceof Uint8Array) return value.length === 32
    return (
        typeof CryptoKey !== 'undefined' &&
        value instanceof CryptoKey &&
        value.type === 'private'
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
 * Browsers without Web Crypto Ed25519 or X25519 fall back to keys made in JS
 * and kept as bytes (`stored-bytes`), which page script could read.
 */
export function createWebAccessClientKeyStore(
    options: WebAccessClientKeyStoreOptions = {}
): AccessClientKeyStore & {
    /** How the record for this Home holds its private keys, if any. */
    protection(controllerId: string): Promise<WebKeyProtection | null>
} {
    let database = options.database ?? null
    const db = () => {
        database ??= openIndexedDbKeyDatabase()
        return database
    }
    const subtle = options.subtle ?? globalThis.crypto?.subtle
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
        const v = value as Partial<StoredWebRecord>
        if (
            v.version !== 1 ||
            (v.protection !== 'non-extractable' &&
                v.protection !== 'stored-bytes') ||
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
        async generate() {
            let generated: GeneratedKeys
            try {
                if (!subtle) throw new Error('No Web Crypto')
                generated = await generateWebKeys(subtle)
            } catch {
                generated = generateByteKeys()
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
                        protection: stored.protection,
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
                protection: generated.protection,
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
            if (!(stored.signingPrivateKey instanceof Uint8Array) && !subtle) {
                return null
            }
            return {
                keys: {
                    signingKey: stored.signingKey,
                    encryptionKey: stored.encryptionKey,
                    signer: signerFor(
                        subtle as SubtleCrypto,
                        stored.signingPrivateKey
                    ),
                },
                enrollment,
            }
        },
        async clear(controllerId) {
            await db().delete(controllerId)
        },
        async protection(controllerId) {
            return (await readRecord(controllerId))?.protection ?? null
        },
    }
}
