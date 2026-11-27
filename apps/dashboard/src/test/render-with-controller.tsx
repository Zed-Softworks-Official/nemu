import { ControllerProvider } from '@nemu/controller'
import {
    type FakeController,
    fakeAccessClientKeyStore,
    fakeControllerConnectors,
} from '@nemu/controller/testing'
import { render } from '@testing-library/react'
import type { ReactNode } from 'react'

/** The Access Client ID this dashboard holds keys for on the fake Controller. */
export const DASHBOARD_ACCESS_CLIENT_ID = 'dashboard-access-client'

/**
 * Render dashboard UI against a fake Controller through the shared
 * Controller client, so tests run the real LAN-then-Relay selection with
 * this browser's Access Client keys.
 */
export function renderWithController(
    ui: ReactNode,
    controller: FakeController
) {
    const accessClientKeyStore = fakeAccessClientKeyStore({
        [controller.controllerId]: DASHBOARD_ACCESS_CLIENT_ID,
    })
    return render(
        <ControllerProvider
            accessClientKeyStore={accessClientKeyStore}
            connectors={fakeControllerConnectors(controller)}
            controllerId={controller.controllerId}
            lanCandidates={[controller.baseUrl]}
        >
            {ui}
        </ControllerProvider>
    )
}
