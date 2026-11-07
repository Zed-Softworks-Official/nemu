import { ControllerProvider, useController } from '@nemu/controller'
import {
    createMemoryCredentialStore,
    FakeController,
    fakeControllerConnectors,
} from '@nemu/controller/testing'
import { ApiError, type CommandResult, type Device } from '@nemu/protocol'
import {
    act,
    fireEvent,
    render,
    screen,
    within,
} from '@testing-library/react-native'
import { useEffect } from 'react'

import { RoomsView } from '~/components/control-surface'
import { HomeControlProvider } from '~/components/home-control'

const LAMP: Device = {
    id: 'lamp',
    name: 'Lamp',
    type: 'light',
    online: true,
    state: { state: 'OFF', brightness: 127 },
}
const STRIP: Device = {
    id: 'strip',
    name: 'Strip',
    type: 'strip',
    online: true,
    state: {
        outlets: [
            { id: '1', name: 'Fan', state: 'OFF' },
            { id: '2', state: 'ON' },
        ],
    },
}
const SENSOR: Device = {
    id: 'sensor',
    name: 'Sensor',
    type: 'sensor',
    online: true,
    state: { temperature: 21 },
}
const OFFLINE_LAMP: Device = { ...LAMP, id: 'old', name: 'Old', online: false }

const ACCEPTED: CommandResult = {
    requestId: 'r',
    ok: true,
    outcome: 'accepted',
}

let reprobe: () => Promise<void>

function CaptureReprobe() {
    const controller = useController()
    useEffect(() => {
        reprobe = controller.reprobe
    }, [controller])
    return null
}

async function setup(options?: {
    devices?: Device[]
    lanReachable?: boolean
    confirmationWindowMs?: number
    commandResult?: () => CommandResult
}) {
    const controller = new FakeController({
        controllerId: 'lake',
        acceptedTokens: ['token'],
        devices: options?.devices ?? [LAMP, OFFLINE_LAMP],
        lanReachable: options?.lanReachable,
    })
    if (options?.commandResult) controller.commandResult = options.commandResult
    const credentialStore = createMemoryCredentialStore()
    credentialStore.set('lake', { clientToken: 'token' })
    await render(
        <ControllerProvider
            connectors={fakeControllerConnectors(controller)}
            controllerId="lake"
            credentialStore={credentialStore}
            lanCandidates={[controller.baseUrl]}
        >
            <CaptureReprobe />
            <HomeControlProvider
                confirmationWindowMs={options?.confirmationWindowMs}
            >
                <RoomsView />
            </HomeControlProvider>
        </ControllerProvider>
    )
    await screen.findByLabelText(
        `${(options?.devices ?? [LAMP])[0]?.name} ${
            (options?.devices ?? [LAMP])[0]?.id === 'strip' ? 'Fan' : 'Power'
        }`
    )
    return controller
}

const power = () => screen.getByLabelText('Lamp Power')
const turnOn = () => fireEvent(power(), 'valueChange', true)

async function report(controller: FakeController, device: Device) {
    await act(async () => {
        controller.setDevices([device, OFFLINE_LAMP])
    })
}

describe('issuing a Command', () => {
    it('sends an absolute desired value for the chosen control', async () => {
        const controller = await setup()
        await turnOn()
        await screen.findByText(/Waiting for the Device to report on/)
        expect(controller.commands).toEqual([
            {
                command: { deviceId: 'lamp', payload: { state: 'ON' } },
                via: 'lan',
            },
        ])
    })

    it('sets a level to an absolute value', async () => {
        const controller = await setup()
        await fireEvent.press(screen.getByLabelText('Raise Lamp Brightness'))
        await screen.findByText(/Waiting for the Device to report 60%/)
        expect(controller.commands[0]?.command.payload).toEqual({
            brightness: 152,
        })
    })

    it('commands one outlet of a strip', async () => {
        const controller = await setup({ devices: [STRIP] })
        await fireEvent(screen.getByLabelText('Strip Fan'), 'valueChange', true)
        await screen.findByText(/Waiting for the Device to report on/)
        expect(controller.commands[0]?.command.payload).toEqual({
            outlet: '1',
            state: 'ON',
        })
    })

    it('offers no control for a Capability that cannot be commanded', async () => {
        await setup({ devices: [LAMP, SENSOR] })
        const sensor = screen.getByLabelText('Sensor')
        expect(within(sensor).queryByRole('switch')).toBeNull()
        expect(within(sensor).queryByRole('button')).toBeNull()
    })

    it('uses the same operation over Relay', async () => {
        const controller = await setup({ lanReachable: false })
        await turnOn()
        await screen.findByText(/Waiting for the Device/)
        expect(controller.commands[0]?.via).toBe('relay')
    })
})

describe('accepted Commands', () => {
    it('stays pending, showing the reported value, until state confirms', async () => {
        const controller = await setup()
        await turnOn()
        await screen.findByText(/Waiting for the Device to report on/)

        expect(power().props.value).toBe(false)
        expect(screen.queryByText(/Confirmed/)).toBeNull()

        await report(controller, { ...LAMP, state: { state: 'ON' } })

        await screen.findByText('Confirmed: on')
        expect(power().props.value).toBe(true)
    })

    it('is not confirmed by state that does not match', async () => {
        const controller = await setup()
        await turnOn()
        await screen.findByText(/Waiting for the Device/)

        await report(controller, {
            ...LAMP,
            state: { state: 'OFF', brightness: 10 },
        })

        expect(screen.queryByText(/Confirmed/)).toBeNull()
        expect(screen.getByText(/Waiting for the Device/)).toBeTruthy()
    })

    it('does not send that control again while one is pending', async () => {
        const controller = await setup()
        await turnOn()
        await screen.findByText(/Waiting for the Device/)

        expect(power().props.disabled).toBe(true)
        await turnOn()
        expect(controller.commands).toHaveLength(1)
    })

    it('confirms immediately when the Controller already has', async () => {
        await setup({
            commandResult: () => ({
                requestId: 'r',
                ok: true,
                outcome: 'confirmed',
            }),
        })
        await turnOn()
        await screen.findByText('Confirmed: on')
    })
})

describe('final outcomes', () => {
    function throwing(code: string, message: string) {
        return () => {
            throw new ApiError(code, message, 409)
        }
    }

    it('shows a rejected Command', async () => {
        await setup({ commandResult: throwing('unavailable', 'no') })
        await turnOn()
        await screen.findByText('Rejected: on')
        expect(screen.getByText(/did not send this/)).toBeTruthy()
    })

    it('shows a failed Command', async () => {
        await setup({
            commandResult: () => ({
                requestId: 'r',
                ok: false,
                error: { code: 'mqtt_error', message: 'broker down' },
            }),
        })
        await turnOn()
        await screen.findByText('Failed: on')
        expect(screen.queryByText(/broker down/)).toBeNull()
    })

    it('shows an unconfirmed Command the Controller gave up on', async () => {
        await setup({ commandResult: throwing('unconfirmed', 'no') })
        await turnOn()
        await screen.findByText('Not confirmed: on')
    })

    it('shows unconfirmed when the confirmation window runs out', async () => {
        await setup({ confirmationWindowMs: 20 })
        await turnOn()
        await screen.findByText('Not confirmed: on')
        expect(screen.getByText(/did not report the change/)).toBeTruthy()
    })

    it('treats a timed out send as unknown, not failed', async () => {
        await setup({ commandResult: throwing('timeout', 'slow') })
        await turnOn()
        await screen.findByText('Not confirmed: on')
        expect(screen.getByText(/may or may not have happened/)).toBeTruthy()
    })

    it('releases the control when a send never answers', async () => {
        await setup({
            confirmationWindowMs: 20,
            commandResult: () =>
                new Promise(() => {}) as unknown as CommandResult,
        })
        await turnOn()
        await screen.findByText('Not confirmed: on')
        expect(power().props.disabled).toBe(false)
    })

    it('does not claim a Command failed when the connection dropped', async () => {
        await setup({
            commandResult: () => {
                throw new ApiError('network_error', 'Network Error')
            },
        })
        await turnOn()
        await screen.findByText('Not confirmed: on')
        expect(screen.getByText(/may or may not have happened/)).toBeTruthy()
    })

    it('can be tried again, or dismissed', async () => {
        const results: Array<() => CommandResult> = [
            throwing('unavailable', 'no'),
            () => ACCEPTED,
        ]
        const controller = await setup({
            commandResult: () => (results.shift() as () => CommandResult)(),
        })
        await turnOn()
        await screen.findByText('Rejected: on')

        await fireEvent.press(screen.getByRole('button', { name: 'Try again' }))
        await screen.findByText(/Waiting for the Device to report on/)
        expect(controller.commands).toHaveLength(2)
    })

    it('clears when dismissed', async () => {
        await setup({ commandResult: throwing('unavailable', 'no') })
        await turnOn()
        await screen.findByText('Rejected: on')
        await fireEvent.press(screen.getByRole('button', { name: 'Dismiss' }))
        expect(screen.queryByText('Rejected: on')).toBeNull()
    })
})

describe('when a Command cannot be sent', () => {
    it('disables controls for an offline Device', async () => {
        await setup()
        expect(screen.getByLabelText('Old Power').props.disabled).toBe(true)
        expect(
            screen.getByLabelText('Raise Old Brightness').props
                .accessibilityState.disabled
        ).toBe(true)
    })

    it('disables controls with no connection and sends nothing later', async () => {
        const controller = await setup()
        controller.goOffline()
        await act(() => reprobe())
        await screen.findByText('Can’t reach the Controller')

        expect(power().props.disabled).toBe(true)
        await turnOn()
        expect(controller.commands).toHaveLength(0)
        expect(screen.queryByText(/Waiting for the Device/)).toBeNull()
        expect(screen.queryByText(/Sending/)).toBeNull()

        controller.lanReachable = true
        await act(() => reprobe())
        await screen.findByText('At home')
        expect(controller.commands).toHaveLength(0)
    })

    it('does not retry a final outcome while offline', async () => {
        const controller = await setup({
            commandResult: () => {
                throw new ApiError('unavailable', 'no', 409)
            },
        })
        await turnOn()
        await screen.findByText('Rejected: on')

        controller.goOffline()
        await act(() => reprobe())
        await screen.findByText('Can’t reach the Controller')

        // The first is the connection banner's; the second retries the Command.
        const retry = screen.getAllByRole('button', { name: 'Try again' })[1]
        await fireEvent.press(retry as never)
        expect(controller.commands).toHaveLength(1)
        expect(screen.getByText('Rejected: on')).toBeTruthy()
    })
})
