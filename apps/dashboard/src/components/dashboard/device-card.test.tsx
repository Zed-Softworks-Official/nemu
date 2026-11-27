import { FakeController } from '@nemu/controller/testing'
import type { Device, DeviceState } from '@nemu/protocol'
import { act, fireEvent, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { presentDevice } from '~/lib/device-presentation'
import {
    DASHBOARD_ACCESS_CLIENT_ID,
    renderWithController,
} from '~/test/render-with-controller'
import { DeviceCard } from './device-card'
import { CONFIRMATION_WINDOW_MS } from './use-command-confirmation'

const LAMP_DEVICE: Device = {
    id: 'lamp',
    name: 'Lamp',
    type: 'light',
    protocol: 'matter',
    externalId: '7',
    roomId: null,
    online: true,
    state: { state: 'OFF' },
}
const LAMP = presentDevice(LAMP_DEVICE)

async function toggled() {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const controller = new FakeController({
        controllerId: 'lake',
        acceptedAccessClients: [DASHBOARD_ACCESS_CLIENT_ID],
    })
    controller.commandResult = () => ({
        requestId: 'cmd-1',
        ok: true,
        outcome: 'accepted',
    })
    let report: (state: DeviceState, online?: boolean) => void = () => {}
    function ReportingCard() {
        const [device, setDevice] = useState(LAMP)
        report = (state, online = true) =>
            act(() =>
                setDevice(presentDevice({ ...LAMP_DEVICE, state, online }))
            )
        return <DeviceCard device={device} />
    }
    renderWithController(<ReportingCard />, controller)
    const toggle = screen.getByRole('switch', { name: 'Toggle Lamp' })
    await vi.waitFor(() => expect(toggle).not.toHaveAttribute('data-disabled'))
    await act(async () => {
        fireEvent.click(toggle)
    })
    expect(controller.commands).toHaveLength(1)
    expect(toggle).toHaveAttribute('aria-checked', 'true')
    return { controller, toggle, report }
}

afterEach(() => {
    vi.useRealTimers()
})

describe('An accepted Command on a Device card', () => {
    it('goes back to the reported value when the Device never confirms it', async () => {
        const { toggle } = await toggled()
        await act(() => vi.advanceTimersByTimeAsync(CONFIRMATION_WINDOW_MS))
        expect(toggle).toHaveAttribute('aria-checked', 'false')
        expect(
            screen.getByText('The Device did not report the change.')
        ).toBeInTheDocument()
    })

    it('goes back to the reported value when its adapter reports a failure', async () => {
        const { controller, toggle } = await toggled()
        await act(async () =>
            controller.emit({
                type: 'commandResult',
                requestId: 'cmd-1',
                ok: false,
                outcome: 'failed',
                error: { code: 'failed', message: 'command failed: failed' },
            })
        )
        expect(toggle).toHaveAttribute('aria-checked', 'false')
        expect(screen.getByText('command failed: failed')).toBeInTheDocument()
    })

    it('keeps waiting through reports that do not confirm it', async () => {
        const { toggle, report } = await toggled()
        report({ state: 'OFF', linkquality: 90 })
        report({ state: 'OFF', linkquality: 90 }, false)
        expect(toggle).toHaveAttribute('aria-checked', 'true')

        await act(() => vi.advanceTimersByTimeAsync(CONFIRMATION_WINDOW_MS))
        expect(toggle).toHaveAttribute('aria-checked', 'false')
        report({ state: 'OFF', linkquality: 91 })
        expect(
            screen.getByText('The Device did not report the change.')
        ).toBeInTheDocument()

        report({ state: 'ON' })
        expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('is settled by a report of the requested value', async () => {
        const { toggle, report } = await toggled()
        report({ state: 'ON' })
        await act(() => vi.advanceTimersByTimeAsync(CONFIRMATION_WINDOW_MS))
        expect(toggle).toHaveAttribute('aria-checked', 'true')
        expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('is not confirmed by a report from before the Command it replaced', async () => {
        const { controller, toggle, report } = await toggled()
        controller.commandResult = () => ({
            requestId: 'cmd-2',
            ok: true,
            outcome: 'accepted',
        })
        await act(async () => {
            fireEvent.click(toggle)
        })
        expect(controller.commands).toHaveLength(2)
        report({ state: 'ON' })
        expect(toggle).toHaveAttribute('aria-checked', 'false')

        await act(() => vi.advanceTimersByTimeAsync(CONFIRMATION_WINDOW_MS))
        expect(toggle).toHaveAttribute('aria-checked', 'true')
        expect(
            screen.getByText('The Device did not report the change.')
        ).toBeInTheDocument()
    })
})
