/**
 * Read a Matter pairing code from a QR scan or typed entry. The phone only
 * checks the code's shape; the Controller decodes it and commissions the
 * Device (it remains the Matter commissioner and fabric authority).
 *
 * `problem` is null when nothing has been entered yet.
 */
export type MatterCodeReading =
    | { ok: true; code: string }
    | { ok: false; problem: string | null }

const QR_PAYLOAD = /^MT:[0-9A-Z.-]{19,}$/

export function readMatterCode(raw: string): MatterCodeReading {
    const entry = raw.trim()
    if (entry === '') return { ok: false, problem: null }

    if (/^MT:/i.test(entry)) {
        const payload = `MT:${entry.slice(3)}`
        return QR_PAYLOAD.test(payload)
            ? { ok: true, code: payload }
            : { ok: false, problem: 'This Matter QR code could not be read.' }
    }

    if (/[^\d\s-]/.test(entry)) {
        return {
            ok: false,
            problem:
                'This isn’t a Matter code. Use the Matter QR code or the 11-digit pairing code.',
        }
    }

    const digits = entry.replace(/\D/g, '')
    if (digits.length !== 11 && digits.length !== 21) {
        return {
            ok: false,
            problem: 'Matter pairing codes have 11 digits.',
        }
    }
    if (!verhoeffValid(digits)) {
        return {
            ok: false,
            problem:
                'This code doesn’t pass its check digit. Check each digit and try again.',
        }
    }
    return { ok: true, code: digits }
}

// Matter manual pairing codes end in a Verhoeff check digit.
const D = [
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
]
const P = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
    [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
    [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
    [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
    [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
    [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
    [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
]

function verhoeffValid(digits: string): boolean {
    let check = 0
    const reversed = [...digits].reverse()
    for (let i = 0; i < reversed.length; i++) {
        const digit = Number(reversed[i])
        check = D[check][P[i % 8][digit]]
    }
    return check === 0
}
