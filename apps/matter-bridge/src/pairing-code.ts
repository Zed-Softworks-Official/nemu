/**
 * Decode a Matter onboarding payload far enough to get the setup passcode
 * (needed for `commission_on_network` after BLE Wi-Fi join).
 *
 * Manual codes: Matter Core Spec §5.1.4.1 (11 or 21 digits, Verhoeff check).
 * QR: §5.1.3 (`MT:` + base38 bit-packed fields).
 */

const VERHOEFF_D = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
    [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
    [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
    [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
    [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
    [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
    [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
    [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
    [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
] as const

const VERHOEFF_P = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
    [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
    [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
    [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
    [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
    [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
    [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
] as const

const BASE38 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-.'

export type ParsedPairingCode = {
    passcode: number
    /** 12-bit long discriminator when the QR payload has it. */
    longDiscriminator?: number
    /** 4-bit short discriminator (manual codes and QR). */
    shortDiscriminator?: number
}

export function parsePairingCode(code: string): ParsedPairingCode | undefined {
    const trimmed = code.trim()
    if (trimmed.toUpperCase().startsWith('MT:')) {
        return parseQr(trimmed)
    }
    const digits = trimmed.replace(/[\s-]/g, '')
    if (/^\d{11}$/.test(digits) || /^\d{21}$/.test(digits)) {
        return parseManual(digits)
    }
    return undefined
}

function parseManual(digits: string): ParsedPairingCode | undefined {
    if (!verhoeffValid(digits)) return undefined
    const digit1 = Number(digits[0])
    const chunk2 = Number.parseInt(digits.slice(1, 6), 10)
    const chunk3 = Number.parseInt(digits.slice(6, 10), 10)
    if (
        !Number.isInteger(digit1) ||
        !Number.isInteger(chunk2) ||
        !Number.isInteger(chunk3)
    ) {
        return undefined
    }
    const shortDiscriminator = ((digit1 & 0x03) << 2) | ((chunk2 >> 14) & 0x03)
    const passcode = (chunk3 << 14) | (chunk2 & 0x3fff)
    if (passcode < 1 || passcode > 99_999_998) return undefined
    return { passcode, shortDiscriminator }
}

function parseQr(code: string): ParsedPairingCode | undefined {
    const body = code.replace(/^MT:/i, '')
    const bytes = decodeBase38(body)
    if (bytes === undefined || bytes.length < 11) return undefined
    const longDiscriminator = unpackBits(bytes, 45, 12)
    const passcode = unpackBits(bytes, 57, 27)
    if (passcode < 1 || passcode > 99_999_998) return undefined
    return {
        passcode,
        longDiscriminator,
        shortDiscriminator: (longDiscriminator >> 8) & 0x0f,
    }
}

function verhoeffValid(digits: string): boolean {
    let checksum = 0
    const chars = [...digits].reverse()
    for (let i = 0; i < chars.length; i++) {
        const digit = Number(chars[i])
        if (!Number.isInteger(digit) || digit < 0 || digit > 9) return false
        const row = VERHOEFF_D[checksum]
        const perm = VERHOEFF_P[i % 8]
        if (row === undefined || perm === undefined) return false
        checksum = row[perm[digit] ?? 0] ?? 0
    }
    return checksum === 0
}

function decodeBase38(encoded: string): Uint8Array | undefined {
    const length = encoded.length
    const remainder = length % 5
    if (remainder !== 0 && remainder !== 2 && remainder !== 4) return undefined
    let decodeLength = ((length - remainder) / 5) * 3
    if (remainder === 4) decodeLength += 2
    if (remainder === 2) decodeLength += 1
    const result = new Uint8Array(decodeLength)
    let decodedOffset = 0
    let encodedOffset = 0
    while (encodedOffset < length) {
        const remaining = length - encodedOffset
        if (remaining > 5) {
            const value = decodeBase38Chunk(encoded, encodedOffset, 5)
            if (value === undefined) return undefined
            result[decodedOffset] = value & 0xff
            result[decodedOffset + 1] = (value >> 8) & 0xff
            result[decodedOffset + 2] = (value >> 16) & 0xff
            decodedOffset += 3
            encodedOffset += 5
        } else if (remaining === 4) {
            const value = decodeBase38Chunk(encoded, encodedOffset, 4)
            if (value === undefined) return undefined
            result[decodedOffset] = value & 0xff
            result[decodedOffset + 1] = (value >> 8) & 0xff
            break
        } else {
            const value = decodeBase38Chunk(encoded, encodedOffset, 2)
            if (value === undefined) return undefined
            result[decodedOffset] = value & 0xff
            break
        }
    }
    return result
}

function decodeBase38Chunk(
    encoded: string,
    offset: number,
    charCount: number
): number | undefined {
    let result = 0
    for (let i = charCount - 1; i >= 0; i--) {
        const char = encoded[offset + i]
        if (char === undefined) return undefined
        const code = BASE38.indexOf(char)
        if (code < 0) return undefined
        result = result * 38 + code
    }
    return result
}

function unpackBits(
    bytes: Uint8Array,
    bitOffset: number,
    bitLength: number
): number {
    let byteOffset = Math.floor(bitOffset / 8)
    let bitOffsetInByte = bitOffset % 8
    const mask = (1n << BigInt(bitLength)) - 1n
    let value = 0n
    let valueBitOffset = 0n
    let tempMask = mask
    while (tempMask !== 0n && byteOffset < bytes.length) {
        const byte = BigInt(bytes[byteOffset] ?? 0)
        value |=
            ((byte >> BigInt(bitOffsetInByte)) & tempMask) << valueBitOffset
        const bitsRead = 8 - bitOffsetInByte
        bitOffsetInByte = 0
        valueBitOffset += BigInt(bitsRead)
        tempMask >>= BigInt(bitsRead)
        byteOffset += 1
    }
    return Number(value & mask)
}

/** Encode an 11-digit manual code (for tests). */
export function encodeManualCode(
    discriminator: number,
    passcode: number
): string {
    const digit1 = (discriminator >> 10) & 0x03
    const part2 = ((discriminator & 0x300) << 6) | (passcode & 0x3fff)
    const part3 = passcode >> 14
    const body = `${digit1}${String(part2).padStart(5, '0')}${String(part3).padStart(4, '0')}`
    return body + String(verhoeffCheckDigit(body))
}

function verhoeffCheckDigit(num: string): number {
    let checksum = 0
    const chars = [...num].reverse()
    for (let i = 0; i < chars.length; i++) {
        const digit = Number(chars[i])
        const row = VERHOEFF_D[checksum]
        const perm = VERHOEFF_P[(i + 1) % 8]
        if (row === undefined || perm === undefined) return 0
        checksum = row[perm[digit] ?? 0] ?? 0
    }
    const inverse = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9]
    return inverse[checksum] ?? 0
}
