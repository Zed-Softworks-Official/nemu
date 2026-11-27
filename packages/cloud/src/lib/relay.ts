import { MINUTE, RateLimiter } from '@convex-dev/rate-limiter'
import {
    CLOCK_SKEW_MS,
    sealedPushSchema,
    sealedRequestSchema,
    sealedResponseSchema,
} from '@nemu/protocol/relay-crypto'
import { ConvexError, type Infer, v } from 'convex/values'
import { components } from '../functions/_generated/api'
import type { Doc } from '../functions/_generated/dataModel'

/** How long Convex keeps an uncollected response or push. */
export const RELAY_TTL_MS = 5 * 60 * 1000

/** Kept small so one cleanup run stays under per-mutation write limits. */
export const CLEANUP_BATCH_SIZE = 100

/**
 * Upper bound on any one opaque field, in base64url characters. Keeps a row
 * well under Convex's 1 MiB document limit.
 */
export const MAX_OPAQUE_CHARS = 256 * 1024

// Token buckets keyed by routing metadata only. `capacity` is the burst a
// dashboard load or reconnect may spend at once; `rate` is the refill.
export const RELAY_ACCESS_CLIENT_LIMIT = {
    kind: 'token bucket',
    rate: 120,
    period: MINUTE,
    capacity: 60,
} as const

/**
 * Per Account, across its Access Clients: one Account can't spend a Home's
 * whole budget by posting as many Access Clients.
 */
export const RELAY_ACCOUNT_LIMIT = {
    kind: 'token bucket',
    rate: 240,
    period: MINUTE,
    capacity: 120,
} as const

export const RELAY_CONTROLLER_LIMIT = {
    kind: 'token bucket',
    rate: 600,
    period: MINUTE,
    capacity: 200,
} as const

export const relayRateLimiter = new RateLimiter(components.rateLimiter, {
    relayPerController: RELAY_CONTROLLER_LIMIT,
    relayPerAccount: RELAY_ACCOUNT_LIMIT,
    relayPerAccessClient: RELAY_ACCESS_CLIENT_LIMIT,
})

// Convex validators mirror `@nemu/protocol/relay-crypto`'s sealed envelope
// schemas exactly, so anything outside the clear header and the opaque sealed
// parts is rejected before a handler runs. The zod schemas then enforce the
// same bounds Core and the clients use.

const requestHeaderValidator = v.object({
    controllerId: v.string(),
    identityEpoch: v.number(),
    accessClientId: v.string(),
    requestId: v.string(),
    counter: v.number(),
    expiresAt: v.number(),
})

const responseHeaderValidator = v.object({
    controllerId: v.string(),
    identityEpoch: v.number(),
    accessClientId: v.string(),
    requestId: v.string(),
})

const pushHeaderValidator = v.object({
    controllerId: v.string(),
    identityEpoch: v.number(),
    accessClientId: v.string(),
    requestId: v.string(),
    counter: v.number(),
})

export const sealedRequestValidator = v.object({
    header: requestHeaderValidator,
    enc: v.string(),
    ciphertext: v.string(),
    signature: v.string(),
})

export const sealedResponseValidator = v.object({
    header: responseHeaderValidator,
    ciphertext: v.string(),
    signature: v.string(),
})

export const sealedPushValidator = v.object({
    header: pushHeaderValidator,
    ciphertext: v.string(),
    signature: v.string(),
})

/** A response or a push: anything a Controller writes back to an Access Client. */
export const sealedToClientValidator = v.union(
    sealedResponseValidator,
    sealedPushValidator
)

export type SealedRequest = Infer<typeof sealedRequestValidator>
export type SealedToClient = Infer<typeof sealedToClientValidator>

export const relayKindValidator = v.union(
    v.literal('request'),
    v.literal('response'),
    v.literal('push')
)

/**
 * Error codes only. Messages never carry envelope fields, so a failure can't
 * leak contents into logs or back to a caller.
 */
export type RelayErrorCode =
    | 'malformed'
    | 'expired'
    | 'wrong_controller'
    /** The Account holds no active Membership in this Home (NEM-133). */
    | 'no_membership'

export function relayError(code: RelayErrorCode): ConvexError<{
    code: RelayErrorCode
}> {
    const error = new ConvexError({ code })
    error.message = code
    return error
}

function opaqueWithinBounds(...fields: string[]): boolean {
    return fields.every(
        (field) => field.length > 0 && field.length <= MAX_OPAQUE_CHARS
    )
}

export function checkSealedRequest(sealed: SealedRequest): SealedRequest {
    const parsed = sealedRequestSchema.safeParse(sealed)
    if (
        !parsed.success ||
        !opaqueWithinBounds(sealed.enc, sealed.ciphertext, sealed.signature)
    ) {
        throw relayError('malformed')
    }
    return parsed.data
}

/** Parses an untrusted value (the HTTP fallback body) as a response or push. */
export function parseSealedToClient(input: unknown): SealedToClient | null {
    const parsed =
        input !== null &&
        typeof input === 'object' &&
        'header' in input &&
        input.header !== null &&
        typeof input.header === 'object' &&
        'counter' in input.header
            ? sealedPushSchema.safeParse(input)
            : sealedResponseSchema.safeParse(input)
    if (
        !parsed.success ||
        !opaqueWithinBounds(parsed.data.ciphertext, parsed.data.signature)
    ) {
        return null
    }
    return parsed.data
}

export function checkSealedToClient(sealed: SealedToClient): SealedToClient {
    const parsed = parseSealedToClient(sealed)
    if (!parsed) {
        throw relayError('malformed')
    }
    return parsed
}

/**
 * When Convex drops a request: once the Controller would reject it anyway
 * (its signed expiry plus allowed clock skew), and never later than the
 * mailbox TTL.
 */
export function requestDeleteAt(expiresAt: number, now: number): number {
    return Math.min(expiresAt + CLOCK_SKEW_MS, now + RELAY_TTL_MS)
}

export function toSealedRequest(message: Doc<'relayMessages'>): SealedRequest {
    if (
        message.kind !== 'request' ||
        message.counter === undefined ||
        message.expiresAt === undefined ||
        message.enc === undefined
    ) {
        throw new Error('Not a Relay request')
    }
    return {
        header: {
            controllerId: message.controllerId,
            identityEpoch: message.identityEpoch,
            accessClientId: message.accessClientId,
            requestId: message.requestId,
            counter: message.counter,
            expiresAt: message.expiresAt,
        },
        enc: message.enc,
        ciphertext: message.ciphertext,
        signature: message.signature,
    }
}

export function toSealedToClient(
    message: Doc<'relayMessages'>
): SealedToClient {
    const header = {
        controllerId: message.controllerId,
        identityEpoch: message.identityEpoch,
        accessClientId: message.accessClientId,
        requestId: message.requestId,
    }
    if (message.kind === 'push' && message.counter !== undefined) {
        return {
            header: { ...header, counter: message.counter },
            ciphertext: message.ciphertext,
            signature: message.signature,
        }
    }
    if (message.kind === 'response') {
        return {
            header,
            ciphertext: message.ciphertext,
            signature: message.signature,
        }
    }
    throw new Error('Not a Relay response or push')
}
