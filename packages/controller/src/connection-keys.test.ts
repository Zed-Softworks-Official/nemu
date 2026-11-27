// ControllerConnection with an Access Client key store (NEM-130): it
// authorizes with keys only, ignores bearer-token credentials, and reports
// when this client must pair again at home.

import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { ApiError } from '@nemu/protocol'
import type { PairAgainReason } from './access-client-keys.ts'
import { ControllerConnection } from './connection.ts'
import {
    createMemoryAccessClientKeyStore,
    createMemoryCredentialStore,
    FakeController,
    fakeControllerConnectors,
    pairFakeAccessClient,
} from './testing.ts'

const connections: ControllerConnection[] = []

function connect(
    options: ConstructorParameters<typeof ControllerConnection>[0]
): ControllerConnection {
    const connection = new ControllerConnection({
        reprobeIntervalMs: 60_000,
        relayApi: {} as never,
        ...options,
    })
    connections.push(connection)
    return connection
}

afterEach(() => {
    for (const connection of connections.splice(0)) connection.stop()
})

function home(
    options: Partial<ConstructorParameters<typeof FakeController>[0]> = {}
) {
    return new FakeController({
        controllerId: 'lake',
        baseUrl: 'https://lake.lan.nemu.sh:6368',
        ...options,
    })
}

describe('ControllerConnection with Access Client keys', () => {
    it('reaches the Home over LAN as its Access Client', async () => {
        const controller = home()
        const keyStore = createMemoryAccessClientKeyStore()
        const record = await pairFakeAccessClient(controller, keyStore)
        const connection = connect({
            controllerId: 'lake',
            accessClientKeyStore: keyStore,
            lanCandidates: [controller.baseUrl],
            connectors: fakeControllerConnectors(controller),
        })

        await connection.start()

        assert.equal(connection.getStatus().mode, 'lan')
        await connection.getDevices()
        assert.equal(
            controller.presentedTokens.at(-1),
            record.enrollment.accessClientId
        )
        assert.equal(connection.getPairingLoss(), null)
    })

    it('falls back to Relay with its keys when the Home is not on this network', async () => {
        const controller = home()
        const keyStore = createMemoryAccessClientKeyStore()
        const record = await pairFakeAccessClient(controller, keyStore)
        controller.lanReachable = false
        const connection = connect({
            controllerId: 'lake',
            accessClientKeyStore: keyStore,
            convex: {} as never,
            lanCandidates: [controller.baseUrl],
            connectors: fakeControllerConnectors(controller),
        })

        await connection.start()

        assert.equal(connection.getStatus().mode, 'relay')
        await connection.getDevices()
        assert.equal(
            controller.presentedTokens.at(-1),
            record.enrollment.accessClientId
        )
    })

    it('treats a stored bearer-token credential as unpaired', async () => {
        const controller = home({
            acceptedTokens: ['nemu_old'],
            lanReachable: false,
        })
        const connection = connect({
            controllerId: 'lake',
            accessClientKeyStore: createMemoryAccessClientKeyStore(),
            credentialStore: createMemoryCredentialStore({
                lake: { clientToken: 'nemu_old' },
            }),
            convex: {} as never,
            lanCandidates: [controller.baseUrl],
            connectors: fakeControllerConnectors(controller),
        })

        await connection.start()

        // Relay needs keys; the old token is never presented anywhere.
        assert.equal(connection.getStatus().mode, 'offline')
        assert.equal(controller.presentedTokens.includes('nemu_old'), false)
    })

    for (const revoked of ['lan', 'relay'] as const) {
        it(`asks to pair again at home when revoked, seen over ${revoked}`, async () => {
            const controller = home()
            const keyStore = createMemoryAccessClientKeyStore()
            const record = await pairFakeAccessClient(controller, keyStore)
            if (revoked === 'relay') controller.lanReachable = false
            const connection = connect({
                controllerId: 'lake',
                accessClientKeyStore: keyStore,
                convex: {} as never,
                lanCandidates: [controller.baseUrl],
                connectors: fakeControllerConnectors(controller),
            })
            await connection.start()
            assert.equal(connection.getStatus().mode, revoked)
            const losses: Array<PairAgainReason | null> = []
            connection.subscribePairingLoss((loss) =>
                losses.push(loss?.reason ?? null)
            )

            controller.revokeToken(record.enrollment.accessClientId)
            await assert.rejects(connection.getDevices(), (err: unknown) => {
                assert.ok(err instanceof ApiError)
                assert.equal(err.code, 'tombstoned_access_client')
                return true
            })

            assert.deepEqual(connection.getPairingLoss(), {
                controllerId: 'lake',
                reason: 'tombstoned_access_client',
            })
            assert.deepEqual(losses, [null, 'tombstoned_access_client'])
            assert.equal(await keyStore.load('lake'), null, 'keys forgotten')
            assert.equal(connection.getStatus().mode, 'offline')

            // It stays offline instead of retrying the other path.
            await connection.reprobe()
            assert.equal(connection.getStatus().mode, 'offline')
        })
    }

    it('recovers once the client has paired again', async () => {
        const controller = home()
        const keyStore = createMemoryAccessClientKeyStore()
        const record = await pairFakeAccessClient(controller, keyStore)
        const connection = connect({
            controllerId: 'lake',
            accessClientKeyStore: keyStore,
            lanCandidates: [controller.baseUrl],
            connectors: fakeControllerConnectors(controller),
        })
        await connection.start()
        controller.revokeToken(record.enrollment.accessClientId)
        await assert.rejects(connection.getDevices())
        assert.ok(connection.getPairingLoss())

        await pairFakeAccessClient(controller, keyStore)
        await connection.reprobe()

        assert.equal(connection.getPairingLoss(), null)
        assert.equal(connection.getStatus().mode, 'lan')
        await connection.getDevices()
    })

    it('notices a revocation when it reconnects', async () => {
        const controller = home()
        const keyStore = createMemoryAccessClientKeyStore()
        const record = await pairFakeAccessClient(controller, keyStore)
        controller.revokeToken(record.enrollment.accessClientId)
        const connection = connect({
            controllerId: 'lake',
            accessClientKeyStore: keyStore,
            convex: {} as never,
            lanCandidates: [controller.baseUrl],
            connectors: fakeControllerConnectors(controller),
        })

        await connection.start()

        assert.equal(
            connection.getPairingLoss()?.reason,
            'tombstoned_access_client'
        )
        assert.equal(connection.getStatus().mode, 'offline')
    })
})
