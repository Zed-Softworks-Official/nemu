/**
 * One commissioning attempt, ported from the Rust adapter's `commission_device`.
 *
 * With home Wi-Fi it tries BLE first, so a fresh Device is not waited for over
 * mDNS. When BLE fails for any reason but attestation, or the host has no
 * Bluetooth adapter, it falls back to commissioning on-network, as the Rust
 * adapter did. The stages and the Owner- or Member-facing messages are the
 * Rust adapter's.
 *
 * Pairing codes and Wi-Fi passwords never reach a log line: everything logged
 * here goes through {@link redact}.
 *
 * The stages map onto the Protocol-neutral steps of `@nemu/protocol`
 * ({@link stepOf}), and a failure names the step that failed
 * ({@link CommissionFailure}). matter.js commissions in one call, so the
 * steps inside it (PASE, attestation, network setup, CASE) are told apart
 * only by the error a failure raises ({@link classifyCommissionError}), and
 * an error that names no step fails the step reached before that call.
 */
import type {
    CommissioningFailureReason,
    CommissioningStep,
} from '@nemu/protocol'
import type { NodeId } from './attributes.ts'
import type { Log } from './log.ts'
import {
    decodePairingCode,
    type MatterSession,
    type WifiCredentials,
} from './matter/session.ts'

export type ProgressStage =
    | 'looking'
    | 'connecting'
    | 'wifi'
    | 'joining'
    | 'setting_up'
    | 'connected'

export type Progress = (stage: ProgressStage, message: string) => Promise<void>

/**
 * The Protocol-neutral step a stage reports, or `undefined` for `connected`,
 * which completes the commissioning.
 */
export function stepOf(stage: ProgressStage): CommissioningStep | undefined {
    switch (stage) {
        case 'looking':
            return 'discovering'
        case 'connecting':
            return 'connecting'
        case 'wifi':
            return 'configuring_network'
        case 'joining':
            return 'joining_network'
        case 'setting_up':
            return 'setting_up'
        case 'connected':
            return undefined
    }
}

/** Which step failed and why. Holds no text from the raw error. */
export interface FailedStep {
    step: CommissioningStep
    reason: CommissioningFailureReason
}

/**
 * A failed commissioning. The message is the Rust adapter's Owner- or
 * Member-facing text, unchanged; the step and reason go on
 * `bridge/commissioning`.
 */
export class CommissionFailure extends Error {
    constructor(
        message: string,
        readonly failed: FailedStep
    ) {
        super(message)
        this.name = 'CommissionFailure'
    }
}

export interface CommissionAttempt {
    code: string
    wifi?: WifiCredentials
    signal: AbortSignal
}

export const CANCELLED = 'pairing was cancelled'

/**
 * Commissions the Device the code names and returns its node ID. Rejects with
 * an Error whose message is ready for the Owner or Member.
 */
export async function commissionDevice(
    session: MatterSession,
    attempt: CommissionAttempt,
    progress: Progress,
    log: Log
): Promise<NodeId> {
    const { code, wifi, signal } = attempt
    const hide = (text: string) => redact(text, attempt)
    if (signal.aborted) throw new Error(CANCELLED)
    await progress('connecting', 'Connecting securely')
    // matter.js runs every later step inside one `commission()` call, so an
    // error the classifier can't place fails this step, the last one reached
    // before the call. The `wifi` stage is announced before that same call
    // and says nothing about where it failed.
    const beforeCall: CommissioningStep = 'connecting'

    // A BLE failure that names its step says more than the fallback's.
    let bleFailure: FailedStep | undefined
    if (wifi) {
        if (session.bleAvailable()) {
            log.info('commissioning over BLE with home Wi-Fi')
            await progress('wifi', 'Sending your Wi-Fi details')
            try {
                const nodeId = await session.commission({
                    code,
                    wifi,
                    signal,
                })
                await progress('joining', 'Joining your home')
                return nodeId
            } catch (error) {
                if (signal.aborted) throw new Error(CANCELLED)
                const raw = hide(messageOf(error))
                const found = classifyCommissionError(raw)
                if (found?.kind === 'attestation')
                    throw new CommissionFailure(
                        found.message,
                        failedStep(found, beforeCall, true)
                    )
                if (found) bleFailure = failedStep(found, beforeCall, true)
                log.info(`BLE commission failed; trying on-network: ${raw}`)
            }
        } else {
            log.info('BLE is unavailable on this host; trying on-network')
        }
    }

    if (signal.aborted) throw new Error(CANCELLED)
    let networkFailure: FailedStep | undefined
    try {
        const nodeId = await session.commission({ code, signal })
        await progress('joining', 'Joining your home')
        return nodeId
    } catch (error) {
        if (signal.aborted) throw new Error(CANCELLED)
        const raw = hide(messageOf(error))
        log.info(`on-network commission failed: ${raw}`)
        const found = classifyCommissionError(raw)
        // Deliberate drift: the Rust adapter discarded the on-network error,
        // so an uncertified Device got the generic answer. Say why instead.
        if (found?.kind === 'attestation')
            throw new CommissionFailure(
                found.message,
                failedStep(found, beforeCall, false)
            )
        if (found) networkFailure = failedStep(found, beforeCall, false)
    }

    throw new CommissionFailure(
        wifi
            ? 'Put the device back in pairing mode and keep it near the controller.'
            : 'Put the device back in pairing mode and try again. If it is new, enter your 2.4 GHz home Wi-Fi.',
        bleFailure ??
            networkFailure ?? { step: beforeCall, reason: 'unreachable' }
    )
}

/** What a raw commissioning error says went wrong. */
export interface CommissionErrorClass {
    kind:
        | 'attestation'
        | 'network_rejected'
        | 'operational_session'
        | 'pase_session'
        | 'timeout'
        | 'not_discovered'
    /** The step it failed in, or `undefined` when it doesn't say. */
    step: CommissioningStep | undefined
    reason: CommissioningFailureReason
    /** The Rust adapter's Owner- or Member-facing text for it, unchanged. */
    message: string
}

const NOT_JOINED =
    'The device was found but did not finish joining. Put it back in pairing mode and keep it near the controller.'

const GENERIC = 'Put the device back in pairing mode and try again.'

/**
 * The one table of what raw commissioning errors mean, checked in order: the
 * first rule with a matching substring wins. The failed step and the Owner-
 * or Member-facing message come from the same rule, so they can't disagree.
 * Attestation comes first because it is final: it never falls back.
 */
const ERROR_RULES: readonly (CommissionErrorClass & {
    match: readonly string[]
})[] = [
    {
        kind: 'attestation',
        match: ['attest', 'paa', 'dac'],
        step: 'verifying',
        reason: 'not_verified',
        message:
            'This device could not be verified. Check that Nemu has Matter trust roots installed.',
    },
    {
        kind: 'network_rejected',
        match: ['wifi', 'wi-fi', 'ssid', 'associat', 'network commissioning'],
        step: 'configuring_network',
        reason: 'network_rejected',
        message: 'Use the 2.4 GHz network, not 5 GHz, and try again.',
    },
    {
        kind: 'operational_session',
        match: ['case session', 'operational', 'sigma'],
        step: 'joining_network',
        reason: 'unreachable',
        message: NOT_JOINED,
    },
    {
        // BTP is the BLE transport PASE runs over, so a failed handshake
        // fails the secure connection, not joining the network.
        kind: 'pase_session',
        match: ['pase', 'btp handshake', 'session establishment'],
        step: 'connecting',
        reason: 'unreachable',
        message: NOT_JOINED,
    },
    {
        kind: 'timeout',
        match: ['timeout', 'timed out'],
        step: undefined,
        reason: 'timed_out',
        message:
            'Pairing timed out. Put the device back in pairing mode and keep it near the controller.',
    },
    {
        kind: 'not_discovered',
        match: ['not discovered', 'no device', 'not found', 'discovery'],
        step: 'discovering',
        reason: 'unreachable',
        message: GENERIC,
    },
]

/**
 * Classifies a raw (redacted) commissioning error, or returns `undefined`
 * when no rule places it.
 */
export function classifyCommissionError(
    raw: string
): CommissionErrorClass | undefined {
    const lower = raw.toLowerCase()
    const rule = ERROR_RULES.find((candidate) =>
        candidate.match.some((needle) => lower.includes(needle))
    )
    if (!rule) return undefined
    const { match: _match, ...found } = rule
    return found
}

/**
 * The step a classified error failed, or `beforeCall` when it names none.
 * Only an attempt that sends Wi-Fi has a network step, so for the on-network
 * attempt a Wi-Fi error is one the classifier can't place.
 */
function failedStep(
    found: CommissionErrorClass,
    beforeCall: CommissioningStep,
    sendsWifi: boolean
): FailedStep {
    if (found.step === 'configuring_network' && !sendsWifi)
        return { step: beforeCall, reason: 'unreachable' }
    return { step: found.step ?? beforeCall, reason: found.reason }
}

/**
 * The step a raw (redacted) commissioning error failed in, and why. An error
 * that names no step fails `beforeCall`, the step reached before matter.js
 * took over.
 */
export function classifyFailure(
    raw: string,
    beforeCall: CommissioningStep,
    sendsWifi = true
): FailedStep {
    const found = classifyCommissionError(raw)
    return found
        ? failedStep(found, beforeCall, sendsWifi)
        : { step: beforeCall, reason: 'unreachable' }
}

/**
 * The Rust adapter's Owner- or Member-facing message for a raw commissioning
 * error.
 */
export function humanCommissionError(raw: string): string {
    return classifyCommissionError(raw)?.message ?? GENERIC
}

/**
 * Masks the pairing code (as sent and as bare digits), the passcode it
 * encodes, and the Wi-Fi password.
 */
export function redact(
    text: string,
    secrets: { code: string; wifi?: WifiCredentials }
): string {
    const hidden = [
        secrets.code.trim(),
        secrets.code.replace(/[\s-]/g, ''),
        passcodeOf(secrets.code),
        secrets.wifi?.password ?? '',
    ]
        .filter((secret) => secret.length > 0)
        // Longest first, so a code is masked whole before its passcode.
        .sort((a, b) => b.length - a.length)
    let out = text
    for (const secret of hidden) out = out.split(secret).join('***')
    return out
}

function passcodeOf(code: string): string {
    try {
        return String(decodePairingCode(code).passcode)
    } catch {
        return ''
    }
}

function messageOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
}
