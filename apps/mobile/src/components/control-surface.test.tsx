import {
    type ControllerConnectors,
    ControllerProvider,
    useController,
} from '@nemu/controller'
import {
    createMemoryCredentialStore,
    FakeController,
    fakeControllerConnectors,
} from '@nemu/controller/testing'
import type { CapabilityCurrentState, Device } from '@nemu/protocol'
import {
    act,
    render,
    screen,
    waitFor,
    within,
} from '@testing-library/react-native'
import { useEffect } from 'react'

import { DevicesView, RoomsView } from '~/components/control-surface'
import { HomeControlProvider } from '~/components/home-control'

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
    online: false,
    state: { state: 'OFF' },
}

function capability(
    overrides: Omit<Partial<CapabilityCurrentState>, 'capabilityId'> & {
        capabilityId: string
    }
): CapabilityCurrentState {
    return {
        device: { protocol: 'zigbee', externalId: 'lamp-ext' },
        physicalScope: { kind: 'device' },
        kind: 'power',
        value: { value: 125, scale: 1 },
        availability: { status: 'available' },
        revision: 1,
        ...overrides,
    } as unknown as CapabilityCurrentState
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
    view: React.ReactNode = <RoomsView />,
    connectors: ControllerConnectors = fakeControllerConnectors(controller)
) {
    const credentialStore = createMemoryCredentialStore()
    credentialStore.set(controller.controllerId, { clientToken: 'token' })
    await render(
        <ControllerProvider
            connectors={connectors}
            controllerId={controller.controllerId}
            credentialStore={credentialStore}
            lanCandidates={[controller.baseUrl]}
        >
            <CaptureReprobe />
            <HomeControlProvider>{view}</HomeControlProvider>
        </ControllerProvider>
    )
}

function home(options?: { lanReachable?: boolean; relayReachable?: boolean }) {
    return new FakeController({
        controllerId: 'lake',
        acceptedTokens: ['token'],
        devices: [LAMP, PLUG],
        rooms: [
            { id: 'bedroom', name: 'Bedroom', sortOrder: 2 },
            { id: 'living', name: 'Living Room', sortOrder: 1 },
        ],
        ...options,
    })
}

async function emitCapabilities(
    controller: FakeController,
    capabilities: CapabilityCurrentState[]
) {
    await act(async () => {
        controller.emit({
            type: 'capabilitySnapshot',
            epoch: 'epoch-1',
            revision: 1,
            capabilities,
        } as never)
    })
}

describe('browsing Rooms and Devices', () => {
    it('lists Devices in their Rooms, ordered like the Home', async () => {
        await renderSurface(home())
        await screen.findByText('Reading Lamp')
        await screen.findByText('Living Room')

        const headers = screen
            .getAllByRole('header')
            .map((header) => header.props.children)
        expect(headers).toEqual(['Living Room', 'Bedroom', 'Not in a Room'])
        expect(screen.getByText('No Devices in this Room.')).toBeTruthy()
        expect(screen.getByText('Desk Plug')).toBeTruthy()
    })

    it('shows every Device on the Devices tab', async () => {
        await renderSurface(home(), <DevicesView />)
        await screen.findByText('Reading Lamp')
        expect(screen.getByText('Desk Plug')).toBeTruthy()
        expect(screen.queryByRole('header')).toBeNull()
    })

    it('shows reported state, and a Device that is offline', async () => {
        await renderSurface(home())
        const lamp = await screen.findByLabelText('Reading Lamp')
        expect(within(lamp).getByText('Online')).toBeTruthy()
        expect(within(lamp).getByText('50%')).toBeTruthy()
        expect(
            within(screen.getByLabelText('Desk Plug')).getByText(
                'Device offline'
            )
        ).toBeTruthy()
    })

    it('updates when the Device reports new state', async () => {
        const controller = home()
        await renderSurface(controller)
        await screen.findByText('50%')

        await act(async () => {
            controller.setDevices([
                { ...LAMP, state: { state: 'ON', brightness: 254 } },
                PLUG,
            ])
        })
        await screen.findByText('100%')
    })

    it('marks one unavailable Capability without hiding the others', async () => {
        const controller = home()
        await renderSurface(controller)
        await screen.findByText('Reading Lamp')

        await emitCapabilities(controller, [
            capability({ capabilityId: 'lamp-power' }),
            capability({
                capabilityId: 'lamp-voltage',
                kind: 'voltage',
                value: undefined,
                availability: {
                    status: 'unavailable',
                    reason: 'freshnessExpired',
                    since: '2026-11-01T00:00:00Z',
                },
            } as never),
        ])

        const lamp = screen.getByLabelText('Reading Lamp')
        expect(within(lamp).getByText('12.5 W')).toBeTruthy()
        expect(within(lamp).getByText('Unavailable')).toBeTruthy()
        expect(within(lamp).getByText('50%')).toBeTruthy()
    })
})

describe('connection status', () => {
    it('says when it is on the Home network', async () => {
        await renderSurface(home())
        await screen.findByText('At home')
    })

    it('says when it fell back to Relay', async () => {
        await renderSurface(home({ lanReachable: false }))
        await screen.findByText('Away from home')
        await screen.findByText('Reading Lamp')
    })

    it('says when it is still connecting', async () => {
        const controller = home()
        const connectors = fakeControllerConnectors(controller)
        let finishDiscovery = () => {}
        const discovering = new Promise<void>((resolve) => {
            finishDiscovery = resolve
        })
        await renderSurface(controller, <RoomsView />, {
            ...connectors,
            discover: async (candidates, remembered) => {
                await discovering
                return connectors.discover(candidates, remembered)
            },
        })
        await screen.findByText('Connecting…')

        await act(async () => finishDiscovery())
        await screen.findByText('At home')
    })

    it('says when neither path works, with nothing to show', async () => {
        await renderSurface(
            home({ lanReachable: false, relayReachable: false })
        )
        await screen.findByText('Can’t reach the Controller')
        expect(screen.getByText(/Nothing is saved to send later/)).toBeTruthy()
        expect(screen.queryByText(/last state/)).toBeNull()
    })
})

describe('offline with state already seen', () => {
    async function goOffline(controller: FakeController) {
        controller.goOffline()
        await act(() => reprobe())
        await screen.findByText('Can’t reach the Controller')
    }

    it('keeps Devices but marks them stale', async () => {
        const controller = home()
        await renderSurface(controller)
        await screen.findByText('Reading Lamp')

        await goOffline(controller)

        expect(screen.getByText(/last state this phone saw/)).toBeTruthy()
        const lamp = screen.getByLabelText('Reading Lamp')
        expect(within(lamp).getByText('Last known')).toBeTruthy()
        expect(within(lamp).queryByText('Online')).toBeNull()
        expect(within(lamp).getByText('50%')).toBeTruthy()
    })

    it('keeps Capability readings, labelled as last known', async () => {
        const controller = home()
        await renderSurface(controller)
        await screen.findByText('Reading Lamp')
        await emitCapabilities(controller, [
            capability({ capabilityId: 'lamp-power' }),
        ])
        await screen.findByText('12.5 W')

        await goOffline(controller)

        await screen.findByText('12.5 W (last known)')
    })

    it('becomes current again when the Controller returns', async () => {
        const controller = home()
        await renderSurface(controller)
        await screen.findByText('Reading Lamp')
        await goOffline(controller)

        controller.lanReachable = true
        await act(() => reprobe())

        await screen.findByText('At home')
        await waitFor(() => expect(screen.queryByText('Last known')).toBeNull())
    })
})
