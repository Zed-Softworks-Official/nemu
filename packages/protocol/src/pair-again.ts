// Why an Access Client must pair again at home (NEM-63). One definition for
// the Controller package, mobile and the dashboard, so every app can give
// each reason its own message.

import { z } from 'zod'

/** This Access Client holds no keys for the Home. */
export const NOT_PAIRED_ERROR_CODE = 'not_paired'
/**
 * The Controller's refusal of a bearer token (NEM-131). This client never
 * sends one; an alpha build that does must pair again at home.
 */
export const BEARER_TOKEN_RETIRED_ERROR_CODE = 'bearer_token_retired'
/** The Controller does not know this Access Client. */
export const UNKNOWN_ACCESS_CLIENT_ERROR_CODE = 'unknown_access_client'
/** The Controller revoked this Access Client; its keys never work again. */
export const TOMBSTONED_ACCESS_CLIENT_ERROR_CODE = 'tombstoned_access_client'
/** The Controller signed this Membership's routing projection as ended. */
export const MEMBERSHIP_ENDED_ERROR_CODE = 'membership_ended'

export const PAIR_AGAIN_ERROR_CODES = [
    NOT_PAIRED_ERROR_CODE,
    BEARER_TOKEN_RETIRED_ERROR_CODE,
    UNKNOWN_ACCESS_CLIENT_ERROR_CODE,
    TOMBSTONED_ACCESS_CLIENT_ERROR_CODE,
    MEMBERSHIP_ENDED_ERROR_CODE,
] as const

export const pairAgainReasonSchema = z.enum(PAIR_AGAIN_ERROR_CODES)
export type PairAgainReason = z.infer<typeof pairAgainReasonSchema>

export function isPairAgainReason(value: unknown): value is PairAgainReason {
    return pairAgainReasonSchema.safeParse(value).success
}

/**
 * True when the reason means the Controller refused this client's keys, so
 * they are worth nothing now. Holding no keys, or a refused bearer token,
 * says nothing about the keys.
 */
export function keysRefused(reason: PairAgainReason): boolean {
    return (
        reason !== NOT_PAIRED_ERROR_CODE &&
        reason !== BEARER_TOKEN_RETIRED_ERROR_CODE
    )
}
