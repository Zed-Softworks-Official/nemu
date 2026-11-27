import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import SetupPage from './page'

const keys = vi.hoisted(() => ({ supported: true }))

vi.mock('next/navigation', () => ({
    useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
}))

vi.mock('@clerk/nextjs', () => ({
    useAuth: () => ({ isSignedIn: true }),
    useUser: () => ({ user: null }),
}))

vi.mock('@nemu/cloud', () => ({
    api: {
        pairings: { create: 'pairings.create' },
        controllers: { listMine: 'controllers.listMine' },
    },
    useMutation: () => vi.fn(),
    useQuery: () => [],
}))

vi.mock('@nemu/controller', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@nemu/controller')>()),
    useController: () => ({ reprobe: vi.fn() }),
}))

vi.mock('~/lib/access-client-keys', () => ({
    dashboardKeyStore: {
        supported: async () => keys.supported,
        load: async () => null,
    },
}))

beforeEach(() => {
    keys.supported = true
    localStorage.clear()
})

describe('SetupPage', () => {
    it('tells a browser without Web Crypto Ed25519 and X25519 to use a current browser, and asks for no Pairing code', async () => {
        keys.supported = false

        render(<SetupPage />)

        expect(
            await screen.findByText(
                'Use a current version of Chrome, Edge, Safari or Firefox to pair this browser.'
            )
        ).toBeInTheDocument()
        expect(
            screen.queryByRole('button', { name: 'Find controller' })
        ).not.toBeInTheDocument()
        expect(screen.queryByLabelText('Pairing code')).not.toBeInTheDocument()
    })

    it('offers to find the controller on a supported browser', async () => {
        render(<SetupPage />)

        expect(
            await screen.findByRole('button', { name: 'Find controller' })
        ).toBeInTheDocument()
        expect(
            screen.queryByText(/Use a current version of Chrome/)
        ).not.toBeInTheDocument()
    })
})
