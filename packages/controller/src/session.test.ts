import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { ApiError } from '@nemu/protocol'
import { ControllerConnection } from './connection.ts'
import {
    FakeController,
    fakeAccessClientKeyStore,
    fakeControllerConnectors,
} from './testing.ts'

const connections: ControllerConnection[] = []

afterEach(() => {
    for (const connection of connections.splice(0)) connection.stop()
})

async function connected(via: 'lan' | 'relay', home: FakeController) {
    home.lanReachable = via === 'lan'
    const connection = new ControllerConnection({
        controllerId: home.controllerId,
        reprobeIntervalMs: 60_000,
        accessClientKeyStore: fakeAccessClientKeyStore({
            [home.controllerId]: 'client-a',
        }),
        lanCandidates: [home.baseUrl],
        connectors: fakeControllerConnectors(home),
    })
    connections.push(connection)
    await connection.start()
    assert.equal(connection.getStatus().mode, via)
    return connection
}

function home(role?: 'owner' | 'member') {
    return new FakeController({
        controllerId: 'home-a',
        acceptedAccessClients: ['client-a'],
        ...(role ? { role } : {}),
    })
}

for (const via of ['lan', 'relay'] as const) {
    describe(`Role in the session over ${via}`, () => {
        it('reports an Owner', async () => {
            const connection = await connected(via, home('owner'))
            assert.deepEqual(await connection.getSession(), { role: 'owner' })
        })

        it('reports a Member', async () => {
            const connection = await connected(via, home('member'))
            assert.deepEqual(await connection.getSession(), {
                role: 'member',
            })
        })

        it('defaults to a Member so Owner-only actions stay hidden', async () => {
            const connection = await connected(via, home())
            assert.deepEqual(await connection.getSession(), {
                role: 'member',
            })
        })

        it('follows a role change on the Controller', async () => {
            const controller = home('member')
            const connection = await connected(via, controller)
            controller.role = 'owner'
            assert.deepEqual(await connection.getSession(), { role: 'owner' })
        })

        it('refuses an inactive Membership', async () => {
            const controller = home('owner')
            const connection = await connected(via, controller)
            controller.membershipActive = false
            await assert.rejects(
                connection.getSession(),
                (error: unknown) =>
                    error instanceof ApiError &&
                    error.code === 'inactive_membership'
            )
        })
    })
}

describe('Role in the session while offline', () => {
    it('is unavailable without a live transport', async () => {
        const controller = home('owner')
        controller.lanReachable = false
        controller.relayReachable = false
        const connection = new ControllerConnection({
            controllerId: 'home-a',
            reprobeIntervalMs: 60_000,
            accessClientKeyStore: fakeAccessClientKeyStore({
                'home-a': 'client-a',
            }),
            lanCandidates: [controller.baseUrl],
            connectors: fakeControllerConnectors(controller),
        })
        connections.push(connection)
        await connection.start()
        assert.equal(connection.getStatus().mode, 'offline')
        await assert.rejects(connection.getSession())
    })
})
