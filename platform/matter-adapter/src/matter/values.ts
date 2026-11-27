/**
 * Matter attribute values as JSON, the form an attribute snapshot holds:
 * integers that fit as numbers (larger ones as decimal strings), octet strings
 * as lowercase hex, structs and bitmaps as plain objects.
 */
export function toJson(value: unknown): unknown {
    if (value === null || value === undefined) return value ?? null
    if (typeof value === 'bigint')
        return value <= BigInt(Number.MAX_SAFE_INTEGER) &&
            value >= BigInt(Number.MIN_SAFE_INTEGER)
            ? Number(value)
            : value.toString()
    if (value instanceof Uint8Array) return Buffer.from(value).toString('hex')
    if (value instanceof ArrayBuffer)
        return Buffer.from(new Uint8Array(value)).toString('hex')
    if (Array.isArray(value)) return value.map(toJson)
    if (typeof value === 'object') {
        const out: Record<string, unknown> = {}
        for (const [key, field] of Object.entries(value)) {
            if (field !== undefined) out[key] = toJson(field)
        }
        return out
    }
    return value
}
