import { utf8Encode } from '@nemu/protocol/relay-crypto'
import * as SecureStore from 'expo-secure-store'

import {
    createSecureAccessClientKeyStore,
    createSecureCredentialStore,
} from '~/lib/secure-credential-store'

const reset = (SecureStore as unknown as { __reset: () => void }).__reset

function enrollment(controllerId: string) {
    return {
        controllerId,
        accessClientId: `ac-${controllerId}`,
        membershipId: 'membership',
        grant: 'h.p.s',
        controllerSigningKey: new Uint8Array(32).fill(3),
        controllerEncryptionKey: new Uint8Array(32).fill(4),
    }
}

beforeEach(() => reset())

describe('Access Client keys in the secure store', () => {
    it('keeps keys per Account and per Home', async () => {
        const alice = createSecureAccessClientKeyStore('user_alice')
        const keys = await alice.generate()
        await alice.save({ keys, enrollment: enrollment('lake') })

        const reopened = createSecureAccessClientKeyStore('user_alice')
        const record = await reopened.load('lake')
        expect(record?.enrollment.accessClientId).toBe('ac-lake')
        expect(record?.keys.signingKey).toEqual(keys.signingKey)
        const signature = await record?.keys.signer.sign(utf8Encode('hi'))
        expect(signature).toHaveLength(64)

        // Another Account on the same phone, or another Home, gets nothing.
        expect(
            await createSecureAccessClientKeyStore('user_bob').load('lake')
        ).toBeNull()
        expect(await reopened.load('city')).toBeNull()
    })

    it('treats a bearer-token credential as unpaired and removes it', async () => {
        createSecureCredentialStore('user_alice').set('lake', {
            clientToken: 'nemu_old',
        })
        const store = createSecureAccessClientKeyStore('user_alice')

        expect(await store.load('lake')).toBeNull()
        await Promise.resolve()
        expect(createSecureCredentialStore('user_alice').get('lake')).toBeNull()
    })

    it('forgets one Home', async () => {
        const store = createSecureAccessClientKeyStore('user_alice')
        await store.save({
            keys: await store.generate(),
            enrollment: enrollment('lake'),
        })
        await store.save({
            keys: await store.generate(),
            enrollment: enrollment('city'),
        })

        await store.clear('lake')

        expect(await store.load('lake')).toBeNull()
        expect((await store.load('city'))?.enrollment.controllerId).toBe('city')
    })
})
