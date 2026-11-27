import {
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
     * 1 until a signed refusal names a newer one (a Home restored onto a new
     * Controller instance). The signed Membership routing projection will
     * carry it instead (NEM-133).
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

function randomSecret(): Uint8Array {
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
