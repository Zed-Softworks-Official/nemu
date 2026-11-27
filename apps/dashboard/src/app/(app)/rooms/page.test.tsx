import { FakeController } from '@nemu/controller/testing'
import type { Device } from '@nemu/protocol'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import {
    DASHBOARD_ACCESS_CLIENT_ID,
    renderWithController,
} from '~/test/render-with-controller'
import RoomsPage from './page'

vi.mock('@clerk/nextjs/server', () => ({
    auth: { protect: async () => ({}) },
}))

const LAMP: Device = {
    id: 'lamp',
    name: 'Reading Lamp',
    type: 'light',
    protocol: 'zigbee',
    externalId: 'lamp-ext',
    roomId: 'living',
    online: true,
    state: { state: 'ON' },
}

/** In the Office, with one outlet explicitly assigned to the Living Room. */
const STRIP: Device = {
    id: 'strip',
    name: 'Power Strip',
    type: 'switch',
    protocol: 'zigbee',
    externalId: 'strip-ext',
    roomId: 'office',
    componentRooms: { l2: 'living' },
    online: true,
    state: {},
}

function home(options?: { lanReachable?: boolean; withKitchen?: boolean }) {
    return new FakeController({
        controllerId: 'lake',
        acceptedAccessClients: [DASHBOARD_ACCESS_CLIENT_ID],
        lanReachable: options?.lanReachable ?? true,
        devices: [structuredClone(LAMP), structuredClone(STRIP)],
        rooms: [
            { id: 'living', name: 'Living Room', sortOrder: 1 },
            { id: 'office', name: 'Office', sortOrder: 2 },
            ...(options?.withKitchen
                ? [{ id: 'kitchen', name: 'Kitchen', sortOrder: 3 }]
                : []),
        ],
    })
}

async function openDelete(
    user: ReturnType<typeof userEvent.setup>,
    roomName: string
): Promise<HTMLElement> {
    const row = (await screen.findByText(roomName)).closest(
        '[data-room-row]'
    ) as HTMLElement
    await user.click(within(row).getByRole('button', { name: 'Delete' }))
    return screen.findByRole('alertdialog', { name: `Delete ${roomName}?` })
}

async function renderRooms(controller: FakeController) {
    renderWithController(await RoomsPage(), controller)
}

describe('Rooms page', () => {
    it('lists the Home’s Rooms', async () => {
        await renderRooms(home())

        expect(
            await screen.findByRole('heading', { name: 'Rooms' })
        ).toBeInTheDocument()
        expect(await screen.findByText('Living Room')).toBeInTheDocument()
        expect(screen.getByText('Office')).toBeInTheDocument()
    })

    it('shows a new Room once the Controller creates it', async () => {
        const user = userEvent.setup()
        await renderRooms(home())

        await user.type(
            await screen.findByRole('textbox', { name: 'New room name' }),
            'Kitchen'
        )
        await user.click(screen.getByRole('button', { name: 'Create' }))

        expect(await screen.findByText('Kitchen')).toBeInTheDocument()
    })

    it('shows a renamed Room', async () => {
        const user = userEvent.setup()
        await renderRooms(home())

        await screen.findByText('Office')
        const [, officeRename] = screen.getAllByRole('button', {
            name: 'Rename',
        })
        await user.click(officeRename as HTMLElement)
        const input = screen.getByRole('textbox', { name: 'Rename Office' })
        await user.clear(input)
        await user.type(input, 'Study')
        await user.click(screen.getByRole('button', { name: 'Save' }))

        expect(await screen.findByText('Study')).toBeInTheDocument()
        expect(screen.queryByText('Office')).not.toBeInTheDocument()
    })

    it('removes an empty Room after confirmation', async () => {
        const user = userEvent.setup()
        const controller = home({ withKitchen: true })
        await renderRooms(controller)

        const dialog = await openDelete(user, 'Kitchen')
        expect(
            within(dialog).getByText('No Devices are in this Room.')
        ).toBeInTheDocument()
        expect(within(dialog).queryByRole('combobox')).not.toBeInTheDocument()
        await user.click(
            within(dialog).getByRole('button', { name: 'Delete room' })
        )

        await vi.waitFor(() =>
            expect(screen.queryByText('Kitchen')).not.toBeInTheDocument()
        )
        expect(screen.getByText('Living Room')).toBeInTheDocument()
        expect(controller.deletedRooms).toEqual([
            { roomId: 'kitchen', destinationRoomId: null, via: 'lan' },
        ])
    })

    it('offers every other Room and No Room when a Room has Devices', async () => {
        const user = userEvent.setup()
        await renderRooms(home({ withKitchen: true }))

        const dialog = await openDelete(user, 'Living Room')
        const destination = within(dialog).getByRole('combobox', {
            name: 'Move Devices to',
        })
        expect(
            within(destination)
                .getAllByRole('option')
                .map((option) => option.textContent)
        ).toEqual(['No Room', 'Office', 'Kitchen'])
        expect(
            within(dialog).getByText('2 Devices will move to No Room.')
        ).toBeInTheDocument()
    })

    it('moves a deleted Room’s Devices to another Room', async () => {
        const user = userEvent.setup()
        const controller = home()
        await renderRooms(controller)

        const dialog = await openDelete(user, 'Living Room')
        await user.selectOptions(
            within(dialog).getByRole('combobox', { name: 'Move Devices to' }),
            'Office'
        )
        expect(
            within(dialog).getByText('2 Devices will move to Office.')
        ).toBeInTheDocument()
        await user.click(
            within(dialog).getByRole('button', { name: 'Delete room' })
        )

        await vi.waitFor(() =>
            expect(screen.queryByText('Living Room')).not.toBeInTheDocument()
        )
        expect(controller.deletedRooms).toEqual([
            { roomId: 'living', destinationRoomId: 'office', via: 'lan' },
        ])
        expect(controller.devices.find((d) => d.id === 'lamp')?.roomId).toBe(
            'office'
        )
        expect(
            controller.devices.find((d) => d.id === 'strip')?.componentRooms
        ).toEqual({ l2: 'office' })
    })

    it('moves a deleted Room’s Devices to No Room', async () => {
        const user = userEvent.setup()
        const controller = home()
        await renderRooms(controller)

        const dialog = await openDelete(user, 'Living Room')
        await user.click(
            within(dialog).getByRole('button', { name: 'Delete room' })
        )

        await vi.waitFor(() =>
            expect(screen.queryByText('Living Room')).not.toBeInTheDocument()
        )
        expect(controller.deletedRooms).toEqual([
            { roomId: 'living', destinationRoomId: null, via: 'lan' },
        ])
        expect(
            controller.devices.find((d) => d.id === 'lamp')?.roomId
        ).toBeNull()
        expect(
            controller.devices.find((d) => d.id === 'strip')?.componentRooms
        ).toBeUndefined()
    })

    it('keeps everything in place when the Controller refuses the delete', async () => {
        const user = userEvent.setup()
        const controller = home()
        await renderRooms(controller)

        const dialog = await openDelete(user, 'Living Room')
        await user.selectOptions(
            within(dialog).getByRole('combobox', { name: 'Move Devices to' }),
            'Office'
        )
        // Someone else deletes Office while this dialog is open.
        controller.rooms = controller.rooms.filter((r) => r.id !== 'office')
        await user.click(
            within(dialog).getByRole('button', { name: 'Delete room' })
        )

        expect(
            await within(dialog).findByText(
                'The destination Room no longer exists'
            )
        ).toBeInTheDocument()
        expect(controller.deletedRooms).toEqual([])
        expect(controller.devices.find((d) => d.id === 'lamp')?.roomId).toBe(
            'living'
        )
        expect(screen.getAllByText('Living Room').length).toBeGreaterThan(0)
    })

    it('asks for a Home connection when only the Relay reaches the Controller', async () => {
        await renderRooms(home({ lanReachable: false }))

        expect(
            await screen.findByText('Home connection required')
        ).toBeInTheDocument()
        expect(screen.queryByText('Living Room')).not.toBeInTheDocument()
    })
})
