import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { toJson } from './values.ts'

describe('toJson', () => {
    it('turns small bigints into numbers and large ones into decimal strings', () => {
        assert.equal(toJson(12n), 12)
        assert.equal(toJson(18446744073709551615n), '18446744073709551615')
    })

    it('turns octet strings into hex', () => {
        assert.equal(toJson(new Uint8Array([0x0a, 0xff])), '0aff')
    })

    it('converts structs and lists deeply and drops absent fields', () => {
        assert.deepEqual(
            toJson({
                deviceTypeList: [
                    { deviceType: 266, revision: 5n, extra: undefined },
                ],
            }),
            { deviceTypeList: [{ deviceType: 266, revision: 5 }] }
        )
    })

    it('keeps null', () => {
        assert.equal(toJson(null), null)
    })
})
