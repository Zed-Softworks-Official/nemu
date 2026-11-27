// Seam 4 (NEM-133): Convex keeps the latest signed Membership routing
// projection per Membership, checks every one against the Controller's
// registered key, and routes Relay on it.

import rateLimiter from '@convex-dev/rate-limiter/test'
import {
    ed25519PublicKey,
    ed25519Signer,
    type MembershipProjection,
    signMembershipProjection,
    verifyMembershipProjection,
} from '@nemu/protocol/relay-crypto'
import { convexTest } from 'convex-test'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { api } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob('./**/*.*s')

const CONTROLLER_ID = 'nemu_0123456789abcdef'
const USER_ID = 'user_2abc'
const REGISTRATION_SECRET = 'registration-secret'
const controllerSecret = new Uint8Array(32).fill(7)
const impostorSecret = new Uint8Array(32).fill(9)
const controllerKey = ed25519PublicKey(controllerSecret)

function base64(bytes: Uint8Array): string {
    return btoa(String.fromCharCode(...bytes))
}

function setup() {
    const t = convexTest(schema, modules)
    rateLimiter.register(t)
    const client = t.withIdentity({
        subject: USER_ID,
        issuer: 'https://clerk.nemu.test',
    })
    return { t, client }
}

type TestConvex = ReturnType<typeof setup>['t']

async function seedController(t: TestConvex) {
    await t.run(async (ctx) => {
        await ctx.db.insert('controllers', {
            controllerId: CONTROLLER_ID,
            publicKey: base64(controllerKey),
            name: 'Home',
            registeredAt: Date.now(),
        })
    })
}

function projection(
    overrides: Partial<MembershipProjection> = {}
): MembershipProjection {
    return {
        controllerId: CONTROLLER_ID,
        identityEpoch: 1,
        membershipId: 'membership-1',
        accountId: USER_ID,
        state: 'active',
        sequence: 1,
        ...overrides,
    }
}

async function signed(
    overrides: Partial<MembershipProjection> = {},
    secret = controllerSecret
) {
    return await signMembershipProjection(
        projection(overrides),
        ed25519Signer(secret)
    )
}

async function publish(t: TestConvex, body: unknown) {
    const response = await t.fetch('/membership/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    })
    return { status: response.status, body: await response.json() }
}

function sealedRequest() {
    return {
        header: {
            controllerId: CONTROLLER_ID,
            identityEpoch: 1,
            accessClientId: 'access-client-1',
            requestId: 'req',
            counter: 1,
            expiresAt: Date.now() + 20_000,
        },
        enc: 'enc',
        ciphertext: 'ciphertext',
        signature: 'signature',
    }
}

async function routes(t: TestConvex) {
    return await t.run((ctx) => ctx.db.query('membershipRoutes').collect())
}

beforeEach(() => {
    vi.stubEnv('CONTROLLER_REGISTRATION_SECRET', REGISTRATION_SECRET)
})

afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
})

describe('Publishing Membership routing projections', () => {
    test('a signed projection is stored as routing facts and its signature, nothing else', async () => {
        const { t } = setup()
        await seedController(t)
        const projectionSigned = await signed()

        expect(
            await publish(t, {
                registrationSecret: REGISTRATION_SECRET,
                signed: projectionSigned,
            })
        ).toEqual({ status: 200, body: { outcome: 'stored' } })

        const [stored] = await routes(t)
        expect(Object.keys(stored ?? {}).sort()).toEqual([
            '_creationTime',
            '_id',
            'accountId',
            'controllerId',
            'identityEpoch',
            'membershipId',
            'sequence',
            'signature',
            'state',
        ])
        expect(stored).toMatchObject({
            ...projectionSigned.projection,
            signature: projectionSigned.signature,
        })
    })

    test('a projection not signed by the registered Controller key is refused', async () => {
        const { t } = setup()
        await seedController(t)

        expect(
            await publish(t, {
                registrationSecret: REGISTRATION_SECRET,
                signed: await signed({}, impostorSecret),
            })
        ).toEqual({ status: 403, body: { error: 'bad_signature' } })
        const tampered = await signed()
        tampered.projection.state = 'ended'
        expect(
            await publish(t, {
                registrationSecret: REGISTRATION_SECRET,
                signed: tampered,
            })
        ).toEqual({ status: 403, body: { error: 'bad_signature' } })
        expect(await routes(t)).toEqual([])
    })

    test('malformed projections, unknown Controllers and a wrong secret are refused', async () => {
        const { t } = setup()
        await seedController(t)
        const good = await signed()

        expect(
            await publish(t, {
                registrationSecret: REGISTRATION_SECRET,
                signed: {
                    ...good,
                    projection: { ...good.projection, role: 'owner' },
                },
            })
        ).toEqual({ status: 400, body: { error: 'malformed' } })
        expect(
            await publish(t, {
                registrationSecret: REGISTRATION_SECRET,
                signed: await signed({ controllerId: 'nemu_fedcba9876543210' }),
            })
        ).toEqual({ status: 404, body: { error: 'Controller not found' } })
        expect(
            (await publish(t, { registrationSecret: 'wrong', signed: good }))
                .status
        ).toBe(401)
        expect(await routes(t)).toEqual([])
    })

    test('only a newer projection replaces the one held for its Membership', async () => {
        const { t } = setup()
        await seedController(t)
        const body = async (overrides: Partial<MembershipProjection>) => ({
            registrationSecret: REGISTRATION_SECRET,
            signed: await signed(overrides),
        })

        await publish(t, await body({ sequence: 5 }))
        expect(
            await publish(t, await body({ sequence: 4, state: 'ended' }))
        ).toEqual({ status: 200, body: { outcome: 'stale' } })
        expect(
            await publish(t, await body({ sequence: 5, state: 'ended' }))
        ).toEqual({ status: 200, body: { outcome: 'stale' } })
        expect((await routes(t)).map((r) => [r.state, r.sequence])).toEqual([
            ['active', 5],
        ])

        await publish(t, await body({ sequence: 6, state: 'ended' }))
        expect((await routes(t)).map((r) => [r.state, r.sequence])).toEqual([
            ['ended', 6],
        ])

        // A restored Home's new epoch wins even with a rewound sequence.
        await publish(t, await body({ identityEpoch: 2, sequence: 1 }))
        expect(
            (await routes(t)).map((r) => [r.state, r.identityEpoch, r.sequence])
        ).toEqual([['active', 2, 1]])
    })
})

describe('Relay routing on the projection', () => {
    test('an Account sends while active and is refused once its Membership ends', async () => {
        const { t, client } = setup()
        await seedController(t)
        const publishAt = async (overrides: Partial<MembershipProjection>) =>
            await publish(t, {
                registrationSecret: REGISTRATION_SECRET,
                signed: await signed(overrides),
            })

        await expect(
            client.mutation(api.relay.send, { sealed: sealedRequest() })
        ).rejects.toThrow('no_membership')

        await publishAt({ sequence: 1 })
        await client.mutation(api.relay.send, { sealed: sealedRequest() })

        await publishAt({ sequence: 2, state: 'ended' })
        await expect(
            client.mutation(api.relay.send, { sealed: sealedRequest() })
        ).rejects.toThrow('no_membership')
    })

    test('clients read back exactly what the Controller signed, and only their own', async () => {
        const { t, client } = setup()
        await seedController(t)
        const original = await signed({ sequence: 3 })
        await publish(t, {
            registrationSecret: REGISTRATION_SECRET,
            signed: original,
        })
        const args = {
            controllerId: CONTROLLER_ID,
            membershipId: 'membership-1',
        }

        const read = await client.query(api.relay.membership, args)
        expect(read).toEqual(original)
        expect(
            verifyMembershipProjection(read, CONTROLLER_ID, controllerKey)
        ).toEqual(original.projection)

        const stranger = t.withIdentity({
            subject: 'user-2',
            issuer: 'https://clerk.nemu.test',
        })
        expect(await stranger.query(api.relay.membership, args)).toBeNull()
        expect(
            await client.query(api.relay.membership, {
                ...args,
                membershipId: 'membership-2',
            })
        ).toBeNull()
    })

    test('publishing never logs the projection', async () => {
        const { t } = setup()
        await seedController(t)
        const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map(
            (level) => vi.spyOn(console, level)
        )

        const good = await signed()
        await publish(t, {
            registrationSecret: REGISTRATION_SECRET,
            signed: good,
        })
        await publish(t, {
            registrationSecret: REGISTRATION_SECRET,
            signed: await signed({}, impostorSecret),
        })

        const logged = JSON.stringify(spies.flatMap((spy) => spy.mock.calls))
        expect(logged).not.toContain(USER_ID)
        expect(logged).not.toContain(good.signature)
    })
})
