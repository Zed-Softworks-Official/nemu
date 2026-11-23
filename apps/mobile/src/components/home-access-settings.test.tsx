import type { ControllerCredentialStore } from '@nemu/controller'
import {
    createMemoryCredentialStore,
    FakeController,
    fakeControllerConnectors,
} from '@nemu/controller/testing'
import { fireEvent, render, screen } from '@testing-library/react-native'
import { Text } from 'react-native'

import { HomeAccessSettings } from '~/components/home-access-settings'
import {
    HomeSessionProvider,
    type HomeSessionServices,
    type MobileHome,
    useHomeSession,
} from '~/components/home-session'

const LAKE: MobileHome = { controllerId: 'lake', name: 'Lake House' }
const CITY: MobileHome = { controllerId: 'city', name: 'City Flat' }

function Session() {
    const { route, activeHome, pairingNotice } = useHomeSession()
    if (route === 'select-home') return <Text>Choose a Home</Text>
    if (route === 'pair') {
        return (
            <>
                <Text>Pair with {activeHome?.name}</Text>
                {pairingNotice ? <Text>{pairingNotice}</Text> : null}
            </>
        )
    }
    if (route === 'loading') return <Text>Loading Homes</Text>
    return <HomeAccessSettings />
}

async function setup(controller: FakeController) {
    const credentialStore: ControllerCredentialStore =
        createMemoryCredentialStore({
            lake: { clientToken: 'phone' },
            city: { clientToken: 'city-phone' },
        })
    let selected: string | null = 'lake'
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
        pairOnLan: async () => {},
        mintOverRelay: async () => {},
        recordMembership: async () => {},
    }
    const view = await render(
        <HomeSessionProvider homes={[LAKE, CITY]} services={services}>
            <Session />
        </HomeSessionProvider>
    )
    return { credentialStore, view }
}

describe.each([
    ['LAN', 'lan', true],
    ['Relay', 'relay', false],
] as const)('Settings over %s', (_label, mode, lanReachable) => {
    function lake(): FakeController {
        return new FakeController({
            controllerId: 'lake',
            lanReachable,
            // This Membership's phone and dashboard browser.
            acceptedTokens: ['phone', 'browser'],
            otherMembershipTokens: ['someone-else'],
        })
    }

    it('removes only this phone, then clears only this Home on the phone', async () => {
        const controller = lake()
        const { credentialStore } = await setup(controller)

        await fireEvent.press(
            await screen.findByRole('button', {
                name: 'Remove this phone from Lake House',
            })
        )
        expect(
            screen.getByText(
                /Only this phone loses access to Lake House\. Your other phones and browsers keep working\./
            )
        ).toBeTruthy()
        await fireEvent.press(
            screen.getByRole('button', { name: 'Remove this phone' })
        )

        await screen.findByText('Pair with Lake House')
        expect(controller.revokedVia).toEqual([mode])
        expect(controller.acceptsToken('phone')).toBe(false)
        expect(controller.acceptsToken('browser')).toBe(true)
        expect(credentialStore.get('lake')).toBeNull()
        expect(credentialStore.get('city')).toEqual({
            clientToken: 'city-phone',
        })
    })

    it('leaves the Home after a confirmation that names its reach', async () => {
        const controller = lake()
        const { credentialStore } = await setup(controller)

        await fireEvent.press(
            await screen.findByRole('button', { name: 'Leave Lake House' })
        )
        expect(
            screen.getByText(
                /Every phone and browser you use with Lake House loses access/
            )
        ).toBeTruthy()
        await fireEvent.press(screen.getByRole('button', { name: 'Leave' }))

        await screen.findByText('Choose a Home')
        expect(controller.leftVia).toEqual([mode])
        expect(controller.acceptsToken('browser')).toBe(false)
        expect(controller.acceptsToken('someone-else')).toBe(true)
        expect(credentialStore.get('lake')).toBeNull()
        expect(credentialStore.get('city')).toEqual({
            clientToken: 'city-phone',
        })
    })

    it('sends the last Owner to the dashboard and keeps this phone paired', async () => {
        const controller = lake()
        controller.lastOwner = true
        const { credentialStore } = await setup(controller)

        await fireEvent.press(
            await screen.findByRole('button', { name: 'Leave Lake House' })
        )
        await fireEvent.press(screen.getByRole('button', { name: 'Leave' }))

        expect(
            await screen.findByText(/only Owner of Lake House.*dashboard/)
        ).toBeTruthy()
        expect(controller.leftVia).toEqual([])
        expect(credentialStore.get('lake')?.clientToken).toBe('phone')
    })

    it('clears this phone when the Controller no longer accepts it', async () => {
        const controller = lake()
        const { credentialStore } = await setup(controller)
        await screen.findByRole('button', {
            name: 'Remove this phone from Lake House',
        })
        // Revoked elsewhere, e.g. by an Owner, while this screen was open.
        controller.revokeToken('phone')

        await fireEvent.press(
            screen.getByRole('button', {
                name: 'Remove this phone from Lake House',
            })
        )
        await fireEvent.press(
            screen.getByRole('button', { name: 'Remove this phone' })
        )

        await screen.findByText('Pair with Lake House')
        expect(
            screen.getByText('This phone was already removed from Lake House.')
        ).toBeTruthy()
        expect(credentialStore.get('lake')).toBeNull()
        expect(credentialStore.get('city')).toEqual({
            clientToken: 'city-phone',
        })
    })

    it('clears this phone when its Membership is no longer active', async () => {
        const controller = lake()
        controller.membershipActive = false
        const { credentialStore } = await setup(controller)

        await fireEvent.press(
            await screen.findByRole('button', { name: 'Leave Lake House' })
        )
        await fireEvent.press(screen.getByRole('button', { name: 'Leave' }))

        await screen.findByText('Pair with Lake House')
        expect(
            screen.getByText('This phone was already removed from Lake House.')
        ).toBeTruthy()
        expect(controller.leftVia).toEqual([])
        // The phone still revoked its own Access Client on the way out.
        expect(controller.acceptsToken('phone')).toBe(false)
        expect(controller.acceptsToken('browser')).toBe(true)
        expect(credentialStore.get('lake')).toBeNull()
    })

    it('does not offer to pair this phone again', async () => {
        await setup(lake())
        await screen.findByRole('button', { name: 'Leave Lake House' })
        expect(
            screen.queryByRole('button', { name: 'Pair this phone again' })
        ).toBeNull()
        expect(
            screen.queryByRole('button', { name: 'Forget on this phone' })
        ).toBeNull()
    })
})

describe('Settings when the Controller is unreachable over LAN and Relay', () => {
    it('offers only Forget on this phone, with its warning', async () => {
        const controller = new FakeController({
            controllerId: 'lake',
            lanReachable: false,
            relayReachable: false,
            acceptedTokens: ['phone'],
        })
        const { credentialStore } = await setup(controller)

        const forget = await screen.findByRole('button', {
            name: 'Forget on this phone',
        })
        expect(
            screen.getByText(
                /Lake House still trusts this phone until an Owner revokes it/
            )
        ).toBeTruthy()
        expect(
            screen.queryByRole('button', {
                name: 'Remove this phone from Lake House',
            })
        ).toBeNull()
        expect(
            screen.queryByRole('button', { name: 'Leave Lake House' })
        ).toBeNull()

        await fireEvent.press(forget)

        await screen.findByText('Pair with Lake House')
        expect(credentialStore.get('lake')).toBeNull()
        expect(credentialStore.get('city')).toEqual({
            clientToken: 'city-phone',
        })
        // Nothing was revoked on the Controller.
        expect(controller.acceptsToken('phone')).toBe(true)
    })
})
