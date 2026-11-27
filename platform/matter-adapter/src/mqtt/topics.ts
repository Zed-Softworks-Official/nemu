/** What the adapter consumes, by topic under the base topic. */

export type Payload = Record<string, unknown>

export type Incoming =
    | { kind: 'commission'; payload: Payload }
    | { kind: 'cancel'; payload: Payload }
    | { kind: 'remove'; payload: Payload }
    | { kind: 'rename'; payload: Payload }
    | { kind: 'health'; payload: Payload }
    | { kind: 'set'; deviceId: string; payload: Payload }
    | { kind: 'capabilityIds'; deviceId: string; payload: Payload }

export const SUBSCRIPTIONS = (base: string): string[] => [
    `${base}/bridge/request/#`,
    `${base}/+/set`,
    `${base}/+/capability-ids`,
]

const REQUESTS = {
    'bridge/request/commission': 'commission',
    'bridge/request/commission/cancel': 'cancel',
    'bridge/request/device/remove': 'remove',
    'bridge/request/device/rename': 'rename',
    'bridge/request/health/check': 'health',
} as const

export function parseIncoming(
    base: string,
    topic: string,
    payload: string
): Incoming | undefined {
    if (!topic.startsWith(`${base}/`)) return undefined
    const rest = topic.slice(base.length + 1)
    const body = parseObject(payload)
    if (rest in REQUESTS)
        return { kind: REQUESTS[rest as keyof typeof REQUESTS], payload: body }
    const [deviceId, leaf, ...more] = rest.split('/')
    if (!deviceId || more.length > 0) return undefined
    if (leaf === 'set') return { kind: 'set', deviceId, payload: body }
    if (leaf === 'capability-ids')
        return { kind: 'capabilityIds', deviceId, payload: body }
    return undefined
}

function parseObject(payload: string): Payload {
    try {
        const value: unknown = JSON.parse(payload)
        return value !== null &&
            typeof value === 'object' &&
            !Array.isArray(value)
            ? (value as Payload)
            : {}
    } catch {
        return {}
    }
}

/** The request's `transaction`, echoed on its response. */
export function transactionOf(payload: Payload): string | undefined {
    return typeof payload.transaction === 'string'
        ? payload.transaction
        : undefined
}
