import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { ApiError, type UpdateStatusResponse } from '@nemu/protocol'
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

const INSTALLED: UpdateStatusResponse = {
    platformVersion: '2026.11.0',
    channel: 'stable',
    newerReleaseAvailable: true,
    maintenanceMode: false,
    rollbackSnapshotAvailable: false,
    rollbackStuck: false,
}

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

function home(role: 'owner' | 'member') {
    const controller = new FakeController({
        controllerId: 'home-a',
        acceptedAccessClients: ['client-a'],
        role,
    })
    controller.releaseStatus = structuredClone(INSTALLED)
    return controller
}

for (const via of ['lan', 'relay'] as const) {
    describe(`Release status over ${via}`, () => {
        for (const role of ['owner', 'member'] as const) {
            it(`is readable by an active ${role}`, async () => {
                const controller = home(role)
                const connection = await connected(via, controller)
                assert.deepEqual(await connection.getReleaseStatus(), INSTALLED)
                assert.deepEqual(controller.releaseStatusRequests, [via])
            })
        }

        it('refuses an inactive Membership', async () => {
            const controller = home('owner')
            const connection = await connected(via, controller)
            controller.membershipActive = false
            await assert.rejects(
                connection.getReleaseStatus(),
                (error: unknown) =>
                    error instanceof ApiError &&
                    error.code === 'inactive_membership'
            )
            assert.deepEqual(controller.releaseStatusRequests, [])
        })

        it('reports an unavailable Updater', async () => {
            const controller = home('member')
            controller.releaseStatus = null
            const connection = await connected(via, controller)
            await assert.rejects(
                connection.getReleaseStatus(),
                (error: unknown) =>
                    error instanceof ApiError &&
                    error.code === 'updater_unavailable'
            )
        })
    })
}
