import { ControllerProvider } from '@nemu/controller'
import {
    createMemoryCredentialStore,
    FakeController,
    fakeControllerConnectors,
} from '@nemu/controller/testing'
import type { Device } from '@nemu/protocol'
import {
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from '@testing-library/react-native'

import { DeviceNameAndRoom } from '~/components/device-setup'
import { HomeControlProvider, useHomeControl } from '~/components/home-control'

const PLUG: Device = {
    id: 'plug',
    name: 'Desk Plug',
    type: 'outlet',
    protocol: 'zigbee',
    externalId: 'plug-ext',
    roomId: null,
    online: true,
    state: { state: 'OFF' },
}

async function renderSurface(
    controller: FakeController,
    view: React.ReactNode
) {
    const credentialStore = createMemoryCredentialStore()
    credentialStore.set(controller.controllerId, { clientToken: 'token' })
    await render(
        <ControllerProvider
            connectors={fakeControllerConnectors(controller)}
            controllerId={controller.controllerId}
            credentialStore={credentialStore}
            lanCandidates={[controller.baseUrl]}
        >
            <HomeControlProvider>{view}</HomeControlProvider>
        </ControllerProvider>
    )
}

const button = (name: string | RegExp) => screen.getByRole('button', { name })
const press = (name: string | RegExp) => fireEvent.press(button(name))

describe('naming a Device and choosing its Room', () => {
    function Step({ onSaved }: { onSaved: () => void }) {
        const { devices } = useHomeControl()
        const device = devices?.find((d) => d.id === 'plug')
        return device ? (
            <DeviceNameAndRoom
                device={device}
                onSaved={onSaved}
                saveTitle="Finish"
            />
        ) : null
    }

    it('saves both in one step, for use after adding a Device', async () => {
        const controller = new FakeController({
            controllerId: 'lake',
            acceptedTokens: ['token'],
            devices: [structuredClone(PLUG)],
            rooms: [{ id: 'living', name: 'Living Room', sortOrder: 1 }],
        })
        const onSaved = jest.fn()
        await renderSurface(controller, <Step onSaved={onSaved} />)
        await screen.findByLabelText('Device name')

        await fireEvent.changeText(
            screen.getByLabelText('Device name'),
            'Kettle'
        )
        await fireEvent.press(
            within(screen.getByLabelText('Room')).getByRole('button', {
                name: 'Living Room',
            })
        )
        await press('Finish')

        await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
        expect(controller.devices[0]).toMatchObject({
            name: 'Kettle',
            roomId: 'living',
        })
    })
})
