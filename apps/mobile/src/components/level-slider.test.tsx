import { ControllerProvider, useController } from '@nemu/controller'
import {
    FakeController,
    fakeAccessClientKeyStore,
    fakeControllerConnectors,
} from '@nemu/controller/testing'
import { ApiError, type CommandResult, type Device } from '@nemu/protocol'
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import { useEffect } from 'react'

import { DeviceSheet } from '~/components/device-sheet'
import { HomeControlProvider } from '~/components/home-control'

const LAMP: Device = {
    id: 'lamp',
    name: 'Lamp',
    type: 'light',
    online: true,
    state: { state: 'ON', brightness: 127, color_temp: 370 },
}
const LIMITED: Device = {
    ...LAMP,
    limits: {
        brightness: { min: 1, max: 201 },
        colorTemp: { min: 200, max: 400 },
    },
    state: { state: 'ON', brightness: 101, color_temp: 250 },
}
const BRIGHTNESS = 'Lamp Brightness'
const COLOR = 'Lamp Color temperature'

let reprobe: () => Promise<void>

function CaptureReprobe() {
    const controller = useController()
    useEffect(() => {
        reprobe = controller.reprobe
    }, [controller])
    return null
}

const slider = (label: string) => screen.getByLabelText(label)
const shown = (label: string) => slider(label).props['aria-valuetext']
const drag = (label: string, value: number) =>
    fireEvent(slider(label), 'change', {
        currentTarget: { value: String(value) },
    })
const letGo = (label: string) => fireEvent(slider(label), 'pointerUp')

describe.each([
    ['LAN', 'lan', true],
    ['Relay', 'relay', false],
] as const)('level sliders over %s', (_label, via, lanReachable) => {
    async function setup(options?: {
        device?: Device
        confirmationWindowMs?: number
        commandResult?: () => CommandResult
    }) {
        const controller = new FakeController({
            controllerId: 'lake',
            acceptedAccessClients: ['phone-access-client'],
            devices: [structuredClone(options?.device ?? LAMP)],
            lanReachable,
        })
        if (options?.commandResult) {
            controller.commandResult = options.commandResult
        }
        const accessClientKeyStore = fakeAccessClientKeyStore({
            lake: 'phone-access-client',
        })
        await render(
            <ControllerProvider
                accessClientKeyStore={accessClientKeyStore}
                connectors={fakeControllerConnectors(controller)}
                controllerId="lake"
                lanCandidates={[controller.baseUrl]}
            >
                <CaptureReprobe />
                <HomeControlProvider
                    confirmationWindowMs={options?.confirmationWindowMs}
                >
                    <DeviceSheet deviceId="lamp" onClose={() => {}} />
                </HomeControlProvider>
            </ControllerProvider>
        )
        await screen.findByLabelText(BRIGHTNESS)
        return controller
    }

    async function report(controller: FakeController, device: Device) {
        await act(async () => {
            controller.setDevices([device])
        })
    }

    it('follows the finger and sends one Command on release', async () => {
        const controller = await setup()
        for (const value of [55, 63.4, 79.6]) await drag(BRIGHTNESS, value)
        expect(slider(BRIGHTNESS).props.value).toBe(79.6)
        expect(shown(BRIGHTNESS)).toBe('80%')
        expect(controller.commands).toEqual([])

        await letGo(BRIGHTNESS)
        await fireEvent(slider(BRIGHTNESS), 'blur')

        await screen.findByText(/Waiting for the Device to report 80%/)
        expect(controller.commands).toEqual([
            {
                command: { deviceId: 'lamp', payload: { brightness: 203 } },
                via,
            },
        ])
    })

    it('sends nothing when the thumb never moved', async () => {
        const controller = await setup()
        await letGo(BRIGHTNESS)
        expect(controller.commands).toEqual([])
    })

    it('keeps the chosen value while pending, then follows the Device', async () => {
        const controller = await setup()
        await drag(BRIGHTNESS, 80)
        await letGo(BRIGHTNESS)
        await screen.findByText(/Waiting for the Device to report 80%/)
        expect(shown(BRIGHTNESS)).toBe('80%')
        expect(slider(BRIGHTNESS).props.disabled).toBe(true)

        // Still on its way there.
        await report(controller, {
            ...LAMP,
            state: { state: 'ON', brightness: 160, color_temp: 370 },
        })
        expect(shown(BRIGHTNESS)).toBe('80%')

        await report(controller, {
            ...LAMP,
            state: { state: 'ON', brightness: 201, color_temp: 370 },
        })
        await screen.findByText('Confirmed: 80%')
        expect(shown(BRIGHTNESS)).toBe('79%')
        expect(slider(BRIGHTNESS).props.disabled).toBe(false)

        await report(controller, {
            ...LAMP,
            state: { state: 'ON', brightness: 25, color_temp: 370 },
        })
        expect(shown(BRIGHTNESS)).toBe('10%')
    })

    it('snaps back and says why when rejected', async () => {
        await setup({
            commandResult: () => {
                throw new ApiError('unavailable', 'no', 409)
            },
        })
        await drag(BRIGHTNESS, 80)
        await letGo(BRIGHTNESS)
        await screen.findByText('Rejected: 80%')
        expect(screen.getByText(/The Device is unavailable/)).toBeTruthy()
        expect(shown(BRIGHTNESS)).toBe('50%')
    })

    it('snaps back and says why when failed', async () => {
        await setup({
            commandResult: () => ({
                requestId: 'r',
                ok: false,
                error: { code: 'mqtt_error', message: 'broker down' },
            }),
        })
        await drag(COLOR, 4000)
        await letGo(COLOR)
        await screen.findByText('Failed: 4000 K')
        expect(screen.getByText(/could not reach the Device/)).toBeTruthy()
        expect(shown(COLOR)).toBe('2703 K')
    })

    it('returns to the last reported value when unconfirmed', async () => {
        const controller = await setup({ confirmationWindowMs: 60 })
        await drag(BRIGHTNESS, 80)
        await letGo(BRIGHTNESS)
        await screen.findByText(/Waiting for the Device/)
        await report(controller, {
            ...LAMP,
            state: { state: 'ON', brightness: 152, color_temp: 370 },
        })
        await screen.findByText('Not confirmed: 80%')
        expect(screen.getByText(/did not report the change/)).toBeTruthy()
        expect(shown(BRIGHTNESS)).toBe('60%')
    })

    it('shows Kelvin on a warm-to-cool track and sends mireds', async () => {
        const controller = await setup()
        expect(screen.getByTestId('warm-to-cool-track')).toBeTruthy()
        expect(shown(COLOR)).toBe('2703 K')

        // Warm is on the left, so a drag right is more Kelvin. The label is
        // the nearest whole mired: 1e6 / 333.
        await drag(COLOR, 3000)
        expect(shown(COLOR)).toBe('3003 K')
        await letGo(COLOR)
        await screen.findByText(/Waiting for the Device to report 3003 K/)
        expect(controller.commands[0]?.command.payload).toEqual({
            color_temp: 333,
        })

        // One mired of rounding by the Device still confirms.
        await report(controller, {
            ...LAMP,
            state: { state: 'ON', brightness: 127, color_temp: 334 },
        })
        await screen.findByText('Confirmed: 3003 K')
        expect(shown(COLOR)).toBe('2994 K')
    })

    it('respects the Device’s own limits', async () => {
        const controller = await setup({ device: LIMITED })
        expect(slider(COLOR).props).toMatchObject({ min: 2500, max: 5000 })
        expect(shown(COLOR)).toBe('4000 K')
        expect(shown(BRIGHTNESS)).toBe('50%')

        await drag(BRIGHTNESS, 100)
        await letGo(BRIGHTNESS)
        await screen.findByText(/Waiting for the Device to report 100%/)
        await drag(COLOR, 2500)
        await letGo(COLOR)
        await screen.findByText(/Waiting for the Device to report 2500 K/)
        expect(
            controller.commands.map(({ command }) => command.payload)
        ).toEqual([{ brightness: 201 }, { color_temp: 400 }])
    })

    it('uses the common limits when the Device reports none', async () => {
        await setup()
        expect(slider(COLOR).props).toMatchObject({ min: 2000, max: 6536 })
    })

    it('drops a drag when the Controller becomes unreachable', async () => {
        const controller = await setup()
        await drag(BRIGHTNESS, 80)
        controller.goOffline()
        await act(() => reprobe())
        await screen.findByText('Showing the last known state')
        expect(shown(BRIGHTNESS)).toBe('50%')
        expect(slider(BRIGHTNESS).props.disabled).toBe(true)

        await letGo(BRIGHTNESS)
        controller.lanReachable = lanReachable
        controller.relayReachable = true
        await act(() => reprobe())
        expect(controller.commands).toEqual([])
        expect(shown(BRIGHTNESS)).toBe('50%')
    })
})
