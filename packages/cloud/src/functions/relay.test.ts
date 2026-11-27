import rateLimiter from '@convex-dev/rate-limiter/test'
import { convexTest } from 'convex-test'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { CONTROLLER_JWT_ISSUER } from '../lib/controllerAuth'
import {
    CLEANUP_BATCH_SIZE,
    RELAY_ACCESS_CLIENT_LIMIT,
    RELAY_ACCOUNT_LIMIT,
    RELAY_CONTROLLER_LIMIT,
    RELAY_TTL_MS,
} from '../lib/relay'
import { api, internal } from './_generated/api'
import http from './http'
import schema from './schema'

const modules = import.meta.glob('./**/*.*s')

const CONTROLLER_ID = 'controller-1'
const ACCESS_CLIENT_ID = 'access-client-1'
const USER_ID = 'user-1'
const REGISTRATION_SECRET = 'registration-secret'

function setup() {
    const t = convexTest(schema, modules)
    rateLimiter.register(t)
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

type TestConvex = ReturnType<typeof setup>['t']

async function seedController(t: TestConvex, controllerId = CONTROLLER_ID) {
    await t.run(async (ctx) => {
        await ctx.db.insert('controllers', {
            controllerId,
            publicKey: 'public-key',
            name: 'Home',
            registeredAt: Date.now(),
        })
    })
}

/**
 * The Account holds an active Membership by the latest signed routing
 * projection, which is what Relay routes on (NEM-133). Seeded as a stored
 * row; `membershipRoutes.test.ts` covers publishing and its signature check.
 */
type RouteSeed = {
    controllerId?: string
    userId?: string
    membershipId?: string
    state?: 'active' | 'ended'
    identityEpoch?: number
    sequence?: number
    accessClientIds?: string[]
}

async function seedRoute(t: TestConvex, seed: RouteSeed = {}) {
    const {
        controllerId = CONTROLLER_ID,
        userId = USER_ID,
        membershipId = `membership-${userId}`,
        state = 'active',
        identityEpoch = 1,
        sequence = 1,
        accessClientIds = state === 'active' ? [ACCESS_CLIENT_ID] : [],
    } = seed
    await t.run(async (ctx) => {
        await ctx.db.insert('membershipRoutes', {
            controllerId,
            identityEpoch,
            membershipId,
            accountId: userId,
            state,
            sequence,
            accessClientIds,
            signature: 'signature',
        })
    })
}

async function seedPairing(
    t: TestConvex,
    {
        controllerId = CONTROLLER_ID,
        userId = USER_ID,
        accessClientIds = [ACCESS_CLIENT_ID],
    }: {
        controllerId?: string
        userId?: string
        accessClientIds?: string[]
    } = {}
) {
    await seedController(t, controllerId)
    await seedRoute(t, { controllerId, userId, accessClientIds })
}

function account(t: TestConvex, subject: string) {
    return t.withIdentity({ subject, issuer: 'https://clerk.nemu.test' })
}

// Opaque blobs: Convex must store and return them byte for byte and never
// look inside. Distinctive values make the logging check meaningful.
function opaque(label: string) {
    return `${label}-c2VjcmV0LWhvbWUtY29udGVudHM`
}

function sealedRequest(
    overrides: {
        requestId?: string
        accessClientId?: string
        controllerId?: string
        counter?: number
        expiresAt?: number
        ciphertext?: string
    } = {}
) {
    return {
        header: {
            controllerId: overrides.controllerId ?? CONTROLLER_ID,
            identityEpoch: 1,
            accessClientId: overrides.accessClientId ?? ACCESS_CLIENT_ID,
            requestId: overrides.requestId ?? 'req',
            counter: overrides.counter ?? 1,
            expiresAt: overrides.expiresAt ?? Date.now() + 20_000,
        },
        enc: opaque('enc'),
        ciphertext: overrides.ciphertext ?? opaque('request-ciphertext'),
        signature: opaque('request-signature'),
    }
}

function sealedResponse(
    overrides: {
        requestId?: string
        accessClientId?: string
        controllerId?: string
        ciphertext?: string
    } = {}
) {
    return {
        header: {
            controllerId: overrides.controllerId ?? CONTROLLER_ID,
            identityEpoch: 1,
            accessClientId: overrides.accessClientId ?? ACCESS_CLIENT_ID,
            requestId: overrides.requestId ?? 'req',
        },
        ciphertext: overrides.ciphertext ?? opaque('response-ciphertext'),
        signature: opaque('response-signature'),
    }
}

function sealedPush(counter: number, requestId = 'watch') {
    return {
        header: {
            controllerId: CONTROLLER_ID,
            identityEpoch: 1,
            accessClientId: ACCESS_CLIENT_ID,
            requestId,
            counter,
        },
        ciphertext: opaque(`push-ciphertext-${counter}`),
        signature: opaque(`push-signature-${counter}`),
    }
}

function responsesFor(requestIds: string[]) {
    return {
        controllerId: CONTROLLER_ID,
        accessClientId: ACCESS_CLIENT_ID,
        requestIds,
    }
}

const STORED_FIELDS = [
    '_creationTime',
    '_id',
    'accessClientId',
    'ciphertext',
    'controllerId',
    'counter',
    'deleteAt',
    'enc',
    'expiresAt',
    'identityEpoch',
    'kind',
    'requestId',
    'signature',
]

beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-25T12:00:00Z'))
})

afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
})

describe('Relay envelope storage', () => {
    test('a request is stored as its clear header plus the opaque sealed parts, and nothing else', async () => {
        const { t, client, controller } = setup()
        await seedPairing(t)
        const sealed = sealedRequest()

        await client.mutation(api.relay.send, { sealed })

        const [stored] = await t.run((ctx) =>
            ctx.db.query('relayMessages').collect()
        )
        expect(Object.keys(stored ?? {}).sort()).toEqual(STORED_FIELDS)
        expect(stored).toMatchObject({
            kind: 'request',
            ...sealed.header,
            enc: sealed.enc,
            ciphertext: sealed.ciphertext,
            signature: sealed.signature,
        })
        expect(await controller.query(api.relay.pendingForMe, {})).toEqual([
            sealed,
        ])
    })

    test('a response is stored as its clear header plus ciphertext and signature', async () => {
        const { t, client, controller } = setup()
        await seedPairing(t)
        const sealed = sealedResponse()

        await controller.mutation(api.relay.respondAsController, { sealed })

        const [stored] = await t.run((ctx) =>
            ctx.db.query('relayMessages').collect()
        )
        expect(Object.keys(stored ?? {}).sort()).toEqual(
            [
                '_creationTime',
                '_id',
                'accessClientId',
                'ciphertext',
                'controllerId',
                'deleteAt',
                'identityEpoch',
                'kind',
                'requestId',
                'signature',
            ].sort()
        )
        const answered = await client.query(
            api.relay.responses,
            responsesFor(['req'])
        )
        expect(answered).toEqual([
            { _id: stored?._id, kind: 'response', sealed },
        ])
    })

    test('a push keeps its counter so the client can open it', async () => {
        const { t, client, controller } = setup()
        await seedPairing(t)

        await controller.mutation(api.relay.respondAsController, {
            sealed: sealedPush(1),
        })
        await controller.mutation(api.relay.respondAsController, {
            sealed: sealedPush(2),
        })

        const pushes = await client.query(
            api.relay.responses,
            responsesFor(['watch'])
        )
        expect(pushes.map(({ kind, sealed }) => ({ kind, sealed }))).toEqual([
            { kind: 'push', sealed: sealedPush(1) },
            { kind: 'push', sealed: sealedPush(2) },
        ])
    })

    test('send rejects fields outside the sealed request shape', async () => {
        const { t, client } = setup()
        await seedPairing(t)

        await expect(
            client.mutation(api.relay.send, {
                sealed: { ...sealedRequest(), payload: 'plaintext' },
            } as never)
        ).rejects.toThrow()
        await expect(
            client.mutation(api.relay.send, {
                sealed: {
                    ...sealedRequest(),
                    header: { ...sealedRequest().header, action: 'getHome' },
                },
            } as never)
        ).rejects.toThrow()
        await expect(
            client.mutation(api.relay.send, {
                sealed: sealedRequest({ counter: 0 }),
            })
        ).rejects.toThrow('malformed')

        expect(
            await t.run((ctx) => ctx.db.query('relayMessages').collect())
        ).toEqual([])
    })

    test('send rejects a request that has already expired', async () => {
        const { t, client } = setup()
        await seedPairing(t)

        await expect(
            client.mutation(api.relay.send, {
                sealed: sealedRequest({ expiresAt: Date.now() - 61_000 }),
            })
        ).rejects.toThrow('expired')
    })

    test('send requires an active Membership by the signed routing projection', async () => {
        const { t, client } = setup()
        await seedController(t)
        // A legacy pairing alone no longer routes.
        await t.run(async (ctx) => {
            await ctx.db.insert('pairings', {
                userId: USER_ID,
                controllerId: CONTROLLER_ID,
                createdAt: Date.now(),
                role: 'owner',
            })
        })

        await expect(
            client.mutation(api.relay.send, { sealed: sealedRequest() })
        ).rejects.toThrow('no_membership')
    })

    test('an Account whose Membership has ended can no longer send', async () => {
        const { t, client } = setup()
        await seedController(t)
        await seedRoute(t, { state: 'ended', sequence: 2 })

        await expect(
            client.mutation(api.relay.send, { sealed: sealedRequest() })
        ).rejects.toThrow('no_membership')
        expect(
            await client.query(api.relay.responses, responsesFor(['req']))
        ).toEqual([])
    })

    test('routes from a retired identity epoch no longer count', async () => {
        const { t, client } = setup()
        await seedController(t)
        // A restore republished the Home's Memberships under epoch 2, and
        // this Account was not among them.
        await seedRoute(t, { identityEpoch: 1, sequence: 9 })
        await seedRoute(t, {
            userId: 'user-2',
            identityEpoch: 2,
            sequence: 1,
        })

        await expect(
            client.mutation(api.relay.send, { sealed: sealedRequest() })
        ).rejects.toThrow('no_membership')
    })

    test('a Controller cannot answer for another Controller', async () => {
        const { t, controller } = setup()
        await seedPairing(t)
        await seedController(t, 'controller-2')

        await expect(
            controller.mutation(api.relay.respondAsController, {
                sealed: sealedResponse({ controllerId: 'controller-2' }),
            })
        ).rejects.toThrow('wrong_controller')
    })
})

describe('Relay routes only an Account’s own Access Clients', () => {
    // Another Account's Access Client, on a Home both Accounts belong to.
    const THEIRS = 'access-client-of-user-2'

    async function twoMembers() {
        const ctx = setup()
        await seedPairing(ctx.t)
        await seedRoute(ctx.t, { userId: 'user-2', accessClientIds: [THEIRS] })
        return ctx
    }

    test('send refuses an Access Client the Account’s projection does not name', async () => {
        const { client } = await twoMembers()
        for (const accessClientId of [THEIRS, 'made-up-access-client']) {
            await expect(
                client.mutation(api.relay.send, {
                    sealed: sealedRequest({ accessClientId }),
                })
            ).rejects.toThrow('no_membership')
        }
        await client.mutation(api.relay.send, { sealed: sealedRequest() })
    })

    test('responses never hands one Account another’s replies', async () => {
        const { t, client, controller } = await twoMembers()
        await controller.mutation(api.relay.respondAsController, {
            sealed: sealedResponse({ accessClientId: THEIRS }),
        })
        expect(
            await client.query(api.relay.responses, {
                ...responsesFor(['req']),
                accessClientId: THEIRS,
            })
        ).toEqual([])
        expect(
            await account(t, 'user-2').query(api.relay.responses, {
                ...responsesFor(['req']),
                accessClientId: THEIRS,
            })
        ).toHaveLength(1)
    })

    test('acknowledge skips another Account’s replies', async () => {
        const { t, client, controller } = await twoMembers()
        const theirs = await controller.mutation(
            api.relay.respondAsController,
            { sealed: sealedResponse({ accessClientId: THEIRS }) }
        )
        await client.mutation(api.relay.acknowledge, { messageIds: [theirs] })
        const left = await t.run((ctx) =>
            ctx.db.query('relayMessages').collect()
        )
        expect(left.map((message) => message._id)).toEqual([theirs])
    })
})

describe('Relay mailbox expiry', () => {
    test('the Controller receives unexpired requests and never expired ones', async () => {
        const { t, client, controller } = setup()
        await seedPairing(t)

        await client.mutation(api.relay.send, {
            sealed: sealedRequest({
                requestId: 'old',
                counter: 1,
                expiresAt: Date.now() + RELAY_TTL_MS,
            }),
        })
        vi.advanceTimersByTime(RELAY_TTL_MS - 1000)
        await client.mutation(api.relay.send, {
            sealed: sealedRequest({
                requestId: 'new',
                counter: 2,
                expiresAt: Date.now() + RELAY_TTL_MS,
            }),
        })

        const requestIds = async () =>
            (await controller.query(api.relay.pendingForMe, {})).map(
                (sealed) => sealed.header.requestId
            )
        expect(await requestIds()).toEqual(['old', 'new'])

        vi.advanceTimersByTime(2000)

        expect(await requestIds()).toEqual(['new'])
        const polled = await t.query(internal.relay.pendingForController, {
            controllerId: CONTROLLER_ID,
        })
        expect(polled.map((sealed) => sealed.header.requestId)).toEqual(['new'])
    })

    test('a request leaves the mailbox once its own expiry plus clock skew passes', async () => {
        const { t, client } = setup()
        await seedPairing(t)

        await client.mutation(api.relay.send, {
            sealed: sealedRequest({ expiresAt: Date.now() + 20_000 }),
        })
        vi.advanceTimersByTime(20_000 + 60_000 - 1)
        expect(
            await t.query(internal.relay.pendingForController, {
                controllerId: CONTROLLER_ID,
            })
        ).toHaveLength(1)

        vi.advanceTimersByTime(2)

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
            sealed: sealedResponse({
                requestId: 'old',
                ciphertext: 'old-response',
            }),
        })
        vi.advanceTimersByTime(RELAY_TTL_MS - 1000)
        await controller.mutation(api.relay.respondAsController, {
            sealed: sealedResponse({
                requestId: 'new',
                ciphertext: 'new-response',
            }),
        })

        const ciphertexts = async () =>
            (
                await client.query(
                    api.relay.responses,
                    responsesFor(['old', 'new'])
                )
            ).map((message) => message.sealed.ciphertext)
        expect(await ciphertexts()).toEqual(['old-response', 'new-response'])

        vi.advanceTimersByTime(2000)

        expect(await ciphertexts()).toEqual(['new-response'])
    })
})

describe('Relay mailbox answers', () => {
    test('answering a request deletes it and hands the response to the client', async () => {
        const { t, client, controller } = setup()
        await seedPairing(t)

        await client.mutation(api.relay.send, { sealed: sealedRequest() })
        await controller.mutation(api.relay.respondAsController, {
            sealed: sealedResponse(),
        })

        expect(await controller.query(api.relay.pendingForMe, {})).toEqual([])
        const stored = await t.run((ctx) =>
            ctx.db.query('relayMessages').collect()
        )
        expect(stored.map((message) => message.kind)).toEqual(['response'])
    })

    test('a response only removes the request of the same Access Client', async () => {
        const { t, client, controller } = setup()
        await seedPairing(t, {
            accessClientIds: [ACCESS_CLIENT_ID, 'other-client'],
        })

        await client.mutation(api.relay.send, {
            sealed: sealedRequest({ accessClientId: 'other-client' }),
        })
        await controller.mutation(api.relay.respondAsController, {
            sealed: sealedResponse(),
        })

        const pending = await controller.query(api.relay.pendingForMe, {})
        expect(pending.map((sealed) => sealed.header.accessClientId)).toEqual([
            'other-client',
        ])
    })

    test('a push leaves the watch request alone', async () => {
        const { t, client, controller } = setup()
        await seedPairing(t)

        await client.mutation(api.relay.send, {
            sealed: sealedRequest({ requestId: 'watch' }),
        })
        await controller.mutation(api.relay.respondAsController, {
            sealed: sealedPush(1),
        })

        expect(await controller.query(api.relay.pendingForMe, {})).toHaveLength(
            1
        )
    })

    test('answering through respondInternal also deletes the request', async () => {
        const { t, client, controller } = setup()
        await seedPairing(t)

        await client.mutation(api.relay.send, { sealed: sealedRequest() })
        await t.mutation(internal.relay.respondInternal, {
            sealed: sealedResponse(),
        })

        expect(await controller.query(api.relay.pendingForMe, {})).toEqual([])
    })

    test('respondInternal refuses an unknown Controller', async () => {
        const { t } = setup()

        await expect(
            t.mutation(internal.relay.respondInternal, {
                sealed: sealedResponse(),
            })
        ).rejects.toThrow('Controller not found')
    })

    test('clients only see responses for a Controller they are paired with', async () => {
        const { t, controller } = setup()
        await seedPairing(t)
        const stranger = t.withIdentity({
            subject: 'user-2',
            issuer: 'https://clerk.nemu.test',
        })

        await controller.mutation(api.relay.respondAsController, {
            sealed: sealedResponse(),
        })

        expect(
            await stranger.query(api.relay.responses, responsesFor(['req']))
        ).toEqual([])
    })
})

describe('Relay rate limits', () => {
    test('one Access Client is limited without blocking another on the same Controller', async () => {
        const { t, client } = setup()
        await seedPairing(t, {
            accessClientIds: [ACCESS_CLIENT_ID, 'access-client-2'],
        })

        for (let i = 0; i < RELAY_ACCESS_CLIENT_LIMIT.capacity; i++) {
            await client.mutation(api.relay.send, {
                sealed: sealedRequest({ requestId: `a-${i}`, counter: i + 1 }),
            })
        }
        await expect(
            client.mutation(api.relay.send, {
                sealed: sealedRequest({ requestId: 'a-over', counter: 999 }),
            })
        ).rejects.toThrow('RateLimited')

        await client.mutation(api.relay.send, {
            sealed: sealedRequest({
                requestId: 'b-0',
                accessClientId: 'access-client-2',
            }),
        })
    })

    test('an Account is limited across all of its Access Clients', async () => {
        const { t, client } = setup()
        const mine = ['phone', 'tablet', 'laptop', 'browser']
        await seedPairing(t, { accessClientIds: mine })
        await seedRoute(t, { userId: 'user-2', accessClientIds: ['theirs'] })

        const perClient = RELAY_ACCOUNT_LIMIT.capacity / mine.length
        for (const accessClientId of mine) {
            for (let i = 0; i < perClient; i++) {
                await client.mutation(api.relay.send, {
                    sealed: sealedRequest({
                        requestId: `${accessClientId}-${i}`,
                        accessClientId,
                    }),
                })
            }
        }
        await expect(
            client.mutation(api.relay.send, {
                sealed: sealedRequest({
                    requestId: 'over',
                    accessClientId: 'phone',
                }),
            })
        ).rejects.toThrow('RateLimited')

        // Another Member of the Home is not held back.
        await account(t, 'user-2').mutation(api.relay.send, {
            sealed: sealedRequest({
                requestId: 'theirs',
                accessClientId: 'theirs',
            }),
        })
    })

    test('a Controller is limited across all of its Accounts', async () => {
        const { t } = setup()
        const accounts = Array.from(
            { length: RELAY_CONTROLLER_LIMIT.capacity / 50 + 1 },
            (_, i) => `user-${i}`
        )
        await seedController(t)
        await seedController(t, 'controller-2')
        for (const userId of accounts) {
            await seedRoute(t, {
                userId,
                accessClientIds: [`client-${userId}`],
            })
        }
        await seedRoute(t, {
            controllerId: 'controller-2',
            userId: 'user-0',
            accessClientIds: ['client-user-0'],
        })

        const [last, ...budgeted] = [...accounts].reverse()
        for (const userId of budgeted) {
            for (let i = 0; i < 50; i++) {
                await account(t, userId).mutation(api.relay.send, {
                    sealed: sealedRequest({
                        requestId: `${userId}-${i}`,
                        accessClientId: `client-${userId}`,
                    }),
                })
            }
        }
        await expect(
            account(t, last ?? '').mutation(api.relay.send, {
                sealed: sealedRequest({
                    requestId: 'over',
                    accessClientId: `client-${last}`,
                }),
            })
        ).rejects.toThrow('RateLimited')

        await account(t, 'user-0').mutation(api.relay.send, {
            sealed: sealedRequest({
                requestId: 'elsewhere',
                controllerId: 'controller-2',
                accessClientId: 'client-user-0',
            }),
        })
    })

    test('the Access Client budget refills over time', async () => {
        const { t, client } = setup()
        await seedPairing(t)

        for (let i = 0; i < RELAY_ACCESS_CLIENT_LIMIT.capacity; i++) {
            await client.mutation(api.relay.send, {
                sealed: sealedRequest({ requestId: `a-${i}`, counter: i + 1 }),
            })
        }
        vi.advanceTimersByTime(RELAY_ACCESS_CLIENT_LIMIT.period)

        await client.mutation(api.relay.send, {
            sealed: sealedRequest({
                requestId: 'later',
                counter: 1000,
                expiresAt: Date.now() + 20_000,
            }),
        })
    })
})

describe('Relay HTTP fallback', () => {
    async function post(t: TestConvex, path: string, body: unknown) {
        return await t.fetch(path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        })
    }

    test('/relay/pending returns sealed requests in the new shape', async () => {
        vi.stubEnv('CONTROLLER_REGISTRATION_SECRET', REGISTRATION_SECRET)
        const { t, client } = setup()
        await seedPairing(t)
        const sealed = sealedRequest()
        await client.mutation(api.relay.send, { sealed })

        const response = await post(t, '/relay/pending', {
            controllerId: CONTROLLER_ID,
            registrationSecret: REGISTRATION_SECRET,
        })

        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({ messages: [sealed] })
    })

    test('/relay/respond stores a sealed response and clears the request', async () => {
        vi.stubEnv('CONTROLLER_REGISTRATION_SECRET', REGISTRATION_SECRET)
        const { t, client, controller } = setup()
        await seedPairing(t)
        await client.mutation(api.relay.send, { sealed: sealedRequest() })
        const sealed = sealedResponse()

        const response = await post(t, '/relay/respond', {
            registrationSecret: REGISTRATION_SECRET,
            sealed,
        })

        expect(response.status).toBe(200)
        expect(await controller.query(api.relay.pendingForMe, {})).toEqual([])
        const answered = await client.query(
            api.relay.responses,
            responsesFor(['req'])
        )
        expect(answered.map((message) => message.sealed)).toEqual([sealed])
    })

    test('/relay/respond rejects the old plaintext shape', async () => {
        vi.stubEnv('CONTROLLER_REGISTRATION_SECRET', REGISTRATION_SECRET)
        const { t } = setup()
        await seedPairing(t)

        const response = await post(t, '/relay/respond', {
            registrationSecret: REGISTRATION_SECRET,
            controllerId: CONTROLLER_ID,
            requestId: 'req',
            payload: 'plaintext',
        })

        expect(response.status).toBe(400)
    })

    test('/relay/respond requires the registration secret', async () => {
        vi.stubEnv('CONTROLLER_REGISTRATION_SECRET', REGISTRATION_SECRET)
        const { t } = setup()
        await seedPairing(t)

        const response = await post(t, '/relay/respond', {
            registrationSecret: 'wrong',
            sealed: sealedResponse(),
        })

        expect(response.status).toBe(401)
    })

    test('http routes stay registered', () => {
        expect(http.isRouter).toBe(true)
    })
})

describe('Relay logging', () => {
    test('no Relay path logs or echoes envelope contents', async () => {
        vi.stubEnv('CONTROLLER_REGISTRATION_SECRET', REGISTRATION_SECRET)
        const logged: unknown[][] = []
        for (const method of [
            'log',
            'info',
            'warn',
            'error',
            'debug',
            'trace',
        ] as const) {
            vi.spyOn(console, method).mockImplementation((...args) => {
                logged.push(args)
            })
        }
        const { t, client, controller } = setup()
        await seedPairing(t)
        const secrets = [
            'request-ciphertext',
            'request-signature',
            'enc',
            'response-ciphertext',
            'response-signature',
        ].map(opaque)
        const errors: string[] = []
        const capture = async (run: () => Promise<unknown>) => {
            try {
                await run()
            } catch (error) {
                errors.push(String(error))
            }
        }

        await client.mutation(api.relay.send, { sealed: sealedRequest() })
        await controller.query(api.relay.pendingForMe, {})
        await t.fetch('/relay/pending', {
            method: 'POST',
            body: JSON.stringify({
                controllerId: CONTROLLER_ID,
                registrationSecret: REGISTRATION_SECRET,
            }),
        })
        await controller.mutation(api.relay.respondAsController, {
            sealed: sealedResponse(),
        })
        await client.query(api.relay.responses, responsesFor(['req']))
        // Failure paths must not echo the envelope either.
        await capture(() =>
            client.mutation(api.relay.send, {
                sealed: sealedRequest({ counter: 0 }),
            })
        )
        await capture(() =>
            client.mutation(api.relay.send, {
                sealed: sealedRequest({ expiresAt: 0 }),
            })
        )
        await capture(() =>
            controller.mutation(api.relay.respondAsController, {
                sealed: sealedResponse({ controllerId: 'controller-2' }),
            })
        )
        const badHttp = await t.fetch('/relay/respond', {
            method: 'POST',
            body: JSON.stringify({
                registrationSecret: REGISTRATION_SECRET,
                sealed: { ...sealedResponse(), header: { requestId: 'x' } },
            }),
        })
        errors.push(await badHttp.text())

        const output = JSON.stringify(logged) + errors.join('\n')
        for (const secret of secrets) {
            expect(output).not.toContain(secret)
        }
        expect(errors.length).toBeGreaterThan(0)
    })
})

describe('Relay mailbox cleanup', () => {
    async function seedMessages({
        t,
        count,
        deleteAt,
        prefix,
    }: {
        t: TestConvex
        count: number
        deleteAt: number
        prefix: string
    }) {
        await t.run(async (ctx) => {
            for (let i = 0; i < count; i++) {
                const { header, ...rest } = sealedRequest({
                    requestId: `${prefix}-${i}`,
                })
                await ctx.db.insert('relayMessages', {
                    kind: 'request',
                    ...header,
                    ...rest,
                    deleteAt,
                })
            }
        })
    }

    async function remainingRequestIds(t: TestConvex) {
        return t.run(async (ctx) =>
            (await ctx.db.query('relayMessages').collect()).map(
                (message) => message.requestId
            )
        )
    }

    test('removes expired messages and leaves unexpired ones', async () => {
        const { t } = setup()
        await seedMessages({
            t,
            count: 3,
            deleteAt: Date.now() - 1,
            prefix: 'expired',
        })
        await seedMessages({
            t,
            count: 2,
            deleteAt: Date.now() + RELAY_TTL_MS,
            prefix: 'live',
        })

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
        await seedMessages({
            t,
            count: backlog,
            deleteAt: Date.now() - 1,
            prefix: 'expired',
        })
        await seedMessages({
            t,
            count: 1,
            deleteAt: Date.now() + RELAY_TTL_MS,
            prefix: 'live',
        })

        expect(await t.mutation(internal.relay.cleanup, {})).toBe(
            CLEANUP_BATCH_SIZE
        )
        expect(await remainingRequestIds(t)).toHaveLength(
            backlog - CLEANUP_BATCH_SIZE + 1
        )

        await t.finishAllScheduledFunctions(vi.runAllTimers)

        expect(await remainingRequestIds(t)).toEqual(['live-0'])
    })
})

describe('Relay mailbox acknowledge', () => {
    async function storedIds(t: TestConvex) {
        const messages = await t.run((ctx) =>
            ctx.db.query('relayMessages').collect()
        )
        return messages.map((message) => message._id)
    }

    test('deletes a response for a Controller the caller is paired with', async () => {
        const { t, client, controller } = setup()
        await seedPairing(t)

        const responseId = await controller.mutation(
            api.relay.respondAsController,
            { sealed: sealedResponse() }
        )
        await client.mutation(api.relay.acknowledge, {
            messageIds: [responseId],
        })

        expect(await storedIds(t)).toEqual([])
    })

    test('deletes only the acknowledged messages of a watch stream', async () => {
        const { t, client, controller } = setup()
        await seedPairing(t)

        const first = await controller.mutation(api.relay.respondAsController, {
            sealed: sealedPush(1),
        })
        await controller.mutation(api.relay.respondAsController, {
            sealed: sealedPush(2),
        })
        await client.mutation(api.relay.acknowledge, { messageIds: [first] })

        const left = await client.query(
            api.relay.responses,
            responsesFor(['watch'])
        )
        expect(left.map((message) => message.sealed.header)).toEqual([
            sealedPush(2).header,
        ])
    })

    test('skips responses for a Controller the caller is not paired with', async () => {
        const { t, controller } = setup()
        await seedPairing(t)
        const other = t.withIdentity({
            subject: 'user-2',
            issuer: 'https://clerk.nemu.test',
        })
        await seedRoute(t, { userId: 'user-2', controllerId: 'controller-2' })

        const responseId = await controller.mutation(
            api.relay.respondAsController,
            { sealed: sealedResponse() }
        )
        await other.mutation(api.relay.acknowledge, {
            messageIds: [responseId],
        })

        expect(await storedIds(t)).toEqual([responseId])
    })

    test('never deletes requests sent to the Controller', async () => {
        const { t, client } = setup()
        await seedPairing(t)

        const requestId = await client.mutation(api.relay.send, {
            sealed: sealedRequest(),
        })
        await client.mutation(api.relay.acknowledge, {
            messageIds: [requestId],
        })

        expect(await storedIds(t)).toEqual([requestId])
    })

    test('skips missing and malformed IDs and is safe to call twice', async () => {
        const { t, client, controller } = setup()
        await seedPairing(t)

        const responseId = await controller.mutation(
            api.relay.respondAsController,
            { sealed: sealedResponse() }
        )
        const kept = await controller.mutation(api.relay.respondAsController, {
            sealed: sealedResponse({ requestId: 'other' }),
        })
        const routeId = await t.run(async (ctx) => {
            const route = await ctx.db.query('membershipRoutes').first()
            return route?._id ?? ''
        })

        for (let attempt = 0; attempt < 2; attempt++) {
            await client.mutation(api.relay.acknowledge, {
                messageIds: [responseId, 'not-an-id', routeId],
            })
        }

        expect(await storedIds(t)).toEqual([kept])
        expect(
            await t.run((ctx) => ctx.db.query('membershipRoutes').collect())
        ).toHaveLength(1)
    })
})
