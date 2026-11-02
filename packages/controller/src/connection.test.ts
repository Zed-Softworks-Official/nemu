import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { ControllerConnection } from './connection.ts'
import {
    createMemoryCredentialStore,
    FakeController,
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
            acceptedTokens: ['token-a'],
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
        const credentialStore = createMemoryCredentialStore({
            'home-a': { clientToken: 'token-a' },
            'home-b': { clientToken: 'token-b' },
        })
        const connection = connect({
            controllerId: 'home-a',
            credentialStore,
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
        assert.equal(
            credentialStore.get('home-a')?.baseUrl,
            'https://a.lan.nemu.sh:6368'
        )
    })

    it('does not attach to a LAN Controller from another Home', async () => {
        const selected = new FakeController({
            controllerId: 'home-a',
            lanReachable: false,
            acceptedTokens: ['token-a'],
        })
        const neighbour = new FakeController({
            controllerId: 'home-b',
            baseUrl: 'http://nemu.local:6368',
        })
        const connection = connect({
            controllerId: 'home-a',
            credentialStore: createMemoryCredentialStore({
                'home-a': { clientToken: 'token-a' },
            }),
            lanCandidates: ['http://nemu.local:6368'],
            connectors: fakeControllerConnectors(selected, neighbour),
        })

        await connection.start()

        assert.equal(connection.getStatus().mode, 'relay')
        assert.equal(connection.getStatus().controllerId, 'home-a')
        assert.equal(neighbour.connectedTransports().length, 0)
        assert.deepEqual(neighbour.presentedTokens, [])
    })

    it('falls back to Relay with the selected Home credential', async () => {
        const home = new FakeController({
            controllerId: 'home-a',
            lanReachable: false,
            acceptedTokens: ['token-a'],
        })
        const connection = connect({
            controllerId: 'home-a',
            credentialStore: createMemoryCredentialStore({
                'home-a': { clientToken: 'token-a' },
            }),
            connectors: fakeControllerConnectors(home),
        })

        await connection.start()

        assert.equal(connection.getStatus().mode, 'relay')
        const [relay] = home.connectedTransports()
        assert.equal(relay?.currentToken(), 'token-a')
        assert.deepEqual(await connection.getDevices(), [])
    })

    it('stays offline without a credential when LAN is unreachable', async () => {
        const home = new FakeController({
            controllerId: 'home-a',
            lanReachable: false,
        })
        const connection = connect({
            controllerId: 'home-a',
            credentialStore: createMemoryCredentialStore(),
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
            acceptedTokens: ['token-a'],
        })
        let allowed = false
        const connection = connect({
            controllerId: 'home-a',
            credentialStore: createMemoryCredentialStore({
                'home-a': { clientToken: 'token-a' },
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
})
