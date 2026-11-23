import { ControllerProvider } from '@nemu/controller'
import {
    createMemoryCredentialStore,
    type FakeController,
    fakeControllerConnectors,
} from '@nemu/controller/testing'
import { render } from '@testing-library/react'
import type { ReactNode } from 'react'

/** The token this dashboard's Access Client presents to the fake Controller. */
export const DASHBOARD_TOKEN = 'dashboard-token'

/**
 * Render dashboard UI against a fake Controller through the shared
 * Controller client, so tests run the real LAN-then-Relay selection.
 */
export function renderWithController(
    ui: ReactNode,
    controller: FakeController
) {
    const credentialStore = createMemoryCredentialStore({
        [controller.controllerId]: { clientToken: DASHBOARD_TOKEN },
    })
    return render(
        <ControllerProvider
            connectors={fakeControllerConnectors(controller)}
            controllerId={controller.controllerId}
            credentialStore={credentialStore}
            lanCandidates={[controller.baseUrl]}
        >
            {ui}
        </ControllerProvider>
    )
}
