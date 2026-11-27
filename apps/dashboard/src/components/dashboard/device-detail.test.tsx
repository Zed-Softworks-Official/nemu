import { FakeController } from '@nemu/controller/testing'
import type { Device } from '@nemu/protocol'
import { act, fireEvent, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import {
    DASHBOARD_ACCESS_CLIENT_ID,
    renderWithController,
} from '~/test/render-with-controller'
import { DeviceDetail } from './device-detail'
import { CONFIRMATION_WINDOW_MS } from './use-command-confirmation'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

const LAMP: Device = {
    id: 'lamp',
    name: 'Lamp',
    type: 'light',
    protocol: 'matter',
    externalId: '7',
    roomId: null,
    online: true,
    state: { state: 'OFF' },
}

afterEach(() => {
    vi.useRealTimers()
})

it.each([
    ['state', { state: { state: 'OFF', linkquality: 90 } }],
    ['online', { online: false }],
])('keeps a Command waiting through an unrelated %s report', async (_name, change) => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const controller = new FakeController({
        controllerId: 'lake',
        acceptedAccessClients: [DASHBOARD_ACCESS_CLIENT_ID],
        devices: [LAMP],
    })
    controller.commandResult = () => ({
        requestId: 'cmd-1',
        ok: true,
        outcome: 'accepted',
    })
    renderWithController(<DeviceDetail deviceId="lamp" />, controller)
    const toggle = (await screen.findAllByRole('switch'))[0] as HTMLElement
    await act(async () => {
        fireEvent.click(toggle)
    })
    expect(controller.commands).toHaveLength(1)

    controller.devices = [{ ...LAMP, ...change }]
    await act(async () => controller.emit({ type: 'resync' }))
    await act(() => vi.advanceTimersByTimeAsync(100))
    expect(toggle).toHaveAttribute('aria-checked', 'true')

    await act(() => vi.advanceTimersByTimeAsync(CONFIRMATION_WINDOW_MS))
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    expect(
        screen.getByText('The Device did not report the change.')
    ).toBeInTheDocument()
})
