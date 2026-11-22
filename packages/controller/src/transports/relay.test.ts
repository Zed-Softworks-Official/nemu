import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { ConvexReactClient } from 'convex/react'
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

describe('RelayTransport Rooms', () => {
    it('loads the Home’s Rooms over Relay', async () => {
        const sent: Array<{ requestId: string; payload: string }> = []
        const convex = {
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
            await relay.deleteRoom('den')
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
                    { type: 'deleteRoom', roomId: 'den' },
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
