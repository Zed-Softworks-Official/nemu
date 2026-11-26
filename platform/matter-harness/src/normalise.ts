/**
 * Turns the raw MQTT messages of one harness step into a stable, comparable
 * record. Pure: the same messages and names always give the same output.
 *
 * What it removes, and why:
 * - Node IDs. The commissioner assigns them, so each is replaced by the
 *   simulated Device's name (`<plug>`, `<light>`) in topics and ID fields.
 * - `observedAt` and `observationId`. They come from the adapter clock.
 * - `bridge/devices` order. The array is sorted by `external_id`, because the
 *   Rust adapter emits it in hash-map order.
 * - Repeats. A retained topic can be republished with an unchanged payload any
 *   number of times as subscription reports arrive, so consecutive identical
 *   payloads on one topic collapse into one. Responses are never collapsed.
 */

export interface RawMessage {
    /** Topic without the base prefix, for example `bridge/devices` or `2/availability`. */
    topic: string
    /** UTF-8 payload. An empty payload clears a retained topic. */
    payload: string
}

/** Node ID (decimal string) to Device name, for example `{ "2": "plug" }`. */
export type NodeNames = Readonly<Record<string, string>>

export type StepRecord = Record<string, unknown[]>

const ID_FIELDS = new Set(['external_id', 'ieee_address', 'externalId'])
/** A response also echoes the Device ID as `id`, which in state means an outlet. */
const RESPONSE_ID_FIELDS = new Set([...ID_FIELDS, 'id'])
const TIME_FIELDS = new Set(['observedAt'])
const OPAQUE_FIELDS = new Set(['observationId'])

/** Topics the harness records. `bridge/event` is kept only for `command_failed`. */
export function isRecordedTopic(topic: string, payload: string): boolean {
    if (topic === 'bridge/devices') return true
    if (topic.startsWith('bridge/response/')) return true
    if (topic === 'bridge/event') return eventType(payload) === 'command_failed'
    if (topic.startsWith('bridge/')) return false
    const parts = topic.split('/')
    if (parts.length === 1) return true
    if (parts.length !== 2) return false
    return ['availability', 'capabilities', 'observations'].includes(
        parts[1] ?? ''
    )
}

function eventType(payload: string): unknown {
    try {
        return (JSON.parse(payload) as { type?: unknown }).type
    } catch {
        return undefined
    }
}

/** Replaces a leading node ID in `2`, `2:1`, `2#3` or `2/availability`. */
export function renameNodeId(value: string, names: NodeNames): string {
    const match = /^(\d+)(?=$|[:#/])/.exec(value)
    if (!match) return value
    const name = names[match[1] ?? '']
    return name === undefined
        ? value
        : `<${name}>${value.slice(match[0].length)}`
}

function normaliseValue(
    value: unknown,
    names: NodeNames,
    idFields: ReadonlySet<string>,
    key?: string
): unknown {
    if (typeof value === 'string') {
        if (key !== undefined && TIME_FIELDS.has(key)) return '<timestamp>'
        if (key !== undefined && OPAQUE_FIELDS.has(key)) return `<${key}>`
        if (key !== undefined && idFields.has(key))
            return renameNodeId(value, names)
        return value
    }
    if (Array.isArray(value))
        return value.map((item) => normaliseValue(item, names, idFields))
    if (value !== null && typeof value === 'object') {
        const out: Record<string, unknown> = {}
        for (const field of Object.keys(value).sort()) {
            out[field] = normaliseValue(
                (value as Record<string, unknown>)[field],
                names,
                idFields,
                field
            )
        }
        return out
    }
    return value
}

/** Normalises one payload. An empty payload becomes `null` (topic cleared). */
export function normalisePayload(
    topic: string,
    payload: string,
    names: NodeNames
): unknown {
    if (payload === '') return null
    let parsed: unknown
    try {
        parsed = JSON.parse(payload)
    } catch {
        return { unparsed: payload }
    }
    const idFields = topic.startsWith('bridge/response/')
        ? RESPONSE_ID_FIELDS
        : ID_FIELDS
    const normalised = normaliseValue(parsed, names, idFields)
    if (topic === 'bridge/devices' && Array.isArray(normalised)) {
        return [...normalised].sort((a, b) =>
            sortKey(a).localeCompare(sortKey(b))
        )
    }
    return normalised
}

function sortKey(device: unknown): string {
    const id = (device as { external_id?: unknown } | null)?.external_id
    return typeof id === 'string' ? id : JSON.stringify(device)
}

function collapses(topic: string): boolean {
    return !topic.startsWith('bridge/response/') && topic !== 'bridge/event'
}

/** One step's messages, grouped by normalised topic in sorted order. */
export function normaliseStep(
    messages: readonly RawMessage[],
    names: NodeNames
): StepRecord {
    const byTopic = new Map<string, unknown[]>()
    for (const message of messages) {
        if (!isRecordedTopic(message.topic, message.payload)) continue
        const topic = renameNodeId(message.topic, names)
        const value = normalisePayload(message.topic, message.payload, names)
        const values = byTopic.get(topic) ?? []
        const last = values.at(-1)
        if (
            collapses(topic) &&
            values.length > 0 &&
            JSON.stringify(last) === JSON.stringify(value)
        ) {
            continue
        }
        values.push(value)
        byTopic.set(topic, values)
    }
    const record: StepRecord = {}
    for (const topic of [...byTopic.keys()].sort()) {
        record[topic] = byTopic.get(topic) ?? []
    }
    return record
}
