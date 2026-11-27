// Seam 3 (NEM-63 spec): `pairWithController` with Access Client keys, against
// a LAN Controller that runs CPace over plain HTTP.

import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { verifyGrant } from '@nemu/protocol/relay-crypto'
import { createMemoryAccessClientKeyStore } from './access-client-keys.ts'
import { FakeLanController } from './fake-lan-controller.ts'
import { pairWithController } from './pairing.ts'
import { createMemoryCredentialStore } from './storage.ts'

const CODE = '135790'

let controller: FakeLanController | undefined

afterEach(() => {
    controller?.stop()
    controller = undefined
})

async function home(
    options: ConstructorParameters<typeof FakeLanController>[0] = {}
) {
    controller = await new FakeLanController({ code: CODE, ...options }).start()
    return controller
}

const identity = {
    clientLabel: 'Kitchen phone',
    userId: 'user_1',
    email: 'owner@example.com',
}

describe('pairWithController with Access Client keys', () => {
    it('pairs with CPace and keeps the keys, the grant and the pinned Controller keys', async () => {
        const lan = await home()
        const keyStore = createMemoryAccessClientKeyStore()
        const credentialStore = createMemoryCredentialStore()

        const result = await pairWithController(lan.baseUrl, {
            ...identity,
            code: CODE,
            keyStore,
            credentialStore,
        })

        const record = await keyStore.load(lan.controllerId)
        assert.ok(record)
        assert.deepEqual(result.enrollment, record.enrollment)
        assert.deepEqual(record.enrollment.controllerSigningKey, lan.signingKey)
        assert.deepEqual(
            record.enrollment.controllerEncryptionKey,
            lan.encryptionKey
        )
        const grant = verifyGrant(
            record.enrollment.grant,
            lan.controllerId,
            lan.signingKey
        )
        assert.equal(grant.accessClientId, record.enrollment.accessClientId)
        assert.equal(grant.membershipId, record.enrollment.membershipId)
        assert.deepEqual(grant.signingKey, record.keys.signingKey)
        assert.deepEqual(grant.encryptionKey, record.keys.encryptionKey)

        // The code never goes over the wire, and no bearer token is stored.
        assert.equal(JSON.stringify(lan.requests).includes(CODE), false)
        assert.equal(credentialStore.get(lan.controllerId), null)
        assert.deepEqual(
            lan.requests.map(
                (r) =>
                    `${r.method} ${r.path.replace(/runs\/[^/]+/, 'runs/:id')}`
            ),
            [
                'GET /api/identify',
                'POST /api/pairing/runs',
                'POST /api/pairing/runs/:id/exchange',
                'POST /api/pairing/runs/:id/confirm',
            ]
        )
    })

    it('refuses a Controller that does not know the code, and keeps nothing', async () => {
        const lan = await home({ code: '000000' })
        const keyStore = createMemoryAccessClientKeyStore()

        await assert.rejects(
            pairWithController(lan.baseUrl, {
                ...identity,
                code: CODE,
                keyStore,
            }),
            { code: 'invalid_code' }
        )
        assert.equal(await keyStore.load(lan.controllerId), null)
        // It never sends its confirmation tag to a Controller it could not verify.
        assert.equal(
            lan.requests.some((r) => r.path.endsWith('/confirm')),
            false
        )
    })

    it('refuses a grant not signed by the key it pinned', async () => {
        const lan = await home({
            advertisedKeys: {
                signingKey: crypto.getRandomValues(new Uint8Array(32)),
                encryptionKey: crypto.getRandomValues(new Uint8Array(32)),
            },
        })
        const keyStore = createMemoryAccessClientKeyStore()

        await assert.rejects(
            pairWithController(lan.baseUrl, {
                ...identity,
                code: CODE,
                keyStore,
            }),
            { code: 'invalid_grant' }
        )
        assert.equal(await keyStore.load(lan.controllerId), null)
    })

    it('refuses a Controller of another Home before pairing', async () => {
        const lan = await home()
        await assert.rejects(
            pairWithController(lan.baseUrl, {
                ...identity,
                code: CODE,
                keyStore: createMemoryAccessClientKeyStore(),
                expectedControllerId: 'nemu_another_home',
            }),
            { code: 'wrong_home' }
        )
        assert.deepEqual(
            lan.requests.map((r) => r.path),
            ['/api/identify']
        )
    })

    it('keys a Recovery Key run by the Recovery Key', async () => {
        const recoveryKey = 'ABCD-EFGH-JKLM-NPQR'
        const lan = await home({ code: recoveryKey })
        const keyStore = createMemoryAccessClientKeyStore()

        await pairWithController(lan.baseUrl, {
            ...identity,
            code: recoveryKey,
            secret: 'recoveryKey',
            keyStore,
        })

        assert.deepEqual(lan.requests[1]?.body, { secret: 'recoveryKey' })
        assert.ok(await keyStore.load(lan.controllerId))
    })
})
