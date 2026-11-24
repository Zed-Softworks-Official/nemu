import { FakeController } from '@nemu/controller/testing'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import {
    DASHBOARD_TOKEN,
    renderWithController,
} from '~/test/render-with-controller'
import { DevicePairingWizard } from './device-pairing-wizard'

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: vi.fn() }),
}))

describe('Adding a Matter Device from the dashboard', () => {
    it('is not offered over Relay, and sends nothing', async () => {
        const controller = new FakeController({
            controllerId: 'lake',
            acceptedTokens: [DASHBOARD_TOKEN],
            lanReachable: false,
        })
        renderWithController(<DevicePairingWizard />, controller)
        const user = userEvent.setup()
        await user.click(
            await screen.findByRole('button', { name: /Works with Matter/ })
        )
        expect(
            await screen.findByText(/only be added on your Home network/)
        ).toBeInTheDocument()
        expect(controller.commissioningRequests).toEqual([])
    })

    it('starts on the Home network', async () => {
        const controller = new FakeController({
            controllerId: 'lake',
            acceptedTokens: [DASHBOARD_TOKEN],
        })
        renderWithController(<DevicePairingWizard />, controller)
        const user = userEvent.setup()
        await user.click(
            await screen.findByRole('button', { name: /Works with Matter/ })
        )
        expect(
            await screen.findByRole('button', { name: 'Next' })
        ).toBeInTheDocument()
    })
})
