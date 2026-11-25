import { ControllerProvider } from '@nemu/controller'
import {
    createMemoryCredentialStore,
    FakeController,
    fakeControllerConnectors,
} from '@nemu/controller/testing'
import type { Device, DeviceState } from '@nemu/protocol'
import {
    act,
    fireEvent,
    render,
    screen,
    waitFor,
} from '@testing-library/react-native'

import { DevicesView } from '~/components/control-surface'
import { DeviceSheet } from '~/components/device-sheet'
import { HomeControlProvider } from '~/components/home-control'

// The list's cards open the sheet; nothing here navigates.
jest.mock('expo-router', () => ({
    useRouter: () => ({ push: jest.fn() }),
    useSegments: () => [],
}))

const NOT_REPORTED = /hasn’t reported its state/
const NOTHING_TO_SHOW = /reports nothing this app can show/

describe.each([
    ['LAN', true],
    ['Relay', false],
] as const)('Device state in the sheet over %s', (_label, lanReachable) => {
    function home(type: string, state: DeviceState | undefined) {
        const device: Device = {
            id: 'device',
            name: 'Thing',
            type,
            protocol: 'zigbee',
            externalId: '0x1',
            roomId: null,
            online: true,
            state,
        }
        return new FakeController({
            controllerId: 'lake',
            acceptedTokens: ['token'],
            devices: [device],
            lanReachable,
        })
    }

    async function show(
        controller: FakeController,
        content = <DeviceSheet deviceId="device" onClose={() => {}} />
    ) {
        const credentialStore = createMemoryCredentialStore()
        credentialStore.set('lake', { clientToken: 'token' })
        await render(
            <ControllerProvider
                connectors={fakeControllerConnectors(controller)}
                controllerId="lake"
                credentialStore={credentialStore}
                lanCandidates={[controller.baseUrl]}
            >
                <HomeControlProvider>{content}</HomeControlProvider>
            </ControllerProvider>
        )
    }

    it.each<[string, DeviceState, string[]]>([
        [
            'sensor',
            { temperature: 21.4, humidity: 48, battery: 91, linkquality: 100 },
            ['Temperature', '21.4 °C', '48%', '91%'],
        ],
        ['contact', { contact: false }, ['Contact', 'Open']],
        ['occupancy', { occupancy: true }, ['Motion', 'Detected']],
        [
            'lock',
            { state: 'LOCK', lock_state: 'not_fully_locked' },
            ['Lock', 'Not fully locked'],
        ],
        ['cover', { state: 'OPEN', position: 60 }, ['Open', '60%']],
    ])('shows what a %s reports', async (type, state, texts) => {
        await show(home(type, state))
        await screen.findByLabelText('Device name')
        for (const text of texts) {
            expect(screen.getAllByText(text).length).toBeGreaterThan(0)
        }
        expect(screen.queryByText(/100/)).toBeNull()
        expect(screen.queryByText(NOT_REPORTED)).toBeNull()
        expect(screen.queryByText(NOTHING_TO_SHOW)).toBeNull()
    })

    it('controls each gang of a switch by its own endpoint', async () => {
        const controller = home('switch', {
            state_left: 'ON',
            state_right: 'OFF',
        })
        await show(controller)
        const right = await screen.findByLabelText('Thing Right')
        expect(screen.getByLabelText('Thing Left').props.value).toBe(true)

        await act(async () => {
            fireEvent(right, 'valueChange', true)
        })

        await waitFor(() =>
            expect(controller.commands[0]?.command.payload).toEqual({
                state_right: 'ON',
            })
        )
    })

    it.each([
        ['has not reported', undefined, NOT_REPORTED],
        ['reported an empty state', {}, NOT_REPORTED],
        ['reports only unknown fields', { linkquality: 9 }, NOTHING_TO_SHOW],
    ])('says so when the Device %s', async (_case, state, message) => {
        await show(home('switch', state))
        expect(await screen.findByText(message)).toBeTruthy()
    })

    it('shows the error instead of loading forever, and recovers', async () => {
        const controller = home('switch', { state: 'ON' })
        controller.devicesAvailable = false
        await show(controller)

        await screen.findByText('Devices couldn’t be loaded')
        expect(screen.getByText('Relay command timed out')).toBeTruthy()

        controller.devicesAvailable = true
        await act(async () => {
            fireEvent.press(screen.getByRole('button', { name: 'Try again' }))
        })
        await screen.findByLabelText('Thing Power')
        expect(screen.queryByText('Devices couldn’t be loaded')).toBeNull()
    })

    it('keeps the last values and says a refresh failed', async () => {
        const controller = home('switch', { state: 'ON' })
        await show(
            controller,
            <>
                <DeviceSheet deviceId="device" onClose={() => {}} />
                <DevicesView />
            </>
        )
        await screen.findByLabelText('Device name')
        controller.devicesAvailable = false
        await act(async () => controller.setDevices(controller.devices))

        // In the sheet and in the list behind it.
        await waitFor(
            () =>
                expect(
                    screen.getAllByText('Devices couldn’t be refreshed')
                ).toHaveLength(2),
            { timeout: 8_000 }
        )
        expect(screen.getAllByLabelText('Thing Power')).toHaveLength(2)
    }, 12_000)
})
