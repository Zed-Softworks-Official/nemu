import type { ControllerCredentialStore } from '@nemu/controller'
import { useController } from '@nemu/controller'
import {
    createMemoryCredentialStore,
    FakeController,
    fakeControllerConnectors,
} from '@nemu/controller/testing'
import {
    fireEvent,
    render,
    screen,
    waitFor,
} from '@testing-library/react-native'
import { Text } from 'react-native'

import {
    HomeSessionProvider,
    type HomeSessionServices,
    type MobileHome,
    useHomeSession,
} from '~/components/home-session'
import { PairHomeScreen } from '~/components/pair-home-screen'
import { SelectHomeScreen } from '~/components/select-home-screen'
import { Button } from '~/components/ui/button'

const LAKE: MobileHome = {
    controllerId: 'lake',
    name: 'Lake House',
    lanHostname: 'lake.local',
}
const CITY: MobileHome = { controllerId: 'city', name: 'City Flat' }

function Session() {
    const { route, activeHome, forgetPairing } = useHomeSession()
    const { status } = useController()
    if (route === 'select-home') return <SelectHomeScreen />
    if (route === 'pair') return <PairHomeScreen />
    if (route === 'loading') return <Text>Loading Homes</Text>
    return (
        <>
            <Text>
                Controlling {activeHome?.name} via {status.mode}
            </Text>
            <Button onPress={forgetPairing} title="Pair this phone again" />
        </>
    )
}

function setup(options?: { selected?: string; controller?: FakeController }) {
    const controller =
        options?.controller ??
        new FakeController({
            controllerId: 'lake',
            baseUrl: 'http://lake.local:6368',
        })
    const credentialStore: ControllerCredentialStore =
        createMemoryCredentialStore()
    let selected = options?.selected ?? null
    const recordMembership = jest.fn(async () => {})
    const services: HomeSessionServices = {
        credentialStore,
        activeHomeStore: {
            get: () => selected,
            set: (id) => {
                selected = id
            },
            clear: () => {
                selected = null
            },
        },
        connectors: {
            ...fakeControllerConnectors(controller),
            discover: async () =>
                controller.lanReachable
                    ? {
                          baseUrl: controller.baseUrl,
                          health: { status: 'ok' },
                      }
                    : null,
        },
        pairOnLan: async (home, baseUrl, code, staging) => {
            staging.set(home.controllerId, {
                clientToken: controller.pair(code).clientToken,
                baseUrl,
            })
        },
        mintOverRelay: async (home, staging) => {
            staging.set(home.controllerId, {
                clientToken: controller.mintSession().clientToken,
            })
        },
        recordMembership,
    }
    const tree = (homes: MobileHome[] | undefined) => (
        <HomeSessionProvider homes={homes} services={services}>
            <Session />
        </HomeSessionProvider>
    )
    return { controller, credentialStore, recordMembership, tree }
}

describe('Home selection', () => {
    it('waits for the Home list, then asks which Home to control', async () => {
        const { tree } = setup()
        const view = await render(tree(undefined))
        expect(screen.getByText('Loading Homes')).toBeTruthy()

        await view.rerender(tree([LAKE, CITY]))
        expect(screen.getByText('Choose a Home')).toBeTruthy()
        expect(screen.getByText('Lake House')).toBeTruthy()
        expect(screen.getByText('City Flat')).toBeTruthy()
    })

    it('explains what to do when the Account has no Homes', async () => {
        const { tree } = setup()
        await render(tree([]))
        expect(screen.getByText('No Homes yet')).toBeTruthy()
    })

    it('asks an unpaired phone to pair with the chosen Home', async () => {
        const { tree } = setup()
        await render(tree([LAKE, CITY]))
        await fireEvent.press(
            screen.getByRole('button', { name: 'Lake House' })
        )
        expect(screen.getByText('Lake House')).toBeTruthy()
        expect(
            screen.getByRole('button', { name: 'Pair this phone' })
        ).toBeTruthy()
    })
})

describe('Access Client pairing', () => {
    async function reachCodeEntry(tree: ReturnType<typeof setup>['tree']) {
        const view = await render(tree([LAKE]))
        await fireEvent.press(
            screen.getByRole('button', { name: 'Lake House' })
        )
        await fireEvent.press(
            screen.getByRole('button', { name: 'Pair this phone' })
        )
        await screen.findByText('Enter pairing code')
        return view
    }

    it('reaches an authorized Controller session over LAN', async () => {
        const { tree, controller, recordMembership } = setup()
        await reachCodeEntry(tree)

        await fireEvent.changeText(
            screen.getByLabelText('Pairing code'),
            '123456'
        )
        await fireEvent.press(screen.getByRole('button', { name: 'Pair' }))
        await screen.findByText('Paired')
        expect(recordMembership).toHaveBeenCalledWith('lake')

        await fireEvent.press(screen.getByRole('button', { name: 'Continue' }))
        await screen.findByText('Controlling Lake House via lan')
        expect(controller.connectedTransports()).toHaveLength(1)
    })

    it('stays on the paired result when the Home list reloads', async () => {
        const { tree } = setup()
        const view = await reachCodeEntry(tree)
        await fireEvent.changeText(
            screen.getByLabelText('Pairing code'),
            '123456'
        )
        await fireEvent.press(screen.getByRole('button', { name: 'Pair' }))
        await screen.findByText('Paired')

        // Recording the Membership reloads `listMine` with new objects.
        await view.rerender(tree([{ ...LAKE }]))
        expect(screen.getByText('Paired')).toBeTruthy()
    })

    it('shows a wrong code as a failure the person can retry', async () => {
        const { tree } = setup()
        await reachCodeEntry(tree)
        await fireEvent.changeText(
            screen.getByLabelText('Pairing code'),
            '000000'
        )
        await fireEvent.press(screen.getByRole('button', { name: 'Pair' }))

        await screen.findByText('Pairing failed')
        expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
    })

    it('shows cancellation and keeps nothing on the phone', async () => {
        const { tree, credentialStore } = setup()
        await reachCodeEntry(tree)
        await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }))

        await screen.findByText('Pairing cancelled')
        expect(credentialStore.get('lake')).toBeNull()
    })

    it('pairs a Member over Relay when the Home is not on this network', async () => {
        const controller = new FakeController({
            controllerId: 'lake',
            baseUrl: 'http://lake.local:6368',
            lanReachable: false,
        })
        const { tree } = setup({ controller })
        await render(tree([LAKE]))
        await fireEvent.press(
            screen.getByRole('button', { name: 'Lake House' })
        )
        await fireEvent.press(
            screen.getByRole('button', { name: 'Pair this phone' })
        )
        await screen.findByText('Paired')

        await fireEvent.press(screen.getByRole('button', { name: 'Continue' }))
        await screen.findByText('Controlling Lake House via relay')
    })

    it('reports an unreachable Home', async () => {
        const controller = new FakeController({
            controllerId: 'lake',
            baseUrl: 'http://lake.local:6368',
            lanReachable: false,
            relayReachable: false,
        })
        const { tree } = setup({ controller })
        await render(tree([LAKE]))
        await fireEvent.press(
            screen.getByRole('button', { name: 'Lake House' })
        )
        await fireEvent.press(
            screen.getByRole('button', { name: 'Pair this phone' })
        )
        await screen.findByText('Pairing failed')
    })
})

describe('Returning to a paired Home', () => {
    it('can pair again after the credential stops working', async () => {
        const controller = new FakeController({
            controllerId: 'lake',
            baseUrl: 'http://lake.local:6368',
            acceptedTokens: ['saved'],
        })
        const { tree, credentialStore } = setup({
            controller,
            selected: 'lake',
        })
        credentialStore.set('lake', { clientToken: 'saved' })
        await render(tree([LAKE]))
        await screen.findByText('Controlling Lake House via lan')

        await fireEvent.press(
            screen.getByRole('button', { name: 'Pair this phone again' })
        )

        expect(credentialStore.get('lake')).toBeNull()
        expect(
            screen.getByRole('button', { name: 'Pair this phone' })
        ).toBeTruthy()
    })

    it('connects without asking to pair again', async () => {
        const controller = new FakeController({
            controllerId: 'lake',
            baseUrl: 'http://lake.local:6368',
            acceptedTokens: ['saved'],
        })
        const { tree, credentialStore } = setup({
            controller,
            selected: 'lake',
        })
        credentialStore.set('lake', { clientToken: 'saved' })
        await render(tree([LAKE]))

        await screen.findByText('Controlling Lake House via lan')
        await waitFor(() =>
            expect(controller.presentedTokens).toContain('saved')
        )
    })
})
