// ControllerConnection with an Access Client key store (NEM-130, NEM-131):
// it authorizes with keys only and reports when this client must pair again
// at home.

import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { ApiError } from '@nemu/protocol'
import {
    BEARER_TOKEN_RETIRED_ERROR_CODE,
    type PairAgainReason,
} from './access-client-keys.ts'
import { ControllerConnection } from './connection.ts'
import {
    createMemoryAccessClientKeyStore,
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
            controller.presentedAccessClientIds.at(-1),
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
            controller.presentedAccessClientIds.at(-1),
            record.enrollment.accessClientId
        )
    })

    it('asks to pair again on a retired bearer token, and keeps its keys', async () => {
        // Only an alpha build sends a bearer token, but the refusal still
        // reads as "pair again at home" (NEM-131). It says nothing about
        // these keys, so they stay.
        const controller = home()
        const keyStore = createMemoryAccessClientKeyStore()
        await pairFakeAccessClient(controller, keyStore)
        const fake = fakeControllerConnectors(controller)
        const connection = connect({
            controllerId: 'lake',
            accessClientKeyStore: keyStore,
            lanCandidates: [controller.baseUrl],
            connectors: {
                ...fake,
                createLanTransport(options) {
                    const transport = fake.createLanTransport(options)
                    transport.getDevices = async () => {
                        throw new ApiError(
                            BEARER_TOKEN_RETIRED_ERROR_CODE,
                            'Bearer tokens no longer work. Pair this device again at home.',
                            401
                        )
                    }
                    return transport
                },
            },
        })

        await connection.start()

        assert.deepEqual(connection.getPairingLoss(), {
            controllerId: 'lake',
            reason: 'bearer_token_retired',
        })
        assert.equal(connection.getStatus().mode, 'offline')
        assert.ok(await keyStore.load('lake'), 'keys kept')
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

            controller.revokeAccessClient(record.enrollment.accessClientId)
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
        controller.revokeAccessClient(record.enrollment.accessClientId)
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
        controller.revokeAccessClient(record.enrollment.accessClientId)
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
