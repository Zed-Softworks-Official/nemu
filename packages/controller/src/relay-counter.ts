/**
 * Relay counters (ADR-0001). The Access Client allocates one per sealed
 * request; the Controller refuses a counter it has seen, or one more than 64
 * behind the highest it accepted. Every tab of one Access Client must take
 * values from one sequence, so the web allocator takes them under a Web Lock.
 *
 * Losing the sequence is recoverable: the Controller answers a refused
 * counter with the highest it saw, signed, and the transport moves past it.
 */
export interface RelayCounter {
    /** A counter never handed out before, from 1. */
    next(): Promise<number>
    /** Moves the sequence past `highest`, the Controller's highest seen. */
    advancePast(highest: number): Promise<void>
}

/** Keeps the sequence in memory: one process, one sequence. */
export function createMemoryRelayCounter(start = 0): RelayCounter {
    let last = start
    return {
        next: async () => {
            last += 1
            return last
        },
        advancePast: async (highest) => {
            last = Math.max(last, highest)
        },
    }
}

/** The slice of the Web Locks API the allocator uses. */
export type RelayCounterLocks = {
    request<T>(name: string, callback: () => Promise<T>): Promise<T>
}

/** The slice of Web Storage the allocator uses. */
export type RelayCounterStorage = Pick<Storage, 'getItem' | 'setItem'>

export type WebRelayCounterOptions = {
    controllerId: string
    accessClientId: string
    /** Defaults to `navigator.locks`. */
    locks?: RelayCounterLocks
    /** Defaults to `localStorage`. */
    storage?: RelayCounterStorage
}

function browserLocks(): RelayCounterLocks | null {
    const nav = (globalThis as { navigator?: { locks?: RelayCounterLocks } })
        .navigator
    return nav?.locks ?? null
}

function browserStorage(): RelayCounterStorage | null {
    try {
        return (
            (globalThis as { localStorage?: RelayCounterStorage })
                .localStorage ?? null
        )
    } catch {
        return null
    }
}

/**
 * One sequence shared by every tab of this Access Client: each value is read,
 * bumped and written back under a Web Lock. Without Web Locks or storage it
 * falls back to memory, which the Controller's refusal then corrects.
 */
export function createWebRelayCounter(
    options: WebRelayCounterOptions
): RelayCounter {
    const locks = options.locks ?? browserLocks()
    const storage = options.storage ?? browserStorage()
    if (!locks || !storage) return createMemoryRelayCounter()
    const key = `nemu.relayCounter.${options.controllerId}.${options.accessClientId}`
    const read = (): number => {
        const value = Number(storage.getItem(key) ?? 0)
        return Number.isSafeInteger(value) && value > 0 ? value : 0
    }
    return {
        next: () =>
            locks.request(key, async () => {
                const value = read() + 1
                storage.setItem(key, String(value))
                return value
            }),
        advancePast: (highest) =>
            locks.request(key, async () => {
                if (highest > read()) storage.setItem(key, String(highest))
            }),
    }
}
