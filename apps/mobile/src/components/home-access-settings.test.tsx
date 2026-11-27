import { FakeController } from '@nemu/controller/testing'
import { fireEvent, render, screen } from '@testing-library/react-native'
import { Text } from 'react-native'

import { HomeAccessSettings } from '~/components/home-access-settings'
import {
    HomeSessionProvider,
    type MobileHome,
    useHomeSession,
} from '~/components/home-session'
import { pairedServices } from '~/test/home-session-services'

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
    // This phone is paired with both Homes, under its own Access Client IDs.
    const city = new FakeController({ controllerId: 'city' })
    const { services, keyStore } = await pairedServices(controller, {
        paired: [
            [controller, 'phone'],
            [city, 'city-phone'],
        ],
    })
    const view = await render(
        <HomeSessionProvider homes={[LAKE, CITY]} services={services}>
            <Session />
        </HomeSessionProvider>
    )
    const paired = async (controllerId: string) =>
        (await keyStore.load(controllerId))?.enrollment.accessClientId ?? null
    return { paired, view }
}

describe.each([
    ['LAN', 'lan', true],
    ['Relay', 'relay', false],
] as const)('Settings over %s', (_label, mode, lanReachable) => {
    function lake(): FakeController {
        return new FakeController({
            controllerId: 'lake',
            lanReachable,
            // This Membership's dashboard browser; the phone pairs below.
            acceptedAccessClients: ['browser'],
            otherMembershipAccessClients: ['someone-else'],
        })
    }

    it('removes only this phone, then clears only this Home on the phone', async () => {
        const controller = lake()
        const { paired } = await setup(controller)

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
        expect(controller.accepts('phone')).toBe(false)
        expect(controller.accepts('browser')).toBe(true)
        expect(await paired('lake')).toBeNull()
        expect(await paired('city')).toBe('city-phone')
    })

    it('leaves the Home after a confirmation that names its reach', async () => {
        const controller = lake()
        const { paired } = await setup(controller)

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
        expect(controller.accepts('browser')).toBe(false)
        expect(controller.accepts('someone-else')).toBe(true)
        expect(await paired('lake')).toBeNull()
        expect(await paired('city')).toBe('city-phone')
    })

    it('sends the last Owner to the dashboard and keeps this phone paired', async () => {
        const controller = lake()
        controller.lastOwner = true
        const { paired } = await setup(controller)

        await fireEvent.press(
            await screen.findByRole('button', { name: 'Leave Lake House' })
        )
        await fireEvent.press(screen.getByRole('button', { name: 'Leave' }))

        expect(
            await screen.findByText(/only Owner of Lake House.*dashboard/)
        ).toBeTruthy()
        expect(controller.leftVia).toEqual([])
        expect(await paired('lake')).toBe('phone')
    })

    it('clears this phone when the Controller no longer accepts it', async () => {
        const controller = lake()
        const { paired } = await setup(controller)
        await screen.findByRole('button', {
            name: 'Remove this phone from Lake House',
        })
        // Revoked elsewhere, e.g. by an Owner, while this screen was open.
        controller.revokeAccessClient('phone')

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
        expect(await paired('lake')).toBeNull()
        expect(await paired('city')).toBe('city-phone')
    })

    it('clears this phone when its Membership is no longer active', async () => {
        const controller = lake()
        controller.membershipActive = false
        const { paired } = await setup(controller)

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
        expect(controller.accepts('phone')).toBe(false)
        expect(controller.accepts('browser')).toBe(true)
        expect(await paired('lake')).toBeNull()
    })

    it('does not offer to pair this phone again', async () => {
        await setup(lake())
        await screen.findByRole('button', { name: 'Leave Lake House' })
        expect(
            screen.queryByRole('button', { name: 'Pair this phone again' })
        ).toBeNull()
        expect(
            screen.queryByRole('button', { name: 'Remove this phone' })
        ).toBeNull()
    })
})

describe('Settings when the Controller is unreachable over LAN and Relay', () => {
    it('offers only Remove this phone, with its warning', async () => {
        const controller = new FakeController({
            controllerId: 'lake',
            lanReachable: false,
            relayReachable: false,
        })
        const { paired } = await setup(controller)

        const forget = await screen.findByRole('button', {
            name: 'Remove this phone',
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
        expect(await paired('lake')).toBeNull()
        expect(await paired('city')).toBe('city-phone')
        // Nothing was revoked on the Controller.
        expect(controller.accepts('phone')).toBe(true)
    })
})
