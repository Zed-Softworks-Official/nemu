import { ControllerProvider, useController } from '@nemu/controller'
import {
    createMemoryCredentialStore,
    FakeController,
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

import { RoomsView } from '~/components/control-surface'

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
/** In the Bedroom, with two outlets explicitly assigned to the Living Room. */
const STRIP: Device = {
    id: 'strip',
    name: 'Power Strip',
    type: 'switch',
    protocol: 'zigbee',
    externalId: 'strip-ext',
    roomId: 'bedroom',
    componentRooms: { l1: 'living', l2: 'living' },
    online: true,
    state: {},
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
 * The signed-in route tree with its real layouts and the real Room sheet
 * routes. Only the tab roots are stand-ins: they show the Room list without
 * the greeting, which needs Clerk.
 */
function routes(controller: FakeController) {
    const credentialStore = createMemoryCredentialStore()
    credentialStore.set(controller.controllerId, { clientToken: 'token' })
    return {
        _layout: () => (
            <ControllerProvider
                connectors={fakeControllerConnectors(controller)}
                controllerId={controller.controllerId}
                credentialStore={credentialStore}
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
                <RoomsView />
            </OnTab>
        ),
        '(app)/(tabs)/(energy)/energy': () => null,
        '(app)/(tabs)/(home,devices,energy)/room/[roomId]': require('../app/(app)/(tabs)/(home,devices,energy)/room/[roomId]'),
        '(app)/(tabs)/(home,devices,energy)/room/new': require('../app/(app)/(tabs)/(home,devices,energy)/room/new'),
    }
}

/** The list behind an open sheet is hidden from accessibility, not gone. */
const behind = { includeHiddenElements: true }

const button = (name: string | RegExp) => screen.getByRole('button', { name })
const press = (name: string | RegExp) =>
    act(async () => {
        fireEvent.press(button(name))
    })
const isDisabled = (name: string | RegExp) =>
    Boolean(button(name).props.accessibilityState?.disabled)
const type = (label: string, value: string) =>
    act(async () => {
        fireEvent.changeText(screen.getByLabelText(label), value)
    })

describe.each([
    ['LAN', 'lan', true],
    ['Relay', 'relay', false],
] as const)('the Room sheets over %s', (_label, via, lanReachable) => {
    const connected = via === 'lan' ? 'At home' : 'Away from home'

    function home(): FakeController {
        return new FakeController({
            controllerId: 'lake',
            acceptedTokens: ['token'],
            lanReachable,
            devices: [structuredClone(LAMP), structuredClone(STRIP)],
            rooms: [
                { id: 'attic', name: 'Attic', sortOrder: 3 },
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

    async function openRoom(controller: FakeController, name: string) {
        const rendered = await start(controller)
        await press(name)
        await screen.findByLabelText('Room name')
        return rendered
    }

    async function openDelete(controller: FakeController, name: string) {
        const rendered = await openRoom(controller, name)
        await press('Delete Room')
        return rendered
    }

    const destinations = () =>
        within(screen.getByLabelText('Move Devices to'))
            .getAllByRole('button')
            .map((option) => option.props.accessibilityLabel)
    const deviceRoom = (controller: FakeController, id: string) =>
        controller.devices.find((d) => d.id === id)?.roomId

    it('opens on the active tab and lists the Room’s Devices', async () => {
        const controller = home()
        const rendered = await start(controller, '/devices')

        await press('Living Room')

        expect(rendered.getSegments()).toEqual([
            '(app)',
            '(tabs)',
            '(devices)',
            'room',
            '[roomId]',
        ])
        const devices = within(await screen.findByLabelText('Devices'))
        expect(devices.getByText('Reading Lamp')).toBeTruthy()
        // Its Components are here, so deleting the Room moves it too.
        expect(devices.getByText('Power Strip')).toBeTruthy()
        expect(
            devices.getByText('Only some of its Components are in this Room')
        ).toBeTruthy()
    })

    it('renames a Room without asking first, and refreshes the list', async () => {
        const controller = home()
        await openRoom(controller, 'Living Room')

        await type('Room name', 'Lounge')
        await press('Save name')

        await screen.findByText('Renamed to Lounge')
        expect(controller.rooms.find((r) => r.id === 'living')?.name).toBe(
            'Lounge'
        )
        expect(controller.setupRequests).toEqual([{ type: 'updateRoom', via }])
        expect(
            await screen.findByLabelText('Devices in Lounge', behind)
        ).toBeTruthy()
    })

    it('creates a Room from its own sheet, then closes it', async () => {
        const controller = home()
        const rendered = await start(controller)

        await press('New Room')
        expect(rendered.getSegments().slice(2)).toEqual([
            '(home)',
            'room',
            'new',
        ])
        expect(isDisabled('Create Room')).toBe(true)
        await type('New Room name', '  Kitchen ')
        await press('Create Room')

        await screen.findByText('Created Kitchen.')
        expect(rendered.getSegments()).not.toContain('room')
        expect(screen.getByLabelText('Devices in Kitchen')).toBeTruthy()
        expect(controller.rooms.map((room) => room.name)).toContain('Kitchen')
        expect(controller.setupRequests).toEqual([{ type: 'createRoom', via }])
    })

    it('keeps the create sheet and its name when the Controller refuses', async () => {
        const controller = home()
        const rendered = await start(controller)
        await press('New Room')
        await type('New Room name', 'Kitchen')
        controller.membershipActive = false

        await press('Create Room')

        await screen.findByText('This Membership is not active')
        expect(rendered.getSegments()).toContain('room')
        expect(screen.getByLabelText('New Room name').props.value).toBe(
            'Kitchen'
        )
        expect(controller.rooms).toHaveLength(3)
    })

    it('asks where a Room’s Devices go, counting each one once', async () => {
        const controller = home()
        await openDelete(controller, 'Living Room')

        expect(screen.getByText('Delete Living Room?')).toBeTruthy()
        expect(destinations()).toEqual(['No Room', 'Bedroom', 'Attic'])
        expect(screen.getByText('2 Devices will move to No Room.')).toBeTruthy()

        await press('Cancel')
        expect(screen.queryByText('Delete Living Room?')).toBeNull()
        expect(controller.setupRequests).toEqual([])
    })

    it('deletes a Room once, moving its Devices and Components to another', async () => {
        const controller = home()
        const rendered = await openDelete(controller, 'Living Room')

        await press('Bedroom')
        expect(screen.getByText('2 Devices will move to Bedroom.')).toBeTruthy()
        await press('Delete Living Room')

        await screen.findByText(
            'Deleted Living Room. 2 Devices moved to Bedroom.'
        )
        expect(rendered.getSegments()).not.toContain('room')
        expect(screen.queryByText('Living Room')).toBeNull()
        expect(
            within(screen.getByLabelText('Devices in Bedroom')).getByText(
                'Reading Lamp'
            )
        ).toBeTruthy()
        expect(controller.setupRequests).toEqual([{ type: 'deleteRoom', via }])
        expect(controller.deletedRooms).toEqual([
            { roomId: 'living', destinationRoomId: 'bedroom', via },
        ])
        expect(
            controller.devices.find((d) => d.id === 'strip')?.componentRooms
        ).toEqual({ l1: 'bedroom', l2: 'bedroom' })
    })

    it('deletes a Room, moving its Devices to No Room', async () => {
        const controller = home()
        await openDelete(controller, 'Bedroom')
        expect(screen.getByText('1 Device will move to No Room.')).toBeTruthy()

        await press('Delete Bedroom')

        await screen.findByText('Deleted Bedroom. 1 Device moved to No Room.')
        expect(controller.deletedRooms).toEqual([
            { roomId: 'bedroom', destinationRoomId: null, via },
        ])
        expect(deviceRoom(controller, 'strip')).toBeNull()
        expect(
            within(screen.getByLabelText('Devices in Not in a Room')).getByText(
                'Power Strip'
            )
        ).toBeTruthy()
    })

    it('deletes an empty Room without asking for a destination', async () => {
        const controller = home()
        await openDelete(controller, 'Attic')

        expect(screen.getByText('No Devices are in this Room.')).toBeTruthy()
        expect(screen.queryByLabelText('Move Devices to')).toBeNull()
        await press('Delete Attic')

        await screen.findByText('Deleted Attic.')
        expect(controller.deletedRooms).toEqual([
            { roomId: 'attic', destinationRoomId: null, via },
        ])
    })

    it('leaves everything in place when the Controller refuses the delete', async () => {
        const controller = home()
        const rendered = await openDelete(controller, 'Living Room')
        await press('Attic')
        // Someone else deletes the Attic while this sheet is open.
        controller.rooms = controller.rooms.filter((r) => r.id !== 'attic')

        await press('Delete Living Room')

        await screen.findByText('The destination Room no longer exists')
        expect(screen.getByText('Not saved')).toBeTruthy()
        expect(rendered.getSegments()).toContain('room')
        expect(controller.deletedRooms).toEqual([])
        expect(deviceRoom(controller, 'lamp')).toBe('living')
        expect(controller.rooms.map((r) => r.id)).toContain('living')
        expect(
            screen.getByLabelText('Devices in Living Room', behind)
        ).toBeTruthy()
        // The gone Room is no longer offered, nor silently kept.
        expect(destinations()).toEqual(['No Room', 'Bedroom'])
        expect(screen.getByText('2 Devices will move to No Room.')).toBeTruthy()
    })

    it('stays open but disables everything, and queues nothing, when the Controller is unreachable', async () => {
        const controller = home()
        await openDelete(controller, 'Living Room')
        await press('Bedroom')
        await type('Room name', 'Lounge')

        controller.goOffline()
        await act(() => reprobe())

        await screen.findByText('Showing the last known state')
        // Same layout: the edit in progress and the confirmation stay.
        expect(screen.getByLabelText('Room name').props).toMatchObject({
            value: 'Lounge',
            editable: false,
        })
        for (const name of [
            'Save name',
            'No Room',
            'Attic',
            'Delete Living Room',
        ]) {
            expect(isDisabled(name)).toBe(true)
            await press(name)
        }
        expect(screen.getByText('2 Devices will move to Bedroom.')).toBeTruthy()

        await backOnline(controller)
        expect(isDisabled('Delete Living Room')).toBe(false)
        expect(controller.setupRequests).toEqual([])
        expect(controller.deletedRooms).toEqual([])
        expect(controller.rooms).toHaveLength(3)
    })

    it('disables creating a Room, and queues nothing, when the Controller is unreachable', async () => {
        const controller = home()
        await start(controller)
        await press('New Room')
        await type('New Room name', 'Kitchen')

        controller.goOffline()
        await act(() => reprobe())

        await screen.findByText('Showing the last known state')
        expect(screen.getByLabelText('New Room name').props).toMatchObject({
            value: 'Kitchen',
            editable: false,
        })
        expect(isDisabled('Create Room')).toBe(true)
        await press('Create Room')

        await backOnline(controller)
        expect(controller.setupRequests).toEqual([])
        expect(controller.rooms).toHaveLength(3)
    })

    async function backOnline(controller: FakeController) {
        controller.lanReachable = lanReachable
        controller.relayReachable = true
        await act(() => reprobe())
        await waitFor(() =>
            expect(
                screen.queryByText('Showing the last known state')
            ).toBeNull()
        )
    }
})

describe('the Room list', () => {
    it('edits nothing inline: setup lives only in the Room sheets', async () => {
        const controller = new FakeController({
            controllerId: 'lake',
            acceptedTokens: ['token'],
            rooms: [{ id: 'living', name: 'Living Room', sortOrder: 1 }],
        })
        await renderRouter(routes(controller), { initialUrl: '/' })
        await screen.findByText('Living Room')

        expect(screen.queryByLabelText('New Room name')).toBeNull()
        expect(
            screen.queryByRole('button', { name: /Rename|Delete|Create/ })
        ).toBeNull()
    })

    it('says when a Room sheet’s Room has left the Home', async () => {
        const controller = new FakeController({
            controllerId: 'lake',
            acceptedTokens: ['token'],
        })
        await renderRouter(routes(controller), { initialUrl: '/room/gone' })

        expect(
            await screen.findByText('This Room is no longer in this Home.')
        ).toBeTruthy()
    })
})
