import type { AccessClientKeyStore } from '@nemu/controller'
import {
    createMemoryAccessClientKeyStore,
    type FakeController,
    fakeControllerConnectors,
    pairFakeAccessClient,
} from '@nemu/controller/testing'

import type { HomeSessionServices } from '~/components/home-session'

/**
 * Home session services for tests: an in-memory key store paired with each
 * given Home under the given Access Client ID, and fake Controller access
 * for `controller`. The active Home starts as `selected`.
 */
export async function pairedServices(
    controller: FakeController,
    options: {
        selected?: string | null
        /** Access Client ID per Controller to pair this phone with. */
        paired?: Array<[FakeController, string]>
    } = {}
): Promise<{
    services: HomeSessionServices
    keyStore: AccessClientKeyStore
}> {
    const keyStore = createMemoryAccessClientKeyStore()
    for (const [home, accessClientId] of options.paired ?? [
        [controller, 'phone'],
    ]) {
        await pairFakeAccessClient(home, keyStore, { accessClientId })
    }
    let selected =
        options.selected === undefined
            ? controller.controllerId
            : options.selected
    const services: HomeSessionServices = {
        accessClientKeyStore: keyStore,
        activeHomeStore: {
            get: () => selected,
            set: (id) => {
                selected = id
            },
            clear: () => {
                selected = null
            },
        },
        connectors: {
            ...fakeControllerConnectors(controller),
            discover: async () =>
                controller.lanReachable
                    ? {
                          baseUrl: controller.baseUrl,
                          health: { status: 'ok' },
                      }
                    : null,
        },
        pairOnLan: async (_home, _baseUrl, code, staging) => {
            await pairFakeAccessClient(controller, staging, { code })
        },
        recordMembership: async () => {},
    }
    return { services, keyStore }
}
