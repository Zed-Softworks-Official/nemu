import { ControllerProvider } from '@nemu/controller'
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

async function renderDevicesTab(
    controller: FakeController,
    { camera = true }: { camera?: boolean } = {}
) {
    const Scanner = camera ? FakeScanner : undefined
    const credentialStore = createMemoryCredentialStore()
    credentialStore.set(controller.controllerId, { clientToken: 'token' })
    await render(
        <ControllerProvider
            connectors={fakeControllerConnectors(controller)}
            controllerId={controller.controllerId}
            credentialStore={credentialStore}
            lanCandidates={[controller.baseUrl]}
        >
            <HomeControlProvider>
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

describe('Adding a Device over Relay', () => {
    it('is not offered and says the phone must be on the Home network', async () => {
        const controller = home(false)
        await renderDevicesTab(controller)
        await screen.findByText('Away from home')
        await screen.findByText('Desk Plug')

        expect(
            screen.queryByRole('button', { name: 'Add a Device' })
        ).toBeNull()
        expect(
            screen.getByText(/needs this phone on the Home network/)
        ).toBeTruthy()
        expect(controller.commissioningRequests).toEqual([])
    })
})
