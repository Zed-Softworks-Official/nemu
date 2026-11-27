/**
 * Reads the node IDs out of the Rust adapter's fabric file,
 * `controller-state.bin`. The `matter-controller` crate (0.7) wrote it as one
 * Matter TLV structure:
 *
 * ```text
 * root:   Structure { C0: version, C1: Array[fabric] }
 * fabric: Structure { ..., C5: Array[device], ... }
 * device: Structure { C0: node_id, ... }
 * ```
 *
 * Only the Device node IDs are read. The file also holds the old fabric's
 * private keys; nothing else here is kept or logged.
 */

/** A decoded TLV element: its context tag (if any) and value. */
interface Element {
    tag: number | undefined
    value: Value
}
type Value = bigint | number | boolean | string | Uint8Array | null | Element[]

const END = Symbol('end')

class Reader {
    #at = 0
    constructor(private readonly bytes: Uint8Array) {}

    element(): Element | typeof END {
        const control = this.#byte()
        const type = control & 0x1f
        if (type === 0x18) return END
        const tag = this.#tag(control >> 5)
        return { tag, value: this.#value(type) }
    }

    #tag(control: number): number | undefined {
        switch (control) {
            case 0:
                return undefined
            case 1:
                return this.#byte()
            case 2:
            case 4:
                this.#skip(2)
                return undefined
            case 3:
            case 5:
                this.#skip(4)
                return undefined
            case 6:
                this.#skip(6)
                return undefined
            default:
                this.#skip(8)
                return undefined
        }
    }

    #value(type: number): Value {
        if (type <= 0x03) return this.#int(1 << type, true)
        if (type <= 0x07) return this.#int(1 << (type - 0x04), false)
        if (type === 0x08) return false
        if (type === 0x09) return true
        if (type === 0x0a) {
            this.#skip(4)
            return 0
        }
        if (type === 0x0b) {
            this.#skip(8)
            return 0
        }
        if (type <= 0x13) {
            const lengthBytes = 1 << ((type - 0x0c) & 0x03)
            const length = Number(this.#int(lengthBytes, false))
            const body = this.bytes.subarray(this.#at, this.#at + length)
            if (body.length !== length) throw new Error('truncated TLV')
            this.#at += length
            return type <= 0x0f ? new TextDecoder().decode(body) : body
        }
        if (type === 0x14) return null
        if (type <= 0x17) {
            const members: Element[] = []
            for (;;) {
                const member = this.element()
                if (member === END) return members
                members.push(member)
            }
        }
        throw new Error(`unknown TLV element type ${type}`)
    }

    #int(size: number, signed: boolean): bigint {
        if (this.#at + size > this.bytes.length)
            throw new Error('truncated TLV')
        let value = 0n
        for (let i = size - 1; i >= 0; i--)
            value = (value << 8n) | BigInt(this.bytes[this.#at + i] ?? 0)
        this.#at += size
        return signed ? BigInt.asIntN(size * 8, value) : value
    }

    #byte(): number {
        const byte = this.bytes[this.#at]
        if (byte === undefined) throw new Error('truncated TLV')
        this.#at += 1
        return byte
    }

    #skip(count: number): void {
        if (this.#at + count > this.bytes.length)
            throw new Error('truncated TLV')
        this.#at += count
    }
}

function member(container: Value, tag: number): Value | undefined {
    if (!Array.isArray(container)) return undefined
    return container.find((element) => element.tag === tag)?.value
}

/**
 * The node IDs of every Device on every fabric in the file, as decimal
 * strings. Throws on a file that isn't this TLV layout.
 */
export function rustFabricNodeIds(bytes: Uint8Array): string[] {
    const reader = new Reader(bytes)
    const root = reader.element()
    if (root === END || !Array.isArray(root.value))
        throw new Error('not a matter-controller snapshot')
    const fabrics = member(root.value, 1)
    if (!Array.isArray(fabrics))
        throw new Error('not a matter-controller snapshot')
    const ids: string[] = []
    for (const fabric of fabrics) {
        const devices = member(fabric.value, 5)
        if (!Array.isArray(devices)) continue
        for (const device of devices) {
            const nodeId = member(device.value, 0)
            if (typeof nodeId === 'bigint') ids.push(nodeId.toString())
        }
    }
    return ids
}
