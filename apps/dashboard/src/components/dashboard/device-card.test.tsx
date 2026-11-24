import { FakeController } from '@nemu/controller/testing'
import { act, fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { presentDevice } from '~/lib/device-presentation'
import {
    DASHBOARD_TOKEN,
    renderWithController,
} from '~/test/render-with-controller'
import { DeviceCard } from './device-card'
import { CONFIRMATION_WINDOW_MS } from './use-command-confirmation'

const LAMP = presentDevice({
    id: 'lamp',
    name: 'Lamp',
    type: 'light',
    protocol: 'matter',
    externalId: '7',
    roomId: null,
    online: true,
    state: { state: 'OFF' },
})

async function toggled() {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const controller = new FakeController({
        controllerId: 'lake',
        acceptedTokens: [DASHBOARD_TOKEN],
    })
    controller.commandResult = () => ({
        requestId: 'cmd-1',
        ok: true,
        outcome: 'accepted',
    })
    renderWithController(<DeviceCard device={LAMP} />, controller)
    const toggle = screen.getByRole('switch', { name: 'Toggle Lamp' })
    await vi.waitFor(() => expect(toggle).not.toHaveAttribute('data-disabled'))
    await act(async () => {
        fireEvent.click(toggle)
    })
    expect(controller.commands).toHaveLength(1)
    expect(toggle).toHaveAttribute('aria-checked', 'true')
    return { controller, toggle }
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
})
