/** The `bridge/devices` entry for a Device. */
import type { BridgeDevice } from '@nemu/protocol'
import type { AttributeSnapshot } from '../attributes.ts'
import type { EndpointDevice } from './node.ts'

type Expose = BridgeDevice['definition']['exposes'][number]
type Feature = Expose['features'][number]

const STATE_FEATURE: Feature = {
    type: 'binary',
    name: 'state',
    property: 'state',
    access: 7,
    value_on: 'ON',
    value_off: 'OFF',
}

export function deviceDescriptor(
    device: EndpointDevice,
    friendlyName: string,
    snapshot: AttributeSnapshot
): BridgeDevice {
    return {
        external_id: device.id,
        ieee_address: device.id,
        friendly_name: friendlyName,
        type: device.kind,
        supported: true,
        definition: {
            model: device.model,
            description: device.description,
            exposes: [
                { type: device.kind, features: features(device, snapshot) },
            ],
        },
    }
}

function features(
    _device: EndpointDevice,
    _snapshot: AttributeSnapshot
): Feature[] {
    // TODO(NEM-116): lights and dimmable plugs add brightness, and lights
    // color_temp, with the Device's own limits from the snapshot.
    return [STATE_FEATURE]
}
