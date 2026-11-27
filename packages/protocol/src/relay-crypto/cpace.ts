// CPace (draft-irtf-cfrg-cpace-21) on ristretto255 with SHA-512, in the
// initiator-responder setting, plus Nemu's pairing binding (ADR-0037).
// Twin of Core's `relay_crypto::cpace`; see that module for the flow.

import { ristretto255, ristretto255_hasher } from '@noble/curves/ed25519.js'
import { hmac } from '@noble/hashes/hmac.js'
import { sha512 } from '@noble/hashes/sha2.js'
import { randomBytes } from '@noble/hashes/utils.js'

import {
    concatBytes,
    equalBytes,
    lvCat,
    lvSplit,
    prependLen,
    utf8Encode,
} from './bytes.ts'

const DSI = utf8Encode('CPaceRistretto255')
const DSI_ISK = utf8Encode('CPaceRistretto255_ISK')
const S_IN_BYTES = 128
const GROUP_ORDER = ristretto255.Point.Fn.ORDER

export const PAIRING_LABEL = utf8Encode('nemu-pairing-v1')
const ACCESS_CLIENT_AD_LABEL = utf8Encode('access-client')
const CONTROLLER_AD_LABEL = utf8Encode('controller')

export type CpaceErrorCode =
    | 'invalid_point'
    | 'invalid_associated_data'
    | 'confirmation_failed'

export class CpaceError extends Error {
    readonly code: CpaceErrorCode

    constructor(code: CpaceErrorCode) {
        super(code)
        this.name = 'CpaceError'
        this.code = code
    }
}

type RistrettoPoint = InstanceType<typeof ristretto255.Point>

/** RFC 9496 element derivation: 64 uniform bytes to a point. */
const deriveToCurve = ((): ((bytes: Uint8Array) => RistrettoPoint) => {
    const derive = ristretto255_hasher.deriveToCurve
    if (derive === undefined) {
        throw new Error('@noble/curves lacks ristretto255 element derivation')
    }
    return derive
})()

// ---------------------------------------------------------------------------
// Draft functions (section 7 and 8.3), exposed for the draft's test vectors.

export function generatorString(
    prs: Uint8Array,
    ci: Uint8Array,
    sid: Uint8Array
): Uint8Array {
    const zpad = Math.max(
        0,
        S_IN_BYTES - prependLen(prs).length - prependLen(DSI).length - 1
    )
    return lvCat(DSI, prs, new Uint8Array(zpad), ci, sid)
}

export function calculateGenerator(
    prs: Uint8Array,
    ci: Uint8Array,
    sid: Uint8Array
): RistrettoPoint {
    return deriveToCurve(sha512(generatorString(prs, ci, sid)))
}

/** Draft section 8.3 `sample_scalar`: bits above 252 cleared. */
export function sampleScalar(): Uint8Array {
    const bytes = randomBytes(32)
    bytes[31] = (bytes[31] ?? 0) & 0x0f
    return bytes
}

function scalarFromBytes(bytes: Uint8Array): bigint {
    let n = 0n
    for (let i = bytes.length - 1; i >= 0; i--) {
        n = (n << 8n) | BigInt(bytes[i] ?? 0)
    }
    return n % GROUP_ORDER
}

export function scalarMult(y: Uint8Array, g: RistrettoPoint): Uint8Array {
    return g.multiply(scalarFromBytes(y)).toBytes()
}

/** Returns `null` where the draft returns `G.I`. */
export function scalarMultVfy(y: Uint8Array, x: Uint8Array): Uint8Array | null {
    let point: RistrettoPoint
    try {
        point = ristretto255.Point.fromBytes(x)
    } catch {
        return null
    }
    if (point.is0()) return null
    const k = point.multiply(scalarFromBytes(y))
    if (k.is0()) return null
    return k.toBytes()
}

export function transcriptIr(
    ya: Uint8Array,
    adA: Uint8Array,
    yb: Uint8Array,
    adB: Uint8Array
): Uint8Array {
    return concatBytes(lvCat(ya, adA), lvCat(yb, adB))
}

export function iskIr(
    sid: Uint8Array,
    k: Uint8Array,
    ya: Uint8Array,
    adA: Uint8Array,
    yb: Uint8Array,
    adB: Uint8Array
): Uint8Array {
    return sha512(
        concatBytes(lvCat(DSI_ISK, sid, k), transcriptIr(ya, adA, yb, adB))
    )
}

export function sidOutputIr(
    ya: Uint8Array,
    adA: Uint8Array,
    yb: Uint8Array,
    adB: Uint8Array
): Uint8Array {
    return sha512(
        concatBytes(
            utf8Encode('CPaceSidOutput'),
            transcriptIr(ya, adA, yb, adB)
        )
    )
}

/** Draft section 10.4 key confirmation tag with HMAC-SHA-512. */
export function confirmationTag(
    sid: Uint8Array,
    isk: Uint8Array,
    y: Uint8Array,
    ad: Uint8Array
): Uint8Array {
    const macKey = sha512(concatBytes(utf8Encode('CPaceMac'), sid, isk))
    return hmac(sha512, macKey, lvCat(y, ad))
}

// ---------------------------------------------------------------------------
// Nemu pairing binding.

export type PairingContext = {
    /** The Pairing code, as the digits the Owner sees. */
    code: string
    controllerId: string
    /** A fresh per-attempt nonce, chosen by the Controller. */
    sid: Uint8Array
}

/** A party's long-term public keys, carried in the CPace associated data. */
export type PartyKeys = {
    /** Ed25519 public key. */
    signingKey: Uint8Array
    /** X25519 public key. */
    encryptionKey: Uint8Array
}

function generator(ctx: PairingContext): RistrettoPoint {
    return calculateGenerator(
        utf8Encode(ctx.code),
        lvCat(PAIRING_LABEL, utf8Encode(ctx.controllerId)),
        ctx.sid
    )
}

export function accessClientAssociatedData(keys: PartyKeys): Uint8Array {
    return lvCat(ACCESS_CLIENT_AD_LABEL, keys.signingKey, keys.encryptionKey)
}

export function controllerAssociatedData(keys: PartyKeys): Uint8Array {
    return lvCat(CONTROLLER_AD_LABEL, keys.signingKey, keys.encryptionKey)
}

function parseAssociatedData(label: Uint8Array, ad: Uint8Array): PartyKeys {
    const parts = lvSplit(ad)
    if (parts?.length !== 3) throw new CpaceError('invalid_associated_data')
    const [found, signingKey, encryptionKey] = parts as [
        Uint8Array,
        Uint8Array,
        Uint8Array,
    ]
    if (
        !equalBytes(found, label) ||
        signingKey.length !== 32 ||
        encryptionKey.length !== 32
    ) {
        throw new CpaceError('invalid_associated_data')
    }
    return {
        signingKey: signingKey.slice(),
        encryptionKey: encryptionKey.slice(),
    }
}

export type InitiatorMessage = { ya: Uint8Array; adA: Uint8Array }
export type ResponderMessage = {
    yb: Uint8Array
    adB: Uint8Array
    tagB: Uint8Array
}

export type InitiatorOutcome = {
    /** The Access Client's confirmation tag, sent to the Controller. */
    tagA: Uint8Array
    isk: Uint8Array
    /** The Controller keys to pin, authenticated by the Pairing code. */
    controllerKeys: PartyKeys
}

/** The Access Client's side of a pairing run. */
export class CpaceInitiator {
    readonly message: InitiatorMessage
    private readonly sid: Uint8Array
    private readonly scalar: Uint8Array

    /** `scalar` is for wire vectors only; omit it to sample one. */
    constructor(ctx: PairingContext, own: PartyKeys, scalar?: Uint8Array) {
        this.scalar = scalar ?? sampleScalar()
        this.sid = ctx.sid
        this.message = {
            ya: scalarMult(this.scalar, generator(ctx)),
            adA: accessClientAssociatedData(own),
        }
    }

    finish(reply: ResponderMessage): InitiatorOutcome {
        const controllerKeys = parseAssociatedData(
            CONTROLLER_AD_LABEL,
            reply.adB
        )
        const k = scalarMultVfy(this.scalar, reply.yb)
        if (k === null) throw new CpaceError('invalid_point')
        const { ya, adA } = this.message
        const isk = iskIr(this.sid, k, ya, adA, reply.yb, reply.adB)
        const expectedB = confirmationTag(this.sid, isk, reply.yb, reply.adB)
        if (!equalBytes(expectedB, reply.tagB)) {
            throw new CpaceError('confirmation_failed')
        }
        return {
            tagA: confirmationTag(this.sid, isk, ya, adA),
            isk,
            controllerKeys,
        }
    }
}

export type ResponderOutcome = {
    isk: Uint8Array
    /** The Access Client keys to bind into an Access grant. */
    accessClientKeys: PartyKeys
}

/** The Controller's side of a pairing run. */
export class CpaceResponder {
    readonly message: ResponderMessage
    private readonly expectedTagA: Uint8Array
    private readonly isk: Uint8Array
    private readonly accessClientKeys: PartyKeys

    /** `scalar` is for wire vectors only; omit it to sample one. */
    constructor(
        ctx: PairingContext,
        own: PartyKeys,
        msg: InitiatorMessage,
        scalar?: Uint8Array
    ) {
        this.accessClientKeys = parseAssociatedData(
            ACCESS_CLIENT_AD_LABEL,
            msg.adA
        )
        const y = scalar ?? sampleScalar()
        const yb = scalarMult(y, generator(ctx))
        const adB = controllerAssociatedData(own)
        const k = scalarMultVfy(y, msg.ya)
        if (k === null) throw new CpaceError('invalid_point')
        this.isk = iskIr(ctx.sid, k, msg.ya, msg.adA, yb, adB)
        this.expectedTagA = confirmationTag(ctx.sid, this.isk, msg.ya, msg.adA)
        this.message = {
            yb,
            adB,
            tagB: confirmationTag(ctx.sid, this.isk, yb, adB),
        }
    }

    confirm(tagA: Uint8Array): ResponderOutcome {
        if (!equalBytes(this.expectedTagA, tagA)) {
            throw new CpaceError('confirmation_failed')
        }
        return { isk: this.isk, accessClientKeys: this.accessClientKeys }
    }
}
