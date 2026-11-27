import { type AccessClientKeyStore, useController } from '@nemu/controller'
import {
    createMemoryAccessClientKeyStore,
    FakeController,
    fakeControllerConnectors,
    pairFakeAccessClient,
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
    pairAgainNotice,
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
            <Button
                onPress={() => forgetPairing()}
                title="Forget on this phone"
            />
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
    const keyStore: AccessClientKeyStore = createMemoryAccessClientKeyStore()
    let selected = options?.selected ?? null
    const recordMembership = jest.fn(async () => {})
    const services: HomeSessionServices = {
        accessClientKeyStore: keyStore,
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
        pairOnLan: async (_home, _baseUrl, code, staging) => {
            await pairFakeAccessClient(controller, staging, { code })
        },
        recordMembership,
    }
    const tree = (homes: MobileHome[] | undefined) => (
        <HomeSessionProvider homes={homes} services={services}>
            <Session />
        </HomeSessionProvider>
    )
    return { controller, keyStore, recordMembership, tree }
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
        const { tree, keyStore } = setup()
        await reachCodeEntry(tree)
        await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }))

        await screen.findByText('Pairing cancelled')
        expect(await keyStore.load('lake')).toBeNull()
    })

    it('asks to pair at home when the Home is not on this network', async () => {
        const controller = new FakeController({
            controllerId: 'lake',
            baseUrl: 'http://lake.local:6368',
            lanReachable: false,
        })
        const { tree, keyStore } = setup({ controller })
        await render(tree([LAKE]))
        await fireEvent.press(
            screen.getByRole('button', { name: 'Lake House' })
        )
        await fireEvent.press(
            screen.getByRole('button', { name: 'Pair this phone' })
        )

        await screen.findByText('Pairing failed')
        expect(screen.getByText(/Pair at home/)).toBeTruthy()
        expect(
            screen.queryByRole('button', {
                name: 'Pair over the internet instead',
            })
        ).toBeNull()
        expect(await keyStore.load('lake')).toBeNull()
    })
})

describe('Returning to a paired Home', () => {
    async function pairedSetup(controller = lake()) {
        const session = setup({ controller, selected: 'lake' })
        const record = await pairFakeAccessClient(controller, session.keyStore)
        return { ...session, record }
    }

    function lake() {
        return new FakeController({
            controllerId: 'lake',
            baseUrl: 'http://lake.local:6368',
        })
    }

    it('can pair again after forgetting this phone', async () => {
        const { tree, keyStore } = await pairedSetup()
        await render(tree([LAKE]))
        await screen.findByText('Controlling Lake House via lan')

        await fireEvent.press(
            screen.getByRole('button', { name: 'Forget on this phone' })
        )

        await screen.findByRole('button', { name: 'Pair this phone' })
        expect(await keyStore.load('lake')).toBeNull()
    })

    it('connects with its keys without asking to pair again', async () => {
        const { tree, controller, record } = await pairedSetup()
        await render(tree([LAKE]))

        await screen.findByText('Controlling Lake House via lan')
        await waitFor(() =>
            expect(controller.presentedAccessClientIds).toContain(
                record.enrollment.accessClientId
            )
        )
    })

    it('asks to pair again at home once the Controller revokes this phone', async () => {
        const { tree, controller, keyStore, record } = await pairedSetup()
        controller.revokeAccessClient(record.enrollment.accessClientId)
        await render(tree([LAKE]))

        await screen.findByRole('button', { name: 'Pair this phone' })
        expect(
            screen.getByText(/no longer has access to Lake House/)
        ).toBeTruthy()
        expect(screen.getByText(/Pair it again at home/)).toBeTruthy()
        expect(await keyStore.load('lake')).toBeNull()
    })
})

describe('pairAgainNotice', () => {
    it('tells a phone that held a retired bearer token to pair again at home', () => {
        expect(pairAgainNotice('bearer_token_retired', 'Lake House')).toBe(
            'Nemu now pairs each phone with its own keys. Pair this phone again at home to keep using Lake House.'
        )
    })
})
