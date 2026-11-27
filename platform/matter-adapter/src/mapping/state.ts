/** The Device state published on `{id}`, from what the Device reported. */
import type { DeviceState } from '@nemu/protocol'
import type { AttributeSnapshot } from '../attributes.ts'
import {
    ATTR_COLOR_TEMPERATURE,
    ATTR_CURRENT_LEVEL,
    ATTR_CURRENT_X,
    ATTR_CURRENT_Y,
    ATTR_ON_OFF,
    CLUSTER_COLOR_CONTROL,
    CLUSTER_LEVEL_CONTROL,
    CLUSTER_ON_OFF,
} from './clusters.ts'
import type { EndpointDevice } from './node.ts'
import { asNumber, attr } from './snapshot.ts'

export function stateForDevice(
    device: EndpointDevice,
    snapshot: AttributeSnapshot
): DeviceState {
    // A strip nests each outlet's state, with its Component ID and name.
    const state: Record<string, unknown> = device.outlets
        ? {
              outlets: device.outlets.map((outlet) => ({
                  ...stateForEndpoint(snapshot, outlet.endpoint),
                  id: String(outlet.endpoint),
                  name: outlet.name,
              })),
          }
        : stateForEndpoint(snapshot, device.endpoint)
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
    const level = asNumber(
        attr(snapshot, endpoint, CLUSTER_LEVEL_CONTROL, ATTR_CURRENT_LEVEL)
    )
    if (level !== undefined)
        state.brightness = Math.min(Math.max(Math.round(level), 0), 254)
    const colorTemp = asNumber(
        attr(snapshot, endpoint, CLUSTER_COLOR_CONTROL, ATTR_COLOR_TEMPERATURE)
    )
    if (colorTemp !== undefined && colorTemp > 0)
        state.color_temp = Math.round(colorTemp)
    const x = asNumber(
        attr(snapshot, endpoint, CLUSTER_COLOR_CONTROL, ATTR_CURRENT_X)
    )
    const y = asNumber(
        attr(snapshot, endpoint, CLUSTER_COLOR_CONTROL, ATTR_CURRENT_Y)
    )
    if (x !== undefined && y !== undefined)
        state.color = { x: round4(x / 65536), y: round4(y / 65536) }
    return state
}

export function round4(value: number): number {
    return Math.round(value * 10_000) / 10_000
}
