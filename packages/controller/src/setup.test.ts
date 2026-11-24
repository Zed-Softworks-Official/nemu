import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import type { Device } from '@nemu/protocol'
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

function lamp(): Device {
    return {
        id: 'lamp',
        name: 'Lamp',
        type: 'light',
        online: true,
        roomId: 'den',
        state: undefined,
    }
}

async function connected(
    via: 'lan' | 'relay',
    home = new FakeController({
        controllerId: 'home-a',
        acceptedTokens: ['token-a'],
        devices: [lamp()],
        rooms: [
            { id: 'den', name: 'Den', sortOrder: 0 },
            { id: 'hall', name: 'Hall', sortOrder: 1 },
        ],
    })
) {
    home.lanReachable = via === 'lan'
    const connection = new ControllerConnection({
        controllerId: 'home-a',
        reprobeIntervalMs: 60_000,
        credentialStore: createMemoryCredentialStore({
            'home-a': { clientToken: 'token-a' },
        }),
        lanCandidates: [home.baseUrl],
        connectors: fakeControllerConnectors(home),
    })
    connections.push(connection)
    await connection.start()
    assert.equal(connection.getStatus().mode, via)
    return { home, connection }
}

for (const via of ['lan', 'relay'] as const) {
    describe(`Device and Room setup over ${via}`, () => {
        it('renames a Device and shows it on the next load', async () => {
            const { home, connection } = await connected(via)
            const renamed = await connection.renameDevice({
                deviceId: 'lamp',
                name: '  Desk lamp ',
            })
            assert.equal(renamed.name, 'Desk lamp')
            assert.equal((await connection.getDevices())[0]?.name, 'Desk lamp')
            assert.deepEqual(home.setupRequests, [
                { type: 'renameDevice', via },
            ])
        })

        it('assigns a Device, or a Component, to a Room', async () => {
            const { connection } = await connected(via)
            assert.equal(
                (
                    await connection.assignRoom({
                        deviceId: 'lamp',
                        roomId: 'hall',
                    })
                ).roomId,
                'hall'
            )
            const strip = await connection.assignRoom({
                deviceId: 'lamp',
                componentId: 'l2',
                roomId: 'den',
            })
            assert.deepEqual(strip.componentRooms, { l2: 'den' })
            const cleared = await connection.assignRoom({
                deviceId: 'lamp',
                roomId: null,
            })
            assert.equal(cleared.roomId, null)
        })

        it('removes a Device and keeps its tombstone', async () => {
            const { home, connection } = await connected(via)
            await connection.removeDevice('lamp')
            assert.deepEqual(await connection.getDevices(), [])
            assert.deepEqual(
                home.removedDevices.map((device) => device.id),
                ['lamp']
            )
        })

        it('creates and renames a Room', async () => {
            const { connection } = await connected(via)
            const room = await connection.createRoom({ name: 'Office' })
            assert.equal(room.name, 'Office')
            const renamed = await connection.renameRoom({
                roomId: room.id,
                name: 'Study',
            })
            assert.deepEqual(renamed, { ...room, name: 'Study' })
            assert.ok(
                (await connection.getRooms()).some(
                    (candidate) => candidate.name === 'Study'
                )
            )
        })

        it('deletes a Room and moves its contents to another Room', async () => {
            const { home, connection } = await connected(via)
            home.setDevices([
                lamp(),
                {
                    ...lamp(),
                    id: 'strip',
                    name: 'Strip',
                    roomId: 'hall',
                    componentRooms: { l1: 'den' },
                },
            ])
            await connection.deleteRoom('den', 'hall')
            assert.deepEqual(
                (await connection.getRooms()).map((room) => room.id),
                ['hall']
            )
            const devices = await connection.getDevices()
            assert.equal(devices.find((d) => d.id === 'lamp')?.roomId, 'hall')
            assert.deepEqual(
                devices.find((d) => d.id === 'strip')?.componentRooms,
                { l1: 'hall' }
            )
            assert.deepEqual(home.deletedRooms, [
                { roomId: 'den', destinationRoomId: 'hall', via },
            ])
            assert.deepEqual(home.roomDeletionAudit, [
                {
                    roomId: 'den',
                    roomName: 'Den',
                    destinationRoomId: 'hall',
                    devicesMoved: 1,
                    componentsMoved: 1,
                },
            ])
        })

        it('deletes a Room and moves its contents to No Room', async () => {
            const { connection } = await connected(via)
            await connection.deleteRoom('den', null)
            const devices = await connection.getDevices()
            assert.equal(devices.find((d) => d.id === 'lamp')?.roomId, null)
        })

        it('leaves everything in place for an invalid destination', async () => {
            const { home, connection } = await connected(via)
            await assert.rejects(connection.deleteRoom('den', 'den'), {
                code: 'invalid_destination',
            })
            await assert.rejects(connection.deleteRoom('den', 'attic'), {
                code: 'destination_not_found',
            })
            assert.deepEqual(
                (await connection.getRooms()).map((room) => room.id),
                ['den', 'hall']
            )
            const devices = await connection.getDevices()
            assert.equal(devices.find((d) => d.id === 'lamp')?.roomId, 'den')
            // As in Core, the destination is checked before the Room exists.
            await assert.rejects(connection.deleteRoom('gone', 'gone'), {
                code: 'invalid_destination',
            })
            await assert.rejects(connection.deleteRoom('gone', 'attic'), {
                code: 'room_not_found',
            })
            assert.deepEqual(home.deletedRooms, [])
            assert.deepEqual(home.roomDeletionAudit, [])
        })

        it('surfaces an inactive Membership without changing anything', async () => {
            const { home, connection } = await connected(via)
            home.membershipActive = false
            await assert.rejects(
                connection.renameDevice({ deviceId: 'lamp', name: 'X' }),
                { code: 'inactive_membership' }
            )
            assert.equal(home.devices[0]?.name, 'Lamp')
        })

        it('reports a Controller without setup as unsupported_action', async () => {
            const { home, connection } = await connected(via)
            home.setupSupported = false
            await assert.rejects(connection.createRoom({ name: 'Den' }), {
                code: 'unsupported_action',
            })
        })
    })
}

describe('Device and Room setup while unreachable', () => {
    it('fails at once and never applies the change later', async () => {
        const { home, connection } = await connected('relay')
        home.goOffline()
        await connection.reprobe()
        await assert.rejects(
            connection.renameDevice({ deviceId: 'lamp', name: 'Later' })
        )
        home.lanReachable = true
        await connection.reprobe()
        assert.equal(home.devices[0]?.name, 'Lamp')
        assert.deepEqual(home.setupRequests, [])
    })
})
