import { ApiError } from '@nemu/protocol'
import {
    b64urlDecode,
    b64urlEncode,
    type Ed25519Signer,
    ed25519PublicKey,
    ed25519Signer,
    x25519PublicKey,
} from '@nemu/protocol/relay-crypto'

/**
 * An Access Client's own keys. Private keys never leave the store that made
 * them: a platform store may hold them as non-extractable Web Crypto keys or
 * in the operating system's key store, and exposes only the public halves
 * and a signer.
 */
export type AccessClientKeys = {
    /** Ed25519 public key. */
    signingKey: Uint8Array
    /** X25519 public key. */
    encryptionKey: Uint8Array
    signer: Ed25519Signer
}

/** What pairing with one Home gave this Access Client (ADR-0037). */
export type AccessClientEnrollment = {
    controllerId: string
    accessClientId: string
    membershipId: string
    /** The Controller-signed Access grant (EdDSA JWS). */
    grant: string
    /**
     * The Controller's keys, pinned from the CPace exchange. Clients never
     * take them from Convex.
     */
    controllerSigningKey: Uint8Array
    controllerEncryptionKey: Uint8Array
    /**
     * The Controller identity epoch this client addresses Relay requests to;
     * 1 until the signed Membership routing projection (NEM-133), or as a
     * backstop a signed `retired_epoch` refusal, names a newer one (a Home
     * restored onto a new Controller instance).
     */
    identityEpoch?: number
}

export type AccessClientRecord = {
    keys: AccessClientKeys
    enrollment: AccessClientEnrollment
}

/**
 * Per-Home Access Client key storage (ADR-0008: one Access Client per Home).
 * `packages/controller` takes it as a dependency; mobile and the dashboard
 * supply their own stores (NEM-130).
 */
export interface AccessClientKeyStore {
    /** New keys for one pairing run. Nothing is kept until `save`. */
    generate(): Promise<AccessClientKeys>
    /** Keeps keys from `generate` with what pairing gave them. */
    save(record: AccessClientRecord): Promise<void>
    load(controllerId: string): Promise<AccessClientRecord | null>
    clear(controllerId: string): Promise<void>
}

/** Error code when this Access Client holds no keys for the Home. */
export const NOT_PAIRED_ERROR_CODE = 'not_paired'

/**
 * The Controller's refusal of a bearer token (NEM-131). This client never
 * sends one; an alpha build that does must pair again at home.
 */
export const BEARER_TOKEN_RETIRED_ERROR_CODE = 'bearer_token_retired'

/**
 * Error codes meaning this Access Client must pair again at home: it holds no
 * keys for the Home, it presented a retired bearer token, or the Controller
 * no longer knows or has revoked it. Each one that drops keys reaches the
 * client only signed by the pinned Controller key and bound to a request or
 * nonce of this client's, so Convex or the network can't fake one. A bad
 * signature is never one: anyone in between can flip a byte.
 */
export const PAIR_AGAIN_ERROR_CODES = [
    NOT_PAIRED_ERROR_CODE,
    BEARER_TOKEN_RETIRED_ERROR_CODE,
    'unknown_access_client',
    'tombstoned_access_client',
    /** The Controller signed this Membership's routing projection as ended. */
    'membership_ended',
] as const

export type PairAgainReason = (typeof PAIR_AGAIN_ERROR_CODES)[number]

/**
 * True when the Controller refused this client's keys, so they are worth
 * nothing now. Holding no keys, or a refused bearer token, says nothing
 * about the keys.
 */
export function keysRefused(reason: PairAgainReason): boolean {
    return (
        reason !== NOT_PAIRED_ERROR_CODE &&
        reason !== BEARER_TOKEN_RETIRED_ERROR_CODE
    )
}

/** The pair-again reason an error carries, or null for any other error. */
export function pairAgainReason(error: unknown): PairAgainReason | null {
    if (!(error instanceof ApiError)) return null
    return PAIR_AGAIN_ERROR_CODES.find((code) => code === error.code) ?? null
}

export function randomSecret(): Uint8Array {
    return crypto.getRandomValues(new Uint8Array(32))
}

/** Keys from raw secrets. For stores that keep key bytes, and for tests. */
export function accessClientKeysFromSecrets(
    signingSecret: Uint8Array,
    encryptionSecret: Uint8Array
): AccessClientKeys {
    return {
        signingKey: ed25519PublicKey(signingSecret),
        encryptionKey: x25519PublicKey(encryptionSecret),
        signer: ed25519Signer(signingSecret),
    }
}

/** Keeps keys in memory only; they are gone when the process ends. */
export function createMemoryAccessClientKeyStore(): AccessClientKeyStore {
    const records = new Map<string, AccessClientRecord>()
    return {
        generate: async () =>
            accessClientKeysFromSecrets(randomSecret(), randomSecret()),
        save: async (record) => {
            records.set(record.enrollment.controllerId, record)
        },
        load: async (controllerId) => records.get(controllerId) ?? null,
        clear: async (controllerId) => {
            records.delete(controllerId)
        },
    }
}

/**
 * A key store for one pairing run. `generate` comes from the target store, so
 * the target keeps whatever private material it made; `save` only holds the
 * record until `commit`. Pairing that is cancelled, or fails after the
 * Controller answered, keeps nothing.
 */
export type StagedAccessClientKeyStore = {
    store: AccessClientKeyStore
    /** The record pairing saved, if any. */
    staged(): AccessClientRecord | null
    /** Saves the staged record to the target store. */
    commit(): Promise<AccessClientRecord>
}

export function stageAccessClientKeys(
    target: AccessClientKeyStore
): StagedAccessClientKeyStore {
    let staged: AccessClientRecord | null = null
    return {
        store: {
            generate: () => target.generate(),
            save: async (record) => {
                staged = record
            },
            load: async (controllerId) =>
                staged?.enrollment.controllerId === controllerId
                    ? staged
                    : null,
            clear: async (controllerId) => {
                if (staged?.enrollment.controllerId === controllerId) {
                    staged = null
                }
            },
        },
        staged: () => staged,
        async commit() {
            if (!staged) throw new Error('Pairing kept no Access Client keys')
            await target.save(staged)
            return staged
        },
    }
}

/** Serialized enrollment: byte fields as base64url. */
type StoredEnrollment = {
    controllerId: string
    accessClientId: string
    membershipId: string
    grant: string
    controllerSigningKey: string
    controllerEncryptionKey: string
    identityEpoch?: number
}

export function serializeEnrollment(
    enrollment: AccessClientEnrollment
): StoredEnrollment {
    const stored: StoredEnrollment = {
        controllerId: enrollment.controllerId,
        accessClientId: enrollment.accessClientId,
        membershipId: enrollment.membershipId,
        grant: enrollment.grant,
        controllerSigningKey: b64urlEncode(enrollment.controllerSigningKey),
        controllerEncryptionKey: b64urlEncode(
            enrollment.controllerEncryptionKey
        ),
    }
    if (enrollment.identityEpoch !== undefined) {
        stored.identityEpoch = enrollment.identityEpoch
    }
    return stored
}

function text(value: unknown): string | null {
    return typeof value === 'string' && value.length > 0 ? value : null
}

function key32(value: unknown): Uint8Array | null {
    if (typeof value !== 'string') return null
    const bytes = b64urlDecode(value)
    return bytes && bytes.length === 32 ? bytes : null
}

export function parseEnrollment(value: unknown): AccessClientEnrollment | null {
    if (typeof value !== 'object' || value === null) return null
    const v = value as Record<string, unknown>
    const controllerId = text(v.controllerId)
    const accessClientId = text(v.accessClientId)
    const membershipId = text(v.membershipId)
    const grant = text(v.grant)
    const controllerSigningKey = key32(v.controllerSigningKey)
    const controllerEncryptionKey = key32(v.controllerEncryptionKey)
    if (
        !controllerId ||
        !accessClientId ||
        !membershipId ||
        !grant ||
        !controllerSigningKey ||
        !controllerEncryptionKey
    ) {
        return null
    }
    const enrollment: AccessClientEnrollment = {
        controllerId,
        accessClientId,
        membershipId,
        grant,
        controllerSigningKey,
        controllerEncryptionKey,
    }
    if (
        typeof v.identityEpoch === 'number' &&
        Number.isSafeInteger(v.identityEpoch) &&
        v.identityEpoch > 0
    ) {
        enrollment.identityEpoch = v.identityEpoch
    }
    return enrollment
}

/**
 * A secret key-value store the platform provides, such as the operating
 * system's key store. Each Account gets its own; keys here are Controller IDs.
 */
export type AccessClientSecretStorage = {
    get(controllerId: string): Promise<string | null> | string | null
    set(controllerId: string, value: string): Promise<void> | void
    delete(controllerId: string): Promise<void> | void
}

const SECRET_RECORD_VERSION = 1

/**
 * Keeps key bytes and the enrollment as one JSON value per Home, for stores
 * that can only hold bytes (mobile: the Keychain or Keystore through
 * expo-secure-store). The crypto runs in JS. Anything that is not a
 * complete record, such as a bearer-token credential from before Access
 * Client keys, loads as unpaired.
 */
export function createSecretAccessClientKeyStore(
    storage: AccessClientSecretStorage
): AccessClientKeyStore {
    // Secrets of generated keys, until pairing saves them.
    const pending = new Map<
        string,
        { signingSecret: Uint8Array; encryptionSecret: Uint8Array }
    >()
    return {
        async generate() {
            const signingSecret = randomSecret()
            const encryptionSecret = randomSecret()
            const keys = accessClientKeysFromSecrets(
                signingSecret,
                encryptionSecret
            )
            pending.set(b64urlEncode(keys.signingKey), {
                signingSecret,
                encryptionSecret,
            })
            return keys
        },
        async save(record) {
            const secrets = pending.get(b64urlEncode(record.keys.signingKey))
            if (!secrets) {
                throw new Error(
                    'These Access Client keys were not generated by this store'
                )
            }
            await storage.set(
                record.enrollment.controllerId,
                JSON.stringify({
                    version: SECRET_RECORD_VERSION,
                    signingSecret: b64urlEncode(secrets.signingSecret),
                    encryptionSecret: b64urlEncode(secrets.encryptionSecret),
                    enrollment: serializeEnrollment(record.enrollment),
                })
            )
        },
        async load(controllerId) {
            const raw = await storage.get(controllerId)
            if (!raw) return null
            let value: unknown
            try {
                value = JSON.parse(raw)
            } catch {
                return null
            }
            if (typeof value !== 'object' || value === null) return null
            const v = value as Record<string, unknown>
            if (v.version !== SECRET_RECORD_VERSION) return null
            const signingSecret = key32(v.signingSecret)
            const encryptionSecret = key32(v.encryptionSecret)
            const enrollment = parseEnrollment(v.enrollment)
            if (
                !signingSecret ||
                !encryptionSecret ||
                !enrollment ||
                enrollment.controllerId !== controllerId
            ) {
                return null
            }
            const keys = accessClientKeysFromSecrets(
                signingSecret,
                encryptionSecret
            )
            // Keep identity epoch updates working after a reload.
            pending.set(b64urlEncode(keys.signingKey), {
                signingSecret,
                encryptionSecret,
            })
            return { keys, enrollment }
        },
        async clear(controllerId) {
            await storage.delete(controllerId)
        },
    }
}
