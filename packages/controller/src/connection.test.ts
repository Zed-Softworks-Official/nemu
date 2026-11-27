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

function connect(
    options: ConstructorParameters<typeof ControllerConnection>[0]
): ControllerConnection {
    const connection = new ControllerConnection({
        reprobeIntervalMs: 60_000,
        ...options,
    })
    connections.push(connection)
    return connection
}

afterEach(() => {
    for (const connection of connections.splice(0)) connection.stop()
})

describe('ControllerConnection for a selected Home', () => {
    it('reaches an authorized LAN session with that Home credential', async () => {
        const home = new FakeController({
            controllerId: 'home-a',
            baseUrl: 'https://a.lan.nemu.sh:6368',
            acceptedAccessClients: ['client-a'],
            devices: [
                {
                    id: 'lamp',
                    name: 'Lamp',
                    type: 'light',
                    online: true,
                    state: undefined,
                },
            ],
        })
        const accessClientKeyStore = fakeAccessClientKeyStore({
            'home-a': 'client-a',
            'home-b': 'client-b',
        })
        const connection = connect({
            controllerId: 'home-a',
            accessClientKeyStore,
            lanCandidates: [home.baseUrl],
            connectors: fakeControllerConnectors(home),
        })

        await connection.start()

        assert.equal(connection.getStatus().mode, 'lan')
        assert.equal(connection.getStatus().controllerId, 'home-a')
        const devices = await connection.getDevices()
        assert.deepEqual(
            devices.map((device) => device.id),
            ['lamp']
        )
        // Home A's keys, never Home B's.
        assert.deepEqual(home.presentedAccessClientIds.at(-1), 'client-a')
    })

    it('does not attach to a LAN Controller from another Home', async () => {
        const selected = new FakeController({
            controllerId: 'home-a',
            lanReachable: false,
            acceptedAccessClients: ['client-a'],
        })
        const neighbour = new FakeController({
            controllerId: 'home-b',
            baseUrl: 'http://nemu.local:6368',
        })
        const connection = connect({
            controllerId: 'home-a',
            accessClientKeyStore: fakeAccessClientKeyStore({
                'home-a': 'client-a',
            }),
            lanCandidates: ['http://nemu.local:6368'],
            connectors: fakeControllerConnectors(selected, neighbour),
        })

        await connection.start()

        assert.equal(connection.getStatus().mode, 'relay')
        assert.equal(connection.getStatus().controllerId, 'home-a')
        assert.equal(neighbour.connectedTransports().length, 0)
        assert.deepEqual(neighbour.presentedAccessClientIds, [])
    })

    it('falls back to Relay with the selected Home credential', async () => {
        const home = new FakeController({
            controllerId: 'home-a',
            lanReachable: false,
            acceptedAccessClients: ['client-a'],
        })
        const connection = connect({
            controllerId: 'home-a',
            accessClientKeyStore: fakeAccessClientKeyStore({
                'home-a': 'client-a',
            }),
            connectors: fakeControllerConnectors(home),
        })

        await connection.start()

        assert.equal(connection.getStatus().mode, 'relay')
        const [relay] = home.connectedTransports()
        assert.equal(relay?.accessClientId, 'client-a')
        assert.deepEqual(await connection.getDevices(), [])
    })

    it('stays offline without a credential when LAN is unreachable', async () => {
        const home = new FakeController({
            controllerId: 'home-a',
            lanReachable: false,
        })
        const connection = connect({
            controllerId: 'home-a',
            accessClientKeyStore: fakeAccessClientKeyStore(),
            connectors: fakeControllerConnectors(home),
        })

        await connection.start()

        assert.equal(connection.getStatus().mode, 'offline')
        assert.equal(home.connectedTransports().length, 0)
    })

    it('waits for relayAllowed before using Relay', async () => {
        const home = new FakeController({
            controllerId: 'home-a',
            lanReachable: false,
            acceptedAccessClients: ['client-a'],
        })
        let allowed = false
        const connection = connect({
            controllerId: 'home-a',
            accessClientKeyStore: fakeAccessClientKeyStore({
                'home-a': 'client-a',
            }),
            relayAllowed: () => allowed,
            connectors: fakeControllerConnectors(home),
        })

        await connection.start()
        assert.equal(connection.getStatus().mode, 'offline')

        allowed = true
        await connection.reprobe()
        assert.equal(connection.getStatus().mode, 'relay')
    })

    function lanSession(home: FakeController, reprobeIntervalMs?: number) {
        const connection = connect({
            controllerId: home.controllerId,
            accessClientKeyStore: fakeAccessClientKeyStore({
                [home.controllerId]: 'client-a',
            }),
            lanCandidates: [home.baseUrl],
            connectors: fakeControllerConnectors(home),
            reprobeIntervalMs,
        })
        return connection
    }

    it('keeps the connection when the Controller refuses a Command', async () => {
        const home = new FakeController({
            controllerId: 'home-a',
            acceptedAccessClients: ['client-a'],
        })
        home.commandResult = () => {
            throw new ApiError('unavailable', 'device is unavailable', 409)
        }
        const connection = lanSession(home)
        await connection.start()

        await assert.rejects(
            connection.sendCommand({ deviceId: 'lamp', payload: {} })
        )

        assert.equal(connection.getStatus().mode, 'lan')
    })

    it('drops LAN when a Command fails to reach the Controller', async () => {
        const home = new FakeController({
            controllerId: 'home-a',
            acceptedAccessClients: ['client-a'],
        })
        home.commandResult = () => {
            throw new ApiError('network_error', 'Network Error')
        }
        const connection = lanSession(home)
        await connection.start()

        await assert.rejects(
            connection.sendCommand({ deviceId: 'lamp', payload: {} })
        )

        assert.equal(connection.getStatus().mode, 'relay')
    })

    it('returns to Relay when a LAN upgrade fails its check', async () => {
        const home = new FakeController({
            controllerId: 'home-a',
            lanReachable: false,
            acceptedAccessClients: ['client-a'],
        })
        const connection = lanSession(home, 5)
        await connection.start()
        assert.equal(connection.getStatus().mode, 'relay')

        // Discovery answers, but the Device check fails.
        home.lanReachable = true
        home.devicesAvailable = false
        await new Promise((resolve) => setTimeout(resolve, 30))
        home.lanReachable = false

        assert.notEqual(connection.getStatus().mode, 'lan')
    })

    it('stays offline on the LAN once it must pair again', async () => {
        const home = new FakeController({
            controllerId: 'home-a',
            lanReachable: false,
            acceptedAccessClients: ['client-a'],
        })
        const connection = lanSession(home, 5)
        await connection.start()
        assert.equal(connection.getStatus().mode, 'relay')

        // The Controller revoked this Access Client; the LAN upgrade check
        // sees it, and later upgrades must not attach without keys.
        home.lanReachable = true
        home.revokeAccessClient('client-a')
        await new Promise((resolve) => setTimeout(resolve, 30))

        assert.equal(connection.getStatus().mode, 'offline')
        assert.equal(
            connection.getPairingLoss()?.reason,
            'tombstoned_access_client'
        )
        assert.equal(home.presentedAccessClientIds.includes(null), false)
    })

    it('notices Relay coming back while offline', async () => {
        const home = new FakeController({
            controllerId: 'home-a',
            lanReachable: false,
            relayReachable: false,
            acceptedAccessClients: ['client-a'],
        })
        const connection = lanSession(home, 5)
        await connection.start()
        assert.equal(connection.getStatus().mode, 'offline')

        home.relayReachable = true
        await new Promise((resolve) => setTimeout(resolve, 30))

        assert.equal(connection.getStatus().mode, 'relay')
    })

    it('leaves nothing running when stopped during the first probe', async () => {
        const home = new FakeController({
            controllerId: 'home-a',
            acceptedAccessClients: ['client-a'],
        })
        const connection = lanSession(home, 5)

        const starting = connection.start()
        connection.stop()
        await starting

        assert.equal(home.connectedTransports().length, 0)
    })
})

describe('Leaving a Home and Access Client revocation', () => {
    for (const mode of ['lan', 'relay'] as const) {
        function session(home: FakeController) {
            return connect({
                controllerId: home.controllerId,
                accessClientKeyStore: fakeAccessClientKeyStore({
                    [home.controllerId]: 'phone',
                }),
                lanCandidates: [home.baseUrl],
                connectors: fakeControllerConnectors(home),
            })
        }

        function home(): FakeController {
            return new FakeController({
                controllerId: 'home-a',
                lanReachable: mode === 'lan',
                // This Membership's phone and browser, and another Member.
                acceptedAccessClients: ['phone', 'browser'],
                otherMembershipAccessClients: ['someone-else'],
            })
        }

        it(`revokes only this Access Client over ${mode}`, async () => {
            const controller = home()
            const connection = session(controller)
            await connection.start()
            assert.equal(connection.getStatus().mode, mode)

            await connection.revokeCurrentAccessClient()

            assert.equal(controller.accepts('phone'), false)
            assert.equal(controller.accepts('browser'), true)
            assert.equal(controller.accepts('someone-else'), true)
        })

        it(`leaves the Home and revokes every Access Client of the Membership over ${mode}`, async () => {
            const controller = home()
            const connection = session(controller)
            await connection.start()

            await connection.leaveHome()

            assert.equal(controller.accepts('phone'), false)
            assert.equal(controller.accepts('browser'), false)
            assert.equal(controller.accepts('someone-else'), true)
            assert.deepEqual(controller.leftVia, [mode])
        })

        it(`surfaces last_owner over ${mode}`, async () => {
            const controller = home()
            controller.lastOwner = true
            const connection = session(controller)
            await connection.start()

            await assert.rejects(connection.leaveHome(), {
                code: 'last_owner',
            })
            assert.equal(controller.accepts('phone'), true)
        })
    }
})
