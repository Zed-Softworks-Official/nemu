import { FakeController } from '@nemu/controller/testing'
import type { HouseholdMember } from '@nemu/protocol'
import { screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
    DASHBOARD_TOKEN,
    renderWithController,
} from '~/test/render-with-controller'
import SettingsPage from './page'

const signedIn = vi.hoisted(() => ({
    user: {
        id: 'user_ada',
        fullName: 'Ada Lovelace',
        primaryEmailAddress: { emailAddress: 'ada@example.com' },
    },
}))

vi.mock('@clerk/nextjs', () => ({
    useUser: () => ({ user: signedIn.user }),
}))

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}))

vi.mock('@nemu/cloud', () => {
    const reference = (path: string): unknown =>
        new Proxy(() => path, {
            get: (_target, key) => reference(`${path}.${String(key)}`),
        })
    return {
        api: reference('api'),
        useConvexAuth: () => ({ isAuthenticated: true, isLoading: false }),
        useQuery: () => [
            {
                controllerId: 'lake',
                name: 'Lake House',
                lanHostname: 'nemu.local',
            },
        ],
        useMutation: () => vi.fn(async () => null),
    }
})

const ADA: HouseholdMember = {
    id: 'member-ada',
    userId: 'user_ada',
    email: 'ada@example.com',
    displayName: 'Ada Lovelace',
    role: 'owner',
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
}
const BEN: HouseholdMember = {
    id: 'member-ben',
    userId: 'user_ben',
    email: 'ben@example.com',
    displayName: 'Ben Okafor',
    role: 'member',
    status: 'active',
    createdAt: '2026-02-01T00:00:00.000Z',
}

const CLEO: HouseholdMember = {
    id: 'member-cleo',
    userId: 'user_cleo',
    email: 'cleo@example.com',
    displayName: 'Cleo Vance',
    role: 'owner',
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
}

function home(options?: {
    lanReachable?: boolean
    members?: HouseholdMember[]
}) {
    const controller = new FakeController({
        controllerId: 'lake',
        name: 'Lake House',
        acceptedTokens: [DASHBOARD_TOKEN],
        lanReachable: options?.lanReachable ?? true,
    })
    controller.members = options?.members ?? [ADA, BEN]
    controller.accessClients = [
        {
            id: 'token-laptop',
            label: 'Ada’s laptop',
            createdAt: '2026-03-01T00:00:00.000Z',
            lastSeenAt: null,
            userId: 'user_ada',
        },
    ]
    controller.releaseStatus = {
        platformVersion: '2026.11.0',
        channel: 'stable',
        newerReleaseAvailable: true,
        maintenanceMode: false,
        rollbackSnapshotAvailable: false,
        rollbackStuck: false,
    }
    return controller
}

function card(title: string): HTMLElement {
    const heading = screen.getByText(title)
    const container = heading.closest('[data-slot="card"]')
    if (!(container instanceof HTMLElement)) {
        throw new Error(`No card titled ${title}`)
    }
    return container
}

describe('Settings page', () => {
    beforeEach(() => {
        localStorage.clear()
    })

    it('shows an Owner the Home’s people, Access Clients and installed Release', async () => {
        renderWithController(<SettingsPage />, home())

        expect(await screen.findByText('2026.11.0')).toBeInTheDocument()
        expect(
            screen.getByText('Stable', { selector: 'p' })
        ).toBeInTheDocument()
        expect(
            screen.getByText('A newer Release is available.')
        ).toBeInTheDocument()
        expect(
            screen.getByRole('button', { name: 'Install' })
        ).toBeInTheDocument()
        expect(screen.getByDisplayValue('Lake House')).toBeInTheDocument()

        const people = card('People')
        expect(within(people).getByText('Ada Lovelace')).toBeInTheDocument()
        expect(within(people).getByText('Ben Okafor')).toBeInTheDocument()
        expect(
            within(people).getByText('ben@example.com · member')
        ).toBeInTheDocument()
        expect(
            within(people).getAllByRole('button', { name: 'Remove' })
        ).toHaveLength(2)

        const devices = card('Devices')
        expect(within(devices).getByText('Ada’s laptop')).toBeInTheDocument()
        expect(
            within(devices).getByText(/^Ada Lovelace · Paired /)
        ).toBeInTheDocument()

        expect(
            screen.getByText('Invite someone to this home')
        ).toBeInTheDocument()
        expect(screen.getByText('Add a device with a code')).toBeInTheDocument()
    })

    it('shows a Member the installed Release but hides Owner-only actions', async () => {
        const adaAsMember: HouseholdMember = { ...ADA, role: 'member' }
        renderWithController(
            <SettingsPage />,
            home({ members: [CLEO, adaAsMember] })
        )

        const people = card('People')
        expect(
            await within(people).findByText('Cleo Vance')
        ).toBeInTheDocument()
        expect(
            within(people).getByText('ada@example.com · member')
        ).toBeInTheDocument()
        // A Member can only remove themselves.
        expect(
            within(people).getAllByRole('button', { name: 'Remove' })
        ).toHaveLength(1)
        // Every active Membership can read the installed Release (NEM-95).
        expect(await screen.findByText('2026.11.0')).toBeInTheDocument()
        expect(
            screen.getByText('Stable', { selector: 'p' })
        ).toBeInTheDocument()
        expect(
            screen.queryByText('Invite someone to this home')
        ).not.toBeInTheDocument()
        expect(
            screen.queryByText('Add a device with a code')
        ).not.toBeInTheDocument()
        expect(
            screen.queryByRole('button', { name: 'Install' })
        ).not.toBeInTheDocument()
    })

    it('shows the Relay connection when the Controller is away from the LAN', async () => {
        renderWithController(<SettingsPage />, home({ lanReachable: false }))

        expect(
            await screen.findByText(
                'Commands pass through the ephemeral Convex relay.'
            )
        ).toBeInTheDocument()
        expect(
            await within(card('People')).findByText('Ada Lovelace')
        ).toBeInTheDocument()
    })

    it('tells the Owner when the installed Release cannot be read', async () => {
        const controller = home()
        controller.releaseStatus = null
        renderWithController(<SettingsPage />, controller)

        expect(
            await screen.findByText('The Updater is unavailable')
        ).toBeInTheDocument()
        expect(
            screen.queryByRole('button', { name: 'Install' })
        ).not.toBeInTheDocument()
    })
})
