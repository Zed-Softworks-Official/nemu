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

describe('RelayTransport leaving and revocation', () => {
    function relayAnswering(message: unknown) {
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
