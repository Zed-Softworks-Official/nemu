import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ManualPairingCodeCodec } from '@matter/main/types'
import { decodePairingCode, PairingCodeError } from './session.ts'

describe('decodePairingCode', () => {
    it('decodes a manual pairing code with dashes', () => {
        assert.deepEqual(decodePairingCode('3497-011-2332'), {
            passcode: 20202021,
            shortDiscriminator: 15,
        })
    })

    it('accepts any discriminator, not only multiples of 256', () => {
        const code = ManualPairingCodeCodec.encode({
            discriminator: 3841,
            passcode: 20202021,
        })
        assert.deepEqual(decodePairingCode(code), {
            passcode: 20202021,
            shortDiscriminator: 15,
        })
    })

    it('decodes a QR payload to its full discriminator', () => {
        assert.deepEqual(decodePairingCode('MT:-24J0AFN00KA0648G00'), {
            passcode: 20202021,
            longDiscriminator: 3840,
        })
    })

    it('refuses anything else', () => {
        assert.throws(() => decodePairingCode('hello'), PairingCodeError)
        assert.throws(() => decodePairingCode('1234'), PairingCodeError)
    })
})
