import { FakeController } from '@nemu/controller/testing'
import type { Device } from '@nemu/protocol'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import {
    DASHBOARD_TOKEN,
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

function home(options?: { lanReachable?: boolean }) {
    return new FakeController({
        controllerId: 'lake',
        acceptedTokens: [DASHBOARD_TOKEN],
        lanReachable: options?.lanReachable ?? true,
        devices: [LAMP],
        rooms: [
            { id: 'living', name: 'Living Room', sortOrder: 1 },
            { id: 'office', name: 'Office', sortOrder: 2 },
        ],
    })
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
        await renderRooms(home())

        await screen.findByText('Office')
        const [, officeDelete] = screen.getAllByRole('button', {
            name: 'Delete',
        })
        await user.click(officeDelete as HTMLElement)
        const dialog = await screen.findByRole('alertdialog', {
            name: 'Delete Office?',
        })
        await user.click(
            within(dialog).getByRole('button', { name: 'Delete room' })
        )

        await vi.waitFor(() =>
            expect(screen.queryByText('Office')).not.toBeInTheDocument()
        )
        expect(screen.getByText('Living Room')).toBeInTheDocument()
    })

    it('names the Devices that keep a Room from being deleted', async () => {
        const user = userEvent.setup()
        await renderRooms(home())

        await screen.findByText('Living Room')
        const [livingDelete] = screen.getAllByRole('button', {
            name: 'Delete',
        })
        await user.click(livingDelete as HTMLElement)
        const dialog = await screen.findByRole('alertdialog', {
            name: 'Delete Living Room?',
        })
        await user.click(
            within(dialog).getByRole('button', { name: 'Delete room' })
        )

        expect(
            await screen.findByText('Move Reading Lamp to another room first.')
        ).toBeInTheDocument()
    })

    it('asks for a Home connection when only the Relay reaches the Controller', async () => {
        await renderRooms(home({ lanReachable: false }))

        expect(
            await screen.findByText('Home connection required')
        ).toBeInTheDocument()
        expect(screen.queryByText('Living Room')).not.toBeInTheDocument()
    })
})
