import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ApiError } from '@nemu/protocol'
import {
    type AccessClientPairingOptions,
    type AccessClientPairingState,
    createAccessClientPairing,
} from './access-client-pairing.ts'
import {
    createMemoryAccessClientKeyStore,
    FakeController,
    fakeControllerConnectors,
    pairFakeAccessClient,
} from './testing.ts'

function deferred<T>() {
    let resolve!: (value: T) => void
    let reject!: (err: unknown) => void
    const promise = new Promise<T>((res, rej) => {
        resolve = res
        reject = rej
    })
    return { promise, resolve, reject }
}

function setup(
    controller: FakeController,
    overrides: Partial<AccessClientPairingOptions> = {},
    others: FakeController[] = []
) {
    const keyStore = createMemoryAccessClientKeyStore()
    const connectors = fakeControllerConnectors(controller, ...others)
    const memberships: string[] = []
    const pairing = createAccessClientPairing({
        home: { controllerId: controller.controllerId, name: 'Beach House' },
        lanCandidates: [controller.baseUrl],
        keyStore,
        discover: (candidates) => connectors.discover(candidates, null),
        identify: connectors.identify,
        pairOnLan: async (_baseUrl, code, staging) => {
            await pairFakeAccessClient(controller, staging, { code })
        },
        recordMembership: async (controllerId) => {
            memberships.push(controllerId)
        },
        ...overrides,
    })
    const states: AccessClientPairingState[] = []
    pairing.subscribe((state) => states.push(state))
    return { pairing, keyStore, memberships, states }
}

describe('Access Client pairing for the selected Home', () => {
    it('pairs on LAN with a code and keeps the Home Access Client keys', async () => {
        const home = new FakeController({ controllerId: 'home-a' })
        const { pairing, keyStore, memberships } = setup(home)

        await pairing.start()
        assert.equal(pairing.getState().phase, 'awaitingCode')

        await pairing.submitCode(home.pairingCode)

        const state = pairing.getState()
        assert.equal(state.phase, 'paired')
        const record = await keyStore.load('home-a')
        assert.ok(record)
        assert.ok(home.acceptsToken(record.enrollment.accessClientId))
        assert.deepEqual(memberships, ['home-a'])
    })

    it('reports a wrong code and lets the person try again', async () => {
        const home = new FakeController({ controllerId: 'home-a' })
        const { pairing, keyStore } = setup(home)

        await pairing.start()
        await pairing.submitCode('000000')

        const state = pairing.getState()
        assert.equal(state.phase, 'failed')
        assert.equal(state.phase === 'failed' && state.reason, 'invalid_code')
        assert.equal(await keyStore.load('home-a'), null)

        await pairing.retry()
        assert.equal(pairing.getState().phase, 'awaitingCode')
        await pairing.submitCode(home.pairingCode)
        assert.equal(pairing.getState().phase, 'paired')
    })

    it('asks a Member to pair at home when the Home is not on this network', async () => {
        const home = new FakeController({
            controllerId: 'home-a',
            lanReachable: false,
        })
        const { pairing, keyStore, states } = setup(home)

        await pairing.start()

        // Relay never pairs: a new Access Client pairs on the home network.
        assert.deepEqual(
            states.map((state) => state.phase),
            ['idle', 'discovering', 'failed']
        )
        const state = pairing.getState()
        assert.equal(
            state.phase === 'failed' && state.reason,
            'not_on_home_network'
        )
        assert.match(state.phase === 'failed' ? state.message : '', /home/i)
        assert.equal(await keyStore.load('home-a'), null)
    })

    it('reports a Controller that refuses this Access Client', async () => {
        const home = new FakeController({ controllerId: 'home-a' })
        const { pairing, keyStore } = setup(home, {
            pairOnLan: async () => {
                throw new ApiError(
                    'tombstoned_access_client',
                    'This Access Client was revoked',
                    403
                )
            },
        })

        await pairing.start()
        await pairing.submitCode(home.pairingCode)

        const state = pairing.getState()
        assert.equal(state.phase === 'failed' && state.reason, 'revoked')
        assert.equal(await keyStore.load('home-a'), null)
    })

    it('requires the Home network when there is no Membership yet', async () => {
        const home = new FakeController({
            controllerId: 'home-a',
            lanReachable: false,
        })
        const { pairing } = setup(home)

        await pairing.start()

        const state = pairing.getState()
        assert.equal(
            state.phase === 'failed' && state.reason,
            'not_on_home_network'
        )
    })

    it('ignores a LAN Controller from a different Home', async () => {
        const selected = new FakeController({
            controllerId: 'home-a',
            lanReachable: false,
            relayReachable: false,
        })
        const neighbour = new FakeController({
            controllerId: 'home-b',
            baseUrl: 'http://nemu.local:6368',
        })
        const { pairing } = setup(
            selected,
            {
                lanCandidates: ['http://nemu.local:6368'],
            },
            [neighbour]
        )

        await pairing.start()

        const state = pairing.getState()
        assert.equal(state.phase === 'failed' && state.reason, 'wrong_home')
    })

    it('cancels in-flight pairing without keeping keys', async () => {
        const home = new FakeController({ controllerId: 'home-a' })
        const gate = deferred<void>()
        const { pairing, keyStore, memberships } = setup(home, {
            pairOnLan: async (_baseUrl, code, staging) => {
                await gate.promise
                await pairFakeAccessClient(home, staging, { code })
            },
        })

        await pairing.start()
        const submitted = pairing.submitCode(home.pairingCode)
        assert.equal(pairing.getState().phase, 'pairing')

        pairing.cancel()
        assert.equal(pairing.getState().phase, 'cancelled')

        gate.resolve()
        await submitted

        assert.equal(pairing.getState().phase, 'cancelled')
        assert.equal(await keyStore.load('home-a'), null)
        assert.deepEqual(memberships, [])
    })

    it('does not keep keys when recording the Membership fails', async () => {
        const home = new FakeController({ controllerId: 'home-a' })
        const { pairing, keyStore } = setup(home, {
            recordMembership: async () => {
                throw new Error('Not invited to this home')
            },
        })

        await pairing.start()
        await pairing.submitCode(home.pairingCode)

        const state = pairing.getState()
        assert.equal(state.phase, 'failed')
        assert.match(state.phase === 'failed' ? state.message : '', /invited/)
        assert.equal(await keyStore.load('home-a'), null)
    })
})
