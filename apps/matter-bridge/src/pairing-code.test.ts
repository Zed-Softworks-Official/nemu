import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { encodeManualCode, parsePairingCode } from './pairing-code'

describe('parsePairingCode', () => {
    it('decodes the spec-style 11-digit example', () => {
        const code = encodeManualCode(0xf00, 20_202_021)
        assert.equal(code.length, 11)
        const parsed = parsePairingCode(code)
        assert.ok(parsed)
        assert.equal(parsed.passcode, 20_202_021)
        assert.equal(parsed.shortDiscriminator, 0x0f)
        assert.equal(parsed.longDiscriminator, undefined)
    })

    it('accepts hyphenated manual codes', () => {
        const code = encodeManualCode(0x200, 2020)
        const grouped = `${code.slice(0, 4)}-${code.slice(4, 7)}-${code.slice(7)}`
        const parsed = parsePairingCode(grouped)
        assert.ok(parsed)
        assert.equal(parsed.passcode, 2020)
    })

    it('rejects a bad check digit', () => {
        const code = encodeManualCode(0xf00, 20_202_021)
        const broken = `${code.slice(0, 10)}0`
        assert.equal(
            parsePairingCode(
                broken === code ? `${code.slice(0, 10)}1` : broken
            ),
            undefined
        )
    })
})
