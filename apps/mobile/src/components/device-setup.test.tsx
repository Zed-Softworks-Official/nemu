import { ControllerProvider, useController } from '@nemu/controller'
import {
    createMemoryCredentialStore,
    FakeController,
    fakeControllerConnectors,
} from '@nemu/controller/testing'
import type { Device } from '@nemu/protocol'
import {
    act,
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from '@testing-library/react-native'
import { useEffect } from 'react'

import { RoomsView } from '~/components/control-surface'
import { DeviceNameAndRoom } from '~/components/device-setup'
import { HomeControlProvider, useHomeControl } from '~/components/home-control'

const LAMP: Device = {
    id: 'lamp',
    name: 'Reading Lamp',
    type: 'light',
    protocol: 'zigbee',
    externalId: 'lamp-ext',
    roomId: 'living',
    online: true,
    state: { state: 'ON', brightness: 127 },
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

async function renderSurface(
    controller: FakeController,
    view: React.ReactNode = <RoomsView />
) {
    const credentialStore = createMemoryCredentialStore()
    credentialStore.set(controller.controllerId, { clientToken: 'token' })
    await render(
        <ControllerProvider
            connectors={fakeControllerConnectors(controller)}
            controllerId={controller.controllerId}
            credentialStore={credentialStore}
            lanCandidates={[controller.baseUrl]}
        >
            <CaptureReprobe />
            <HomeControlProvider>{view}</HomeControlProvider>
        </ControllerProvider>
    )
}

const button = (name: string | RegExp) => screen.getByRole('button', { name })
const press = (name: string | RegExp) => fireEvent.press(button(name))
const disabled = (name: string | RegExp) =>
    Boolean(button(name).props.accessibilityState?.disabled)

describe.each([
    ['LAN', 'lan', true],
    ['Relay', 'relay', false],
] as const)('Room setup over %s', (_label, via, lanReachable) => {
    function home(): FakeController {
        return new FakeController({
            controllerId: 'lake',
            acceptedTokens: ['token'],
            lanReachable,
            devices: [structuredClone(LAMP), structuredClone(PLUG)],
            rooms: [
                { id: 'living', name: 'Living Room', sortOrder: 1 },
                { id: 'bedroom', name: 'Bedroom', sortOrder: 2 },
            ],
        })
    }

    it('creates a Room', async () => {
        const controller = home()
        await renderSurface(controller)
        await screen.findByText('Living Room')

        await fireEvent.changeText(
            screen.getByLabelText('New Room name'),
            'Kitchen'
        )
        await press('Create Room')

        await screen.findByText('Created Kitchen')
        await waitFor(() =>
            expect(
                screen
                    .getAllByRole('header')
                    .map((header) => header.props.children)
            ).toContain('Kitchen')
        )
        expect(controller.rooms.map((room) => room.name)).toContain('Kitchen')
        expect(controller.setupRequests).toEqual([{ type: 'createRoom', via }])
    })

    it('renames a Room and points to the dashboard for deleting it', async () => {
        const controller = home()
        await renderSurface(controller)
        await screen.findByText('Living Room')

        await press('Rename Living Room')
        expect(screen.getByText(/delete a Room.*dashboard/)).toBeTruthy()
        expect(screen.queryByRole('button', { name: /Delete/ })).toBeNull()

        await fireEvent.changeText(screen.getByLabelText('Room name'), 'Lounge')
        await press('Save Room name')

        await screen.findByText('Saved')
        await waitFor(() =>
            expect(
                screen
                    .getAllByRole('header')
                    .map((header) => header.props.children)
            ).toContain('Lounge')
        )
        expect(controller.rooms.find((r) => r.id === 'living')?.name).toBe(
            'Lounge'
        )
        expect(controller.setupRequests).toEqual([{ type: 'updateRoom', via }])
    })

    it('disables Room setup and queues nothing while the Controller is unreachable', async () => {
        const controller = home()
        await renderSurface(controller)
        await screen.findByText('Living Room')
        await fireEvent.changeText(
            screen.getByLabelText('New Room name'),
            'Kitchen'
        )

        controller.goOffline()
        await act(() => reprobe())
        await screen.findByText('Can’t reach the Controller')

        for (const name of ['Create Room', 'Rename Living Room']) {
            expect(disabled(name)).toBe(true)
            await press(name)
        }

        controller.lanReachable = lanReachable
        controller.relayReachable = true
        await act(() => reprobe())
        await screen.findByText(via === 'lan' ? 'At home' : 'Away from home')
        expect(controller.setupRequests).toEqual([])
        expect(controller.rooms.map((room) => room.name)).not.toContain(
            'Kitchen'
        )
    })
})

describe('naming a Device and choosing its Room', () => {
    function Step({ onSaved }: { onSaved: () => void }) {
        const { devices } = useHomeControl()
        const device = devices?.find((d) => d.id === 'plug')
        return device ? (
            <DeviceNameAndRoom
                device={device}
                onSaved={onSaved}
                saveTitle="Finish"
            />
        ) : null
    }

    it('saves both in one step, for use after adding a Device', async () => {
        const controller = new FakeController({
            controllerId: 'lake',
            acceptedTokens: ['token'],
            devices: [structuredClone(PLUG)],
            rooms: [{ id: 'living', name: 'Living Room', sortOrder: 1 }],
        })
        const onSaved = jest.fn()
        await renderSurface(controller, <Step onSaved={onSaved} />)
        await screen.findByLabelText('Device name')

        await fireEvent.changeText(
            screen.getByLabelText('Device name'),
            'Kettle'
        )
        await fireEvent.press(
            within(screen.getByLabelText('Room')).getByRole('button', {
                name: 'Living Room',
            })
        )
        await press('Finish')

        await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
        expect(controller.devices[0]).toMatchObject({
            name: 'Kettle',
            roomId: 'living',
        })
    })
})
