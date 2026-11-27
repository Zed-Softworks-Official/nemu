// Sealed Relay requests, responses and pushes. Twin of Core's
// `relay_crypto::envelope`; see that module for the construction.

import { z } from 'zod'

import {
    b64urlDecode,
    b64urlDecodeLength,
    b64urlEncode,
    lvCat,
    u64be,
    utf8Encode,
} from './bytes.ts'
import {
    aeadOpen,
    aeadSeal,
    type HpkeContext,
    HpkeError,
    NONCE_LENGTH,
    setupBaseReceiver,
    setupBaseSender,
} from './hpke.ts'
import { acceptCounter, type ReplayWindow } from './replay.ts'
import { type Ed25519Signer, ed25519Verify } from './signing.ts'

export const HPKE_INFO = utf8Encode('nemu-relay-v1')
const REQUEST_LABEL = utf8Encode('nemu-relay-request-v1')
const RESPONSE_LABEL = utf8Encode('nemu-relay-response-v1')
const PUSH_LABEL = utf8Encode('nemu-relay-push-v1')
const RESPONSE_KEY_LABEL = utf8Encode('nemu-relay-response-key')
const PUSH_KEY_LABEL = utf8Encode('nemu-relay-push-key')

/** Allowed clock skew past `expiresAt`. */
export const CLOCK_SKEW_MS = 60_000
const MAX_ID_BYTES = 256

export type RelayRejection =
    | 'malformed'
    | 'wrong_controller'
    | 'retired_epoch'
    | 'expired'
    | 'unknown_access_client'
    | 'tombstoned_access_client'
    | 'bad_signature'
    | 'replayed'
    | 'outside_window'
    | 'mismatched_header'
    | 'decrypt_failed'

export class RelayCryptoError extends Error {
    readonly code: RelayRejection

    constructor(code: RelayRejection) {
        super(code)
        this.name = 'RelayCryptoError'
        this.code = code
    }
}

const id = z
    .string()
    .min(1)
    .refine((value) => utf8Encode(value).length <= MAX_ID_BYTES)
const safeUint = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)
const counter = safeUint.min(1)
const b64url = z.string()

export const requestHeaderSchema = z.strictObject({
    controllerId: id,
    identityEpoch: safeUint,
    accessClientId: id,
    requestId: id,
    counter,
    /** Milliseconds since the Unix epoch. */
    expiresAt: safeUint,
})
export type RequestHeader = z.infer<typeof requestHeaderSchema>

export const responseHeaderSchema = z.strictObject({
    controllerId: id,
    identityEpoch: safeUint,
    accessClientId: id,
    requestId: id,
})
export type ResponseHeader = z.infer<typeof responseHeaderSchema>

export const pushHeaderSchema = z.strictObject({
    controllerId: id,
    identityEpoch: safeUint,
    accessClientId: id,
    /** The request that registered the watch. */
    requestId: id,
    counter,
})
export type PushHeader = z.infer<typeof pushHeaderSchema>

export const sealedRequestSchema = z.strictObject({
    header: requestHeaderSchema,
    enc: b64url,
    ciphertext: b64url,
    signature: b64url,
})
export type SealedRequest = z.infer<typeof sealedRequestSchema>

export const sealedResponseSchema = z.strictObject({
    header: responseHeaderSchema,
    ciphertext: b64url,
    signature: b64url,
})
export type SealedResponse = z.infer<typeof sealedResponseSchema>

export const sealedPushSchema = z.strictObject({
    header: pushHeaderSchema,
    ciphertext: b64url,
    signature: b64url,
})
export type SealedPush = z.infer<typeof sealedPushSchema>

export function encodeRequestHeader(header: RequestHeader): Uint8Array {
    return lvCat(
        REQUEST_LABEL,
        utf8Encode(header.controllerId),
        u64be(header.identityEpoch),
        utf8Encode(header.accessClientId),
        utf8Encode(header.requestId),
        u64be(header.counter),
        u64be(header.expiresAt)
    )
}

export function encodeResponseHeader(header: ResponseHeader): Uint8Array {
    return lvCat(
        RESPONSE_LABEL,
        utf8Encode(header.controllerId),
        u64be(header.identityEpoch),
        utf8Encode(header.accessClientId),
        utf8Encode(header.requestId)
    )
}

export function encodePushHeader(header: PushHeader): Uint8Array {
    return lvCat(
        PUSH_LABEL,
        utf8Encode(header.controllerId),
        u64be(header.identityEpoch),
        utf8Encode(header.accessClientId),
        utf8Encode(header.requestId),
        u64be(header.counter)
    )
}

export function responseHeaderFor(request: RequestHeader): ResponseHeader {
    return {
        controllerId: request.controllerId,
        identityEpoch: request.identityEpoch,
        accessClientId: request.accessClientId,
        requestId: request.requestId,
    }
}

export function pushHeaderFor(
    watch: RequestHeader,
    pushCounter: number
): PushHeader {
    return { ...responseHeaderFor(watch), counter: pushCounter }
}

function sameResponseHeader(a: ResponseHeader, b: ResponseHeader): boolean {
    return (
        a.controllerId === b.controllerId &&
        a.identityEpoch === b.identityEpoch &&
        a.accessClientId === b.accessClientId &&
        a.requestId === b.requestId
    )
}

/**
 * Keys exported from a request's HPKE context. The Access Client holds them
 * from sealing, the Controller from opening.
 */
export type RequestKeys = {
    responseKey: Uint8Array
    pushKey: Uint8Array
}

function exportKeys(context: HpkeContext): RequestKeys {
    return {
        responseKey: context.export(RESPONSE_KEY_LABEL, 32),
        pushKey: context.export(PUSH_KEY_LABEL, 32),
    }
}

function counterNonce(value: number): Uint8Array {
    const nonce = new Uint8Array(NONCE_LENGTH)
    nonce.set(u64be(value), NONCE_LENGTH - 8)
    return nonce
}

function verifyOrThrow(
    signingKey: Uint8Array,
    message: Uint8Array,
    signatureText: string
): void {
    const signature = b64urlDecodeLength(signatureText, 64)
    if (signature === null) throw new RelayCryptoError('malformed')
    if (!ed25519Verify(signingKey, message, signature)) {
        throw new RelayCryptoError('bad_signature')
    }
}

function decodeOrThrow(text: string): Uint8Array {
    const bytes = b64urlDecode(text)
    if (bytes === null) throw new RelayCryptoError('malformed')
    return bytes
}

function openOrThrow(
    key: Uint8Array,
    nonce: Uint8Array,
    aad: Uint8Array,
    ciphertext: Uint8Array
): Uint8Array {
    try {
        return aeadOpen(key, nonce, aad, ciphertext)
    } catch {
        throw new RelayCryptoError('decrypt_failed')
    }
}

// ---------------------------------------------------------------------------
// Requests

export type SealRequestInput = {
    header: RequestHeader
    plaintext: Uint8Array
    /** The Controller's X25519 key, pinned at pairing. */
    controllerEncryptionKey: Uint8Array
    accessClientSigner: Ed25519Signer
    /** Derives the HPKE ephemeral key; wire vectors only. */
    ikmE?: Uint8Array
}

export async function sealRequest(
    input: SealRequestInput
): Promise<{ sealed: SealedRequest; keys: RequestKeys }> {
    const header = requestHeaderSchema.safeParse(input.header)
    if (!header.success) throw new RelayCryptoError('malformed')
    const aad = encodeRequestHeader(header.data)
    let sender: ReturnType<typeof setupBaseSender>
    try {
        sender = setupBaseSender(
            input.controllerEncryptionKey,
            HPKE_INFO,
            input.ikmE
        )
    } catch (error) {
        if (error instanceof HpkeError) throw new RelayCryptoError('malformed')
        throw error
    }
    const ciphertext = sender.context.seal(aad, input.plaintext)
    const signature = await input.accessClientSigner.sign(
        lvCat(aad, sender.enc, ciphertext)
    )
    return {
        sealed: {
            header: header.data,
            enc: b64urlEncode(sender.enc),
            ciphertext: b64urlEncode(ciphertext),
            signature: b64urlEncode(signature),
        },
        keys: exportKeys(sender.context),
    }
}

/** What the Controller knows about an Access Client. */
export type AccessClientStatus =
    | { status: 'active'; signingKey: Uint8Array }
    | { status: 'tombstoned' }
    | { status: 'unknown' }

export type RequestPolicy = {
    controllerId: string
    identityEpoch: number
    nowMs: number
}

export type OpenedRequest = {
    header: RequestHeader
    plaintext: Uint8Array
    keys: RequestKeys
    /** The Access Client's window with this counter accepted. */
    window: ReplayWindow
}

/**
 * Opens a request as the Controller. Checks run in the spec's order and all
 * before decryption: wrong Home, retired identity epoch, expiry, unknown or
 * tombstoned Access Client, signature, replayed counter.
 */
export function openRequest(input: {
    sealed: SealedRequest
    controllerEncryptionSecret: Uint8Array
    policy: RequestPolicy
    lookup: (accessClientId: string) => AccessClientStatus
    window: ReplayWindow
}): OpenedRequest {
    const parsed = sealedRequestSchema.safeParse(input.sealed)
    if (!parsed.success) throw new RelayCryptoError('malformed')
    const { header } = parsed.data
    const enc = b64urlDecodeLength(parsed.data.enc, 32)
    if (enc === null) throw new RelayCryptoError('malformed')
    const ciphertext = decodeOrThrow(parsed.data.ciphertext)
    const { policy } = input
    if (header.controllerId !== policy.controllerId) {
        throw new RelayCryptoError('wrong_controller')
    }
    if (header.identityEpoch !== policy.identityEpoch) {
        throw new RelayCryptoError('retired_epoch')
    }
    if (policy.nowMs > header.expiresAt + CLOCK_SKEW_MS) {
        throw new RelayCryptoError('expired')
    }
    const client = input.lookup(header.accessClientId)
    if (client.status === 'tombstoned') {
        throw new RelayCryptoError('tombstoned_access_client')
    }
    if (client.status === 'unknown') {
        throw new RelayCryptoError('unknown_access_client')
    }
    const aad = encodeRequestHeader(header)
    verifyOrThrow(
        client.signingKey,
        lvCat(aad, enc, ciphertext),
        parsed.data.signature
    )
    const replay = acceptCounter(input.window, header.counter)
    if (!replay.ok) throw new RelayCryptoError(replay.reason)
    let context: HpkeContext
    let plaintext: Uint8Array
    try {
        context = setupBaseReceiver(
            enc,
            input.controllerEncryptionSecret,
            HPKE_INFO
        )
        plaintext = context.open(aad, ciphertext)
    } catch {
        throw new RelayCryptoError('decrypt_failed')
    }
    return {
        header,
        plaintext,
        keys: exportKeys(context),
        window: replay.window,
    }
}

/**
 * The response and push keys of a request, from its HPKE encapsulation
 * alone. Nothing is decrypted or checked, so these keys only let the
 * Controller answer a request `openRequest` refused with a sealed, signed
 * refusal that only the request's sender can open. Twin of Core's
 * `reply_keys`.
 */
export function replyKeys(input: {
    sealed: SealedRequest
    controllerEncryptionSecret: Uint8Array
}): RequestKeys {
    const enc = b64urlDecodeLength(input.sealed.enc, 32)
    if (enc === null) throw new RelayCryptoError('malformed')
    try {
        return exportKeys(
            setupBaseReceiver(enc, input.controllerEncryptionSecret, HPKE_INFO)
        )
    } catch {
        throw new RelayCryptoError('malformed')
    }
}

// ---------------------------------------------------------------------------
// Responses

export async function sealResponse(input: {
    request: RequestHeader
    keys: RequestKeys
    plaintext: Uint8Array
    controllerSigner: Ed25519Signer
}): Promise<SealedResponse> {
    const header = responseHeaderFor(input.request)
    const aad = encodeResponseHeader(header)
    const ciphertext = aeadSeal(
        input.keys.responseKey,
        counterNonce(0),
        aad,
        input.plaintext
    )
    const signature = await input.controllerSigner.sign(lvCat(aad, ciphertext))
    return {
        header,
        ciphertext: b64urlEncode(ciphertext),
        signature: b64urlEncode(signature),
    }
}

/**
 * Opens a response as the Access Client, against the request it sent and
 * the Controller signing key pinned at pairing.
 */
export function openResponse(input: {
    sealed: SealedResponse
    request: RequestHeader
    keys: RequestKeys
    controllerSigningKey: Uint8Array
}): Uint8Array {
    const parsed = sealedResponseSchema.safeParse(input.sealed)
    if (!parsed.success) throw new RelayCryptoError('malformed')
    const { header } = parsed.data
    if (!sameResponseHeader(header, responseHeaderFor(input.request))) {
        throw new RelayCryptoError('mismatched_header')
    }
    const ciphertext = decodeOrThrow(parsed.data.ciphertext)
    const aad = encodeResponseHeader(header)
    verifyOrThrow(
        input.controllerSigningKey,
        lvCat(aad, ciphertext),
        parsed.data.signature
    )
    return openOrThrow(input.keys.responseKey, counterNonce(0), aad, ciphertext)
}

// ---------------------------------------------------------------------------
// Pushes

/** Seals push `counter` (from 1) on the watch `watch` registered. */
export async function sealPush(input: {
    watch: RequestHeader
    keys: RequestKeys
    counter: number
    plaintext: Uint8Array
    controllerSigner: Ed25519Signer
}): Promise<SealedPush> {
    const header = pushHeaderSchema.safeParse(
        pushHeaderFor(input.watch, input.counter)
    )
    if (!header.success) throw new RelayCryptoError('malformed')
    const aad = encodePushHeader(header.data)
    const ciphertext = aeadSeal(
        input.keys.pushKey,
        counterNonce(input.counter),
        aad,
        input.plaintext
    )
    const signature = await input.controllerSigner.sign(lvCat(aad, ciphertext))
    return {
        header: header.data,
        ciphertext: b64urlEncode(ciphertext),
        signature: b64urlEncode(signature),
    }
}

/** Opens a push as the Access Client and advances the watch's window. */
export function openPush(input: {
    sealed: SealedPush
    watch: RequestHeader
    keys: RequestKeys
    controllerSigningKey: Uint8Array
    window: ReplayWindow
}): { plaintext: Uint8Array; window: ReplayWindow } {
    const parsed = sealedPushSchema.safeParse(input.sealed)
    if (!parsed.success) throw new RelayCryptoError('malformed')
    const { header } = parsed.data
    const expected = pushHeaderFor(input.watch, header.counter)
    if (!sameResponseHeader(header, expected)) {
        throw new RelayCryptoError('mismatched_header')
    }
    const ciphertext = decodeOrThrow(parsed.data.ciphertext)
    const aad = encodePushHeader(header)
    verifyOrThrow(
        input.controllerSigningKey,
        lvCat(aad, ciphertext),
        parsed.data.signature
    )
    const replay = acceptCounter(input.window, header.counter)
    if (!replay.ok) throw new RelayCryptoError(replay.reason)
    const plaintext = openOrThrow(
        input.keys.pushKey,
        counterNonce(header.counter),
        aad,
        ciphertext
    )
    return { plaintext, window: replay.window }
}
