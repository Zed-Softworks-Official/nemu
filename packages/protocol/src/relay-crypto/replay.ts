// The sliding replay window for per-Access Client counters. Twin of Core's
// `relay_crypto::replay`: the highest accepted counter plus a bitmap of the
// 64 counters ending at it. Counters start at 1.

export const REPLAY_WINDOW_SIZE = 64

const WINDOW_MASK = (1n << 64n) - 1n

export type ReplayWindow = {
    /** Highest accepted counter, or 0 when nothing has been accepted. */
    readonly highest: number
    /** Bit `i` is set when counter `highest - i` has been accepted. */
    readonly seen: bigint
}

export const EMPTY_REPLAY_WINDOW: ReplayWindow = { highest: 0, seen: 0n }

export type ReplayRejection = 'replayed' | 'outside_window'

export type ReplayResult =
    | { ok: true; window: ReplayWindow }
    | { ok: false; reason: ReplayRejection }

/**
 * Returns the window after accepting `counter`, or why it is refused. The
 * input window never changes, so a caller commits the result only once the
 * rest of its checks pass.
 */
export function acceptCounter(
    window: ReplayWindow,
    counter: number
): ReplayResult {
    if (!Number.isSafeInteger(counter) || counter < 1) {
        return { ok: false, reason: 'outside_window' }
    }
    if (counter > window.highest) {
        const shift = counter - window.highest
        const seen =
            shift >= REPLAY_WINDOW_SIZE
                ? 0n
                : (window.seen << BigInt(shift)) & WINDOW_MASK
        return { ok: true, window: { highest: counter, seen: seen | 1n } }
    }
    const age = window.highest - counter
    if (age >= REPLAY_WINDOW_SIZE) {
        return { ok: false, reason: 'outside_window' }
    }
    const bit = 1n << BigInt(age)
    if ((window.seen & bit) !== 0n) return { ok: false, reason: 'replayed' }
    return {
        ok: true,
        window: { highest: window.highest, seen: window.seen | bit },
    }
}
