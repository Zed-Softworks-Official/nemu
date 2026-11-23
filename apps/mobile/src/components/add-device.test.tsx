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
} from '@testing-library/react-native'

import { type CodeScanner, DevicesTab } from '~/components/add-device'
import { HomeControlProvider } from '~/components/home-control'
import { Button } from '~/components/ui/button'
import { Text } from '~/components/ui/text'

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
const MATTER_BULB: Device = {
    id: 'bulb',
    name: 'Matter Bulb',
    type: 'light',
    protocol: 'matter',
    externalId: 'matter-1',
    roomId: null,
    online: true,
    state: { state: 'OFF' },
}
const ZIGBEE_SENSOR: Device = {
    id: 'sensor',
    name: '0x00158d0001',
    type: 'sensor',
    protocol: 'zigbee',
    externalId: '0x00158d0001',
    roomId: null,
    online: true,
    state: {},
}

/** Stands in for the camera: each press "scans" the next queued code. */
const scans: string[] = []
const FakeScanner: CodeScanner = ({ onCode }) => (
    <Button
        onPress={() => onCode(scans.shift() ?? '')}
        title="Scan with the camera"
    />
)

function home(lanReachable: boolean) {
    return new FakeController({
        controllerId: 'lake',
        acceptedTokens: ['token'],
        lanReachable,
        devices: [structuredClone(PLUG)],
        rooms: [
            { id: 'living', name: 'Living Room', sortOrder: 1 },
            { id: 'bedroom', name: 'Bedroom', sortOrder: 2 },
        ],
    })
}

/** Lets a test re-check the connection, as the app does after a blip. */
function Reprobe() {
    const { reprobe, status } = useController()
    return (
        <>
            <Button
                onPress={() => void reprobe()}
                title="Re-check connection"
            />
            <Text>{`Connected over ${status.mode}`}</Text>
        </>
    )
}

async function renderDevicesTab(
    controller: FakeController,
    {
        camera = true,
        discoverGate,
    }: { camera?: boolean; discoverGate?: () => Promise<void> } = {}
) {
    const Scanner = camera ? FakeScanner : undefined
    const credentialStore = createMemoryCredentialStore()
    credentialStore.set(controller.controllerId, { clientToken: 'token' })
    const connectors = fakeControllerConnectors(controller)
    const discover = connectors.discover
    await render(
        <ControllerProvider
            connectors={{
                ...connectors,
                discover: async (...args) => {
                    await discoverGate?.()
                    return discover ? discover(...args) : null
                },
            }}
            controllerId={controller.controllerId}
            credentialStore={credentialStore}
            lanCandidates={[controller.baseUrl]}
        >
            <HomeControlProvider>
                <Reprobe />
                <DevicesTab Scanner={Scanner} />
            </HomeControlProvider>
        </ControllerProvider>
    )
}

const button = (name: string | RegExp) => screen.getByRole('button', { name })
const press = (name: string | RegExp) => fireEvent.press(button(name))

async function startAdding() {
    await screen.findByText('At home')
    await press('Add a Device')
}

afterEach(() => {
    scans.length = 0
})

describe('Adding a Device on the Home network', () => {
    it('commissions a Matter Device from a typed pairing code and names it', async () => {
        const controller = home(true)
        await renderDevicesTab(controller)
        await startAdding()
        await press('Matter')
        await press('Enter the code instead')

        await fireEvent.changeText(
            screen.getByLabelText('Pairing code'),
            '3497-011-2332'
        )
        await press('Add Device')

        await waitFor(() =>
            expect(controller.matterCommissioning).toEqual({
                code: '34970112332',
            })
        )
        await act(async () =>
            controller.commissionProgress('joining', 'Joining your Home')
        )
        await screen.findByText('Joining your Home')

        await act(async () => controller.joinDevice(MATTER_BULB))
        const name = await screen.findByLabelText('Device name')
        await fireEvent.changeText(name, 'Hall Light')
        await press('Bedroom')
        await press('Finish')

        await screen.findByText('Added Hall Light.')
        const bulb = controller.devices.find((d) => d.id === 'bulb')
        expect(bulb).toMatchObject({ name: 'Hall Light', roomId: 'bedroom' })
        expect(controller.commissioningRequests[0]).toEqual({
            type: 'commissionMatter',
            via: 'lan',
        })
        // Back on the Device list, which now has the new Device.
        await screen.findByText('Hall Light')
    })

    it('commissions a Matter Device from its QR code', async () => {
        const controller = home(true)
        await renderDevicesTab(controller)
        await startAdding()
        await press('Matter')

        scans.push('https://example.com/not-matter', 'MT:Y.K9042C00KA0648G00')
        await press('Scan with the camera')
        await screen.findByText(/isn’t a Matter code/)
        expect(controller.matterCommissioning).toBeNull()

        await press('Scan with the camera')
        await waitFor(() =>
            expect(controller.matterCommissioning).toEqual({
                code: 'MT:Y.K9042C00KA0648G00',
            })
        )
        await screen.findByRole('button', { name: 'Cancel' })
    })

    it('takes a typed code when the phone has no camera', async () => {
        const controller = home(true)
        await renderDevicesTab(controller, { camera: false })
        await startAdding()
        await press('Matter')

        expect(
            screen.queryByRole('button', { name: 'Scan with the camera' })
        ).toBeNull()
        await fireEvent.changeText(
            screen.getByLabelText('Pairing code'),
            '34970112331'
        )
        await screen.findByText(/check digit/)
        expect(
            button('Add Device').props.accessibilityState?.disabled
        ).toBeTruthy()

        await fireEvent.changeText(
            screen.getByLabelText('Pairing code'),
            '34970112332'
        )
        await press('Add Device')
        await waitFor(() =>
            expect(controller.matterCommissioning?.code).toBe('34970112332')
        )
    })

    it('cancels Matter commissioning on the Controller', async () => {
        const controller = home(true)
        await renderDevicesTab(controller)
        await startAdding()
        await press('Matter')
        scans.push('MT:Y.K9042C00KA0648G00')
        await press('Scan with the camera')
        await waitFor(() =>
            expect(controller.matterCommissioning).not.toBeNull()
        )

        await press('Cancel')

        await waitFor(() => expect(controller.matterCommissioning).toBeNull())
        expect(controller.commissioningRequests).toContainEqual({
            type: 'cancelMatterCommission',
            via: 'lan',
        })
        await screen.findByText('Cancelled. Nothing was added.')
    })

    it('adds a Zigbee Device through permit-join and names it', async () => {
        const controller = home(true)
        await renderDevicesTab(controller)
        await startAdding()
        await press('Zigbee')
        await press('Start searching')

        await waitFor(() => expect(controller.zigbeeJoinOpenFor).toBe(180))
        await screen.findByText(/Searching/)

        await act(async () => controller.joinDevice(ZIGBEE_SENSOR))
        await press('Set up 0x00158d0001')
        await fireEvent.changeText(
            await screen.findByLabelText('Device name'),
            'Hall Sensor'
        )
        await press('Living Room')
        await press('Finish')

        await screen.findByText('Added Hall Sensor.')
        expect(controller.devices.find((d) => d.id === 'sensor')).toMatchObject(
            { name: 'Hall Sensor', roomId: 'living' }
        )
    })

    it('closes permit-join on the Controller when cancelled', async () => {
        const controller = home(true)
        await renderDevicesTab(controller)
        await startAdding()
        await press('Zigbee')
        await press('Start searching')
        await waitFor(() => expect(controller.zigbeeJoinOpenFor).toBe(180))

        await press('Cancel')

        await waitFor(() => expect(controller.zigbeeJoinOpenFor).toBe(0))
        await screen.findByText('Cancelled. Nothing was added.')
    })
})

describe('Adding a Device while the connection changes', () => {
    async function commissioningMatter(controller: FakeController) {
        await startAdding()
        await press('Matter')
        scans.push('MT:Y.K9042C00KA0648G00')
        await press('Scan with the camera')
        await waitFor(() =>
            expect(controller.matterCommissioning).not.toBeNull()
        )
    }

    it('keeps commissioning through a brief re-check of the Home network', async () => {
        const controller = home(true)
        let release: () => void = () => {}
        let gated = false
        await renderDevicesTab(controller, {
            discoverGate: () =>
                gated
                    ? new Promise<void>((resolve) => {
                          release = resolve
                      })
                    : Promise.resolve(),
        })
        await commissioningMatter(controller)

        gated = true
        await press('Re-check connection')
        await screen.findByText(/Reconnecting to your Home/)
        expect(screen.getByText('Add a Device')).toBeTruthy()
        expect(controller.matterCommissioning).not.toBeNull()

        gated = false
        await act(async () => release())
        await waitFor(() =>
            expect(screen.queryByText(/Reconnecting to your Home/)).toBeNull()
        )
        expect(controller.matterCommissioning).not.toBeNull()
        expect(controller.commissioningRequests).not.toContainEqual(
            expect.objectContaining({ type: 'cancelMatterCommission' })
        )
    })

    it('keeps commissioning when the phone moves to Relay', async () => {
        const controller = home(true)
        await renderDevicesTab(controller)
        await commissioningMatter(controller)

        controller.lanReachable = false
        await press('Re-check connection')

        await screen.findByText('Connected over relay')
        expect(screen.queryByText(/Adding a Device stopped/)).toBeNull()
        expect(controller.matterCommissioning).not.toBeNull()
        expect(controller.commissioningRequests).not.toContainEqual(
            expect.objectContaining({ type: 'cancelMatterCommission' })
        )
        await screen.findByRole('button', { name: 'Cancel' })
    })

    it('stops adding once the phone loses the Home', async () => {
        const controller = home(true)
        await renderDevicesTab(controller)
        await commissioningMatter(controller)

        controller.goOffline()
        await press('Re-check connection')

        await screen.findByText(/Adding a Device stopped/)
        expect(
            screen.queryByRole('button', { name: 'Add a Device' })
        ).toBeNull()
    })
})

describe('Adding a Device over Relay', () => {
    async function startAddingAway() {
        await screen.findByText('Away from home')
        await press('Add a Device')
    }

    it('lets a Member commission a Matter Device from a typed code', async () => {
        const controller = home(false)
        await renderDevicesTab(controller)
        await startAddingAway()
        await press('Matter')
        await press('Enter the code instead')

        await fireEvent.changeText(
            screen.getByLabelText('Pairing code'),
            '3497-011-2332'
        )
        await press('Add Device')

        await waitFor(() =>
            expect(controller.matterCommissioning).toEqual({
                code: '34970112332',
            })
        )
        expect(controller.commissioningRequests).toContainEqual({
            type: 'commissionMatter',
            via: 'relay',
        })
        expect(controller.relayCommissioningAudit).toEqual([
            { protocol: 'matter' },
        ])

        // Over Relay the new Device is found from the Device list.
        controller.devices = [...controller.devices, MATTER_BULB]
        const name = await screen.findByLabelText(
            'Device name',
            {},
            { timeout: 4_000 }
        )
        await fireEvent.changeText(name, 'Hall Light')
        await press('Bedroom')
        await press('Finish')

        await screen.findByText('Added Hall Light.')
        expect(controller.devices.find((d) => d.id === 'bulb')).toMatchObject({
            name: 'Hall Light',
            roomId: 'bedroom',
        })
    })

    it('lets a Member add a Zigbee Device through permit-join', async () => {
        const controller = home(false)
        await renderDevicesTab(controller)
        await startAddingAway()
        await press('Zigbee')
        await press('Start searching')

        await waitFor(() => expect(controller.zigbeeJoinOpenFor).toBe(180))
        expect(controller.relayCommissioningAudit).toEqual([
            { protocol: 'zigbee' },
        ])
        await screen.findByText(/Searching/)

        // Over Relay no join event arrives; the Device list shows it.
        controller.devices = [...controller.devices, ZIGBEE_SENSOR]
        await screen.findByRole(
            'button',
            { name: 'Set up 0x00158d0001' },
            { timeout: 4_000 }
        )
        await press('Set up 0x00158d0001')
        await fireEvent.changeText(
            await screen.findByLabelText('Device name'),
            'Hall Sensor'
        )
        await press('Living Room')
        await press('Finish')

        await screen.findByText('Added Hall Sensor.')
        expect(controller.devices.find((d) => d.id === 'sensor')).toMatchObject(
            { name: 'Hall Sensor', roomId: 'living' }
        )
    })

    it('is refused for an inactive Membership', async () => {
        const controller = home(false)
        controller.membershipActive = false
        await renderDevicesTab(controller)
        await startAddingAway()
        await press('Zigbee')
        await press('Start searching')

        await screen.findByText(/not active/)
        expect(controller.zigbeeJoinOpenFor).toBe(0)
        expect(controller.relayCommissioningAudit).toEqual([])
    })

    it('is not offered while the Home cannot be reached', async () => {
        const controller = home(false)
        controller.goOffline()
        await renderDevicesTab(controller)
        await screen.findByText('Connected over offline')

        expect(
            screen.queryByRole('button', { name: 'Add a Device' })
        ).toBeNull()
        expect(controller.commissioningRequests).toEqual([])
    })
})
