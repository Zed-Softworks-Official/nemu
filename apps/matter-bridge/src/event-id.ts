export function nodeIdFromEventData(data: unknown): string | undefined {
    if (typeof data === 'number' || typeof data === 'bigint')
        return String(data)
    if (typeof data === 'string' && data.length > 0) return data
    if (typeof data !== 'object' || data === null) return undefined
    const record = data as Record<string, unknown>
    const raw = record.node_id ?? record.nodeId
    if (typeof raw === 'number' || typeof raw === 'bigint') return String(raw)
    if (typeof raw === 'string' && raw.length > 0) return raw
    return undefined
}
