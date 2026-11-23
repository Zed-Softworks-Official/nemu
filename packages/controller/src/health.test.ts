import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { ApiError, type Device } from '@nemu/protocol'
import { ControllerConnection } from './connection.ts'
import {
    createMemoryCredentialStore,
    FakeController,
    fakeControllerConnectors,
} from './testing.ts'

const connections: ControllerConnection[] = []

afterEach(() => {
    for (const connection of connections.splice(0)) connection.stop()
})

function device(id: string, online: boolean): Device {
    return { id, name: id, type: 'light', online, state: undefined }
}

async function connected(via: 'lan' | 'relay', home: FakeController) {
    home.lanReachable = via === 'lan'
    const connection = new ControllerConnection({
        controllerId: home.controllerId,
        reprobeIntervalMs: 60_000,
        credentialStore: createMemoryCredentialStore({
            [home.controllerId]: { clientToken: 'token-a' },
        }),
        lanCandidates: [home.baseUrl],
        connectors: fakeControllerConnectors(home),
    })
    connections.push(connection)
    await connection.start()
    assert.equal(connection.getStatus().mode, via)
    return connection
}

function home() {
    return new FakeController({
        controllerId: 'home-a',
        acceptedTokens: ['token-a'],
        devices: [device('lamp', true), device('plug', false)],
    })
}

for (const via of ['lan', 'relay'] as const) {
    describe(`Controller health summary over ${via}`, () => {
        it('gives an Owner service, Device, and Controller details', async () => {
            const controller = home()
            controller.health.relayConnected = false
            const connection = await connected(via, controller)
            assert.deepEqual(await connection.getHealthSummary(), {
                view: 'owner',
                status: 'ok',
                services: { mqtt: true, zigbee: true, matter: true },
                devices: { online: 1, total: 2 },
                controller: { database: true, relayConnected: false },
            })
            assert.deepEqual(controller.healthRequests, [via])
        })

        it('gives a Member only service and Device availability', async () => {
            const controller = home()
            controller.role = 'member'
            controller.health.mqtt = false
            const connection = await connected(via, controller)
            assert.deepEqual(await connection.getHealthSummary(), {
                view: 'member',
                status: 'degraded',
                services: { mqtt: false, zigbee: true, matter: true },
                devices: { online: 1, total: 2 },
            })
        })

        it('refuses an inactive Membership', async () => {
            const controller = home()
            const connection = await connected(via, controller)
            controller.membershipActive = false
            await assert.rejects(
                connection.getHealthSummary(),
                (error: unknown) =>
                    error instanceof ApiError &&
                    error.code === 'inactive_membership'
            )
        })
    })
}

describe('Controller health summary while unreachable', () => {
    it('is not available offline', async () => {
        const controller = home()
        const connection = await connected('lan', controller)
        controller.goOffline()
        await connection.reprobe()
        await assert.rejects(connection.getHealthSummary())
        assert.deepEqual(controller.healthRequests, [])
    })
})
