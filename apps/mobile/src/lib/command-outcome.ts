import type { CommandResult } from '@nemu/protocol'

export type CommandFinalFailure = 'rejected' | 'failed' | 'unconfirmed'

/** What a Command's answer means for the person who sent it (ADR-0015). */
export type CommandAnswer =
    | { phase: 'pending' }
    | { phase: 'confirmed' }
    | { phase: CommandFinalFailure; message: string }

const REJECTED_MESSAGES: Record<string, string> = {
    unavailable:
        'The Device is unavailable, so the Controller did not send this.',
    device_not_found: 'The Controller no longer has this Device.',
    maintenance:
        'The Home is being updated, so the Controller did not send this.',
    unauthorized: 'This phone is no longer allowed to control this Home.',
    forbidden: 'This phone is not allowed to control this Device.',
}
const REJECTED_DEFAULT =
    'The Controller refused this Command and did not send it.'

const FAILED_MESSAGES: Record<string, string> = {
    dispatch_expired: 'The Controller could not send this in time.',
    mqtt_error: 'The Controller could not reach the Device’s network.',
    relay_disconnected: 'This phone lost the Relay, so this was not sent.',
}
const FAILED_DEFAULT = 'The Device or its network reported an error.'

export const UNCONFIRMED_MESSAGE =
    'The Device did not report the change in time. Check it before trying again.'
const CONNECTION_LOST_MESSAGE =
    'The connection dropped before the Controller answered, so this may or may not have happened.'

/** No Controller answer: the Command may have been admitted. */
const UNKNOWN_FATE_CODES = new Set([
    'network_error',
    'timeout',
    'http_error',
    'unknown',
])

const REJECTED_CODES = new Set([
    ...Object.keys(REJECTED_MESSAGES),
    'invalid_command',
])

function fromCode(code: string | undefined): CommandAnswer {
    if (code === 'unconfirmed') {
        return { phase: 'unconfirmed', message: UNCONFIRMED_MESSAGE }
    }
    if (code !== undefined && REJECTED_CODES.has(code)) {
        return {
            phase: 'rejected',
            message: REJECTED_MESSAGES[code] ?? REJECTED_DEFAULT,
        }
    }
    return {
        phase: 'failed',
        message: (code && FAILED_MESSAGES[code]) || FAILED_DEFAULT,
    }
}

export function answerFromResult(result: CommandResult): CommandAnswer {
    const code = result.error?.code
    switch (result.outcome) {
        case 'confirmed':
            return { phase: 'confirmed' }
        case 'rejected':
            return {
                phase: 'rejected',
                message: (code && REJECTED_MESSAGES[code]) || REJECTED_DEFAULT,
            }
        case 'failed':
            return {
                phase: 'failed',
                message: (code && FAILED_MESSAGES[code]) || FAILED_DEFAULT,
            }
        case 'unconfirmed':
            return { phase: 'unconfirmed', message: UNCONFIRMED_MESSAGE }
    }
    return result.ok ? { phase: 'pending' } : fromCode(code)
}

/**
 * A thrown send either carries a Controller error code, or the connection
 * failed and the Command's fate is unknown. Unknown is never reported as
 * "not sent": the Controller may have admitted it.
 */
export function answerFromError(error: unknown): CommandAnswer {
    const code =
        typeof error === 'object' && error !== null && 'code' in error
            ? (error as { code?: unknown }).code
            : undefined
    if (typeof code === 'string' && !UNKNOWN_FATE_CODES.has(code)) {
        return fromCode(code)
    }
    return { phase: 'unconfirmed', message: CONNECTION_LOST_MESSAGE }
}
