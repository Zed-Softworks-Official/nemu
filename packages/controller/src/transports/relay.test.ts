import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { ConvexReactClient } from 'convex/react'
import { ControllerConnection } from '../connection.ts'
import { createMemoryCredentialStore } from '../storage.ts'
import { type RelayApi, RelayTransport } from './relay.ts'

describe('RelayTransport Commands', () => {
    it('refuses a Command rather than letting Convex hold it for later', async () => {
        const mutations: unknown[] = []
        const convex = {
            connectionState: () => ({ isWebSocketConnected: false }),
            mutation: async (...args: unknown[]) => {
                mutations.push(args)
            },
        } as unknown as ConvexReactClient
        const relay = new RelayTransport({
            convex,
            api: {} as RelayApi,
            controllerId: 'home-a',
            getToken: () => 'token-a',
        })

        await assert.rejects(
            relay.sendCommand({ deviceId: 'lamp', payload: { state: 'ON' } }),
            { code: 'relay_disconnected' }
        )
        assert.equal(mutations.length, 0)
    })
})

describe('RelayTransport writes while disconnected', () => {
    function disconnectedRelay(commandTimeoutMs?: number) {
        const state = { isWebSocketConnected: false }
        const mutations: Array<{ payload: string }> = []
        const convex = {
            connectionState: () => state,
            // Convex holds a mutation until it is connected again.
            mutation: (_ref: unknown, args: { payload: string }) => {
                mutations.push(args)
                return new Promise(() => {})
            },
            query: async () => [],
        } as unknown as ConvexReactClient
        const relay = new RelayTransport({
            convex,
            api: {} as RelayApi,
            controllerId: 'home-a',
            getToken: () => 'token-a',
            commandTimeoutMs,
        })
        return { relay, state, mutations }
    }

    const writes: Record<string, (relay: RelayTransport) => Promise<unknown>> =
        {
            renameDevice: (relay) =>
                relay.renameDevice({ deviceId: 'lamp', name: 'Lamp' }),
            assignRoom: (relay) =>
                relay.assignRoom({ deviceId: 'lamp', roomId: null }),
            removeDevice: (relay) => relay.removeDevice('lamp'),
            createRoom: (relay) => relay.createRoom({ name: 'Den' }),
            updateRoom: (relay) =>
                relay.renameRoom({ roomId: 'den', name: 'Den' }),
            deleteRoom: (relay) => relay.deleteRoom('den', null),
            permitJoin: (relay) => relay.permitJoin(180),
            cancelMatterCommission: (relay) => relay.cancelMatterCommission(),
            installRelease: (relay) => relay.installRelease('0.4.10'),
            rollbackRelease: (relay) => relay.rollbackRelease(),
            switchReleaseChannel: (relay) =>
                relay.switchReleaseChannel('canary'),
            designateHomeMeter: (relay) =>
                relay.designateHomeMeter({
                    powerCapabilityId: null,
                    importedEnergyCapabilityId: null,
                }),
            inviteMember: (relay) => relay.inviteMember('a@example.com'),
            removeMember: (relay) => relay.removeMember('m'),
            revokeToken: (relay) => relay.revokeToken('t'),
            revokeCurrentToken: (relay) => relay.revokeCurrentToken(),
            leaveHome: (relay) => relay.leaveHome(),
            bootstrapOwner: (relay) =>
                relay.bootstrapOwner({ userId: 'u', email: 'a@example.com' }),
        }

    for (const [name, write] of Object.entries(writes)) {
        it(`refuses ${name} without handing it to Convex`, async () => {
            const { relay, mutations } = disconnectedRelay()
            await assert.rejects(write(relay), { code: 'relay_disconnected' })
            assert.deepEqual(mutations, [])
        })
    }

    it('gives up on a write the socket dropped, and dates it', async () => {
        const { relay, state, mutations } = disconnectedRelay(20)
        state.isWebSocketConnected = true
        const before = Date.now()
        await assert.rejects(relay.removeDevice('lamp'), /timed out/)
        const { expiresAt } = JSON.parse(mutations[0]?.payload ?? '{}')
        assert.ok(expiresAt >= before + 20)
        assert.ok(expiresAt <= Date.now() + 20)
    })

    it('does not date a read', async () => {
        const { relay, mutations } = disconnectedRelay(20)
        await assert.rejects(relay.getRooms(), /timed out/)
        assert.equal(
            'expiresAt' in JSON.parse(mutations[0]?.payload ?? '{}'),
            false
        )
    })
})

describe('Matter pairing codes and Wi-Fi credentials', () => {
    it('never reach Convex: no mutation is made for them over Relay', async () => {
        const sent: string[] = []
        const convex = {
            connectionState: () => ({ isWebSocketConnected: true }),
            mutation: async (_ref: unknown, args: { payload: string }) => {
                sent.push(args.payload)
            },
            query: async () => [],
        } as unknown as ConvexReactClient
        const relay = new RelayTransport({
            convex,
            api: {} as RelayApi,
            controllerId: 'home-a',
            getToken: () => 'token-a',
            commandTimeoutMs: 20,
        })
        for (const operation of [
            'commissionMatter',
            'getMatterWifi',
            'saveMatterWifi',
        ]) {
            assert.equal(operation in relay, false, operation)
        }
        // Even a message forced past the types has no envelope.
        const forced = relay as unknown as {
            request(message: unknown): Promise<unknown>
        }
        for (const message of [
            { type: 'commissionMatter', code: '34970112332' },
            { type: 'getMatterWifi' },
            { type: 'saveMatterWifi', wifiSsid: 'home', wifiPassword: 'pw' },
        ]) {
            await assert.rejects(forced.request(message))
        }

        const connection = new ControllerConnection({
            reprobeIntervalMs: 60_000,
            controllerId: 'home-a',
            credentialStore: createMemoryCredentialStore({
                'home-a': { clientToken: 'token-a' },
            }),
            connectors: {
                discover: async () => null,
                createRelayTransport: () => relay,
            },
        })
        await connection.start()
        try {
            assert.equal(connection.getStatus().mode, 'relay')
            for (const operation of [
                () => connection.commissionMatter({ code: '34970112332' }),
                () => connection.getMatterWifi(),
                () =>
                    connection.saveMatterWifi({
                        wifiSsid: 'home',
                        wifiPassword: 'pw',
                    }),
            ]) {
                await assert.rejects(operation, { code: 'unsupported_action' })
            }
        } finally {
            connection.stop()
        }
        const types = sent.map((payload) => JSON.parse(payload).message.type)
        assert.deepEqual(
            types.filter(
                (type) =>
                    type !== 'watchCapabilityChanges' &&
                    type !== 'getCapabilitySnapshot'
            ),
            []
        )
        assert.equal(sent.join().includes('34970112332'), false)
    })
})

describe('RelayTransport Rooms', () => {
    it('loads the Home’s Rooms over Relay', async () => {
        const sent: Array<{ requestId: string; payload: string }> = []
        const convex = {
            connectionState: () => ({ isWebSocketConnected: true }),
            mutation: async (_ref: unknown, args: (typeof sent)[number]) => {
                sent.push(args)
            },
            query: async () =>
                sent.map(({ requestId }) => ({
                    requestId,
                    direction: 'toClient',
                    payload: JSON.stringify({
                        requestId,
                        signature: 'sig',
                        message: {
                            type: 'rooms',
                            rooms: [
                                {
                                    id: 'living',
                                    name: 'Living Room',
                                    sortOrder: 1,
                                },
                            ],
                        },
                    }),
                })),
        } as unknown as ConvexReactClient
        const relay = new RelayTransport({
            convex,
            api: {} as RelayApi,
            controllerId: 'home-a',
            getToken: () => 'token-a',
        })
        await relay.connect()
        try {
            assert.deepEqual(await relay.getRooms(), [
                { id: 'living', name: 'Living Room', sortOrder: 1 },
            ])
            assert.equal(
                JSON.parse(sent.at(-1)?.payload ?? '{}').message.type,
                'getRooms'
            )
        } finally {
            relay.disconnect()
        }
    })
})

describe('RelayTransport leaving and revocation', () => {
    function relayAnswering(message: unknown) {
        const sent: Array<{ requestId: string; payload: string }> = []
        const convex = {
            connectionState: () => ({ isWebSocketConnected: true }),
            mutation: async (_ref: unknown, args: (typeof sent)[number]) => {
                sent.push(args)
            },
            query: async () =>
                sent.map(({ requestId }) => ({
                    requestId,
                    direction: 'toClient',
                    payload: JSON.stringify({
                        requestId,
                        signature: 'sig',
                        message,
                    }),
                })),
        } as unknown as ConvexReactClient
        const relay = new RelayTransport({
            convex,
            api: {} as RelayApi,
            controllerId: 'home-a',
            getToken: () => 'token-a',
        })
        return { relay, sent }
    }

    it('leaves the Home with no arguments', async () => {
        const { relay, sent } = relayAnswering({
            type: 'commandResult',
            ok: true,
        })
        await relay.connect()
        try {
            await relay.leaveHome()
            assert.deepEqual(JSON.parse(sent.at(-1)?.payload ?? '{}').message, {
                type: 'leaveHome',
            })
        } finally {
            relay.disconnect()
        }
    })

    it('keeps error details, as on LAN', async () => {
        const details = { roomId: 'attic' }
        const { relay } = relayAnswering({
            type: 'commandResult',
            ok: false,
            error: {
                code: 'destination_not_found',
                message: 'The destination Room no longer exists',
                details,
            },
        })
        await relay.connect()
        try {
            await assert.rejects(relay.deleteRoom('den', 'attic'), {
                code: 'destination_not_found',
                details,
            })
        } finally {
            relay.disconnect()
        }
    })

    it('surfaces the Controller’s error code, as on LAN', async () => {
        const { relay } = relayAnswering({
            type: 'commandResult',
            ok: false,
            error: {
                code: 'last_owner',
                message: 'The last Owner cannot leave the Home',
            },
        })
        await relay.connect()
        try {
            await assert.rejects(relay.leaveHome(), { code: 'last_owner' })
            await assert.rejects(relay.revokeCurrentToken(), {
                code: 'last_owner',
            })
        } finally {
            relay.disconnect()
        }
    })
})

function scriptedRelay(answer: (message: { type: string }) => unknown) {
    const sent: Array<{ requestId: string; payload: string }> = []
    const convex = {
        connectionState: () => ({ isWebSocketConnected: true }),
        mutation: async (_ref: unknown, args: (typeof sent)[number]) => {
            sent.push(args)
        },
        query: async () =>
            sent.map(({ requestId, payload }) => ({
                requestId,
                direction: 'toClient',
                payload: JSON.stringify({
                    requestId,
                    signature: 'sig',
                    message: answer(JSON.parse(payload).message),
                }),
            })),
    } as unknown as ConvexReactClient
    const relay = new RelayTransport({
        convex,
        api: {} as RelayApi,
        controllerId: 'home-a',
        getToken: () => 'token-a',
        pollIntervalMs: 1,
    })
    return { relay, sent: () => sent.map((s) => JSON.parse(s.payload).message) }
}

describe('RelayTransport Device and Room setup', () => {
    const lamp = { id: 'lamp', name: 'Desk lamp', type: 'light', online: true }

    it('sends each setup request and reads the same outcomes as LAN', async () => {
        const { relay, sent } = scriptedRelay((message) => {
            if (
                message.type === 'createRoom' ||
                message.type === 'updateRoom'
            ) {
                return { type: 'room', room: { id: 'den', name: 'Den' } }
            }
            if (
                message.type === 'removeDevice' ||
                message.type === 'deleteRoom'
            ) {
                return { type: 'commandResult', ok: true }
            }
            return { type: 'device', device: lamp }
        })
        await relay.connect()
        try {
            assert.equal(
                (
                    await relay.renameDevice({
                        deviceId: 'lamp',
                        name: 'Desk lamp',
                    })
                ).name,
                'Desk lamp'
            )
            await relay.assignRoom({
                deviceId: 'strip',
                componentId: 'l2',
                roomId: null,
            })
            await relay.removeDevice('lamp')
            assert.deepEqual(await relay.createRoom({ name: 'Den' }), {
                id: 'den',
                name: 'Den',
            })
            await relay.renameRoom({ roomId: 'den', name: 'Den' })
            await relay.deleteRoom('den', 'hall')
            await relay.deleteRoom('den', null)
            assert.deepEqual(
                sent().filter((m) => m.type !== 'watchCapabilityChanges'),
                [
                    {
                        type: 'renameDevice',
                        deviceId: 'lamp',
                        name: 'Desk lamp',
                    },
                    {
                        type: 'assignRoom',
                        deviceId: 'strip',
                        componentId: 'l2',
                        roomId: null,
                    },
                    { type: 'removeDevice', deviceId: 'lamp' },
                    { type: 'createRoom', name: 'Den' },
                    { type: 'updateRoom', roomId: 'den', name: 'Den' },
                    {
                        type: 'deleteRoom',
                        roomId: 'den',
                        destinationRoomId: 'hall',
                    },
                    {
                        type: 'deleteRoom',
                        roomId: 'den',
                        destinationRoomId: null,
                    },
                ]
            )
        } finally {
            relay.disconnect()
        }
    })

    it('keeps the Controller error code', async () => {
        const { relay } = scriptedRelay(() => ({
            type: 'commandResult',
            ok: false,
            error: {
                code: 'unsupported_action',
                message: 'Update the Controller',
            },
        }))
        await relay.connect()
        try {
            await assert.rejects(relay.removeDevice('lamp'), {
                code: 'unsupported_action',
                message: 'Update the Controller',
            })
        } finally {
            relay.disconnect()
        }
    })
})

describe('RelayTransport Device setup', () => {
    it('checks the Room before renaming, so a bad roomId changes nothing', async () => {
        const sent: Array<{ requestId: string; payload: string }> = []
        const convex = {
            connectionState: () => ({ isWebSocketConnected: true }),
            mutation: async (_ref: unknown, args: (typeof sent)[number]) => {
                sent.push(args)
            },
            query: async () =>
                sent.map(({ requestId }) => ({
                    requestId,
                    direction: 'toClient',
                    payload: JSON.stringify({
                        requestId,
                        signature: 'sig',
                        message: {
                            type: 'commandResult',
                            ok: false,
                            error: {
                                code: 'room_not_found',
                                message: 'Room not found',
                            },
                        },
                    }),
                })),
        } as unknown as ConvexReactClient
        const relay = new RelayTransport({
            convex,
            api: {} as RelayApi,
            controllerId: 'home-a',
            getToken: () => 'token-a',
        })
        await relay.connect()
        try {
            await assert.rejects(
                relay.patchDevice('lamp', {
                    name: 'Desk lamp',
                    roomId: 'gone',
                }),
                { code: 'room_not_found' }
            )
            const types = sent
                .map(({ payload }) => JSON.parse(payload).message.type)
                .filter((type) => type !== 'watchCapabilityChanges')
            assert.deepEqual(types, ['assignRoom'])
        } finally {
            relay.disconnect()
        }
    })
})
