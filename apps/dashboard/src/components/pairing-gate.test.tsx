import { ControllerProvider } from '@nemu/controller'
import {
    createMemoryAccessClientKeyStore,
    FakeController,
    fakeControllerConnectors,
    pairFakeAccessClient,
} from '@nemu/controller/testing'
import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PairingGate } from './pairing-gate'

const nav = vi.hoisted(() => ({ replace: vi.fn() }))
const keys = vi.hoisted(() => ({
    store: null as ReturnType<typeof createMemoryAccessClientKeyStore> | null,
}))

vi.mock('next/navigation', () => ({
    useRouter: () => ({ replace: nav.replace, push: vi.fn() }),
}))

vi.mock('@nemu/cloud', () => ({
    api: { pairings: { list: 'pairings.list' } },
    useConvexAuth: () => ({ isAuthenticated: true, isLoading: false }),
    useQuery: () => [{ controllerId: 'lake' }],
}))

vi.mock('~/lib/access-client-keys', () => ({
    get dashboardKeyStore() {
        return keys.store
    },
}))

function lake() {
    return new FakeController({
        controllerId: 'lake',
        baseUrl: 'https://lake.lan.nemu.sh:6368',
    })
}

function renderGate(controller: FakeController) {
    const keyStore = keys.store
    if (!keyStore) throw new Error('no key store')
    return render(
        <ControllerProvider
            accessClientKeyStore={keyStore}
            connectors={fakeControllerConnectors(controller)}
            lanCandidates={[controller.baseUrl]}
        >
            <PairingGate>
                <p>Home</p>
            </PairingGate>
        </ControllerProvider>
    )
}

beforeEach(() => {
    nav.replace.mockReset()
    keys.store = createMemoryAccessClientKeyStore()
    localStorage.clear()
    localStorage.setItem('nemu.controller.id', 'lake')
})

describe('PairingGate', () => {
    it('opens the dashboard for a browser that holds keys for the Home', async () => {
        const controller = lake()
        const keyStore = keys.store
        if (!keyStore) throw new Error('no key store')
        await pairFakeAccessClient(controller, keyStore)

        renderGate(controller)

        expect(await screen.findByText('Home')).toBeInTheDocument()
        expect(nav.replace).not.toHaveBeenCalled()
    })

    it('sends a browser that only holds an old bearer token to pair at home', async () => {
        const controller = lake()
        localStorage.setItem('nemu.controller.clientToken', 'nemu_old')

        renderGate(controller)

        await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/setup'))
        expect(screen.queryByText('Home')).not.toBeInTheDocument()
    })

    it('sends a revoked browser to pair again at home, saying why', async () => {
        const controller = lake()
        const keyStore = keys.store
        if (!keyStore) throw new Error('no key store')
        const record = await pairFakeAccessClient(controller, keyStore)
        controller.revokeToken(record.enrollment.accessClientId)

        renderGate(controller)

        await waitFor(() =>
            expect(nav.replace).toHaveBeenCalledWith(
                '/setup?pairAgain=tombstoned_access_client'
            )
        )
        expect(await keyStore.load('lake')).toBeNull()
    })
})
