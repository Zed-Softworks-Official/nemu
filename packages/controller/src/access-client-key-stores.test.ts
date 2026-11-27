// Credential stores for Access Client keys (NEM-130): the byte store mobile
// puts in the operating system's key store, the dashboard's Web Crypto store,
// and staging for one pairing run.

import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { ApiError } from '@nemu/protocol'
import {
    ed25519PublicKey,
    ed25519Verify,
    utf8Encode,
    x25519PublicKey,
} from '@nemu/protocol/relay-crypto'
import {
    type AccessClientEnrollment,
    type AccessClientKeyStore,
    type AccessClientSecretStorage,
    createMemoryAccessClientKeyStore,
    createSecretAccessClientKeyStore,
    serializeEnrollment,
    stageAccessClientKeys,
} from './access-client-keys.ts'
import { FakeLanController } from './fake-lan-controller.ts'
import { LocalSession } from './local-session.ts'
import { pairWithController } from './pairing.ts'
import { LanTransport } from './transports/lan.ts'
import {
    type AccessClientKeyDatabase,
    createWebAccessClientKeyStore,
    UNSUPPORTED_BROWSER_ERROR_CODE,
} from './web-access-client-keys.ts'

function enrollment(
    controllerId: string,
    extra: Partial<AccessClientEnrollment> = {}
): AccessClientEnrollment {
    return {
        controllerId,
        accessClientId: `ac-${controllerId}`,
        membershipId: `mem-${controllerId}`,
        grant: 'header.payload.signature',
        controllerSigningKey: ed25519PublicKey(new Uint8Array(32).fill(7)),
        controllerEncryptionKey: x25519PublicKey(new Uint8Array(32).fill(9)),
        ...extra,
    }
}

async function signs(store: AccessClientKeyStore, controllerId: string) {
    const record = await store.load(controllerId)
    assert.ok(record, 'record loads')
    const message = utf8Encode('nemu-local-session-v1')
    const signature = await record.keys.signer.sign(message)
    assert.equal(
        ed25519Verify(record.keys.signingKey, message, signature),
        true,
        'signs with the key it advertises'
    )
    return record
}

function memorySecrets(): AccessClientSecretStorage & {
    values: Map<string, string>
} {
    const values = new Map<string, string>()
    return {
        values,
        get: (id) => values.get(id) ?? null,
        set: (id, value) => {
            values.set(id, value)
        },
        delete: (id) => {
            values.delete(id)
        },
    }
}

/** IndexedDB keeps structured clones, which keep CryptoKeys opaque. */
function memoryDatabase(): AccessClientKeyDatabase & {
    values: Map<string, unknown>
} {
    const values = new Map<string, unknown>()
    return {
        values,
        get: async (id) =>
            values.has(id) ? structuredClone(values.get(id)) : undefined,
        put: async (id, value) => {
            values.set(id, structuredClone(value))
        },
        delete: async (id) => {
            values.delete(id)
        },
    }
}

describe('Secret Access Client key store (mobile)', () => {
    it('keeps keys and the enrollment per Home across restarts', async () => {
        const secrets = memorySecrets()
        const store = createSecretAccessClientKeyStore(secrets)
        const keys = await store.generate()
        assert.equal(await store.load('lake'), null, 'nothing kept yet')

        await store.save({ keys, enrollment: enrollment('lake') })

        const restarted = createSecretAccessClientKeyStore(secrets)
        const record = await signs(restarted, 'lake')
        assert.deepEqual(record.keys.signingKey, keys.signingKey)
        assert.deepEqual(record.keys.encryptionKey, keys.encryptionKey)
        assert.deepEqual(record.enrollment, enrollment('lake'))
        assert.equal(await restarted.load('city'), null)
    })

    it('saves a loaded record again with a new identity epoch', async () => {
        const secrets = memorySecrets()
        const first = createSecretAccessClientKeyStore(secrets)
        const keys = await first.generate()
        await first.save({ keys, enrollment: enrollment('lake') })

        const restarted = createSecretAccessClientKeyStore(secrets)
        const loaded = await restarted.load('lake')
        assert.ok(loaded)
        await restarted.save({
            keys: loaded.keys,
            enrollment: { ...loaded.enrollment, identityEpoch: 3 },
        })

        const again = await signs(
            createSecretAccessClientKeyStore(secrets),
            'lake'
        )
        assert.equal(again.enrollment.identityEpoch, 3)
    })

    it('treats a bearer-token credential, or anything malformed, as not paired', async () => {
        const secrets = memorySecrets()
        secrets.values.set(
            'lake',
            JSON.stringify({ clientToken: 'nemu_old', baseUrl: 'http://x' })
        )
        secrets.values.set('city', '{not json')
        secrets.values.set(
            'barn',
            JSON.stringify({ version: 1, signingSecret: 'short' })
        )
        const store = createSecretAccessClientKeyStore(secrets)

        assert.equal(await store.load('lake'), null)
        assert.equal(await store.load('city'), null)
        assert.equal(await store.load('barn'), null)
    })

    it('forgets one Home only', async () => {
        const secrets = memorySecrets()
        const store = createSecretAccessClientKeyStore(secrets)
        for (const id of ['lake', 'city']) {
            await store.save({
                keys: await store.generate(),
                enrollment: enrollment(id),
            })
        }

        await store.clear('lake')

        assert.equal(await store.load('lake'), null)
        await signs(store, 'city')
    })

    it('refuses keys it did not make', async () => {
        const store = createSecretAccessClientKeyStore(memorySecrets())
        const foreign = await createMemoryAccessClientKeyStore().generate()
        await assert.rejects(
            store.save({ keys: foreign, enrollment: enrollment('lake') }),
            /not generated by this store/
        )
    })
})

describe('Staged Access Client keys', () => {
    it('keeps nothing in the target until commit', async () => {
        const target = createMemoryAccessClientKeyStore()
        const staged = stageAccessClientKeys(target)
        const keys = await staged.store.generate()
        await staged.store.save({ keys, enrollment: enrollment('lake') })

        assert.equal(await target.load('lake'), null)
        assert.equal(staged.staged()?.enrollment.controllerId, 'lake')

        await staged.commit()
        assert.deepEqual(
            (await target.load('lake'))?.keys.signingKey,
            keys.signingKey
        )
    })
})

describe('Web Access Client key store (dashboard)', () => {
    it('keeps non-extractable keys in IndexedDB across page loads', async () => {
        const database = memoryDatabase()
        const persisted: string[] = []
        const storage = {
            persist: async () => {
                persisted.push('persist')
                return true
            },
        }
        const store = createWebAccessClientKeyStore({ database, storage })
        const keys = await store.generate()
        await store.save({ keys, enrollment: enrollment('lake') })

        const reloaded = createWebAccessClientKeyStore({ database, storage })
        const record = await signs(reloaded, 'lake')
        assert.deepEqual(record.keys.signingKey, keys.signingKey)
        assert.deepEqual(record.enrollment, enrollment('lake'))
        assert.deepEqual(persisted, ['persist'], 'asks for persistent storage')

        // What IndexedDB holds: CryptoKeys whose bytes nobody can export.
        const stored = database.values.get('lake') as Record<string, unknown>
        for (const field of ['signingPrivateKey', 'encryptionPrivateKey']) {
            const key = stored[field]
            assert.ok(key instanceof CryptoKey, `${field} is a CryptoKey`)
            assert.equal(key.extractable, false)
            await assert.rejects(crypto.subtle.exportKey('pkcs8', key))
        }
    })

    it('saves loaded keys again with a new identity epoch', async () => {
        const database = memoryDatabase()
        const store = createWebAccessClientKeyStore({ database, storage: null })
        await store.save({
            keys: await store.generate(),
            enrollment: enrollment('lake'),
        })
        const reloaded = createWebAccessClientKeyStore({
            database,
            storage: null,
        })
        const loaded = await reloaded.load('lake')
        assert.ok(loaded)

        await reloaded.save({
            keys: loaded.keys,
            enrollment: { ...loaded.enrollment, identityEpoch: 2 },
        })

        assert.equal(
            (await signs(reloaded, 'lake')).enrollment.identityEpoch,
            2
        )
    })

    it('refuses to make keys when Web Crypto lacks Ed25519 or X25519', async () => {
        const noEd25519 = {
            generateKey: async () => {
                throw new DOMException('Ed25519', 'NotSupportedError')
            },
        } as unknown as SubtleCrypto
        const noX25519 = {
            generateKey: async (algorithm: { name: string }) => {
                if (algorithm.name === 'X25519') {
                    throw new DOMException('X25519', 'NotSupportedError')
                }
                return crypto.subtle.generateKey(algorithm, false, [
                    'sign',
                    'verify',
                ])
            },
            exportKey: crypto.subtle.exportKey.bind(crypto.subtle),
        } as unknown as SubtleCrypto
        for (const subtle of [noEd25519, noX25519, null]) {
            const database = memoryDatabase()
            const store = createWebAccessClientKeyStore({
                database,
                subtle,
                storage: null,
            })

            assert.equal(await store.supported(), false)
            await assert.rejects(
                store.generate(),
                (err: unknown) =>
                    err instanceof ApiError &&
                    err.code === UNSUPPORTED_BROWSER_ERROR_CODE
            )
            assert.equal(database.values.size, 0)
        }
    })

    it('reports support on a browser with Web Crypto Ed25519 and X25519', async () => {
        const database = memoryDatabase()
        const store = createWebAccessClientKeyStore({ database, storage: null })
        assert.equal(await store.supported(), true)
        assert.equal(database.values.size, 0, 'the check stores nothing')
    })

    it('loads a record with key bytes from the old fallback as not paired, and clears it', async () => {
        const database = memoryDatabase()
        database.values.set('lake', {
            version: 1,
            protection: 'stored-bytes',
            signingPrivateKey: new Uint8Array(32).fill(1),
            encryptionPrivateKey: new Uint8Array(32).fill(2),
            signingKey: new Uint8Array(32).fill(3),
            encryptionKey: new Uint8Array(32).fill(4),
            enrollment: serializeEnrollment(enrollment('lake')),
        })
        const store = createWebAccessClientKeyStore({ database, storage: null })

        assert.equal(await store.load('lake'), null)
        assert.equal(database.values.has('lake'), false)
    })

    it('clears a Home, and loads a cleared or foreign record as not paired', async () => {
        const database = memoryDatabase()
        const store = createWebAccessClientKeyStore({ database, storage: null })
        await store.save({
            keys: await store.generate(),
            enrollment: enrollment('lake'),
        })
        database.values.set('city', { clientToken: 'nemu_old' })

        await store.clear('lake')

        assert.equal(await store.load('lake'), null)
        assert.equal(await store.load('city'), null)
    })
})

describe('Platform key stores with CPace pairing and Local sessions', () => {
    let lan: FakeLanController | undefined
    afterEach(() => {
        lan?.stop()
        lan = undefined
    })

    const stores: Array<[string, () => AccessClientKeyStore]> = [
        ['mobile', () => createSecretAccessClientKeyStore(memorySecrets())],
        [
            'dashboard',
            () =>
                createWebAccessClientKeyStore({
                    database: memoryDatabase(),
                    storage: null,
                }),
        ],
    ]
    for (const [platform, makeStore] of stores) {
        it(`pairs the ${platform} store and opens a Local session with its keys`, async () => {
            lan = await new FakeLanController({ code: '246810' }).start()
            const keyStore = makeStore()

            const { enrollment } = await pairWithController(lan.baseUrl, {
                code: '246810',
                clientLabel: platform,
                userId: 'user_1',
                email: 'owner@example.com',
                keyStore,
            })

            const transport = new LanTransport({
                baseUrl: lan.baseUrl,
                localSession: new LocalSession({
                    baseUrl: lan.baseUrl,
                    controllerId: enrollment.controllerId,
                    keyStore,
                }),
            })
            assert.deepEqual(await transport.getDevices(), [])
            assert.equal(lan.sessionCount(), 1)
        })
    }
})
