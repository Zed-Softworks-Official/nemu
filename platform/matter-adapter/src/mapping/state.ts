/** The Device state published on `{id}`, from what the Device reported. */
import type { DeviceState } from '@nemu/protocol'
import type { AttributeSnapshot } from '../attributes.ts'
import { ATTR_ON_OFF, CLUSTER_ON_OFF } from './clusters.ts'
import type { EndpointDevice } from './node.ts'
import { attr } from './snapshot.ts'

export function stateForDevice(
    device: EndpointDevice,
    snapshot: AttributeSnapshot
): DeviceState {
    const state = stateForEndpoint(snapshot, device.endpoint)
    if (device.energyEndpoint !== undefined)
        Object.assign(state, stateForEndpoint(snapshot, device.energyEndpoint))
    return state
}

export function stateForEndpoint(
    snapshot: AttributeSnapshot,
    endpoint: number
): Record<string, unknown> {
    const state: Record<string, unknown> = {}
    const on = attr(snapshot, endpoint, CLUSTER_ON_OFF, ATTR_ON_OFF)
    if (typeof on === 'boolean') state.state = on ? 'ON' : 'OFF'
    // TODO(NEM-116): brightness, color_temp and color.
    return state
}
