import { readMatterCode } from '~/lib/matter-code'

describe('readMatterCode', () => {
    it('accepts an 11-digit manual pairing code with or without separators', () => {
        expect(readMatterCode('34970112332')).toEqual({
            ok: true,
            code: '34970112332',
        })
        expect(readMatterCode(' 3497-011-2332 ')).toEqual({
            ok: true,
            code: '34970112332',
        })
    })

    it('rejects a manual code whose check digit is wrong', () => {
        expect(readMatterCode('34970112331')).toEqual({
            ok: false,
            problem: expect.stringMatching(/check/i),
        })
    })

    it('rejects manual codes of the wrong length', () => {
        expect(readMatterCode('3497011233')).toMatchObject({ ok: false })
        expect(readMatterCode('349701123321')).toMatchObject({ ok: false })
    })

    it('accepts a Matter QR payload as scanned', () => {
        expect(readMatterCode('MT:Y.K9042C00KA0648G00')).toEqual({
            ok: true,
            code: 'MT:Y.K9042C00KA0648G00',
        })
    })

    it('rejects QR codes that are not Matter codes', () => {
        expect(readMatterCode('https://example.com/setup')).toEqual({
            ok: false,
            problem: expect.stringMatching(/Matter/),
        })
        expect(readMatterCode('MT:abc')).toMatchObject({ ok: false })
    })

    it('treats an empty entry as no code yet', () => {
        expect(readMatterCode('  ')).toEqual({ ok: false, problem: null })
    })
})
