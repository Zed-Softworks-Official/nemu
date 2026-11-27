import { ControllerProvider, useController } from '@nemu/controller'
import {
    FakeController,
    fakeAccessClientKeyStore,
    fakeControllerConnectors,
} from '@nemu/controller/testing'
import type { SessionRole, UpdateStatusResponse } from '@nemu/protocol'
import { Slot } from 'expo-router'
import {
    act,
    fireEvent,
    renderRouter,
    screen,
} from 'expo-router/testing-library'
import { useEffect } from 'react'

// The drawer animates with Reanimated, whose Jest mock can't load under
// Reanimated 4.7. Render its content and scene without the animation.
jest.mock('react-native-drawer-layout', () => {
    const { createContext } = require('react')
    const { View } = require('react-native')
    return {
        Drawer: ({ children }: { children: React.ReactNode }) => (
            <View>{children}</View>
        ),
        DrawerProgressContext: createContext(undefined),
        useDrawerProgress: () => ({ value: 0 }),
    }
})

// The Home list needs Clerk and Convex; the Controller is the real seam.
jest.mock('~/components/home-session', () => ({
    useHomeSession: () => ({
        activeHome: { controllerId: 'lake', name: 'Lake House' },
        forgetPairing: () => {},
        switchHome: () => {},
    }),
}))

const NEWER: UpdateStatusResponse = {
    platformVersion: '0.4.9',
    channel: 'stable',
    newerReleaseAvailable: true,
    availableRelease: {
        platformVersion: '0.4.10',
        releaseNotes: '- Faster pairing',
    },
    maintenanceMode: false,
    rollbackSnapshotAvailable: true,
    rollbackStuck: false,
}

const TABS = '../app/(app)/(tabs)/(home,devices,energy)'
let reprobe: () => Promise<void>

function CaptureReprobe() {
    const controller = useController()
    useEffect(() => {
        reprobe = controller.reprobe
    }, [controller])
    return null
}

function routes(controller: FakeController) {
    const accessClientKeyStore = fakeAccessClientKeyStore({
        [controller.controllerId]: 'phone-access-client',
    })
    const connectors = fakeControllerConnectors(controller)
    return {
        _layout: () => (
            <ControllerProvider
                accessClientKeyStore={accessClientKeyStore}
                connectors={connectors}
                controllerId={controller.controllerId}
            >
                <CaptureReprobe />
                <Slot />
            </ControllerProvider>
        ),
        '(app)/_layout': require('../app/(app)/_layout'),
        '(app)/(tabs)/_layout': require('../app/(app)/(tabs)/_layout'),
        '(app)/(tabs)/(home,devices,energy)/_layout': require(
            `${TABS}/_layout`
        ),
        '(app)/(tabs)/(home)/index': () => null,
        '(app)/(tabs)/(devices)/devices': () => null,
        '(app)/(tabs)/(energy)/energy': () => null,
        '(app)/(tabs)/(home,devices,energy)/settings': require(
            `${TABS}/settings`
        ),
        '(app)/(tabs)/(home,devices,energy)/update': require(`${TABS}/update`),
    }
}

const button = (name: string) => screen.getByRole('button', { name })
const isDisabled = (name: string) =>
    Boolean(button(name).props.accessibilityState?.disabled)
const press = (name: string) =>
    act(async () => {
        fireEvent.press(button(name))
    })
/** Long enough for the connection to reconnect and read Release status. */
const pass = (ms = 5_000) =>
    act(async () => {
        await jest.advanceTimersByTimeAsync(ms)
    })

beforeEach(() => jest.useFakeTimers())
afterEach(() => jest.useRealTimers())

describe.each([
    ['LAN', 'lan', true],
    ['Relay', 'relay', false],
] as const)('installing and rolling back over %s', (_label, via, lanReachable) => {
    function lake(
        role: SessionRole = 'owner',
        release: Partial<UpdateStatusResponse> = {}
    ): FakeController {
        const controller = new FakeController({
            controllerId: 'lake',
            acceptedAccessClients: ['phone-access-client'],
            lanReachable,
            role,
        })
        controller.releaseStatus = { ...structuredClone(NEWER), ...release }
        controller.previousPlatformVersion = '0.4.8'
        return controller
    }

    async function openSettings(controller: FakeController) {
        const rendered = await renderRouter(routes(controller), {
            initialUrl: '/settings',
        })
        await screen.findByText('0.4.9')
        await screen.findByText(
            controller.role === 'owner'
                ? 'Install update'
                : 'An Owner of Lake House can install it.'
        )
        return rendered
    }

    async function openSheet(controller: FakeController) {
        const rendered = await openSettings(controller)
        await press('Install update')
        await screen.findByText('- Faster pairing')
        return rendered
    }

    it('confirms with the version and release notes before installing', async () => {
        const controller = lake()
        const rendered = await openSheet(controller)

        expect(rendered.getSegments().at(-1)).toBe('update')
        expect(screen.getByText('0.4.10')).toBeTruthy()
        expect(controller.releaseUpdates).toEqual([])

        await press('Done')
        expect(rendered.getSegments().at(-1)).toBe('settings')
        expect(controller.releaseUpdates).toEqual([])
    })

    it('says when the Release has no notes', async () => {
        const controller = lake('owner', {
            availableRelease: { platformVersion: '0.4.10', releaseNotes: null },
        })
        await openSettings(controller)
        await press('Install update')
        expect(
            await screen.findByText(
                'This Release was published without release notes.'
            )
        ).toBeTruthy()
    })

    it('shows Updating…, reconnects after the restart, and reports the install', async () => {
        const controller = lake()
        const rendered = await openSheet(controller)
        await press('Install now')

        await screen.findByText('Updating…')
        expect(rendered.getSegments().at(-1)).toBe('settings')
        expect(controller.releaseUpdates).toEqual([
            { type: 'install', via, platformVersion: '0.4.10' },
        ])
        expect(screen.queryByText('Install update')).toBeNull()

        controller.restart()
        await pass()
        expect(
            screen.getByText(
                'The Controller is restarting. Reconnecting to Lake House…'
            )
        ).toBeTruthy()
        await pass()
        expect(screen.getByText('Updating…')).toBeTruthy()

        controller.finishReleaseUpdate('installed')
        await pass(10_000)
        expect(screen.getByText('Release 0.4.10 was installed.')).toBeTruthy()
        expect(screen.getByText('0.4.10')).toBeTruthy()
        expect(screen.getByText('This is the latest Release.')).toBeTruthy()
        expect(controller.releaseUpdates).toHaveLength(1)

        await press('Dismiss')
        expect(screen.queryByText('Release 0.4.10 was installed.')).toBeNull()
    })

    it('refuses when the channel serves another Release by then', async () => {
        const controller = lake()
        await openSheet(controller)
        controller.releaseStatus = {
            ...structuredClone(NEWER),
            availableRelease: { platformVersion: '0.4.11' },
        }
        await press('Install now')
        expect(
            await screen.findByText(/A different Release is available now/)
        ).toBeTruthy()
        expect(controller.releaseUpdates).toEqual([])
        expect(controller.releaseStatus.maintenanceMode).toBe(false)
    })

    it('does not claim a rollback from a snapshot that was already there', async () => {
        const controller = lake('owner', { rollbackSnapshotAvailable: true })
        await openSheet(controller)
        await press('Install now')
        await pass()
        controller.restart()
        await pass()
        controller.finishReleaseUpdate('rolledBack')
        await pass(10_000)
        expect(
            screen.getByText(
                'The update did not complete. The Controller still runs Release 0.4.9.'
            )
        ).toBeTruthy()
    })

    it('keeps Updating… while the Controller is back but still in maintenance', async () => {
        const controller = lake()
        await openSheet(controller)
        await press('Install now')
        controller.restart()
        await pass()
        controller.finishRestart()
        await pass(10_000)
        expect(screen.getByText('Updating…')).toBeTruthy()
    })

    it('reports a failed install that rolled back', async () => {
        const controller = lake('owner', {
            rollbackSnapshotAvailable: false,
        })
        await openSheet(controller)
        await press('Install now')
        await pass()
        controller.restart()
        await pass()
        controller.finishReleaseUpdate('rolledBack')
        await pass(10_000)
        expect(
            screen.getByText(
                'The new Release did not stay healthy, so the Controller rolled back to Release 0.4.9.'
            )
        ).toBeTruthy()
        expect(isDisabled('Install update')).toBe(false)
    })

    it('rolls back after a confirmation and reports the previous Release', async () => {
        const controller = lake()
        await openSettings(controller)
        await press('Roll back')
        expect(controller.releaseUpdates).toEqual([])
        await press('Cancel')
        await press('Roll back')
        await press('Roll back now')

        await screen.findByText('Rolling back…')
        expect(controller.releaseUpdates).toEqual([{ type: 'rollback', via }])
        controller.restart()
        await pass()
        controller.finishReleaseUpdate('rolledBack')
        await pass(10_000)
        expect(screen.getByText('Rolled back to Release 0.4.8.')).toBeTruthy()
    })

    it('reports a rollback that could not finish and lets the Owner retry it', async () => {
        const controller = lake()
        await openSettings(controller)
        await press('Roll back')
        await press('Roll back now')
        await pass()
        controller.finishReleaseUpdate('rollbackStuck')
        await pass(10_000)
        expect(
            screen.getByText(
                'The rollback could not finish. The Controller is in maintenance.'
            )
        ).toBeTruthy()
        expect(isDisabled('Roll back')).toBe(false)
        expect(isDisabled('Install update')).toBe(true)

        await press('Roll back')
        await press('Roll back now')
        controller.finishReleaseUpdate('rolledBack')
        await pass(10_000)
        expect(screen.getByText('Rolled back to Release 0.4.8.')).toBeTruthy()
    })

    it('shows the Controller’s refusal and starts nothing', async () => {
        const controller = lake()
        await openSheet(controller)
        controller.role = 'member'
        await press('Install now')
        expect(
            await screen.findByText('Only the home owner can do that')
        ).toBeTruthy()
        expect(controller.releaseUpdates).toEqual([])
    })

    it('disables both actions while the Controller is unreachable', async () => {
        const controller = lake()
        await openSettings(controller)
        controller.goOffline()
        await act(() => reprobe())

        for (const name of ['Install update', 'Roll back']) {
            expect(isDisabled(name)).toBe(true)
            await press(name)
        }
        expect(screen.queryByText('Roll back now')).toBeNull()

        controller.lanReachable = lanReachable
        controller.relayReachable = true
        await act(() => reprobe())
        await pass(0)
        expect(isDisabled('Install update')).toBe(false)
        expect(controller.releaseUpdates).toEqual([])
    })

    it('keeps the sheet open but disabled, and queues nothing, while unreachable', async () => {
        const controller = lake()
        const rendered = await openSheet(controller)
        controller.goOffline()
        await act(() => reprobe())

        expect(screen.getByText('Showing the last known state')).toBeTruthy()
        expect(screen.getByText('- Faster pairing')).toBeTruthy()
        expect(isDisabled('Install now')).toBe(true)
        await press('Install now')

        controller.lanReachable = lanReachable
        controller.relayReachable = true
        await act(() => reprobe())
        await pass(10_000)
        expect(rendered.getSegments().at(-1)).toBe('update')
        expect(isDisabled('Install now')).toBe(false)
        expect(controller.releaseUpdates).toEqual([])
    })

    it('never shows a Member either action', async () => {
        const controller = lake('member')
        await openSettings(controller)
        expect(screen.queryByText('Install update')).toBeNull()
        expect(screen.queryByText('Roll back')).toBeNull()

        controller.goOffline()
        await act(() => reprobe())
        expect(screen.queryByText('Install update')).toBeNull()
        expect(screen.queryByText('Roll back')).toBeNull()
    })

    it('offers a Member nothing to install in the sheet', async () => {
        const controller = lake('member')
        await renderRouter(routes(controller), { initialUrl: '/update' })
        expect(
            await screen.findByText('Only an Owner can install an update.')
        ).toBeTruthy()
        expect(screen.queryByText('Install now')).toBeNull()
    })
})
