import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
    type AccessClientPairingOptions,
    type AccessClientPairingState,
    createAccessClientPairing,
} from './access-client-pairing.ts'
import {
    createMemoryCredentialStore,
    FakeController,
    fakeControllerConnectors,
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
    const credentialStore = createMemoryCredentialStore()
    const connectors = fakeControllerConnectors(controller, ...others)
    const memberships: string[] = []
    const pairing = createAccessClientPairing({
        home: { controllerId: controller.controllerId, name: 'Beach House' },
        isMember: true,
        lanCandidates: [controller.baseUrl],
        credentialStore,
        discover: (candidates) => connectors.discover(candidates, null),
        identify: connectors.identify,
        pairOnLan: async (_baseUrl, code, staging) => {
            const result = controller.pair(code)
            staging.set(result.controllerId, {
                clientToken: result.clientToken,
                baseUrl: controller.baseUrl,
            })
        },
        mintOverRelay: async (staging) => {
            const result = controller.mintSession()
            staging.set(result.controllerId, {
                clientToken: result.clientToken,
            })
        },
        recordMembership: async (controllerId) => {
            memberships.push(controllerId)
        },
        ...overrides,
    })
    const states: AccessClientPairingState[] = []
    pairing.subscribe((state) => states.push(state))
    return { pairing, credentialStore, memberships, states }
}

describe('Access Client pairing for the selected Home', () => {
    it('pairs on LAN with a code and stores that Home credential', async () => {
        const home = new FakeController({ controllerId: 'home-a' })
        const { pairing, credentialStore, memberships } = setup(home)

        await pairing.start()
        assert.equal(pairing.getState().phase, 'awaitingCode')

        await pairing.submitCode(home.pairingCode)

        const state = pairing.getState()
        assert.equal(state.phase, 'paired')
        const credential = credentialStore.get('home-a')
        assert.ok(credential)
        assert.ok(home.acceptsToken(credential.clientToken))
        assert.deepEqual(memberships, ['home-a'])
    })

    it('reports a wrong code and lets the person try again', async () => {
        const home = new FakeController({ controllerId: 'home-a' })
        const { pairing, credentialStore } = setup(home)

        await pairing.start()
        await pairing.submitCode('000000')

        const state = pairing.getState()
        assert.equal(state.phase, 'failed')
        assert.equal(state.phase === 'failed' && state.reason, 'invalid_code')
        assert.equal(credentialStore.get('home-a'), null)

        await pairing.retry()
        assert.equal(pairing.getState().phase, 'awaitingCode')
        await pairing.submitCode(home.pairingCode)
        assert.equal(pairing.getState().phase, 'paired')
    })

    it('mints over Relay for a Member when the Home is not on this network', async () => {
        const home = new FakeController({
            controllerId: 'home-a',
            lanReachable: false,
        })
        const { pairing, credentialStore, states } = setup(home)

        await pairing.start()

        assert.deepEqual(
            states.map((state) => state.phase),
            ['idle', 'discovering', 'pairing', 'paired']
        )
        assert.ok(
            home.acceptsToken(
                credentialStore.get('home-a')?.clientToken ?? null
            )
        )
    })

    it('fails clearly when the Home cannot be reached at all', async () => {
        const home = new FakeController({
            controllerId: 'home-a',
            lanReachable: false,
            relayReachable: false,
        })
        const { pairing, credentialStore } = setup(home)

        await pairing.start()

        const state = pairing.getState()
        assert.equal(state.phase, 'failed')
        assert.equal(state.phase === 'failed' && state.reason, 'unreachable')
        assert.ok(state.phase === 'failed' && state.message.length > 0)
        assert.equal(credentialStore.get('home-a'), null)
    })

    it('requires the Home network when there is no Membership yet', async () => {
        const home = new FakeController({
            controllerId: 'home-a',
            lanReachable: false,
        })
        const { pairing } = setup(home, { isMember: false })

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
                isMember: false,
            },
            [neighbour]
        )

        await pairing.start()

        const state = pairing.getState()
        assert.equal(state.phase === 'failed' && state.reason, 'wrong_home')
    })

    it('cancels in-flight pairing without storing a credential', async () => {
        const home = new FakeController({ controllerId: 'home-a' })
        const gate = deferred<void>()
        const { pairing, credentialStore, memberships } = setup(home, {
            pairOnLan: async (_baseUrl, code, staging) => {
                await gate.promise
                const result = home.pair(code)
                staging.set(result.controllerId, {
                    clientToken: result.clientToken,
                })
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
        assert.equal(credentialStore.get('home-a'), null)
        assert.deepEqual(memberships, [])
    })

    it('does not keep a credential when recording the Membership fails', async () => {
        const home = new FakeController({ controllerId: 'home-a' })
        const { pairing, credentialStore } = setup(home, {
            recordMembership: async () => {
                throw new Error('Not invited to this home')
            },
        })

        await pairing.start()
        await pairing.submitCode(home.pairingCode)

        const state = pairing.getState()
        assert.equal(state.phase, 'failed')
        assert.match(state.phase === 'failed' ? state.message : '', /invited/)
        assert.equal(credentialStore.get('home-a'), null)
    })
})
