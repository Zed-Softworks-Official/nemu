/**
 * One commissioning attempt, ported from the Rust adapter's `commission_device`.
 *
 * With home Wi-Fi it tries BLE first, so a fresh Device is not waited for over
 * mDNS. When BLE fails for any reason but attestation, or the host has no
 * Bluetooth adapter, it falls back to commissioning on-network, as the Rust
 * adapter did. The stages and the Owner-facing messages are the Rust
 * adapter's.
 *
 * Pairing codes and Wi-Fi passwords never reach a log line: everything logged
 * here goes through {@link redact}.
 *
 * The stages map onto the Protocol-neutral steps of `@nemu/protocol`
 * ({@link stepOf}), and a failure names the step that failed
 * ({@link CommissionFailure}). matter.js commissions in one call, so the
 * steps inside it (PASE, attestation, network setup, CASE) are told apart
 * only by the error a failure raises ({@link classifyFailure}).
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
 * A failed commissioning. The message is the Rust adapter's Owner-facing
 * text, unchanged; the step and reason go on `bridge/commissioning`.
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
 * an Error whose message is ready for the Owner.
 */
export async function commissionDevice(
    session: MatterSession,
    attempt: CommissionAttempt,
    progress: Progress,
    log: Log
): Promise<NodeId> {
    const { code, wifi, signal } = attempt
    const hide = (text: string) => redact(text, attempt)
    // The last step reached, for a failure no error names a step for.
    let reached: CommissioningStep = 'discovering'
    const report: Progress = (stage, message) => {
        reached = stepOf(stage) ?? reached
        return progress(stage, message)
    }
    if (signal.aborted) throw new Error(CANCELLED)
    await report('connecting', 'Connecting securely')

    // A BLE failure that names its step says more than the fallback's.
    let bleFailure: FailedStep | undefined
    if (wifi) {
        if (session.bleAvailable()) {
            log.info('commissioning over BLE with home Wi-Fi')
            await report('wifi', 'Sending your Wi-Fi details')
            try {
                const nodeId = await session.commission({
                    code,
                    wifi,
                    signal,
                })
                await report('joining', 'Joining your home')
                return nodeId
            } catch (error) {
                if (signal.aborted) throw new Error(CANCELLED)
                const raw = hide(messageOf(error))
                if (isAttestationError(raw))
                    throw new CommissionFailure(
                        humanCommissionError(raw),
                        classifyFailure(raw, reached)
                    )
                bleFailure = namedFailure(raw, reached)
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
        await report('joining', 'Joining your home')
        return nodeId
    } catch (error) {
        if (signal.aborted) throw new Error(CANCELLED)
        const raw = hide(messageOf(error))
        log.info(`on-network commission failed: ${raw}`)
        // Deliberate drift: the Rust adapter discarded the on-network error,
        // so an uncertified Device got the generic answer. Say why instead.
        if (isAttestationError(raw))
            throw new CommissionFailure(
                humanCommissionError(raw),
                classifyFailure(raw, reached)
            )
        networkFailure = namedFailure(raw, reached)
    }

    throw new CommissionFailure(
        wifi
            ? 'Put the device back in pairing mode and keep it near the controller.'
            : 'Put the device back in pairing mode and try again. If it is new, enter your 2.4 GHz home Wi-Fi.',
        bleFailure ?? networkFailure ?? { step: reached, reason: 'unreachable' }
    )
}

/**
 * The step a raw (redacted) commissioning error failed in, and why. An error
 * that names no step fails the step last reached.
 */
export function classifyFailure(
    raw: string,
    reached: CommissioningStep
): FailedStep {
    return (
        namedFailure(raw, reached) ?? { step: reached, reason: 'unreachable' }
    )
}

function namedFailure(
    raw: string,
    reached: CommissioningStep
): FailedStep | undefined {
    const lower = raw.toLowerCase()
    if (isAttestationError(raw))
        return { step: 'verifying', reason: 'not_verified' }
    if (
        lower.includes('wifi') ||
        lower.includes('wi-fi') ||
        lower.includes('ssid') ||
        lower.includes('associat') ||
        lower.includes('network commissioning')
    )
        return { step: 'configuring_network', reason: 'network_rejected' }
    if (
        lower.includes('case session') ||
        lower.includes('operational') ||
        lower.includes('sigma')
    )
        return { step: 'joining_network', reason: 'unreachable' }
    if (
        lower.includes('pase') ||
        lower.includes('btp handshake') ||
        lower.includes('session establishment')
    )
        return { step: 'connecting', reason: 'unreachable' }
    if (lower.includes('timeout') || lower.includes('timed out'))
        return { step: reached, reason: 'timed_out' }
    if (
        lower.includes('not discovered') ||
        lower.includes('no device') ||
        lower.includes('not found') ||
        lower.includes('discovery')
    )
        return { step: 'discovering', reason: 'unreachable' }
    return undefined
}

/** The Rust adapter's Owner-facing message for a raw commissioning error. */
export function humanCommissionError(raw: string): string {
    const lower = raw.toLowerCase()
    if (
        lower.includes('wifi') ||
        lower.includes('ssid') ||
        lower.includes('associat')
    )
        return 'Use the 2.4 GHz network, not 5 GHz, and try again.'
    if (
        lower.includes('case session') ||
        lower.includes('btp handshake') ||
        lower.includes('session establishment')
    )
        return 'The device was found but did not finish joining. Put it back in pairing mode and keep it near the controller.'
    if (lower.includes('timeout') || lower.includes('timed out'))
        return 'Pairing timed out. Put the device back in pairing mode and keep it near the controller.'
    if (isAttestationError(raw))
        return 'This device could not be verified. Check that Nemu has Matter trust roots installed.'
    return 'Put the device back in pairing mode and try again.'
}

function isAttestationError(raw: string): boolean {
    const lower = raw.toLowerCase()
    return (
        lower.includes('attest') ||
        lower.includes('paa') ||
        lower.includes('dac')
    )
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
