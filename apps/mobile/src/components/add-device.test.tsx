import { ControllerProvider, useController } from '@nemu/controller'
import {
    createMemoryCredentialStore,
    FakeController,
    fakeControllerConnectors,
} from '@nemu/controller/testing'
import type { Device, SessionRole } from '@nemu/protocol'
import { Slot } from 'expo-router'
import {
    act,
    fireEvent,
    renderRouter,
    screen,
    waitFor,
} from 'expo-router/testing-library'
import { useEffect, useState } from 'react'

import {
    AddDeviceSheet,
    type CodeScanner,
    DevicesTab,
} from '~/components/add-device'
import { Button } from '~/components/ui/button'
import { Text } from '~/components/ui/text'

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

// The route passes the camera; the stand-in below replaces it.
jest.mock('~/components/camera-code-scanner', () => ({
    CameraCodeScanner: (props: { onCode: (data: string) => void }) => (
        <FakeScanner {...props} />
    ),
}))

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

function home(lanReachable: boolean, role: SessionRole = 'member') {
    return new FakeController({
        controllerId: 'lake',
        acceptedTokens: ['token'],
        lanReachable,
        role,
        devices: [structuredClone(PLUG)],
        rooms: [
            { id: 'living', name: 'Living Room', sortOrder: 1 },
            { id: 'bedroom', name: 'Bedroom', sortOrder: 2 },
        ],
    })
}

/** Lets a test re-check the connection, as the app does after a blip. */
let reprobe: () => Promise<void>

function Connection() {
    const controller = useController()
    const { getSession, status } = controller
    const [role, setRole] = useState<SessionRole | null>(null)
    useEffect(() => {
        reprobe = controller.reprobe
    }, [controller])
    useEffect(() => {
        if (status.mode !== 'lan' && status.mode !== 'relay') return
        void getSession().then(
            (session) => setRole(session.role),
            () => setRole(null)
        )
    }, [getSession, status.mode])
    return (
        <>
            <Text>{`Connected over ${status.mode}`}</Text>
            <Text>{`Session role: ${role}`}</Text>
        </>
    )
}

/**
 * The signed-in route tree with its real layouts and the real add-Device
 * sheet route. Only the tab roots are stand-ins, without the header.
 */
async function renderDevicesTab(
    controller: FakeController,
    {
        camera = true,
        discoverGate,
        initialUrl = '/devices',
    }: {
        camera?: boolean
        discoverGate?: () => Promise<void>
        initialUrl?: string
    } = {}
) {
    const credentialStore = createMemoryCredentialStore()
    credentialStore.set(controller.controllerId, { clientToken: 'token' })
    const connectors = fakeControllerConnectors(controller)
    const discover = connectors.discover
    return renderRouter(
        {
            _layout: () => (
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
                    <Connection />
                    <Slot />
                </ControllerProvider>
            ),
            '(app)/_layout': require('../app/(app)/_layout'),
            '(app)/(tabs)/_layout': require('../app/(app)/(tabs)/_layout'),
            '(app)/(tabs)/(home,devices,energy)/_layout': require('../app/(app)/(tabs)/(home,devices,energy)/_layout'),
            '(app)/(tabs)/(home)/index': () => null,
            '(app)/(tabs)/(devices)/devices': () => <DevicesTab />,
            '(app)/(tabs)/(energy)/energy': () => null,
            '(app)/(tabs)/(home,devices,energy)/add-device': camera
                ? require('../app/(app)/(tabs)/(home,devices,energy)/add-device')
                : () => <AddDeviceSheet onClose={() => {}} />,
        },
        { initialUrl }
    )
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

        await act(async () =>
            controller.joinDevice(structuredClone(MATTER_BULB))
        )
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

        await act(async () =>
            controller.joinDevice(structuredClone(ZIGBEE_SENSOR))
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
        await screen.findByText('At home')
        await press('Add a Device')
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
        await act(async () => {
            void reprobe()
        })
        await screen.findByText(/Reconnecting to your Home/)
        expect(
            screen.getByRole('header', { name: 'Add a Device' })
        ).toBeTruthy()
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
        await act(() => reprobe())

        await screen.findByText('Connected over relay')
        expect(controller.matterCommissioning).not.toBeNull()
        expect(controller.commissioningRequests).not.toContainEqual(
            expect.objectContaining({ type: 'cancelMatterCommission' })
        )
        await screen.findByRole('button', { name: 'Cancel' })
    })

    it('shows each commissioning step over LAN, and none over Relay until NEM-63', async () => {
        const controller = home(true)
        await renderDevicesTab(controller)
        await commissioningMatter(controller)
        await act(async () =>
            controller.commissioningStep({
                status: 'active',
                step: 'discovering',
            })
        )
        await screen.findByText('Looking for your Device')

        await act(async () =>
            controller.commissioningStep({
                status: 'active',
                step: 'connecting',
            })
        )
        await screen.findByText('Connecting securely')
        expect(screen.getByLabelText('Commissioning steps')).toBeTruthy()
        expect(screen.getByText('✓ Looking for your Device')).toBeTruthy()
        expect(screen.getByText('○ Joining your Home')).toBeTruthy()

        // Progress goes over the LAN WebSocket only (Relay pushes come back
        // encrypted in NEM-63), so a step reached over Relay never shows.
        controller.lanReachable = false
        await act(() => reprobe())
        await screen.findByText('Connected over relay')
        await act(async () =>
            controller.commissioningStep({
                status: 'active',
                step: 'configuring_network',
            })
        )
        expect(screen.queryByText('Sending your Wi‑Fi details')).toBeNull()
        expect(screen.getByText('Connecting securely')).toBeTruthy()
    })

    it('names the step that failed, with guidance, over LAN', async () => {
        const controller = home(true)
        await renderDevicesTab(controller)
        await commissioningMatter(controller)

        await act(async () => {
            controller.commissioningStep({
                status: 'failed',
                step: 'configuring_network',
                reason: 'network_rejected',
            })
            // The older failed interview follows; it changes nothing.
            controller.emit({
                type: 'interview',
                externalId: 'commissioning',
                status: 'failed',
                error: 'Put the device back in pairing mode and try again.',
            })
        })

        await screen.findByText('The Device wasn’t added')
        expect(
            screen.getByText('The Device couldn’t get on your Wi‑Fi.')
        ).toBeTruthy()
        expect(
            screen.getByText(
                'Check your Wi‑Fi name and password, and use a 2.4 GHz network, not 5 GHz.'
            )
        ).toBeTruthy()
        expect(
            screen.queryByText(
                'Put the device back in pairing mode and try again.'
            )
        ).toBeNull()
    })

    it.each([
        ['LAN', true],
        ['Relay', false],
    ])('stays open but disables everything while the Home is unreachable, then carries on over %s', async (_label, lanReachable) => {
        const controller = home(true)
        const rendered = await renderDevicesTab(controller)
        await commissioningMatter(controller)
        const before = [...controller.commissioningRequests]

        controller.goOffline()
        await act(() => reprobe())

        await screen.findByText('Showing the last known state')
        expect(rendered.getSegments()).toContain('add-device')
        expect(isDisabled('Cancel')).toBe(true)
        await press('Cancel')

        controller.lanReachable = lanReachable
        controller.relayReachable = true
        await act(() => reprobe())
        await waitFor(() =>
            expect(
                screen.queryByText('Showing the last known state')
            ).toBeNull()
        )
        // Nothing was queued, and commissioning was never stopped.
        expect(controller.commissioningRequests).toEqual(before)
        expect(controller.matterCommissioning).not.toBeNull()

        // The Device joined meanwhile; the sheet picks it up.
        controller.devices = [
            ...controller.devices,
            structuredClone(MATTER_BULB),
        ]
        await screen.findByLabelText('Device name', {}, { timeout: 4_000 })
        controller.goOffline()
        await act(() => reprobe())
        await screen.findByText('Showing the last known state')
        expect(screen.getByLabelText('Device name').props.editable).toBe(false)
        for (const name of ['Bedroom', 'Finish']) {
            expect(isDisabled(name)).toBe(true)
        }
    })

    it('sends no pairing code once the phone moves to Relay mid-flow', async () => {
        const controller = home(true)
        await renderDevicesTab(controller)
        await startAdding()
        await press('Matter')
        await press('Enter the code instead')
        await fireEvent.changeText(
            screen.getByLabelText('Pairing code'),
            '34970112332'
        )

        controller.lanReachable = false
        await act(() => reprobe())
        await screen.findByText(/only be added on your Home network/)
        expect(screen.queryByLabelText('Pairing code')).toBeNull()
        expect(
            screen.queryByRole('button', { name: 'Scan with the camera' })
        ).toBeNull()

        await press('Back')
        expect(isDisabled('Matter')).toBe(true)
        expect(controller.matterCommissioning).toBeNull()
        expect(controller.commissioningRequests).not.toContainEqual(
            expect.objectContaining({ type: 'commissionMatter' })
        )
    })

    it('starts nothing when reading the Devices drops the Home network', async () => {
        const controller = home(true)
        await renderDevicesTab(controller)
        await startAdding()
        await press('Matter')
        await press('Enter the code instead')
        await fireEvent.changeText(
            screen.getByLabelText('Pairing code'),
            '34970112332'
        )

        // The connection has not noticed yet.
        controller.lanReachable = false
        await press('Add Device')

        await screen.findByText('The Device wasn’t added')
        await screen.findByText('Connected over relay')
        expect(controller.matterCommissioning).toBeNull()
        expect(controller.commissioningRequests).not.toContainEqual(
            expect.objectContaining({ type: 'commissionMatter' })
        )
    })

    it('starts nothing from a code entered or scanned while unreachable', async () => {
        const controller = home(true)
        await renderDevicesTab(controller)
        await startAdding()
        await press('Matter')
        controller.goOffline()
        await act(() => reprobe())
        await screen.findByText('Showing the last known state')

        scans.push('MT:Y.K9042C00KA0648G00')
        await press('Scan with the camera')
        expect(isDisabled('Enter the code instead')).toBe(true)

        controller.lanReachable = true
        await act(() => reprobe())
        await waitFor(() =>
            expect(isDisabled('Enter the code instead')).toBe(false)
        )
        await press('Enter the code instead')
        await fireEvent.changeText(
            screen.getByLabelText('Pairing code'),
            '34970112332'
        )
        controller.goOffline()
        await act(() => reprobe())
        await screen.findByText('Showing the last known state')
        expect(screen.getByLabelText('Pairing code').props).toMatchObject({
            editable: false,
            value: '34970112332',
        })
        expect(isDisabled('Add Device')).toBe(true)
        await press('Add Device')

        controller.lanReachable = true
        await act(() => reprobe())
        await waitFor(() => expect(isDisabled('Add Device')).toBe(false))
        expect(controller.commissioningRequests).toEqual([])
    })
})

describe('The add-Device sheet', () => {
    it('opens above the Devices tab and hands it back when closed', async () => {
        const rendered = await renderDevicesTab(home(true))
        await startAdding()

        expect(rendered.getSegments()).toEqual([
            '(app)',
            '(tabs)',
            '(devices)',
            'add-device',
        ])
        expect(
            screen.getByRole('header', { name: 'Add a Device' })
        ).toBeTruthy()
        expect(screen.getByText('Desk Plug', behind)).toBeTruthy()
        // A native sheet over the tab Stack, not a replacement screen.
        expect(
            screen.container.queryAll(
                (node) => node.props.stackPresentation === 'formSheet'
            )
        ).toHaveLength(1)

        await press('Done')

        expect(rendered.getSegments()).toEqual([
            '(app)',
            '(tabs)',
            '(devices)',
            'devices',
        ])
        expect(button('Add a Device')).toBeTruthy()
    })

    it('stops commissioning on the Controller when closed', async () => {
        const controller = home(true)
        await renderDevicesTab(controller)
        await startAdding()
        await press('Zigbee')
        await press('Start searching')
        await waitFor(() => expect(controller.zigbeeJoinOpenFor).toBe(180))

        await press('Done')

        await waitFor(() => expect(controller.zigbeeJoinOpenFor).toBe(0))
    })

    it('opens disabled from a deep link while the Home is unreachable', async () => {
        const controller = home(false)
        controller.goOffline()
        await renderDevicesTab(controller, { initialUrl: '/add-device' })

        await screen.findByText('Showing the last known state')
        for (const name of ['Matter', 'Zigbee']) {
            expect(isDisabled(name)).toBe(true)
        }
        expect(controller.commissioningRequests).toEqual([])
    })
})

describe('Adding a Device over Relay', () => {
    async function startAddingAway() {
        await screen.findByText('Away from home')
        await press('Add a Device')
    }

    describe.each([
        ['a Member', 'member'],
        ['an Owner', 'owner'],
    ] as const)('as %s', (_label, role) => {
        it('is told Matter needs the Home network', async () => {
            const controller = home(false, role)
            await renderDevicesTab(controller)
            await screen.findByText(`Session role: ${role}`)
            await startAddingAway()

            await screen.findByText(/only be added on your Home network/)
            expect(isDisabled('Matter')).toBe(true)
            await press('Matter')
            expect(screen.queryByLabelText('Pairing code')).toBeNull()
            expect(controller.commissioningRequests).toEqual([])
            expect(controller.relayCommissioningAudit).toEqual([])
        })

        it('may add a Zigbee Device through permit-join', async () => {
            const controller = home(false, role)
            await renderDevicesTab(controller)
            await screen.findByText(`Session role: ${role}`)
            await startAddingAway()
            await press('Zigbee')
            await press('Start searching')

            await waitFor(() => expect(controller.zigbeeJoinOpenFor).toBe(180))
            expect(controller.relayCommissioningAudit).toEqual([
                { protocol: 'zigbee' },
            ])
            await screen.findByText(/Searching/)

            // Over Relay no join event arrives; the Device list shows it.
            controller.devices = [
                ...controller.devices,
                structuredClone(ZIGBEE_SENSOR),
            ]
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
            expect(
                controller.devices.find((d) => d.id === 'sensor')
            ).toMatchObject({ name: 'Hall Sensor', roomId: 'living' })
        })
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
