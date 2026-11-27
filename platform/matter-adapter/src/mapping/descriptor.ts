/** The `bridge/devices` entry for a Device. */
import type { BridgeDevice } from '@nemu/protocol'
import type { AttributeSnapshot } from '../attributes.ts'
import {
    ATTR_COLOR_TEMP_MAX,
    ATTR_COLOR_TEMP_MIN,
    ATTR_CURRENT_LEVEL,
    ATTR_MAX_LEVEL,
    ATTR_MIN_LEVEL,
    CLUSTER_COLOR_CONTROL,
    CLUSTER_LEVEL_CONTROL,
} from './clusters.ts'
import type { EndpointDevice } from './node.ts'
import { asNumber, attr } from './snapshot.ts'

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

/** A change to one of these changes the descriptor's `exposes`. */
export function isLimitAttribute(cluster: number, attribute: number): boolean {
    if (cluster === CLUSTER_LEVEL_CONTROL)
        return attribute === ATTR_MIN_LEVEL || attribute === ATTR_MAX_LEVEL
    return (
        cluster === CLUSTER_COLOR_CONTROL &&
        (attribute === ATTR_COLOR_TEMP_MIN || attribute === ATTR_COLOR_TEMP_MAX)
    )
}

function features(
    device: EndpointDevice,
    snapshot: AttributeSnapshot
): Feature[] {
    const { endpoint } = device
    const features = [STATE_FEATURE]
    // A strip's outlets are on/off only.
    if (device.kind === 'strip') return features
    if (device.kind === 'light') {
        features.push(brightnessFeature(snapshot, endpoint))
        const colorTemp = colorTempFeature(snapshot, endpoint)
        if (colorTemp) features.push(colorTemp)
    } else if (
        // A dimmable plug is a switch with a level.
        attr(snapshot, endpoint, CLUSTER_LEVEL_CONTROL, ATTR_CURRENT_LEVEL) !==
        undefined
    ) {
        features.push(brightnessFeature(snapshot, endpoint))
    }
    return features
}

function numericFeature(property: string, min: number, max: number): Feature {
    return {
        type: 'numeric',
        name: property,
        property,
        access: 7,
        value_min: min,
        value_max: max,
    }
}

/** A limit attribute as the Rust adapter reads it: an unsigned integer. */
function limit(
    snapshot: AttributeSnapshot,
    endpoint: number,
    cluster: number,
    attribute: number
): number | undefined {
    const value = asNumber(attr(snapshot, endpoint, cluster, attribute))
    return value !== undefined && Number.isInteger(value) && value >= 0
        ? value
        : undefined
}

/** The level range. The optional limits default to the cluster's 0-254. */
function brightnessFeature(
    snapshot: AttributeSnapshot,
    endpoint: number
): Feature {
    const level = (id: number) =>
        limit(snapshot, endpoint, CLUSTER_LEVEL_CONTROL, id)
    return numericFeature(
        'brightness',
        level(ATTR_MIN_LEVEL) ?? 0,
        Math.min(level(ATTR_MAX_LEVEL) ?? 254, 254)
    )
}

/** The color temperature range in mireds, when the Device reports both ends. */
function colorTempFeature(
    snapshot: AttributeSnapshot,
    endpoint: number
): Feature | undefined {
    const mireds = (id: number) =>
        limit(snapshot, endpoint, CLUSTER_COLOR_CONTROL, id)
    const min = mireds(ATTR_COLOR_TEMP_MIN)
    const max = mireds(ATTR_COLOR_TEMP_MAX)
    if (min === undefined || max === undefined) return undefined
    return numericFeature('color_temp', min, max)
}
