/**
 * Which Devices a node is, and their IDs, names and kinds. Ported from the Rust
 * adapter's `map_node`.
 */
import type { AttributeSnapshot, NodeId } from '../attributes.ts'
import {
    ATTR_NODE_LABEL,
    ATTR_ON_OFF,
    ATTR_PRODUCT_NAME,
    ATTR_VENDOR_NAME,
    CLUSTER_BASIC_INFORMATION,
    CLUSTER_ON_OFF,
    DEVICE_TYPE_AGGREGATOR,
    DEVICE_TYPE_ROOT_NODE,
    LIGHT_DEVICE_TYPES,
    PLUG_DEVICE_TYPES,
} from './clusters.ts'
import {
    asText,
    attr,
    deviceTypesOf,
    hasEnergyMeasurement,
    listEndpoints,
} from './snapshot.ts'

export type DeviceKind = 'light' | 'switch'

/** One Nemu Device on a Matter node. */
export interface EndpointDevice {
    /**
     * `{nodeId}` when the node is one Device, else `{nodeId}:{endpoint}`, as the
     * Rust adapter (and the golden payloads) have it.
     */
    id: string
    nodeId: NodeId
    /** The endpoint that is controlled. */
    endpoint: number
    /** An endpoint that only measures power and energy, folded into this Device. */
    energyEndpoint?: number
    kind: DeviceKind
    defaultName: string
    model: string
    description: string
}

export function mapNode(
    nodeId: NodeId,
    snapshot: AttributeSnapshot
): EndpointDevice[] {
    const base = baseName(snapshot, nodeId)
    const model =
        asText(
            attr(snapshot, 0, CLUSTER_BASIC_INFORMATION, ATTR_PRODUCT_NAME)
        ) || 'Matter device'
    const vendor =
        asText(
            attr(snapshot, 0, CLUSTER_BASIC_INFORMATION, ATTR_VENDOR_NAME)
        ) ?? ''
    const functional: [number, DeviceKind][] = []
    const energyOnly: number[] = []
    for (const endpoint of listEndpoints(snapshot)) {
        const kind = endpointKind(snapshot, endpoint)
        if (kind) functional.push([endpoint, kind])
        else if (hasEnergyMeasurement(snapshot, endpoint))
            energyOnly.push(endpoint)
    }
    // TODO(NEM-117): two or more switches (or metered outlets) and no light are
    // one strip Device with outlet Components, as the Rust adapter maps them.
    const single = functional.length === 1
    return functional.map(([endpoint, kind], index) => {
        const suffix =
            kind === 'switch' ? `Outlet ${index + 1}` : String(index + 1)
        const device: EndpointDevice = {
            id: single ? nodeId : `${nodeId}:${endpoint}`,
            nodeId,
            endpoint,
            kind,
            defaultName: single ? base : `${base} · ${suffix}`,
            model,
            description: describe(kind, vendor),
        }
        const energyEndpoint = single ? energyOnly[0] : undefined
        if (energyEndpoint !== undefined) device.energyEndpoint = energyEndpoint
        return device
    })
}

function endpointKind(
    snapshot: AttributeSnapshot,
    endpoint: number
): DeviceKind | undefined {
    const types = deviceTypesOf(snapshot, endpoint)
    const hasOnOff =
        attr(snapshot, endpoint, CLUSTER_ON_OFF, ATTR_ON_OFF) !== undefined
    if (
        types.some(
            (type) =>
                type === DEVICE_TYPE_AGGREGATOR ||
                type === DEVICE_TYPE_ROOT_NODE
        )
    )
        return hasOnOff ? 'switch' : undefined
    if (types.some((type) => LIGHT_DEVICE_TYPES.includes(type))) return 'light'
    if (types.some((type) => PLUG_DEVICE_TYPES.includes(type))) return 'switch'
    return hasOnOff ? 'switch' : undefined
}

function baseName(snapshot: AttributeSnapshot, nodeId: NodeId): string {
    const label = asText(
        attr(snapshot, 0, CLUSTER_BASIC_INFORMATION, ATTR_NODE_LABEL)
    )
    if (label && !label.includes('\u0000')) return label
    const product = asText(
        attr(snapshot, 0, CLUSTER_BASIC_INFORMATION, ATTR_PRODUCT_NAME)
    )
    return product || `Matter ${nodeId}`
}

function describe(kind: DeviceKind, vendor: string): string {
    const what =
        kind === 'light' ? 'Matter light' : 'Matter on/off plug-in unit'
    return vendor ? `${what} (${vendor})` : what
}
