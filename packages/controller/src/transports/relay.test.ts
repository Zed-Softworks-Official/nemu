// Seam 3 (NEM-63 spec): RelayTransport against a faked Convex mailbox with a
// sealing Controller behind it (`fake-relay-mailbox.ts`).

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ControllerConnection } from '../connection.ts'
import { createMemoryRelayCounter } from '../relay-counter.ts'
import {
    FAKE_ACCESS_CLIENT_ID,
    FAKE_HOME_ID,
    FAKE_RELAY_API,
    type FakeAnswer,
    FakeRelayMailbox,
    type FakeRelayMailboxOptions,
} from './fake-relay-mailbox.ts'
import { RelayTransport } from './relay.ts'

type Setup = FakeRelayMailboxOptions & {
    commandTimeoutMs?: number
    membershipRefreshMs?: number
    enrollment?: { identityEpoch?: number }
    pair?: boolean
    counterStart?: number
}

async function relayWith(setup: Setup = {}) {
    const mailbox = new FakeRelayMailbox(setup)
    if (setup.pair ?? true) await mailbox.pair(setup.enrollment)
    const relay = new RelayTransport({
        convex: mailbox.convex,
        api: FAKE_RELAY_API,
        controllerId: FAKE_HOME_ID,
        keyStore: mailbox.keyStore,
        counter: createMemoryRelayCounter(setup.counterStart ?? 0),
        pollIntervalMs: 1,
        commandTimeoutMs: setup.commandTimeoutMs ?? 2_000,
        ...(setup.membershipRefreshMs === undefined
            ? {}
            : { membershipRefreshMs: setup.membershipRefreshMs }),
    })
    return { mailbox, relay }
}

/** Runs `body` against a connected transport, then disconnects it. */
async function withRelay(
    setup: Setup,
    body: (ctx: Awaited<ReturnType<typeof relayWith>>) => Promise<void>
) {
    const ctx = await relayWith(setup)
    await ctx.relay.connect()
    try {
        await body(ctx)
    } finally {
        ctx.relay.disconnect()
    }
}

/** Actions the Controller opened, without the background capability watch. */
function actions(mailbox: FakeRelayMailbox) {
    return mailbox.opened.filter((m) => m.type !== 'watchCapabilityChanges')
}

const answering =
    (reply: unknown): FakeAnswer =>
    (message) =>
        message.type === 'watchCapabilityChanges'
            ? { type: 'capabilityWatchAck' }
            : reply

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

describe('RelayTransport seals every request', () => {
    it('sends Convex only the clear header and opaque bytes', async () => {
        await withRelay(
            {
                answer: (message) =>
                    message.type === 'createRoom'
                        ? { type: 'room', room: { id: 'den', name: 'Den' } }
                        : answering({ type: 'rooms', rooms })(
                              message,
                              {} as never
                          ),
            },
            async ({ mailbox, relay }) => {
                assert.deepEqual(await relay.getRooms(), rooms)
                await relay.createRoom({ name: 'Secret Den' })
                const wire = JSON.stringify(mailbox.wire)
                for (const secret of ['getRooms', 'createRoom', 'Secret Den']) {
                    assert.equal(wire.includes(secret), false, secret)
                }
                for (const sealed of mailbox.wire) {
                    assert.deepEqual(Object.keys(sealed).sort(), [
                        'ciphertext',
                        'enc',
                        'header',
                        'signature',
                    ])
                    assert.equal(sealed.header.controllerId, FAKE_HOME_ID)
                    assert.equal(
                        sealed.header.accessClientId,
                        FAKE_ACCESS_CLIENT_ID
                    )
                    assert.equal(sealed.header.identityEpoch, 1)
                }
            }
        )
    })

    it('never puts a bearer token in an envelope', async () => {
        await withRelay(
            { answer: answering({ type: 'rooms', rooms }) },
            async ({ mailbox, relay }) => {
                await relay.getRooms()
                for (const message of mailbox.opened) {
                    assert.equal('clientToken' in message, false)
                }
                assert.equal(
                    JSON.stringify(mailbox.opened).includes('client'),
                    false
                )
            }
        )
    })

    it('gives every request a new counter and an expiry', async () => {
        await withRelay(
            {
                answer: answering({ type: 'rooms', rooms }),
                commandTimeoutMs: 5_000,
            },
            async ({ mailbox, relay }) => {
                const before = Date.now()
                await relay.getRooms()
                await relay.getRooms()
                const counters = mailbox.wire.map((s) => s.header.counter)
                assert.equal(new Set(counters).size, counters.length)
                assert.deepEqual(
                    [...counters].sort((a, b) => a - b),
                    counters.map((_, i) => i + 1)
                )
                for (const { header } of mailbox.wire) {
                    assert.ok(header.expiresAt >= before + 5_000)
                    assert.ok(header.expiresAt <= Date.now() + 5_000)
                }
            }
        )
    })

    it('refuses to connect without keys for this Home', async () => {
        const { mailbox, relay } = await relayWith({ pair: false })
        await assert.rejects(relay.connect(), { code: 'not_paired' })
        await assert.rejects(relay.getRooms(), { code: 'not_paired' })
        assert.deepEqual(mailbox.wire, [])
    })
})

describe('RelayTransport checks every reply against the pinned key', () => {
    it('ignores a reply signed by anyone but the paired Controller', async () => {
        await withRelay(
            {
                answer: answering({ type: 'rooms', rooms }),
                commandTimeoutMs: 150,
            },
            async ({ mailbox, relay }) => {
                mailbox.impostor = true
                await assert.rejects(relay.getRooms(), /timed out/)
                // Discarded, not kept for later.
                await until(() => mailbox.stored.length === 0)
            }
        )
    })

    it('ignores a reply Convex altered', async () => {
        await withRelay(
            {
                answer: answering({ type: 'rooms', rooms }),
                commandTimeoutMs: 150,
            },
            async ({ mailbox, relay }) => {
                mailbox.tamper = (sealed) => ({
                    ...sealed,
                    ciphertext: `A${sealed.ciphertext.slice(1)}`,
                })
                await assert.rejects(relay.getRooms(), /timed out/)
            }
        )
    })

    it('takes the genuine reply when a forged one sits beside it', async () => {
        await withRelay(
            {
                answer: (message) =>
                    message.type === 'watchCapabilityChanges'
                        ? { type: 'capabilityWatchAck' }
                        : undefined,
            },
            async ({ mailbox, relay }) => {
                const result = relay.getRooms()
                await until(() => mailbox.pendingRequestIds().length > 0)
                const requestId = mailbox.pendingRequestIds()[0] ?? ''
                const forged = mailbox.forge(requestId)
                await tick(20)
                const genuine = await mailbox.respond(requestId, {
                    type: 'rooms',
                    rooms,
                })
                assert.deepEqual(await result, rooms)
                await until(() => mailbox.stored.length === 0)
                assert.ok(mailbox.acks.flat().includes(forged))
                assert.ok(mailbox.acks.flat().includes(genuine))
            }
        )
    })
})

describe('RelayTransport recovers from signed refusals', () => {
    it('re-addresses to the identity epoch the Controller names, and keeps it', async () => {
        await withRelay(
            {
                answer: answering({ type: 'rooms', rooms }),
                identityEpoch: 3,
            },
            async ({ mailbox, relay }) => {
                assert.deepEqual(await relay.getRooms(), rooms)
                const epochs = mailbox.wire.map((s) => s.header.identityEpoch)
                assert.equal(epochs[0], 1)
                assert.equal(epochs.at(-1), 3)
                const record = await mailbox.keyStore.load(FAKE_HOME_ID)
                assert.equal(record?.enrollment.identityEpoch, 3)

                mailbox.wire.length = 0
                await relay.getRooms()
                assert.deepEqual(
                    mailbox.wire.map((s) => s.header.identityEpoch),
                    [3]
                )
            }
        )
    })

    it('moves its counter past the window when its counters were lost', async () => {
        const { mailbox, relay } = await relayWith({
            answer: answering({ type: 'rooms', rooms }),
        })
        // The Controller already accepted counters up to 500 from this client.
        mailbox.window = { highest: 500, seen: 1n }
        await relay.connect()
        try {
            assert.deepEqual(await relay.getRooms(), rooms)
            const counters = mailbox.wire.map((s) => s.header.counter)
            assert.ok(
                counters.some((counter) => counter > 500),
                `${counters}`
            )
        } finally {
            relay.disconnect()
        }
    })

    it('sends a retry as the same request, so a stored outcome answers it', async () => {
        await withRelay(
            {
                answer: answering({
                    type: 'room',
                    room: { id: 'den', name: 'Den' },
                }),
                identityEpoch: 2,
            },
            async ({ mailbox, relay }) => {
                await relay.createRoom({ name: 'Den' })
                const sends = mailbox.wire.filter(
                    (s) =>
                        s.header.requestId ===
                        mailbox.wire.at(-1)?.header.requestId
                )
                assert.equal(sends.length, 2)
                assert.notEqual(
                    sends[0]?.header.counter,
                    sends[1]?.header.counter
                )
                assert.deepEqual(actions(mailbox), [
                    { type: 'createRoom', name: 'Den' },
                ])
            }
        )
    })

    it('tells the user to pair again when the Controller no longer knows it', async () => {
        await withRelay({}, async ({ mailbox, relay }) => {
            mailbox.paired = false
            await assert.rejects(relay.getRooms(), {
                code: 'unknown_access_client',
            })
        })
    })
})

describe('RelayTransport reads the signed Membership routing projection', () => {
    // Distinct epochs addressed, since the background watch sends too.
    const epochsSent = (mailbox: FakeRelayMailbox) => [
        ...new Set(mailbox.wire.map((s) => s.header.identityEpoch)),
    ]

    it('takes the identity epoch from the verified projection, so no refusal is needed', async () => {
        const { mailbox, relay } = await relayWith({
            answer: answering({ type: 'rooms', rooms }),
            identityEpoch: 3,
        })
        await mailbox.publishMembership({ identityEpoch: 3 })
        await relay.connect()
        try {
            assert.deepEqual(await relay.getRooms(), rooms)
            assert.deepEqual(epochsSent(mailbox), [3])
            const record = await mailbox.keyStore.load(FAKE_HOME_ID)
            assert.equal(record?.enrollment.identityEpoch, 3)
            assert.deepEqual(
                [...new Set(mailbox.membershipReads)],
                ['membership-1']
            )
        } finally {
            relay.disconnect()
        }
    })

    it('picks up a restored Home’s new epoch from a newer projection', async () => {
        await withRelay(
            {
                answer: answering({ type: 'rooms', rooms }),
                membershipRefreshMs: 0,
            },
            async ({ mailbox, relay }) => {
                await mailbox.publishMembership()
                await relay.getRooms()
                mailbox.identityEpoch = 2
                await mailbox.publishMembership({ identityEpoch: 2 })

                mailbox.wire.length = 0
                await relay.getRooms()
                assert.deepEqual(epochsSent(mailbox), [2])
            }
        )
    })

    it('never trusts a projection it cannot verify or that is not its own', async () => {
        await withRelay(
            {
                answer: answering({ type: 'rooms', rooms }),
                membershipRefreshMs: 0,
            },
            async ({ mailbox, relay }) => {
                await mailbox.publishMembership(
                    { identityEpoch: 9 },
                    { impostor: true }
                )
                mailbox.wire.length = 0
                await relay.getRooms()
                assert.deepEqual(epochsSent(mailbox), [1])

                await mailbox.publishMembership({
                    identityEpoch: 9,
                    controllerId: 'nemu_fedcba9876543210',
                })
                mailbox.wire.length = 0
                await relay.getRooms()
                assert.deepEqual(epochsSent(mailbox), [1])
            }
        )
    })

    it('never moves back to an older epoch', async () => {
        await withRelay(
            {
                answer: answering({ type: 'rooms', rooms }),
                identityEpoch: 4,
                enrollment: { identityEpoch: 4 },
                membershipRefreshMs: 0,
            },
            async ({ mailbox, relay }) => {
                await mailbox.publishMembership({ identityEpoch: 2 })
                mailbox.wire.length = 0
                await relay.getRooms()
                assert.deepEqual(epochsSent(mailbox), [4])
            }
        )
    })

    it('keeps the signed refusal as a backstop when no projection is published', async () => {
        await withRelay(
            { answer: answering({ type: 'rooms', rooms }), identityEpoch: 2 },
            async ({ mailbox, relay }) => {
                assert.deepEqual(await relay.getRooms(), rooms)
                assert.equal(mailbox.wire.at(-1)?.header.identityEpoch, 2)
            }
        )
    })

    it('says the Membership ended once the Controller signed it ended', async () => {
        await withRelay(
            { answer: answering({ type: 'rooms', rooms }) },
            async ({ mailbox, relay }) => {
                await mailbox.publishMembership()
                await relay.getRooms()
                // Convex now refuses the send; the client re-reads the
                // projection to learn why.
                await mailbox.publishMembership({ state: 'ended' })
                await assert.rejects(relay.getRooms(), {
                    code: 'membership_ended',
                })
            }
        )
    })

    it('does not end anything on a refusal it cannot verify', async () => {
        await withRelay(
            { answer: answering({ type: 'rooms', rooms }) },
            async ({ mailbox, relay }) => {
                await mailbox.publishMembership(
                    { state: 'ended' },
                    { impostor: true }
                )
                await assert.rejects(relay.getRooms(), {
                    code: 'no_membership',
                })
                assert.ok(await mailbox.keyStore.load(FAKE_HOME_ID))
            }
        )
    })
})

describe('RelayTransport writes while disconnected', () => {
    const writes: Record<string, (relay: RelayTransport) => Promise<unknown>> =
        {
            sendCommand: (relay) =>
                relay.sendCommand({
                    deviceId: 'lamp',
                    payload: { state: 'ON' },
                }),
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
            revokeAccessClient: (relay) => relay.revokeAccessClient('ac'),
            revokeCurrentAccessClient: (relay) =>
                relay.revokeCurrentAccessClient(),
            leaveHome: (relay) => relay.leaveHome(),
        }

    for (const [name, write] of Object.entries(writes)) {
        it(`refuses ${name} without handing it to Convex`, async () => {
            const { mailbox, relay } = await relayWith({ connected: false })
            await assert.rejects(write(relay), { code: 'relay_disconnected' })
            assert.deepEqual(mailbox.wire, [])
        })
    }

    it('gives up on a write the socket dropped by its expiry', async () => {
        const { mailbox, relay } = await relayWith({ commandTimeoutMs: 20 })
        // Convex took the request but nothing answers it.
        await relay.connect()
        try {
            const before = Date.now()
            await assert.rejects(relay.removeDevice('lamp'), /timed out/)
            const sealed = mailbox.wire.find(
                (s) => s.header.requestId === mailbox.pendingRequestIds().at(-1)
            )
            assert.ok(sealed)
            assert.ok(sealed.header.expiresAt >= before + 20)
            assert.ok(sealed.header.expiresAt <= Date.now() + 20)
        } finally {
            relay.disconnect()
        }
    })
})

describe('Matter pairing codes and Wi-Fi credentials', () => {
    it('never reach Convex: no request is sealed for them over Relay', async () => {
        const { mailbox, relay } = await relayWith({
            answer: answering({ type: 'commandResult', ok: true }),
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
        assert.deepEqual(mailbox.wire, [])

        const connection = new ControllerConnection({
            reprobeIntervalMs: 60_000,
            controllerId: FAKE_HOME_ID,
            accessClientKeyStore: mailbox.keyStore,
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
        assert.deepEqual(
            actions(mailbox).filter((m) => m.type !== 'getCapabilitySnapshot'),
            []
        )
    })
})

describe('ControllerConnection over Relay', () => {
    it('uses Relay with keys and no bearer token', async () => {
        const mailbox = new FakeRelayMailbox({
            answer: answering({ type: 'rooms', rooms }),
        })
        await mailbox.pair()
        const connection = new ControllerConnection({
            reprobeIntervalMs: 60_000,
            controllerId: FAKE_HOME_ID,
            convex: mailbox.convex,
            relayApi: FAKE_RELAY_API,
            accessClientKeyStore: mailbox.keyStore,
            connectors: { discover: async () => null },
        })
        await connection.start()
        try {
            assert.equal(connection.getStatus().mode, 'relay')
            assert.deepEqual(await connection.getRooms(), rooms)
        } finally {
            connection.stop()
        }
    })

    it('stays offline without keys for the Home', async () => {
        const mailbox = new FakeRelayMailbox()
        const connection = new ControllerConnection({
            reprobeIntervalMs: 60_000,
            controllerId: FAKE_HOME_ID,
            convex: mailbox.convex,
            relayApi: FAKE_RELAY_API,
            accessClientKeyStore: mailbox.keyStore,
            connectors: { discover: async () => null },
        })
        await connection.start()
        try {
            assert.equal(connection.getStatus().mode, 'offline')
            assert.deepEqual(mailbox.wire, [])
        } finally {
            connection.stop()
        }
    })
})

describe('RelayTransport outcomes, as on LAN', () => {
    it('leaves the Home with no arguments', async () => {
        await withRelay(
            { answer: answering({ type: 'commandResult', ok: true }) },
            async ({ mailbox, relay }) => {
                await relay.leaveHome()
                assert.deepEqual(actions(mailbox), [{ type: 'leaveHome' }])
            }
        )
    })

    it('keeps error details', async () => {
        const details = { roomId: 'attic' }
        await withRelay(
            {
                answer: answering({
                    type: 'commandResult',
                    ok: false,
                    error: {
                        code: 'destination_not_found',
                        message: 'The destination Room no longer exists',
                        details,
                    },
                }),
            },
            async ({ relay }) => {
                await assert.rejects(relay.deleteRoom('den', 'attic'), {
                    code: 'destination_not_found',
                    details,
                })
            }
        )
    })

    it('surfaces the Controller’s error code', async () => {
        await withRelay(
            {
                answer: answering({
                    type: 'commandResult',
                    ok: false,
                    error: {
                        code: 'last_owner',
                        message: 'The last Owner cannot leave the Home',
                    },
                }),
            },
            async ({ relay }) => {
                await assert.rejects(relay.leaveHome(), { code: 'last_owner' })
                await assert.rejects(relay.revokeCurrentAccessClient(), {
                    code: 'last_owner',
                })
                await assert.rejects(relay.getDevices(), { code: 'last_owner' })
            }
        )
    })

    it('sends each setup request and reads the same outcomes as LAN', async () => {
        const lamp = {
            id: 'lamp',
            name: 'Desk lamp',
            type: 'light',
            online: true,
        }
        await withRelay(
            {
                answer: (message) => {
                    if (message.type === 'watchCapabilityChanges') {
                        return { type: 'capabilityWatchAck' }
                    }
                    if (
                        message.type === 'createRoom' ||
                        message.type === 'updateRoom'
                    ) {
                        return {
                            type: 'room',
                            room: { id: 'den', name: 'Den' },
                        }
                    }
                    if (
                        message.type === 'removeDevice' ||
                        message.type === 'deleteRoom'
                    ) {
                        return { type: 'commandResult', ok: true }
                    }
                    return { type: 'device', device: lamp }
                },
            },
            async ({ mailbox, relay }) => {
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
                assert.deepEqual(actions(mailbox), [
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
                ])
            }
        )
    })

    it('checks the Room before renaming, so a bad roomId changes nothing', async () => {
        await withRelay(
            {
                answer: answering({
                    type: 'commandResult',
                    ok: false,
                    error: {
                        code: 'room_not_found',
                        message: 'Room not found',
                    },
                }),
            },
            async ({ mailbox, relay }) => {
                await assert.rejects(
                    relay.patchDevice('lamp', {
                        name: 'Desk lamp',
                        roomId: 'gone',
                    }),
                    { code: 'room_not_found' }
                )
                assert.deepEqual(
                    actions(mailbox).map((m) => m.type),
                    ['assignRoom']
                )
            }
        )
    })
})

describe('RelayTransport acknowledges Relay replies', () => {
    it('acknowledges a request’s reply once it has it, and only then', async () => {
        await withRelay({}, async ({ mailbox, relay }) => {
            await until(() => mailbox.pendingRequestIds().length > 0)
            const watch = mailbox.pendingRequestIds()[0] ?? ''
            await mailbox.respond(watch, { type: 'capabilityWatchAck' })
            await until(() => mailbox.stored.length === 0)

            const result = relay.getRooms()
            await until(() => mailbox.pendingRequestIds().length > 0)
            await tick()
            const acked = mailbox.acks.length
            const requestId = mailbox.pendingRequestIds()[0] ?? ''
            const replyId = await mailbox.respond(requestId, {
                type: 'rooms',
                rooms,
            })
            assert.deepEqual(await result, rooms)
            await until(() => mailbox.acks.length > acked)
            assert.deepEqual(mailbox.acks.at(-1), [replyId])
            assert.deepEqual(mailbox.stored, [])
        })
    })

    it('emits a commandResult event once per Command', async () => {
        await withRelay(
            {
                answer: answering({
                    type: 'commandResult',
                    ok: true,
                    outcome: 'confirmed',
                }),
            },
            async ({ relay }) => {
                const events: Array<{ type: string; requestId?: string }> = []
                relay.subscribeEvents((event) =>
                    events.push(event as (typeof events)[number])
                )
                const result = await relay.sendCommand({
                    deviceId: 'lamp',
                    payload: { state: 'ON' },
                })
                assert.equal(result.ok, true)
                assert.equal(result.outcome, 'confirmed')
                await tick(20)
                assert.deepEqual(
                    events
                        .filter((e) => e.type === 'commandResult')
                        .map((e) => e.requestId),
                    [result.requestId]
                )
            }
        )
    })

    it('reads a History query result', async () => {
        await withRelay(
            {
                answer: (message, header) =>
                    message.type === 'historyQuery'
                        ? {
                              type: 'historyQueryResult',
                              requestId: header.requestId,
                              asOf: '2026-11-25T12:00:00.000Z',
                              incomplete: false,
                              series: [],
                              reasons: [],
                          }
                        : { type: 'capabilityWatchAck' },
            },
            async ({ mailbox, relay }) => {
                const read = await relay.queryHistory({
                    cursor: 'next-page',
                } as unknown as Parameters<typeof relay.queryHistory>[0])
                assert.equal(read.type, 'historyQueryResult')
                await until(() => mailbox.stored.length === 0)
            }
        )
    })

    it('ignores a failing acknowledge: requests still resolve', async () => {
        await withRelay(
            { answer: answering({ type: 'rooms', rooms }) },
            async ({ mailbox, relay }) => {
                mailbox.failAcknowledge = true
                assert.deepEqual(await relay.getRooms(), rooms)
                assert.deepEqual(await relay.getRooms(), rooms)
            }
        )
    })
})

// Capability-watch pushes (NEM-132): sealed by the Controller with the key
// exported from the watch request and a counter nonce, opened here against
// the pinned Controller key.

const capabilityReading = {
    capabilityId: '6f1d7c6a-6a2e-4d0a-9c3e-3d6c1b9a4e21',
    device: { protocol: 'matter', externalId: 'plug-1' },
    physicalScope: { kind: 'device' },
    kind: 'power',
    value: { value: 1500, scale: 3, constraintRevisionId: 'limits-1' },
    availability: { status: 'available' },
    observedAt: '2026-10-09T18:00:00.000Z',
    receivedAt: '2026-10-09T18:00:01.000Z',
    revision: 4,
}

const capabilityChange = (revision: number) => ({
    type: 'capabilityChange',
    epoch: '2b7e1c4a-8f3d-4a6b-9c1e-5d8a7b6c4e32',
    revision,
    state: { ...capabilityReading, revision },
})

const watching: FakeAnswer = (message) => {
    if (message.type === 'watchCapabilityChanges') {
        return { type: 'capabilityWatchAck' }
    }
    if (message.type === 'getCapabilitySnapshot') {
        return {
            type: 'capabilitySnapshot',
            epoch: '2b7e1c4a-8f3d-4a6b-9c1e-5d8a7b6c4e32',
            revision: 9,
            capabilities: [],
        }
    }
    return undefined
}

/** A connected transport with a live watch, recording what it emits. */
async function withWatch(
    setup: Setup & { watchRenewalMs?: number },
    body: (
        ctx: Awaited<ReturnType<typeof relayWith>> & {
            events: Array<{ type: string } & Record<string, unknown>>
        }
    ) => Promise<void>
) {
    const ctx = await relayWith({ answer: watching, ...setup })
    const relay = new RelayTransport({
        convex: ctx.mailbox.convex,
        api: FAKE_RELAY_API,
        controllerId: FAKE_HOME_ID,
        keyStore: ctx.mailbox.keyStore,
        counter: createMemoryRelayCounter(0),
        pollIntervalMs: 1,
        commandTimeoutMs: 2_000,
        watchRenewalMs: setup.watchRenewalMs,
    })
    const events: Array<{ type: string } & Record<string, unknown>> = []
    relay.subscribeEvents((event) => {
        events.push(event as never)
    })
    await relay.connect()
    try {
        await until(() => ctx.mailbox.watches.length === 1)
        await body({ ...ctx, relay, events })
    } finally {
        relay.disconnect()
    }
}

const changes = (events: Array<{ type: string } & Record<string, unknown>>) =>
    events.filter((e) => e.type === 'capabilityChange').map((e) => e.revision)

describe('RelayTransport capability pushes', () => {
    it('emits each sealed push and acknowledges it', async () => {
        await withWatch({}, async ({ mailbox, events }) => {
            const [first] = await mailbox.push(capabilityChange(5))
            const [second] = await mailbox.push(capabilityChange(6))
            await until(() => changes(events).length === 2)
            assert.deepEqual(changes(events), [5, 6])
            assert.deepEqual(events[0], capabilityChange(5))
            await until(() => mailbox.storedPushes().length === 0)
            assert.ok(mailbox.acks.flat().includes(first ?? ''))
            assert.ok(mailbox.acks.flat().includes(second ?? ''))
        })
    })

    it('leaves Convex only the push header and opaque bytes', async () => {
        await withWatch({}, async ({ mailbox }) => {
            await mailbox.push(capabilityChange(5))
            const [push] = mailbox.storedPushes()
            assert.ok(push)
            assert.deepEqual(Object.keys(push).sort(), [
                'ciphertext',
                'header',
                'signature',
            ])
            assert.deepEqual(Object.keys(push.header).sort(), [
                'accessClientId',
                'controllerId',
                'counter',
                'identityEpoch',
                'requestId',
            ])
            const wire = JSON.stringify(push)
            for (const secret of ['capabilityChange', 'plug-1', 'power']) {
                assert.equal(wire.includes(secret), false, secret)
            }
        })
    })

    it('ignores pushes Convex forged or an impostor signed', async () => {
        await withWatch({}, async ({ mailbox, events }) => {
            const forged = mailbox.forgePush(1)
            mailbox.impostor = true
            const impostor = await mailbox.push(capabilityChange(5))
            mailbox.impostor = false
            await until(() =>
                [forged, ...impostor].every((id) =>
                    mailbox.acks.flat().includes(id)
                )
            )
            assert.deepEqual(changes(events), [])
            // The genuine push after them still arrives.
            await mailbox.push(capabilityChange(6))
            await until(() => changes(events).length === 1)
            assert.deepEqual(changes(events), [6])
        })
    })

    it('rejects a replayed push counter', async () => {
        await withWatch({}, async ({ mailbox, events }) => {
            const sealed = await mailbox.sealPush(capabilityChange(5))
            mailbox.deliver(sealed)
            await until(() => changes(events).length === 1)
            const replay = mailbox.deliver(sealed)
            await until(() => mailbox.acks.flat().includes(replay))
            await tick()
            assert.deepEqual(changes(events), [5])
        })
    })

    it('rejects a push older than one it already applied', async () => {
        await withWatch({}, async ({ mailbox, events }) => {
            const first = await mailbox.sealPush(capabilityChange(5))
            const second = await mailbox.sealPush(capabilityChange(6))
            mailbox.deliver(second)
            await until(() => changes(events).length === 1)
            const late = mailbox.deliver(first)
            await until(() => mailbox.acks.flat().includes(late))
            await tick()
            // Counter 1 after counter 2 would roll the state back.
            assert.deepEqual(changes(events), [6])
        })
    })

    it('applies pushes listed out of order in counter order', async () => {
        await withWatch({}, async ({ mailbox, events }) => {
            const first = await mailbox.sealPush(capabilityChange(5))
            const second = await mailbox.sealPush(capabilityChange(6))
            // One poll lists both, newest first.
            mailbox.deliver(second)
            mailbox.deliver(first)
            await until(() => changes(events).length === 2)
            assert.deepEqual(changes(events), [5, 6])
        })
    })

    it('re-reads the snapshot when a push counter skips', async () => {
        await withWatch({}, async ({ mailbox, events }) => {
            await mailbox.sealPush(capabilityChange(5)) // lost on the way
            await mailbox.push(capabilityChange(6))
            await until(() =>
                events.some((e) => e.type === 'capabilitySnapshot')
            )
            assert.deepEqual(changes(events), [6])
            assert.ok(
                mailbox.opened.some((m) => m.type === 'getCapabilitySnapshot')
            )
        })
    })

    it('renews by naming its watch, and reads leftovers of the old one', async () => {
        await withWatch({ watchRenewalMs: 60 }, async ({ mailbox, events }) => {
            const firstWatch = mailbox.watchRequestIds()[0] ?? ''
            // Sealed on the first watch before the renewal reached Core.
            const leftover = await mailbox.sealPush(
                capabilityChange(5),
                firstWatch
            )
            await until(() => !mailbox.watchRequestIds().includes(firstWatch))
            const renewal = mailbox.opened.find(
                (m) =>
                    m.type === 'watchCapabilityChanges' &&
                    m.renews === firstWatch
            )
            assert.ok(renewal, 'the renewal names the watch it renews')
            assert.equal(mailbox.watches.length, 1)
            mailbox.deliver(leftover)
            await mailbox.push(capabilityChange(6))
            await until(() => changes(events).length === 2)
            assert.deepEqual(changes(events), [5, 6])
        })
    })

    it('gives two tabs of one Access Client a watch each', async () => {
        await withWatch({}, async ({ mailbox, events }) => {
            const tab = new RelayTransport({
                convex: mailbox.convex,
                api: FAKE_RELAY_API,
                controllerId: FAKE_HOME_ID,
                keyStore: mailbox.keyStore,
                counter: createMemoryRelayCounter(1_000),
                pollIntervalMs: 1,
            })
            const tabEvents: unknown[] = []
            tab.subscribeEvents((event) => {
                tabEvents.push(event)
            })
            await tab.connect()
            try {
                await until(() => mailbox.watches.length === 2)
                await mailbox.push(capabilityChange(5))
                await until(
                    () => changes(events).length === 1 && tabEvents.length === 1
                )
            } finally {
                tab.disconnect()
            }
        })
    })

    it('stops watching once the Controller says to pair again', async () => {
        await withWatch({ watchRenewalMs: 20 }, async ({ mailbox, events }) => {
            const watch = mailbox.watchRequestIds()[0] ?? ''
            const pollsOfWatch = () =>
                mailbox.queried.filter((ids) => ids.includes(watch)).length
            mailbox.revoke()
            // The next renewal is refused, signed: pair again at home.
            await until(() =>
                mailbox.wire.some((sealed) => sealed.header.requestId !== watch)
            )
            await tick(40)
            const polls = pollsOfWatch()
            await tick(40)
            assert.equal(pollsOfWatch(), polls)
            assert.deepEqual(changes(events), [])
        })
    })
})
