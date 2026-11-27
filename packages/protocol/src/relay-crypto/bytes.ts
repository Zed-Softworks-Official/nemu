// Byte encodings shared by every Relay crypto module. These are hand-written
// so they run on Hermes without TextDecoder, Buffer or atob.

/** Largest integer both Rust and JavaScript represent exactly. */
export const MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER

export function concatBytes(...parts: Uint8Array[]): Uint8Array {
    let length = 0
    for (const part of parts) length += part.length
    const out = new Uint8Array(length)
    let offset = 0
    for (const part of parts) {
        out.set(part, offset)
        offset += part.length
    }
    return out
}

/** Constant-time for equal lengths. */
export function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false
    let diff = 0
    for (let i = 0; i < a.length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0)
    return diff === 0
}

/** draft-irtf-cfrg-cpace `prepend_len`: LEB128 length, then the data. */
export function prependLen(data: Uint8Array): Uint8Array {
    const prefix: number[] = []
    let length = data.length
    do {
        prefix.push(length < 128 ? length : (length & 0x7f) | 0x80)
        length = Math.floor(length / 128)
    } while (length > 0)
    return concatBytes(Uint8Array.from(prefix), data)
}

/** draft-irtf-cfrg-cpace `lv_cat`. */
export function lvCat(...parts: Uint8Array[]): Uint8Array {
    return concatBytes(...parts.map(prependLen))
}

/** Splits an `lv_cat` encoding back into its parts, or `null`. */
export function lvSplit(data: Uint8Array): Uint8Array[] | null {
    const parts: Uint8Array[] = []
    let offset = 0
    while (offset < data.length) {
        let length = 0
        let multiplier = 1
        for (;;) {
            const byte = data[offset]
            if (byte === undefined) return null
            offset++
            length += (byte & 0x7f) * multiplier
            if ((byte & 0x80) === 0) break
            multiplier *= 128
            if (multiplier > 2 ** 21) return null
        }
        if (offset + length > data.length) return null
        parts.push(data.subarray(offset, offset + length))
        offset += length
    }
    return parts
}

export function u64be(value: number): Uint8Array {
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new RangeError('expected a non-negative safe integer')
    }
    const out = new Uint8Array(8)
    let rest = value
    for (let i = 7; i >= 0; i--) {
        out[i] = rest % 256
        rest = Math.floor(rest / 256)
    }
    return out
}

export function utf8Encode(text: string): Uint8Array {
    const out: number[] = []
    for (const char of text) {
        const code = char.codePointAt(0) ?? 0
        if (code >= 0xd800 && code <= 0xdfff) {
            throw new TypeError('lone surrogate in string')
        }
        if (code < 0x80) {
            out.push(code)
        } else if (code < 0x800) {
            out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f))
        } else if (code < 0x10000) {
            out.push(
                0xe0 | (code >> 12),
                0x80 | ((code >> 6) & 0x3f),
                0x80 | (code & 0x3f)
            )
        } else {
            out.push(
                0xf0 | (code >> 18),
                0x80 | ((code >> 12) & 0x3f),
                0x80 | ((code >> 6) & 0x3f),
                0x80 | (code & 0x3f)
            )
        }
    }
    return Uint8Array.from(out)
}

/** Strict UTF-8 decoding; returns `null` for invalid input. */
export function utf8Decode(bytes: Uint8Array): string | null {
    let text = ''
    let i = 0
    while (i < bytes.length) {
        const b0 = bytes[i] ?? 0
        let code: number
        let size: number
        let min: number
        if (b0 < 0x80) {
            code = b0
            size = 1
            min = 0
        } else if ((b0 & 0xe0) === 0xc0) {
            code = b0 & 0x1f
            size = 2
            min = 0x80
        } else if ((b0 & 0xf0) === 0xe0) {
            code = b0 & 0x0f
            size = 3
            min = 0x800
        } else if ((b0 & 0xf8) === 0xf0) {
            code = b0 & 0x07
            size = 4
            min = 0x10000
        } else {
            return null
        }
        if (i + size > bytes.length) return null
        for (let j = 1; j < size; j++) {
            const b = bytes[i + j] ?? 0
            if ((b & 0xc0) !== 0x80) return null
            code = (code << 6) | (b & 0x3f)
        }
        if (
            code < min ||
            code > 0x10ffff ||
            (code >= 0xd800 && code <= 0xdfff)
        ) {
            return null
        }
        text += String.fromCodePoint(code)
        i += size
    }
    return text
}

const B64URL =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
const B64URL_INDEX = new Map([...B64URL].map((char, index) => [char, index]))

/** Unpadded base64url. */
export function b64urlEncode(bytes: Uint8Array): string {
    let out = ''
    for (let i = 0; i < bytes.length; i += 3) {
        const b0 = bytes[i] ?? 0
        const b1 = bytes[i + 1] ?? 0
        const b2 = bytes[i + 2] ?? 0
        const n = (b0 << 16) | (b1 << 8) | b2
        const chars = Math.min(4, Math.ceil(((bytes.length - i) * 8) / 6))
        for (let j = 0; j < chars; j++) {
            out += B64URL[(n >> (18 - 6 * j)) & 0x3f]
        }
    }
    return out
}

/**
 * Strict unpadded base64url: rejects padding, other alphabets and
 * non-canonical trailing bits. Returns `null` on any of them.
 */
export function b64urlDecode(text: string): Uint8Array | null {
    if (text.length % 4 === 1) return null
    const out = new Uint8Array(Math.floor((text.length * 6) / 8))
    let buffer = 0
    let bits = 0
    let offset = 0
    for (const char of text) {
        const value = B64URL_INDEX.get(char)
        if (value === undefined) return null
        buffer = ((buffer << 6) | value) & 0xffffff
        bits += 6
        if (bits >= 8) {
            bits -= 8
            out[offset++] = (buffer >> bits) & 0xff
        }
    }
    if ((buffer & ((1 << bits) - 1)) !== 0) return null
    return out
}

export function b64urlDecodeLength(
    text: string,
    length: number
): Uint8Array | null {
    const bytes = b64urlDecode(text)
    return bytes !== null && bytes.length === length ? bytes : null
}

export function hexEncode(bytes: Uint8Array): string {
    let out = ''
    for (const byte of bytes) out += byte.toString(16).padStart(2, '0')
    return out
}

export function hexDecode(text: string): Uint8Array {
    if (text.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(text)) {
        throw new TypeError('invalid hex')
    }
    const out = new Uint8Array(text.length / 2)
    for (let i = 0; i < out.length; i++) {
        out[i] = Number.parseInt(text.slice(i * 2, i * 2 + 2), 16)
    }
    return out
}
