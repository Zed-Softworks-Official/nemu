import {
    ApiError,
    BEARER_TOKEN_RETIRED_ERROR_CODE,
    keysRefused,
    NOT_PAIRED_ERROR_CODE,
    PAIR_AGAIN_ERROR_CODES,
    type PairAgainReason,
    pairAgainReasonSchema,
} from '@nemu/protocol'
import {
    acceptableEncryptionKey,
    acceptableSigningKey,
    b64urlDecode,
    b64urlEncode,
    type Ed25519Signer,
    ed25519PublicKey,
    ed25519Signer,
    x25519PublicKey,
} from '@nemu/protocol/relay-crypto'
import { z } from 'zod'

export {
    BEARER_TOKEN_RETIRED_ERROR_CODE,
    keysRefused,
    NOT_PAIRED_ERROR_CODE,
    PAIR_AGAIN_ERROR_CODES,
    type PairAgainReason,
}

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

// The pair-again reasons (`PAIR_AGAIN_ERROR_CODES`) live in @nemu/protocol.
// Each one that drops keys reaches the client only signed by the pinned
// Controller key and bound to a request or nonce of this client's, so
// Convex or the network can't fake one. A bad signature is never one:
// anyone in between can flip a byte.

/**
 * A refusal this client verified came from the Controller it paired with:
 * a Relay reply that opened under this request's keys and the pinned
 * Controller key, a signed Local session refusal over this client's nonce,
 * or a verified Membership routing projection. Only one of these may make
 * the client drop its keys; the same code in anything unverified (a plain
 * HTTP error, which anyone on the network can send) changes nothing.
 */
export class SignedRefusal extends ApiError {
    constructor(
        code: string,
        message: string,
        status?: number,
        details?: unknown
    ) {
        super(code, message, status, details)
        this.name = 'SignedRefusal'
    }
}

/**
 * The pair-again reason an error carries, or null for any other error. A
 * reason that drops keys counts only from a `SignedRefusal`.
 */
export function pairAgainReason(error: unknown): PairAgainReason | null {
    if (!(error instanceof ApiError)) return null
    const parsed = pairAgainReasonSchema.safeParse(error.code)
    if (!parsed.success) return null
    const reason = parsed.data
    if (keysRefused(reason) && !(error instanceof SignedRefusal)) return null
    return reason
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

/** 32 bytes, as base64url text. */
export const b64urlKey32Schema = z.string().transform((text, ctx) => {
    const bytes = b64urlDecode(text)
    if (bytes?.length === 32) return bytes
    ctx.addIssue({ code: 'custom', message: 'Expected 32 bytes' })
    return z.NEVER
})

/** 32 raw bytes. */
export const bytes32Schema = z.custom<Uint8Array>(
    (value) => value instanceof Uint8Array && value.length === 32
)

const storedEnrollmentSchema = z.object({
    controllerId: z.string().min(1),
    accessClientId: z.string().min(1),
    membershipId: z.string().min(1),
    grant: z.string().min(1),
    // Only keys pairing would have pinned (see `pairWithController`).
    controllerSigningKey: b64urlKey32Schema.refine(acceptableSigningKey),
    controllerEncryptionKey: b64urlKey32Schema.refine(acceptableEncryptionKey),
    // A bad epoch is dropped, not the enrollment: 1 is the safe default.
    identityEpoch: z
        .number()
        .int()
        .positive()
        .max(Number.MAX_SAFE_INTEGER)
        .optional()
        .catch(undefined),
})

export function parseEnrollment(value: unknown): AccessClientEnrollment | null {
    const parsed = storedEnrollmentSchema.safeParse(value)
    if (!parsed.success) return null
    const { identityEpoch, ...enrollment } = parsed.data
    return identityEpoch === undefined
        ? enrollment
        : { ...enrollment, identityEpoch }
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

const secretRecordSchema = z.object({
    version: z.literal(SECRET_RECORD_VERSION),
    signingSecret: b64urlKey32Schema,
    encryptionSecret: b64urlKey32Schema,
    enrollment: z.unknown(),
})

/**
 * Keeps key bytes and the enrollment as one JSON value per Home, for stores
 * that can only hold bytes (mobile: the Keychain or Keystore through
 * expo-secure-store). The crypto runs in JS. Anything that is not a
 * complete record, such as a bearer-token credential from before Access
 * Client keys, loads as not paired.
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
            const record = secretRecordSchema.safeParse(value)
            if (!record.success) return null
            const { signingSecret, encryptionSecret } = record.data
            const enrollment = parseEnrollment(record.data.enrollment)
            if (!enrollment || enrollment.controllerId !== controllerId) {
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
