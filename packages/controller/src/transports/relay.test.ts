import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { ConvexReactClient } from 'convex/react'
import { ControllerConnection } from '../connection.ts'
import { createMemoryCredentialStore } from '../storage.ts'
import { type RelayApi, RelayTransport } from './relay.ts'

const RELAY_API = {
    send: 'relay:send',
    responses: 'relay:responses',
    acknowledge: 'relay:acknowledge',
} as unknown as RelayApi

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
            api: RELAY_API,
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
            api: RELAY_API,
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
            api: RELAY_API,
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
            mutation: async (ref: unknown, args: (typeof sent)[number]) => {
                if (ref === RELAY_API.send) sent.push(args)
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
            api: RELAY_API,
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
            mutation: async (ref: unknown, args: (typeof sent)[number]) => {
                if (ref === RELAY_API.send) sent.push(args)
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
            api: RELAY_API,
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
        mutation: async (ref: unknown, args: (typeof sent)[number]) => {
            if (ref === RELAY_API.send) sent.push(args)
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
        api: RELAY_API,
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
            mutation: async (ref: unknown, args: (typeof sent)[number]) => {
                if (ref === RELAY_API.send) sent.push(args)
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
            api: RELAY_API,
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

describe('RelayTransport Devices', () => {
    it('surfaces the Controller’s error code, as on LAN', async () => {
        const { relay } = scriptedRelay(() => ({
            type: 'commandResult',
            ok: false,
            error: { code: 'unauthorized', message: 'Invalid client token' },
        }))
        await relay.connect()
        try {
            await assert.rejects(relay.getDevices(), {
                code: 'unauthorized',
                message: 'Invalid client token',
            })
        } finally {
            relay.disconnect()
        }
    })
})

type StoredResponse = {
    _id: string
    requestId: string
    payload: string
    direction: 'toClient'
}

function mailboxRelay(options: {
    answer?: (
        message: { type: string },
        requestId: string
    ) => unknown | undefined
    readResponses?: (requestIds: string[]) => void
    acknowledge?: (messageIds: string[]) => Promise<void> | void
}) {
    const stored: StoredResponse[] = []
    const sent: Array<{ requestId: string; message: { type: string } }> = []
    const acks: string[][] = []
    let nextId = 0
    const respond = (requestId: string, message: unknown): string => {
        const _id = `msg-${nextId++}`
        stored.push({
            _id,
            requestId,
            direction: 'toClient',
            payload: JSON.stringify({ requestId, signature: 'sig', message }),
        })
        return _id
    }
    const convex = {
        connectionState: () => ({ isWebSocketConnected: true }),
        mutation: async (ref: unknown, args: Record<string, unknown>) => {
            if (ref === RELAY_API.acknowledge) {
                const messageIds = args.messageIds as string[]
                acks.push(messageIds)
                await options.acknowledge?.(messageIds)
                for (const id of messageIds) {
                    const index = stored.findIndex((m) => m._id === id)
                    if (index >= 0) stored.splice(index, 1)
                }
                return null
            }
            const requestId = args.requestId as string
            const message = JSON.parse(args.payload as string).message
            sent.push({ requestId, message })
            const answer = options.answer?.(message, requestId)
            if (answer !== undefined) respond(requestId, answer)
            return 'request-id'
        },
        query: async (_ref: unknown, args: { requestIds: string[] }) => {
            options.readResponses?.(args.requestIds)
            return stored.filter((m) => args.requestIds.includes(m.requestId))
        },
    } as unknown as ConvexReactClient
    const relay = new RelayTransport({
        convex,
        api: RELAY_API,
        controllerId: 'home-a',
        getToken: () => 'token-a',
        pollIntervalMs: 1,
    })
    const watchRequestId = () =>
        sent.find((s) => s.message.type === 'watchCapabilityChanges')?.requestId
    return { relay, stored, sent, acks, respond, watchRequestId }
}

const tick = (ms = 10) => new Promise((resolve) => setTimeout(resolve, ms))

async function until(condition: () => boolean, timeoutMs = 1_000) {
    const started = Date.now()
    while (!condition()) {
        if (Date.now() - started > timeoutMs) {
            throw new Error('condition not met in time')
        }
        await tick(1)
    }
}

const rooms = [{ id: 'living', name: 'Living Room', sortOrder: 1 }]

const watchMessage = (revision: number) => ({
    type: 'capabilitySnapshot',
    epoch: '6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b',
    revision,
    capabilities: [],
})

describe('RelayTransport acknowledges Relay responses', () => {
    it('acknowledges a request’s response once the request has it, and only then', async () => {
        let requestId: string | undefined
        const mailbox = mailboxRelay({
            answer: (message, id) => {
                if (message.type === 'getRooms') requestId = id
                return undefined
            },
        })
        const { relay, acks, respond } = mailbox
        await relay.connect()
        try {
            const result = relay.getRooms()
            await until(() => requestId !== undefined)
            await tick()
            assert.deepEqual(acks, [])

            const responseId = respond(requestId ?? '', {
                type: 'rooms',
                rooms,
            })
            assert.deepEqual(await result, rooms)
            await until(() => acks.length > 0)
            assert.deepEqual(acks, [[responseId]])
            assert.deepEqual(mailbox.stored, [])
        } finally {
            relay.disconnect()
        }
    })

    it('never lets the general poll acknowledge a response a pending request still needs', async () => {
        let roomsRequestId: string | undefined
        let pollReads = 0
        let waiterBlocked = true
        const mailbox = mailboxRelay({
            answer: (message, id) => {
                if (message.type !== 'getRooms') return undefined
                roomsRequestId = id
                return { type: 'rooms', rooms }
            },
            readResponses: (requestIds) => {
                const isWaiter =
                    requestIds.length === 1 && requestIds[0] === roomsRequestId
                if (!isWaiter) {
                    if (roomsRequestId && requestIds.includes(roomsRequestId)) {
                        pollReads++
                    }
                    return
                }
                if (waiterBlocked) throw new Error('slow read')
            },
        })
        const { relay, acks } = mailbox
        await relay.connect()
        try {
            await until(() => mailbox.watchRequestId() !== undefined)
            await tick()
            const result = relay.getRooms()
            await until(() => pollReads >= 3)
            assert.deepEqual(acks, [])

            waiterBlocked = false
            assert.deepEqual(await result, rooms)
            await until(() => acks.length > 0)
            assert.deepEqual(acks, [['msg-0']])
        } finally {
            relay.disconnect()
        }
    })

    it('acknowledges each watch-stream message by ID, and later changes still arrive', async () => {
        const mailbox = mailboxRelay({})
        const { relay, acks, respond } = mailbox
        const events: unknown[] = []
        relay.subscribeEvents((event) => events.push(event))
        await relay.connect()
        try {
            await until(() => mailbox.watchRequestId() !== undefined)
            await tick()
            const watch = mailbox.watchRequestId() ?? ''
            const first = respond(watch, watchMessage(1))
            const second = respond(watch, watchMessage(2))
            await until(() => events.length === 2)
            await until(() => acks.flat().length === 2)
            assert.deepEqual(acks, [[first, second]])

            const third = respond(watch, watchMessage(3))
            await until(() => events.length === 3)
            await until(() => acks.flat().length === 3)
            assert.deepEqual(acks.at(-1), [third])
            assert.deepEqual(
                events.map((event) => (event as { revision: number }).revision),
                [1, 2, 3]
            )
            assert.deepEqual(mailbox.stored, [])
        } finally {
            relay.disconnect()
        }
    })

    it('still emits a commandResult event, once, when the request reads the response first', async () => {
        const mailbox = mailboxRelay({
            answer: (message) =>
                message.type === 'command'
                    ? { type: 'commandResult', ok: true, outcome: 'confirmed' }
                    : undefined,
        })
        const { relay } = mailbox
        const events: Array<{ type: string; requestId?: string }> = []
        relay.subscribeEvents((event) =>
            events.push(event as (typeof events)[number])
        )
        await relay.connect()
        try {
            const result = await relay.sendCommand({
                deviceId: 'lamp',
                payload: { state: 'ON' },
            })
            assert.equal(result.ok, true)
            await tick(20)
            const results = events.filter((e) => e.type === 'commandResult')
            assert.deepEqual(
                results.map((e) => e.requestId),
                [result.requestId]
            )
        } finally {
            relay.disconnect()
        }
    })

    it('still emits a commandResult event, once, when the general poll reads it first', async () => {
        let commandRequestId: string | undefined
        let waiterBlocked = true
        let pollReads = 0
        const mailbox = mailboxRelay({
            answer: (message, id) => {
                if (message.type !== 'command') return undefined
                commandRequestId = id
                return { type: 'commandResult', ok: true, outcome: 'confirmed' }
            },
            readResponses: (requestIds) => {
                const isWaiter =
                    requestIds.length === 1 &&
                    requestIds[0] === commandRequestId
                if (!isWaiter) {
                    if (
                        commandRequestId &&
                        requestIds.includes(commandRequestId)
                    ) {
                        pollReads++
                    }
                    return
                }
                if (waiterBlocked) throw new Error('slow read')
            },
        })
        const { relay } = mailbox
        const events: Array<{ type: string; requestId?: string }> = []
        relay.subscribeEvents((event) =>
            events.push(event as (typeof events)[number])
        )
        await relay.connect()
        try {
            await until(() => mailbox.watchRequestId() !== undefined)
            await tick()
            const result = relay.sendCommand({
                deviceId: 'lamp',
                payload: { state: 'ON' },
            })
            await until(() => pollReads >= 2)
            waiterBlocked = false
            const { requestId } = await result
            await tick(20)
            assert.deepEqual(
                events
                    .filter((e) => e.type === 'commandResult')
                    .map((e) => e.requestId),
                [requestId]
            )
        } finally {
            relay.disconnect()
        }
    })

    it('acknowledges a History query result', async () => {
        const mailbox = mailboxRelay({
            answer: (message, requestId) =>
                message.type === 'historyQuery'
                    ? {
                          type: 'historyQueryResult',
                          requestId,
                          asOf: '2026-11-25T12:00:00.000Z',
                          incomplete: false,
                          series: [],
                          reasons: [],
                      }
                    : undefined,
        })
        const { relay, acks } = mailbox
        await relay.connect()
        try {
            const read = await relay.queryHistory({
                cursor: 'next-page',
            } as unknown as Parameters<typeof relay.queryHistory>[0])
            assert.equal(read.type, 'historyQueryResult')
            await until(() => acks.length > 0)
            assert.deepEqual(acks, [['msg-0']])
            assert.deepEqual(mailbox.stored, [])
        } finally {
            relay.disconnect()
        }
    })

    it('ignores a failing acknowledge: requests still resolve and polling continues', async () => {
        const mailbox = mailboxRelay({
            answer: (message) =>
                message.type === 'getRooms'
                    ? { type: 'rooms', rooms }
                    : undefined,
            acknowledge: () => {
                throw new Error('offline')
            },
        })
        const { relay, respond } = mailbox
        const events: unknown[] = []
        relay.subscribeEvents((event) => events.push(event))
        await relay.connect()
        try {
            assert.deepEqual(await relay.getRooms(), rooms)
            assert.deepEqual(await relay.getRooms(), rooms)

            await until(() => mailbox.watchRequestId() !== undefined)
            const watch = mailbox.watchRequestId() ?? ''
            respond(watch, watchMessage(1))
            await until(() => events.length === 1)
            respond(watch, watchMessage(2))
            await until(() => events.length === 2)
        } finally {
            relay.disconnect()
        }
    })
})
