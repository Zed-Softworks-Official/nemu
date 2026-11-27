import { ControllerProvider, useController } from '@nemu/controller'
import {
    FakeController,
    fakeAccessClientKeyStore,
    fakeControllerConnectors,
} from '@nemu/controller/testing'
import type { Device } from '@nemu/protocol'
import { Slot, useSegments } from 'expo-router'
import {
    act,
    fireEvent,
    renderRouter,
    screen,
    waitFor,
    within,
} from 'expo-router/testing-library'
import { useEffect } from 'react'

import { DevicesView, RoomsView } from '~/components/control-surface'

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

const LAMP: Device = {
    id: 'lamp',
    name: 'Reading Lamp',
    type: 'light',
    protocol: 'zigbee',
    externalId: 'lamp-ext',
    roomId: 'living',
    online: true,
    state: { state: 'OFF', brightness: 127 },
}
const PLUG: Device = {
    id: 'plug',
    name: 'Desk Plug',
    type: 'outlet',
    protocol: 'zigbee',
    externalId: 'plug-ext',
    roomId: null,
    online: true,
    state: { state: 'OFF' },
}

let reprobe: () => Promise<void>

function CaptureReprobe() {
    const controller = useController()
    useEffect(() => {
        reprobe = controller.reprobe
    }, [controller])
    return null
}

/** Native tabs mount every tab; show a tab's list only while it is active. */
function OnTab({ tab, children }: { tab: string; children: React.ReactNode }) {
    return useSegments().includes(tab as never) ? children : null
}

/**
 * The signed-in route tree with its real layouts and the real Device sheet
 * route. Only the tab roots are stand-ins: they show the same lists without
 * the greeting, which needs Clerk.
 */
function routes(controller: FakeController) {
    const accessClientKeyStore = fakeAccessClientKeyStore({
        [controller.controllerId]: 'phone-access-client',
    })
    return {
        _layout: () => (
            <ControllerProvider
                accessClientKeyStore={accessClientKeyStore}
                connectors={fakeControllerConnectors(controller)}
                controllerId={controller.controllerId}
                lanCandidates={[controller.baseUrl]}
            >
                <CaptureReprobe />
                <Slot />
            </ControllerProvider>
        ),
        '(app)/_layout': require('../app/(app)/_layout'),
        '(app)/(tabs)/_layout': require('../app/(app)/(tabs)/_layout'),
        '(app)/(tabs)/(home,devices,energy)/_layout': require('../app/(app)/(tabs)/(home,devices,energy)/_layout'),
        '(app)/(tabs)/(home)/index': () => (
            <OnTab tab="(home)">
                <RoomsView />
            </OnTab>
        ),
        '(app)/(tabs)/(devices)/devices': () => (
            <OnTab tab="(devices)">
                <DevicesView />
            </OnTab>
        ),
        '(app)/(tabs)/(energy)/energy': () => null,
        '(app)/(tabs)/(home,devices,energy)/device/[deviceId]': require('../app/(app)/(tabs)/(home,devices,energy)/device/[deviceId]'),
    }
}

/** The list behind an open sheet is hidden from accessibility, not gone. */
const behind = { includeHiddenElements: true }

const button = (name: string | RegExp) => screen.getByRole('button', { name })
const press = (name: string | RegExp) =>
    act(async () => {
        fireEvent.press(button(name))
    })
const slide = (value: number) =>
    act(async () => {
        const slider = screen.getByLabelText('Reading Lamp Brightness')
        await fireEvent(slider, 'change', {
            currentTarget: { value: String(value) },
        })
        await fireEvent(slider, 'pointerUp')
    })
const isDisabled = (name: string | RegExp) =>
    Boolean(button(name).props.accessibilityState?.disabled)

describe.each([
    ['LAN', 'lan', true],
    ['Relay', 'relay', false],
] as const)('the Device sheet over %s', (_label, via, lanReachable) => {
    const connected = via === 'lan' ? 'At home' : 'Away from home'

    function home(): FakeController {
        return new FakeController({
            controllerId: 'lake',
            acceptedAccessClients: ['phone-access-client'],
            lanReachable,
            devices: [structuredClone(LAMP), structuredClone(PLUG)],
            rooms: [
                { id: 'living', name: 'Living Room', sortOrder: 1 },
                { id: 'bedroom', name: 'Bedroom', sortOrder: 2 },
            ],
        })
    }

    async function start(controller: FakeController, initialUrl = '/') {
        const rendered = await renderRouter(routes(controller), { initialUrl })
        await screen.findByText(connected)
        await screen.findByText('Living Room')
        return rendered
    }

    async function openSheet(controller: FakeController, name: string) {
        const rendered = await start(controller)
        await press(name)
        await screen.findByLabelText('Device name')
        return rendered
    }

    it('switches a Device from its card toggle without opening the sheet', async () => {
        const controller = home()
        const rendered = await start(controller)

        await act(async () => {
            fireEvent(
                screen.getByLabelText('Reading Lamp Power'),
                'valueChange',
                true
            )
        })

        await screen.findByText(/Waiting for the Device to report on/)
        expect(controller.commands).toEqual([
            {
                command: { deviceId: 'lamp', payload: { state: 'ON' } },
                via,
            },
        ])
        expect(rendered.getSegments()).not.toContain('device')
        expect(screen.queryByLabelText('Device name')).toBeNull()
    })

    it('opens the Device sheet from the rest of the card, on the same tab', async () => {
        const controller = home()
        const rendered = await start(controller)

        await press('Reading Lamp')

        expect(rendered.getSegments()).toEqual([
            '(app)',
            '(tabs)',
            '(home)',
            'device',
            '[deviceId]',
        ])
        await screen.findByLabelText('Device name')
        // Every control the Device supports, not only its power toggle.
        expect(screen.getByLabelText('Reading Lamp Brightness')).toBeTruthy()
        expect(controller.commands).toEqual([])
    })

    it('controls the Device from the sheet', async () => {
        const controller = home()
        await openSheet(controller, 'Reading Lamp')

        await slide(60)

        await waitFor(() =>
            expect(controller.commands).toEqual([
                {
                    command: { deviceId: 'lamp', payload: { brightness: 152 } },
                    via,
                },
            ])
        )
    })

    it('opens the sheet on the Devices tab from the Devices tab', async () => {
        const controller = home()
        const rendered = await renderRouter(routes(controller), {
            initialUrl: '/devices',
        })
        await screen.findByText(connected)
        await screen.findByText('Desk Plug')

        await press('Desk Plug')

        expect(rendered.getSegments().slice(0, 4)).toEqual([
            '(app)',
            '(tabs)',
            '(devices)',
            'device',
        ])
        expect((await screen.findByLabelText('Device name')).props.value).toBe(
            'Desk Plug'
        )
    })

    it('renames a Device without asking first, and refreshes the list', async () => {
        const controller = home()
        await openSheet(controller, 'Reading Lamp')

        await act(async () => {
            fireEvent.changeText(
                screen.getByLabelText('Device name'),
                'Sofa Lamp'
            )
        })
        await press('Save name')

        await screen.findByText('Renamed to Sofa Lamp')
        expect(controller.devices.find((d) => d.id === 'lamp')?.name).toBe(
            'Sofa Lamp'
        )
        expect(controller.setupRequests).toEqual([
            { type: 'renameDevice', via },
        ])
        // The Room list behind the sheet has the new name too.
        await waitFor(() =>
            expect(
                within(
                    screen.getByLabelText('Devices in Living Room', behind)
                ).getByText('Sofa Lamp', behind)
            ).toBeTruthy()
        )
    })

    it('moves a Device to another Room as soon as it is chosen', async () => {
        const controller = home()
        await openSheet(controller, 'Reading Lamp')

        await press('Bedroom')

        await screen.findByText('Moved to Bedroom')
        expect(controller.devices.find((d) => d.id === 'lamp')?.roomId).toBe(
            'bedroom'
        )
        expect(controller.setupRequests).toEqual([{ type: 'assignRoom', via }])
        await waitFor(() =>
            expect(
                within(
                    screen.getByLabelText('Devices in Bedroom', behind)
                ).getByText('Reading Lamp', behind)
            ).toBeTruthy()
        )
        expect(button('Bedroom').props.accessibilityState?.selected).toBe(true)
    })

    it('takes a Device out of every Room', async () => {
        const controller = home()
        await openSheet(controller, 'Reading Lamp')

        await press('Not in a Room')

        await screen.findByText('Moved out of its Room')
        expect(controller.devices.find((d) => d.id === 'lamp')?.roomId).toBe(
            null
        )
    })

    it('asks before removing a Device, naming it, then closes the sheet', async () => {
        const controller = home()
        const rendered = await openSheet(controller, 'Reading Lamp')

        await press('Remove Device')
        expect(
            screen.getByText(
                'Remove Reading Lamp from this Home? It will need to be set up again before you can use it.'
            )
        ).toBeTruthy()
        expect(controller.setupRequests).toEqual([])

        await press('Cancel')
        expect(controller.removedDevices).toEqual([])

        await press('Remove Device')
        await press('Remove Reading Lamp')

        await screen.findByText('Removed Reading Lamp.')
        await waitFor(() =>
            expect(rendered.getSegments()).not.toContain('device')
        )
        expect(
            screen.queryByRole('button', { name: 'Reading Lamp' })
        ).toBeNull()
        expect(controller.removedDevices.map((d) => d.id)).toEqual(['lamp'])
        expect(controller.setupRequests).toEqual([
            { type: 'removeDevice', via },
        ])
    })

    it('does not show an earlier outcome when it is opened again', async () => {
        const controller = home()
        await openSheet(controller, 'Reading Lamp')
        await press('Bedroom')
        await screen.findByText('Moved to Bedroom')

        await press('Done')
        await press('Reading Lamp')

        await screen.findByLabelText('Device name')
        expect(screen.queryByText('Moved to Bedroom')).toBeNull()
    })

    it('shows the Controller’s refusal as it gave it', async () => {
        const controller = home()
        await openSheet(controller, 'Reading Lamp')
        controller.membershipActive = false

        await press('Bedroom')

        await screen.findByText('This Membership is not active')
        expect(screen.getByText('Not saved')).toBeTruthy()
        expect(controller.devices.find((d) => d.id === 'lamp')?.roomId).toBe(
            'living'
        )
    })

    it('stays open but disables everything, and queues nothing, when the Controller is unreachable', async () => {
        const controller = home()
        await openSheet(controller, 'Reading Lamp')
        await act(async () => {
            fireEvent.changeText(
                screen.getByLabelText('Device name'),
                'Sofa Lamp'
            )
        })
        await press('Remove Device')

        controller.goOffline()
        await act(() => reprobe())

        await screen.findByText('Showing the last known state')
        // Same layout: the edit in progress and the confirmation stay.
        expect(screen.getByLabelText('Device name').props.value).toBe(
            'Sofa Lamp'
        )
        expect(screen.getByLabelText('Device name').props.editable).toBe(false)
        expect(screen.getByLabelText('Reading Lamp Power').props.disabled).toBe(
            true
        )
        for (const name of [
            'Save name',
            'Remove Reading Lamp',
            'Bedroom',
            'Not in a Room',
        ]) {
            expect(isDisabled(name)).toBe(true)
            await press(name)
        }
        await act(async () => {
            fireEvent(
                screen.getByLabelText('Reading Lamp Power'),
                'valueChange',
                true
            )
        })
        expect(
            screen.getByLabelText('Reading Lamp Brightness').props.disabled
        ).toBe(true)
        await slide(60)

        controller.lanReachable = lanReachable
        controller.relayReachable = true
        await act(() => reprobe())
        await waitFor(() =>
            expect(
                screen.queryByText('Showing the last known state')
            ).toBeNull()
        )
        expect(isDisabled('Save name')).toBe(false)
        expect(controller.setupRequests).toEqual([])
        expect(controller.commands).toEqual([])
        expect(controller.removedDevices).toEqual([])
        expect(controller.devices.find((d) => d.id === 'lamp')?.name).toBe(
            'Reading Lamp'
        )
    })
})

describe('the Device lists', () => {
    it('edit nothing inline: setup lives only in the Device sheet', async () => {
        const controller = new FakeController({
            controllerId: 'lake',
            acceptedAccessClients: ['phone-access-client'],
            devices: [structuredClone(LAMP), structuredClone(PLUG)],
            rooms: [{ id: 'living', name: 'Living Room', sortOrder: 1 }],
        })
        await renderRouter(routes(controller), { initialUrl: '/' })
        await screen.findByText('Living Room')

        expect(screen.queryByRole('button', { name: /^Set up/ })).toBeNull()
        expect(screen.queryByLabelText('Device name')).toBeNull()
        expect(screen.queryByRole('button', { name: /Remove/ })).toBeNull()
        // Level controls are in the sheet, not on the card.
        expect(screen.queryByLabelText('Reading Lamp Brightness')).toBeNull()
    })

    it('says when a Device sheet’s Device has left the Home', async () => {
        const controller = new FakeController({
            controllerId: 'lake',
            acceptedAccessClients: ['phone-access-client'],
            devices: [structuredClone(LAMP)],
        })
        await renderRouter(routes(controller), { initialUrl: '/device/gone' })

        expect(
            await screen.findByText('This Device is no longer in this Home.')
        ).toBeTruthy()
    })
})
