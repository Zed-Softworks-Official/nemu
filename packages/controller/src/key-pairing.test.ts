// Seam 3 (NEM-63 spec): `pairWithController` with Access Client keys, against
// a LAN Controller that runs CPace over plain HTTP.

import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import {
    ed25519PublicKey,
    hexDecode,
    verifyGrant,
    x25519PublicKey,
} from '@nemu/protocol/relay-crypto'
import { createMemoryAccessClientKeyStore } from './access-client-keys.ts'
import { FakeLanController } from './fake-lan-controller.ts'
import { pairWithController } from './pairing.ts'

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

        const result = await pairWithController(lan.baseUrl, {
            ...identity,
            code: CODE,
            keyStore,
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

        // The code never goes over the wire, and nothing asks for a bearer token.
        assert.equal(JSON.stringify(lan.requests).includes(CODE), false)
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
                signingKey: ed25519PublicKey(
                    crypto.getRandomValues(new Uint8Array(32))
                ),
                encryptionKey: x25519PublicKey(
                    crypto.getRandomValues(new Uint8Array(32))
                ),
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

    // Rust's `verify_strict` and the clients must never disagree about a
    // key, so a small-order or torsion key is refused before it is pinned.
    const signingKey = ed25519PublicKey(new Uint8Array(32).fill(3))
    const encryptionKey = x25519PublicKey(new Uint8Array(32).fill(4))
    const weakKeys: Array<
        [string, { signingKey: Uint8Array; encryptionKey: Uint8Array }]
    > = [
        [
            'a small-order signing key',
            { signingKey: hexDecode(`01${'00'.repeat(31)}`), encryptionKey },
        ],
        [
            'a signing key of order 8',
            {
                signingKey: hexDecode(
                    'c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac037a'
                ),
                encryptionKey,
            },
        ],
        [
            'a small-order encryption key',
            { signingKey, encryptionKey: new Uint8Array(32) },
        ],
    ]
    for (const [name, weak] of weakKeys) {
        it(`refuses a Controller that pairs with ${name}`, async () => {
            const lan = await home({ advertisedKeys: weak })
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
            assert.ok(
                !lan.requests.some((r) => r.path.endsWith('/confirm')),
                'never confirms the exchange'
            )
        })
    }

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
