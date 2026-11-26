import { convexTest } from 'convex-test'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { CONTROLLER_JWT_ISSUER } from '../lib/controllerAuth'
import { api, internal } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob('./**/*.*s')

const RELAY_TTL_MS = 5 * 60 * 1000
const CONTROLLER_ID = 'controller-1'
const USER_ID = 'user-1'

function setup() {
    const t = convexTest(schema, modules)
    const client = t.withIdentity({
        subject: USER_ID,
        issuer: 'https://clerk.nemu.test',
    })
    const controller = t.withIdentity({
        subject: CONTROLLER_ID,
        issuer: CONTROLLER_JWT_ISSUER,
    })
    return { t, client, controller }
}

async function seedPairing(t: ReturnType<typeof convexTest>) {
    await t.run(async (ctx) => {
        await ctx.db.insert('controllers', {
            controllerId: CONTROLLER_ID,
            publicKey: 'public-key',
            name: 'Home',
            registeredAt: Date.now(),
        })
        await ctx.db.insert('pairings', {
            userId: USER_ID,
            controllerId: CONTROLLER_ID,
            createdAt: Date.now(),
            role: 'owner',
        })
    })
}

beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-25T12:00:00Z'))
})

afterEach(() => {
    vi.useRealTimers()
})

describe('Relay mailbox expiry', () => {
    test('the Controller receives unexpired requests and never expired ones', async () => {
        const { t, client, controller } = setup()
        await seedPairing(t)

        await client.mutation(api.relay.send, {
            controllerId: CONTROLLER_ID,
            requestId: 'old',
            payload: 'old-payload',
        })
        vi.advanceTimersByTime(RELAY_TTL_MS - 1000)
        await client.mutation(api.relay.send, {
            controllerId: CONTROLLER_ID,
            requestId: 'new',
            payload: 'new-payload',
        })

        expect(await controller.query(api.relay.pendingForMe, {})).toEqual([
            { requestId: 'old', payload: 'old-payload' },
            { requestId: 'new', payload: 'new-payload' },
        ])

        vi.advanceTimersByTime(2000)

        expect(await controller.query(api.relay.pendingForMe, {})).toEqual([
            { requestId: 'new', payload: 'new-payload' },
        ])
        const polled = await t.query(internal.relay.pendingForController, {
            controllerId: CONTROLLER_ID,
        })
        expect(polled.map((message) => message.requestId)).toEqual(['new'])
    })

    test('pendingForController drops expired requests', async () => {
        const { t, client } = setup()
        await seedPairing(t)

        await client.mutation(api.relay.send, {
            controllerId: CONTROLLER_ID,
            requestId: 'req',
            payload: 'payload',
        })
        expect(
            await t.query(internal.relay.pendingForController, {
                controllerId: CONTROLLER_ID,
            })
        ).toHaveLength(1)

        vi.advanceTimersByTime(RELAY_TTL_MS + 1)

        expect(
            await t.query(internal.relay.pendingForController, {
                controllerId: CONTROLLER_ID,
            })
        ).toEqual([])
    })

    test('clients receive unexpired responses and never expired ones', async () => {
        const { t, client, controller } = setup()
        await seedPairing(t)

        await controller.mutation(api.relay.respondAsController, {
            requestId: 'old',
            payload: 'old-response',
        })
        vi.advanceTimersByTime(RELAY_TTL_MS - 1000)
        await controller.mutation(api.relay.respondAsController, {
            requestId: 'new',
            payload: 'new-response',
        })

        const before = await client.query(api.relay.responses, {
            requestIds: ['old', 'new'],
        })
        expect(before.map((message) => message.payload)).toEqual([
            'old-response',
            'new-response',
        ])

        vi.advanceTimersByTime(2000)

        const after = await client.query(api.relay.responses, {
            requestIds: ['old', 'new'],
        })
        expect(after.map((message) => message.payload)).toEqual([
            'new-response',
        ])
    })
})

describe('Relay mailbox answers', () => {
    test('answering a request deletes it and hands the response to the client', async () => {
        const { t, client, controller } = setup()
        await seedPairing(t)

        await client.mutation(api.relay.send, {
            controllerId: CONTROLLER_ID,
            requestId: 'req',
            payload: 'command',
        })
        await controller.mutation(api.relay.respondAsController, {
            requestId: 'req',
            payload: 'result',
        })

        expect(await controller.query(api.relay.pendingForMe, {})).toEqual([])
        const stored = await t.run((ctx) =>
            ctx.db
                .query('relayMessages')
                .withIndex('by_request_id', (q) => q.eq('requestId', 'req'))
                .collect()
        )
        expect(stored.map((message) => message.direction)).toEqual(['toClient'])
        const answered = await client.query(api.relay.responses, {
            requestIds: ['req'],
        })
        expect(answered.map((message) => message.payload)).toEqual(['result'])
    })

    test('answering through respondInternal also deletes the request', async () => {
        const { t, client, controller } = setup()
        await seedPairing(t)

        await client.mutation(api.relay.send, {
            controllerId: CONTROLLER_ID,
            requestId: 'req',
            payload: 'command',
        })
        await t.mutation(internal.relay.respondInternal, {
            controllerId: CONTROLLER_ID,
            requestId: 'req',
            payload: 'result',
        })

        expect(await controller.query(api.relay.pendingForMe, {})).toEqual([])
        expect(
            await t.query(internal.relay.pendingForController, {
                controllerId: CONTROLLER_ID,
            })
        ).toEqual([])
    })
})

describe('Relay mailbox cleanup', () => {
    const CLEANUP_BATCH_SIZE = 100

    async function seedMessages(
        t: ReturnType<typeof convexTest>,
        count: number,
        expiresAt: number,
        prefix: string
    ) {
        await t.run(async (ctx) => {
            for (let i = 0; i < count; i++) {
                await ctx.db.insert('relayMessages', {
                    controllerId: CONTROLLER_ID,
                    direction: 'toController',
                    requestId: `${prefix}-${i}`,
                    payload: 'payload',
                    consumed: false,
                    expiresAt,
                })
            }
        })
    }

    async function remainingRequestIds(t: ReturnType<typeof convexTest>) {
        return t.run(async (ctx) =>
            (await ctx.db.query('relayMessages').collect()).map(
                (message) => message.requestId
            )
        )
    }

    test('removes expired messages and leaves unexpired ones', async () => {
        const { t } = setup()
        await seedMessages(t, 3, Date.now() - 1, 'expired')
        await seedMessages(t, 2, Date.now() + RELAY_TTL_MS, 'live')

        expect(await t.mutation(internal.relay.cleanup, {})).toBe(3)
        await t.finishAllScheduledFunctions(vi.runAllTimers)

        expect((await remainingRequestIds(t)).sort()).toEqual([
            'live-0',
            'live-1',
        ])
    })

    test('keeps rescheduling until a backlog bigger than one batch is gone', async () => {
        const { t } = setup()
        const backlog = CLEANUP_BATCH_SIZE * 2 + 50
        await seedMessages(t, backlog, Date.now() - 1, 'expired')
        await seedMessages(t, 1, Date.now() + RELAY_TTL_MS, 'live')

        expect(await t.mutation(internal.relay.cleanup, {})).toBe(
            CLEANUP_BATCH_SIZE
        )
        expect(await remainingRequestIds(t)).toHaveLength(
            backlog - CLEANUP_BATCH_SIZE + 1
        )

        await t.finishAllScheduledFunctions(vi.runAllTimers)

        expect(await remainingRequestIds(t)).toEqual(['live-0'])
    })

    test('does not delete consumed messages that have not expired', async () => {
        const { t } = setup()
        await t.run(async (ctx) => {
            await ctx.db.insert('relayMessages', {
                controllerId: CONTROLLER_ID,
                direction: 'toClient',
                requestId: 'consumed-live',
                payload: 'payload',
                consumed: true,
                expiresAt: Date.now() + RELAY_TTL_MS,
            })
        })

        expect(await t.mutation(internal.relay.cleanup, {})).toBe(0)
        expect(await remainingRequestIds(t)).toEqual(['consumed-live'])
    })
})

describe('Relay messages without the consumed flag', () => {
    async function storedMessages(t: ReturnType<typeof convexTest>) {
        return t.run((ctx) => ctx.db.query('relayMessages').collect())
    }

    test('new requests and responses are written without consumed', async () => {
        const { t, client, controller } = setup()
        await seedPairing(t)

        await client.mutation(api.relay.send, {
            controllerId: CONTROLLER_ID,
            requestId: 'req',
            payload: 'command',
        })
        await controller.mutation(api.relay.respondAsController, {
            requestId: 'other',
            payload: 'result',
        })

        const stored = await storedMessages(t)
        expect(stored).toHaveLength(2)
        for (const message of stored) {
            expect(message).not.toHaveProperty('consumed')
        }
    })

    test('older messages written with consumed: false work with every Relay function', async () => {
        const { t, client, controller } = setup()
        await seedPairing(t)
        await t.run(async (ctx) => {
            for (const requestId of ['legacy-1', 'legacy-2', 'legacy-3']) {
                await ctx.db.insert('relayMessages', {
                    controllerId: CONTROLLER_ID,
                    direction: 'toController',
                    requestId,
                    payload: 'command',
                    consumed: false,
                    expiresAt: Date.now() + RELAY_TTL_MS,
                })
            }
            await ctx.db.insert('relayMessages', {
                controllerId: CONTROLLER_ID,
                direction: 'toClient',
                requestId: 'legacy-response',
                payload: 'old-result',
                consumed: false,
                expiresAt: Date.now() + RELAY_TTL_MS,
            })
        })
        await client.mutation(api.relay.send, {
            controllerId: CONTROLLER_ID,
            requestId: 'new',
            payload: 'command',
        })

        expect(await controller.query(api.relay.pendingForMe, {})).toEqual([
            { requestId: 'legacy-1', payload: 'command' },
            { requestId: 'legacy-2', payload: 'command' },
            { requestId: 'legacy-3', payload: 'command' },
            { requestId: 'new', payload: 'command' },
        ])
        const polled = await t.query(internal.relay.pendingForController, {
            controllerId: CONTROLLER_ID,
        })
        expect(polled.map((message) => message.requestId)).toEqual([
            'legacy-1',
            'legacy-2',
            'legacy-3',
            'new',
        ])
        const legacyResponses = await client.query(api.relay.responses, {
            requestIds: ['legacy-response'],
        })
        expect(legacyResponses.map((message) => message.payload)).toEqual([
            'old-result',
        ])

        await controller.mutation(api.relay.respondAsController, {
            requestId: 'legacy-1',
            payload: 'result-1',
        })
        await t.mutation(internal.relay.respondInternal, {
            controllerId: CONTROLLER_ID,
            requestId: 'legacy-2',
            payload: 'result-2',
        })
        await t.mutation(api.relay.respond, {
            controllerId: CONTROLLER_ID,
            requestId: 'legacy-3',
            payload: 'result-3',
        })
        expect(await controller.query(api.relay.pendingForMe, {})).toEqual([
            { requestId: 'new', payload: 'command' },
        ])
        const answered = await client.query(api.relay.responses, {
            requestIds: ['legacy-1', 'legacy-2', 'legacy-3'],
        })
        expect(answered.map((message) => message.payload)).toEqual([
            'result-1',
            'result-2',
            'result-3',
        ])

        vi.advanceTimersByTime(RELAY_TTL_MS + 1000)
        expect(await t.mutation(internal.relay.cleanup, {})).toBe(5)
        expect(await storedMessages(t)).toEqual([])
    })
})
