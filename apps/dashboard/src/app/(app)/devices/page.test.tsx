import { FakeController } from '@nemu/controller/testing'
import type { Device } from '@nemu/protocol'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import {
    DASHBOARD_TOKEN,
    renderWithController,
} from '~/test/render-with-controller'
import DevicesPage from './page'

vi.mock('@clerk/nextjs/server', () => ({
    auth: { protect: async () => ({}) },
}))

const LAMP: Device = {
    id: 'lamp',
    name: 'Reading Lamp',
    type: 'light',
    protocol: 'zigbee',
    externalId: 'lamp-ext',
    model: 'Hue White',
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
    online: false,
    state: { state: 'OFF' },
}

function home(options?: {
    devices?: Device[]
    lanReachable?: boolean
    relayReachable?: boolean
}) {
    return new FakeController({
        controllerId: 'lake',
        acceptedTokens: [DASHBOARD_TOKEN],
        lanReachable: options?.lanReachable ?? true,
        relayReachable: options?.relayReachable ?? true,
        devices: options?.devices ?? [LAMP, PLUG],
    })
}

async function renderDevices(controller: FakeController) {
    renderWithController(await DevicesPage(), controller)
}

describe('Devices page', () => {
    it.each([
        ['LAN', true],
        ['Relay', false],
    ] as const)('lists the Home’s Devices over %s', async (_via, lanReachable) => {
        await renderDevices(home({ lanReachable }))

        expect(
            screen.getByRole('heading', { name: 'Devices' })
        ).toBeInTheDocument()
        expect(await screen.findByText('Reading Lamp')).toBeInTheDocument()
        expect(screen.getByText('Desk Plug')).toBeInTheDocument()
        expect(screen.getByText('Hue White')).toBeInTheDocument()
        expect(
            screen.getByRole('link', { name: 'Open Reading Lamp' })
        ).toHaveAttribute('href', '/devices/lamp')
    })

    it('narrows the list to Devices matching the search', async () => {
        const user = userEvent.setup()
        await renderDevices(home())

        await screen.findByText('Reading Lamp')
        await user.type(
            screen.getByRole('textbox', { name: 'Search devices' }),
            'lamp'
        )

        await vi.waitFor(() =>
            expect(screen.queryByText('Desk Plug')).not.toBeInTheDocument()
        )
        expect(screen.getByText('Reading Lamp')).toBeInTheDocument()
    })

    it('says when no Device matches the search', async () => {
        const user = userEvent.setup()
        await renderDevices(home())

        await screen.findByText('Reading Lamp')
        await user.type(
            screen.getByRole('textbox', { name: 'Search devices' }),
            'thermostat'
        )

        expect(
            await screen.findByText('No matching devices')
        ).toBeInTheDocument()
    })

    it('says when the Home has no Devices yet', async () => {
        await renderDevices(home({ devices: [] }))

        expect(await screen.findByText('No devices yet')).toBeInTheDocument()
    })

    it('says when the Controller cannot be reached', async () => {
        await renderDevices(
            home({ lanReachable: false, relayReachable: false })
        )

        expect(
            await screen.findByText('Controller offline')
        ).toBeInTheDocument()
        expect(screen.queryByText('Reading Lamp')).not.toBeInTheDocument()
    })
})
