/** Reading values out of an attribute snapshot. */
import { type AttributeSnapshot, attributeKey } from '../attributes.ts'
import {
    ATTR_DEVICE_TYPE_LIST,
    CLUSTER_DESCRIPTOR,
    CLUSTER_ELECTRICAL_ENERGY,
    CLUSTER_ELECTRICAL_POWER,
} from './clusters.ts'

export function attr(
    snapshot: AttributeSnapshot,
    endpoint: number,
    cluster: number,
    attribute: number
): unknown {
    return snapshot[attributeKey(endpoint, cluster, attribute)]
}

/** A struct field by field ID (`"0"`) or by one of its names. */
export function structField(
    value: unknown,
    fieldId: number,
    names: readonly string[]
): unknown {
    if (value === null || typeof value !== 'object' || Array.isArray(value))
        return undefined
    const record = value as Record<string, unknown>
    if (String(fieldId) in record) return record[String(fieldId)]
    for (const name of names) if (name in record) return record[name]
    return undefined
}

export function asNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value)
        ? value
        : undefined
}

export function asText(value: unknown): string | undefined {
    return typeof value === 'string' ? value.trim() : undefined
}

/** Every endpoint other than the root, ascending. */
export function listEndpoints(snapshot: AttributeSnapshot): number[] {
    const endpoints = new Set<number>()
    for (const key of Object.keys(snapshot)) {
        const endpoint = Number(key.split('/')[0])
        if (Number.isInteger(endpoint) && endpoint > 0) endpoints.add(endpoint)
    }
    return [...endpoints].sort((a, b) => a - b)
}

export function deviceTypesOf(
    snapshot: AttributeSnapshot,
    endpoint: number
): number[] {
    const list = attr(
        snapshot,
        endpoint,
        CLUSTER_DESCRIPTOR,
        ATTR_DEVICE_TYPE_LIST
    )
    if (!Array.isArray(list)) return []
    return list.flatMap((entry) => {
        const id = asNumber(structField(entry, 0, ['deviceType', 'type']))
        return id === undefined ? [] : [id]
    })
}

export function hasCluster(
    snapshot: AttributeSnapshot,
    endpoint: number,
    cluster: number
): boolean {
    const prefix = `${endpoint}/${cluster}/`
    return Object.keys(snapshot).some((key) => key.startsWith(prefix))
}

export function hasEnergyMeasurement(
    snapshot: AttributeSnapshot,
    endpoint: number
): boolean {
    return (
        hasCluster(snapshot, endpoint, CLUSTER_ELECTRICAL_POWER) ||
        hasCluster(snapshot, endpoint, CLUSTER_ELECTRICAL_ENERGY)
    )
}
