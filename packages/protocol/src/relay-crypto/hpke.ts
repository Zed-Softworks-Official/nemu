// HPKE base mode (RFC 9180) for one suite only:
// DHKEM(X25519, HKDF-SHA256), HKDF-SHA256, ChaCha20-Poly1305.
// Pure JS on @noble so it runs on Hermes; twin of Core's `relay_crypto::hpke`.

import { chacha20poly1305 } from '@noble/ciphers/chacha.js'
import { ed25519, x25519 } from '@noble/curves/ed25519.js'
import { bytesToNumberLE, numberToBytesLE } from '@noble/curves/utils.js'
import { expand } from '@noble/hashes/hkdf.js'
import { hmac } from '@noble/hashes/hmac.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { randomBytes } from '@noble/hashes/utils.js'

import { concatBytes, equalBytes, utf8Encode } from './bytes.ts'

const KEM_SUITE_ID = Uint8Array.of(0x4b, 0x45, 0x4d, 0x00, 0x20)
const HPKE_SUITE_ID = Uint8Array.of(
    0x48,
    0x50,
    0x4b,
    0x45,
    0x00,
    0x20,
    0x00,
    0x01,
    0x00,
    0x03
)
const VERSION_LABEL = utf8Encode('HPKE-v1')
const EMPTY = new Uint8Array(0)
const label = utf8Encode

export const NONCE_LENGTH = 12

export type HpkeErrorCode = 'invalid_public_key' | 'decrypt_failed'

export class HpkeError extends Error {
    readonly code: HpkeErrorCode

    constructor(code: HpkeErrorCode) {
        super(code)
        this.name = 'HpkeError'
        this.code = code
    }
}

function labeledExtract(
    suiteId: Uint8Array,
    salt: Uint8Array,
    name: string,
    ikm: Uint8Array
): Uint8Array {
    return hmac(
        sha256,
        salt,
        concatBytes(VERSION_LABEL, suiteId, label(name), ikm)
    )
}

function labeledExpand(
    suiteId: Uint8Array,
    prk: Uint8Array,
    name: string,
    info: Uint8Array,
    length: number
): Uint8Array {
    const labeledInfo = concatBytes(
        Uint8Array.of(length >> 8, length & 0xff),
        VERSION_LABEL,
        suiteId,
        label(name),
        info
    )
    return expand(sha256, prk, labeledInfo, length)
}

export function x25519PublicKey(secretKey: Uint8Array): Uint8Array {
    return x25519.getPublicKey(secretKey)
}

/**
 * An X25519 public key both sides bind: its Edwards form is a point not of
 * small order, so a shared secret with it is never predictable. Twin of
 * Core's `relay_crypto::session::acceptable_encryption_key`
 * (`MontgomeryPoint::to_edwards(0)` then `is_small_order`).
 */
export function acceptableEncryptionKey(key: Uint8Array): boolean {
    if (key.length !== 32) return false
    const Fp = ed25519.Point.Fp
    const masked = Uint8Array.from(key)
    masked[31] = (masked[31] ?? 0) & 0x7f
    const u = Fp.create(bytesToNumberLE(masked))
    if (u === Fp.neg(Fp.ONE)) return false
    const y = Fp.div(Fp.sub(u, Fp.ONE), Fp.add(u, Fp.ONE))
    try {
        const point = ed25519.Point.fromBytes(numberToBytesLE(y, 32), false)
        return !point.isSmallOrder()
    } catch {
        return false
    }
}

/** RFC 9180 section 7.1.3 `DeriveKeyPair` for X25519. */
export function deriveKeyPair(ikm: Uint8Array): {
    secretKey: Uint8Array
    publicKey: Uint8Array
} {
    const dkpPrk = labeledExtract(KEM_SUITE_ID, EMPTY, 'dkp_prk', ikm)
    const secretKey = labeledExpand(KEM_SUITE_ID, dkpPrk, 'sk', EMPTY, 32)
    return { secretKey, publicKey: x25519PublicKey(secretKey) }
}

function dh(secretKey: Uint8Array, publicKey: Uint8Array): Uint8Array {
    let shared: Uint8Array
    try {
        shared = x25519.getSharedSecret(secretKey, publicKey)
    } catch {
        throw new HpkeError('invalid_public_key')
    }
    if (equalBytes(shared, new Uint8Array(32))) {
        throw new HpkeError('invalid_public_key')
    }
    return shared
}

function extractAndExpand(dhValue: Uint8Array, kemContext: Uint8Array) {
    const eaePrk = labeledExtract(KEM_SUITE_ID, EMPTY, 'eae_prk', dhValue)
    return labeledExpand(KEM_SUITE_ID, eaePrk, 'shared_secret', kemContext, 32)
}

/** An HPKE encryption context (RFC 9180 section 5.2). */
export class HpkeContext {
    private readonly key: Uint8Array
    private readonly baseNonce: Uint8Array
    private readonly exporterSecret: Uint8Array
    private seq = 0

    constructor(sharedSecret: Uint8Array, info: Uint8Array) {
        const pskIdHash = labeledExtract(
            HPKE_SUITE_ID,
            EMPTY,
            'psk_id_hash',
            EMPTY
        )
        const infoHash = labeledExtract(HPKE_SUITE_ID, EMPTY, 'info_hash', info)
        const context = concatBytes(Uint8Array.of(0), pskIdHash, infoHash)
        const secret = labeledExtract(
            HPKE_SUITE_ID,
            sharedSecret,
            'secret',
            EMPTY
        )
        this.key = labeledExpand(HPKE_SUITE_ID, secret, 'key', context, 32)
        this.baseNonce = labeledExpand(
            HPKE_SUITE_ID,
            secret,
            'base_nonce',
            context,
            NONCE_LENGTH
        )
        this.exporterSecret = labeledExpand(
            HPKE_SUITE_ID,
            secret,
            'exp',
            context,
            32
        )
    }

    private nonce(): Uint8Array {
        const nonce = this.baseNonce.slice()
        let seq = this.seq
        for (let i = NONCE_LENGTH - 1; i >= NONCE_LENGTH - 8 && seq > 0; i--) {
            nonce[i] = (nonce[i] ?? 0) ^ (seq % 256)
            seq = Math.floor(seq / 256)
        }
        return nonce
    }

    seal(aad: Uint8Array, plaintext: Uint8Array): Uint8Array {
        const ciphertext = aeadSeal(this.key, this.nonce(), aad, plaintext)
        this.seq++
        return ciphertext
    }

    /** The sequence number only advances when the ciphertext opens. */
    open(aad: Uint8Array, ciphertext: Uint8Array): Uint8Array {
        const plaintext = aeadOpen(this.key, this.nonce(), aad, ciphertext)
        this.seq++
        return plaintext
    }

    /** RFC 9180 section 5.3 secret export. */
    export(exporterContext: Uint8Array, length: number): Uint8Array {
        return labeledExpand(
            HPKE_SUITE_ID,
            this.exporterSecret,
            'sec',
            exporterContext,
            length
        )
    }
}

/**
 * `SetupBaseS`. `ikmE` derives the ephemeral key and is for wire vectors
 * only; omit it to use a random one.
 */
export function setupBaseSender(
    recipientPublicKey: Uint8Array,
    info: Uint8Array,
    ikmE: Uint8Array = randomBytes(32)
): { enc: Uint8Array; context: HpkeContext } {
    const ephemeral = deriveKeyPair(ikmE)
    const dhValue = dh(ephemeral.secretKey, recipientPublicKey)
    const kemContext = concatBytes(ephemeral.publicKey, recipientPublicKey)
    return {
        enc: ephemeral.publicKey,
        context: new HpkeContext(extractAndExpand(dhValue, kemContext), info),
    }
}

/** `SetupBaseR`. */
export function setupBaseReceiver(
    enc: Uint8Array,
    recipientSecretKey: Uint8Array,
    info: Uint8Array
): HpkeContext {
    const dhValue = dh(recipientSecretKey, enc)
    const kemContext = concatBytes(enc, x25519PublicKey(recipientSecretKey))
    return new HpkeContext(extractAndExpand(dhValue, kemContext), info)
}

/** ChaCha20-Poly1305 with an explicit nonce, for exported keys. */
export function aeadSeal(
    key: Uint8Array,
    nonce: Uint8Array,
    aad: Uint8Array,
    plaintext: Uint8Array
): Uint8Array {
    return chacha20poly1305(key, nonce, aad).encrypt(plaintext)
}

export function aeadOpen(
    key: Uint8Array,
    nonce: Uint8Array,
    aad: Uint8Array,
    ciphertext: Uint8Array
): Uint8Array {
    try {
        return chacha20poly1305(key, nonce, aad).decrypt(ciphertext)
    } catch {
        throw new HpkeError('decrypt_failed')
    }
}
