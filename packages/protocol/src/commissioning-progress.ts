/**
 * Commissioning progress, in steps that do not depend on the Protocol. A
 * Protocol adapter maps its own phases onto these steps; no Protocol phase
 * name reaches Core or the Access Clients. Zigbee pairing can report the same
 * steps, skipping the ones it has no equivalent for.
 *
 * Progress travels from the adapter to Core on `{base}/bridge/commissioning`,
 * and from Core to Access Clients over the LAN WebSocket as the
 * `commissioningStep` event. It stays off Relay until NEM-123 pushes it
 * sealed on the capability watch. It carries no pairing code, passcode, Wi-Fi
 * credential, free text or Device identifier: every field is one of the enums
 * below, and the objects are strict, so anything else is refused.
 */
import { z } from 'zod'

/** The steps, in the order a commissioning reaches them. */
export const COMMISSIONING_STEPS = [
    /** Looking for the Device (Matter: BLE or mDNS discovery). */
    'discovering',
    /** Opening a secure session with the Device (Matter: PASE). */
    'connecting',
    /** Checking that the Device is genuine (Matter: attestation). */
    'verifying',
    /** Giving the Device the Home network (Matter: Wi-Fi or Thread setup). */
    'configuring_network',
    /**
     * The Device joining the Home network and the Controller reaching it there
     * (Matter: operational discovery and CASE).
     */
    'joining_network',
    /** Reading what the Device can do (Matter: the node interview). */
    'setting_up',
] as const

export const commissioningStepSchema = z.enum(COMMISSIONING_STEPS)
export type CommissioningStep = z.infer<typeof commissioningStepSchema>

/**
 * Why a step failed, for the guidance an Access Client shows the Owner.
 * - `unreachable`: the Device was not found or stopped answering; move closer
 *   and put it back in pairing mode.
 * - `network_rejected`: the Device could not join the Home network; check the
 *   Wi-Fi details.
 * - `not_verified`: the Device could not be verified as genuine.
 * - `timed_out`: the step took too long; reset the Device and try again.
 * - `unknown`: anything else.
 */
export const commissioningFailureReasonSchema = z.enum([
    'unreachable',
    'network_rejected',
    'not_verified',
    'timed_out',
    'unknown',
])
export type CommissioningFailureReason = z.infer<
    typeof commissioningFailureReasonSchema
>

const activeProgress = {
    status: z.literal('active'),
    step: commissioningStepSchema,
}
const completedProgress = { status: z.literal('completed') }
const failedProgress = {
    status: z.literal('failed'),
    /** The step that failed. */
    step: commissioningStepSchema,
    reason: commissioningFailureReasonSchema,
}

/**
 * Non-retained `{base}/bridge/commissioning`. An adapter publishes `active`
 * for each step it reaches, then `completed` or `failed`. A cancelled
 * commissioning publishes nothing more.
 */
export const commissioningProgressSchema = z.discriminatedUnion('status', [
    z.strictObject(activeProgress),
    z.strictObject(completedProgress),
    z.strictObject(failedProgress),
])
export type CommissioningProgress = z.infer<typeof commissioningProgressSchema>

const eventType = { type: z.literal('commissioningStep') }

/** The same progress as Core sends it to Access Clients over LAN. */
export const commissioningStepEventSchema = z.discriminatedUnion('status', [
    z.strictObject({ ...eventType, ...activeProgress }),
    z.strictObject({ ...eventType, ...completedProgress }),
    z.strictObject({ ...eventType, ...failedProgress }),
])
export type CommissioningStepEvent = z.infer<
    typeof commissioningStepEventSchema
>
