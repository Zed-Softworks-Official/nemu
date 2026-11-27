import { FakeController } from '@nemu/controller/testing'
import type { SessionRole, UpdateStatusResponse } from '@nemu/protocol'
import { render, screen } from '@testing-library/react-native'

import { HomeSessionProvider, type MobileHome } from '~/components/home-session'
import { pairedServices } from '~/test/home-session-services'
import SettingsScreen from '../app/(app)/(tabs)/(home,devices,energy)/settings'

// Settings opens the update sheet; update-sheet.test.tsx covers the routes.
jest.mock('expo-router', () => ({
    useRouter: () => ({ push: () => {} }),
    useSegments: () => [],
}))

// The header's menu button needs the drawer navigator, which isn't under test.
jest.mock('~/components/drawer-menu-button', () => ({
    DrawerMenuButton: () => null,
}))

const LAKE: MobileHome = { controllerId: 'lake', name: 'Lake House' }

const NEWER: UpdateStatusResponse = {
    platformVersion: '2026.11.0',
    channel: 'stable',
    newerReleaseAvailable: true,
    maintenanceMode: false,
    rollbackSnapshotAvailable: false,
    rollbackStuck: false,
}

const OWNER_ONLY = 'Install update'
const MEMBER_NOTE = 'An Owner of Lake House can install it.'

async function renderSettings(controller: FakeController) {
    const { services } = await pairedServices(controller)
    await render(
        <HomeSessionProvider homes={[LAKE]} services={services}>
            <SettingsScreen />
        </HomeSessionProvider>
    )
}

describe.each([
    ['LAN', 'lan', true],
    ['Relay', 'relay', false],
] as const)('Settings Release over %s', (_label, mode, lanReachable) => {
    function lake(role: SessionRole): FakeController {
        const controller = new FakeController({
            controllerId: 'lake',
            name: 'Lake House',
            lanReachable,
            acceptedTokens: ['phone'],
            role,
        })
        controller.releaseStatus = structuredClone(NEWER)
        return controller
    }

    it('shows an Owner the installed Release and the Owner-only parts', async () => {
        const controller = lake('owner')
        await renderSettings(controller)

        expect(await screen.findByText('2026.11.0')).toBeTruthy()
        expect(screen.getByText('Stable')).toBeTruthy()
        expect(screen.getByText('A newer Release is available.')).toBeTruthy()
        expect(await screen.findByText(OWNER_ONLY)).toBeTruthy()
        expect(screen.queryByText(MEMBER_NOTE)).toBeNull()
        expect(controller.releaseStatusRequests).toEqual([mode])
    })

    it('shows a Member the installed Release without the Owner-only parts', async () => {
        const controller = lake('member')
        await renderSettings(controller)

        expect(await screen.findByText('2026.11.0')).toBeTruthy()
        expect(screen.getByText('A newer Release is available.')).toBeTruthy()
        expect(await screen.findByText(MEMBER_NOTE)).toBeTruthy()
        expect(screen.queryByText(OWNER_ONLY)).toBeNull()
        expect(controller.releaseStatusRequests).toEqual([mode])
    })

    it('says when the installed Release is the latest', async () => {
        const controller = lake('member')
        controller.releaseStatus = {
            ...NEWER,
            channel: 'canary',
            newerReleaseAvailable: false,
        }
        await renderSettings(controller)

        expect(await screen.findByText('2026.11.0')).toBeTruthy()
        expect(screen.getByText('Canary')).toBeTruthy()
        expect(screen.getByText('This is the latest Release.')).toBeTruthy()
        expect(screen.queryByText(MEMBER_NOTE)).toBeNull()
    })

    it('tells everyone when the installed Release cannot be read', async () => {
        const controller = lake('owner')
        controller.releaseStatus = null
        await renderSettings(controller)

        expect(
            await screen.findByText('The Updater is unavailable')
        ).toBeTruthy()
        expect(screen.queryByText(OWNER_ONLY)).toBeNull()
    })
})

describe('Settings Release while offline', () => {
    it('asks for a connection and hides the Owner-only parts', async () => {
        const controller = new FakeController({
            controllerId: 'lake',
            name: 'Lake House',
            lanReachable: false,
            relayReachable: false,
            acceptedTokens: ['phone'],
            role: 'owner',
        })
        controller.releaseStatus = structuredClone(NEWER)
        await renderSettings(controller)

        expect(
            await screen.findByText(
                'Connect to Lake House to see its installed Release.'
            )
        ).toBeTruthy()
        expect(screen.queryByText(OWNER_ONLY)).toBeNull()
        expect(controller.releaseStatusRequests).toEqual([])
    })
})
