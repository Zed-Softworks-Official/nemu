import { useController } from '@nemu/controller'
import { FakeController } from '@nemu/controller/testing'
import type { SessionRole } from '@nemu/protocol'
import {
    fireEvent,
    render,
    screen,
    waitFor,
} from '@testing-library/react-native'

import { HomeSessionProvider, type MobileHome } from '~/components/home-session'
import { Button } from '~/components/ui/button'
import { pairedServices } from '~/test/home-session-services'
import SettingsScreen from '../app/(app)/(tabs)/(home,devices,energy)/settings'

// The header's menu button needs the drawer navigator, which isn't under test.
jest.mock('~/components/drawer-menu-button', () => ({
    DrawerMenuButton: () => null,
}))

const LAKE: MobileHome = { controllerId: 'lake', name: 'Lake House' }

function Reprobe() {
    const { reprobe } = useController()
    return <Button onPress={() => void reprobe()} title="Reprobe" />
}

async function renderSettings(controller: FakeController) {
    const { services } = await pairedServices(controller)
    await render(
        <HomeSessionProvider homes={[LAKE]} services={services}>
            <SettingsScreen />
            <Reprobe />
        </HomeSessionProvider>
    )
}

function lake(
    role: SessionRole,
    reachable: { lanReachable: boolean; relayReachable?: boolean }
): FakeController {
    return new FakeController({
        controllerId: 'lake',
        name: 'Lake House',
        acceptedTokens: ['phone'],
        role,
        ...reachable,
    })
}

const HEADING = 'Controller health'

describe.each([
    ['LAN', 'lan', true],
    ['Relay', 'relay', false],
] as const)('Settings health over %s', (_label, mode, lanReachable) => {
    it('shows an Owner the Relay status and the health summary', async () => {
        const controller = lake('owner', { lanReachable })
        Object.assign(controller.health, {
            mqtt: true,
            zigbee: true,
            matter: false,
            database: true,
            relayConnected: true,
        })
        await renderSettings(controller)

        expect(await screen.findByLabelText('Relay: Connected')).toBeTruthy()
        expect(screen.getByText(HEADING)).toBeTruthy()
        expect(
            screen.getByLabelText('Controller: Some services unavailable')
        ).toBeTruthy()
        expect(screen.getByLabelText('MQTT: Available')).toBeTruthy()
        expect(screen.getByLabelText('Zigbee: Available')).toBeTruthy()
        expect(screen.getByLabelText('Matter: Unavailable')).toBeTruthy()
        expect(screen.getByLabelText('Database: Available')).toBeTruthy()
        expect(screen.getByLabelText('Devices: 0 of 0 online')).toBeTruthy()
        expect(controller.healthRequests).toEqual([mode])
    })

    it('reads the health again when an Owner asks', async () => {
        const controller = lake('owner', { lanReachable })
        controller.health.database = false
        controller.health.relayConnected = false
        await renderSettings(controller)
        expect(await screen.findByLabelText('Relay: Disconnected')).toBeTruthy()
        expect(screen.getByLabelText('Controller: Error')).toBeTruthy()

        controller.health.database = true
        controller.health.relayConnected = true
        await fireEvent.press(screen.getByText('Check health again'))

        expect(await screen.findByLabelText('Relay: Connected')).toBeTruthy()
        expect(screen.getByLabelText('Controller: OK')).toBeTruthy()
        expect(controller.healthRequests).toEqual([mode, mode])
    })

    it('tells an Owner when the health summary cannot be read', async () => {
        const controller = lake('owner', { lanReachable })
        controller.healthSummary = () => {
            throw new Error('The Controller did not answer')
        }
        await renderSettings(controller)

        expect(
            await screen.findByText('The Controller did not answer')
        ).toBeTruthy()
        expect(screen.queryByLabelText(/^Relay:/)).toBeNull()
    })

    it('hides both from a Member and does not ask for them', async () => {
        const controller = lake('member', { lanReachable })
        controller.releaseStatus = {
            platformVersion: '2026.11.0',
            channel: 'stable',
            newerReleaseAvailable: true,
            maintenanceMode: false,
            rollbackSnapshotAvailable: false,
            rollbackStuck: false,
        }
        await renderSettings(controller)

        // Shown only once the role is known to be Member.
        expect(
            await screen.findByText('An Owner of Lake House can install it.')
        ).toBeTruthy()
        expect(screen.queryByText(HEADING)).toBeNull()
        expect(screen.queryByLabelText(/^Relay:/)).toBeNull()
        expect(controller.healthRequests).toEqual([])
    })

    it('hides both when the Controller becomes unreachable', async () => {
        const controller = lake('owner', { lanReachable })
        await renderSettings(controller)
        expect(await screen.findByText(HEADING)).toBeTruthy()

        controller.goOffline()
        await fireEvent.press(screen.getByText('Reprobe'))

        await waitFor(() => expect(screen.queryByText(HEADING)).toBeNull())
    })
})

describe('Settings health while offline', () => {
    it('is hidden', async () => {
        const controller = lake('owner', {
            lanReachable: false,
            relayReachable: false,
        })
        await renderSettings(controller)

        expect(
            await screen.findByText(
                'Connect to Lake House to see its installed Release.'
            )
        ).toBeTruthy()
        expect(screen.queryByText(HEADING)).toBeNull()
        expect(controller.healthRequests).toEqual([])
    })
})
