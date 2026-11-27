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

export type DeviceKind = 'light' | 'switch' | 'strip'

/** One outlet of a strip: a Component of the strip Device. */
export interface StripOutlet {
    endpoint: number
    name: string
}

/** One Nemu Device on a Matter node. */
export interface EndpointDevice {
    /**
     * `{nodeId}` when the node is one Device, else `{nodeId}:{endpoint}`, as the
     * Rust adapter (and the golden payloads) have it.
     */
    id: string
    nodeId: NodeId
    /** The endpoint that is controlled; a strip's first outlet. */
    endpoint: number
    /** A strip's outlets, one Component each. */
    outlets?: StripOutlet[]
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
    const model = modelOf(snapshot)
    const vendor = vendorOf(snapshot)
    const { functional, energyOnly } = classify(snapshot)
    const strip = (endpoints: number[], energyEndpoint?: number) => {
        const [first] = endpoints
        if (first === undefined) return []
        const device: EndpointDevice = {
            id: nodeId,
            nodeId,
            endpoint: first,
            outlets: outletsOf(endpoints),
            kind: 'strip',
            defaultName: base,
            model,
            description: describe('strip', vendor),
        }
        if (energyEndpoint !== undefined) device.energyEndpoint = energyEndpoint
        return [device]
    }
    const hasLight = functional.some(([, kind]) => kind === 'light')
    const switches = functional
        .filter(([, kind]) => kind === 'switch')
        .map(([endpoint]) => endpoint)
    // Two or more switches, or metered outlets, and no light are one strip.
    if (switches.length >= 2 && !hasLight) return strip(switches, energyOnly[0])
    if (energyOnly.length >= 2 && !hasLight) return strip(energyOnly)
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

/**
 * `mapNode`, or for a node it cannot classify, one Device over every endpoint:
 * a switch for one endpoint, else a strip. Ported from `map_node_with_fallback`.
 */
export function mapNodeWithFallback(
    nodeId: NodeId,
    snapshot: AttributeSnapshot
): EndpointDevice[] {
    const mapped = mapNode(nodeId, snapshot)
    if (mapped.length > 0) return mapped
    const endpoints = listEndpoints(snapshot)
    const [first] = endpoints
    if (first === undefined) return []
    const kind: DeviceKind = endpoints.length === 1 ? 'switch' : 'strip'
    const device: EndpointDevice = {
        id: nodeId,
        nodeId,
        endpoint: first,
        kind,
        defaultName: baseName(snapshot, nodeId),
        model: modelOf(snapshot),
        description: describe(kind, vendorOf(snapshot)),
    }
    if (kind === 'strip') device.outlets = outletsOf(endpoints)
    return [device]
}

/**
 * The `{nodeId}:{endpoint}` IDs a node had before its endpoints were folded
 * into one Device, so Core can drop them. Empty unless the node is now one
 * Device with the bare node ID. Ported from `collapsed_legacy_ids`.
 */
export function collapsedLegacyIds(
    nodeId: NodeId,
    snapshot: AttributeSnapshot
): string[] {
    const mapped = mapNode(nodeId, snapshot)
    if (mapped.length !== 1 || mapped[0]?.id !== nodeId) return []
    const { functional, energyOnly } = classify(snapshot)
    const controlsHaveEnergy = functional.some(([endpoint]) =>
        hasEnergyMeasurement(snapshot, endpoint)
    )
    const energyEndpoint = controlsHaveEnergy ? undefined : energyOnly[0]
    const endpoints = functional.map(([endpoint]) => endpoint)
    if (energyEndpoint !== undefined) endpoints.push(energyEndpoint)
    if (endpoints.length <= 1) return []
    return endpoints.map((endpoint) => `${nodeId}:${endpoint}`)
}

/** Whether a set naming this endpoint is for this Device. */
export function deviceCoversEndpoint(
    device: EndpointDevice,
    endpoint: number
): boolean {
    return (
        device.outlets?.some((outlet) => outlet.endpoint === endpoint) ===
            true ||
        device.energyEndpoint === endpoint ||
        device.endpoint === endpoint
    )
}

function outletsOf(endpoints: number[]): StripOutlet[] {
    return endpoints.map((endpoint, index) => ({
        endpoint,
        name: `Outlet ${index + 1}`,
    }))
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

/** Controllable endpoints, and endpoints that only measure power and energy. */
function classify(snapshot: AttributeSnapshot): {
    functional: [number, DeviceKind][]
    energyOnly: number[]
} {
    const functional: [number, DeviceKind][] = []
    const energyOnly: number[] = []
    for (const endpoint of listEndpoints(snapshot)) {
        const kind = endpointKind(snapshot, endpoint)
        if (kind) functional.push([endpoint, kind])
        else if (hasEnergyMeasurement(snapshot, endpoint))
            energyOnly.push(endpoint)
    }
    return { functional, energyOnly }
}

function modelOf(snapshot: AttributeSnapshot): string {
    return (
        asText(
            attr(snapshot, 0, CLUSTER_BASIC_INFORMATION, ATTR_PRODUCT_NAME)
        ) || 'Matter device'
    )
}

function vendorOf(snapshot: AttributeSnapshot): string {
    return (
        asText(
            attr(snapshot, 0, CLUSTER_BASIC_INFORMATION, ATTR_VENDOR_NAME)
        ) ?? ''
    )
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
        kind === 'light'
            ? 'Matter light'
            : kind === 'strip'
              ? 'Matter smart strip'
              : 'Matter on/off plug-in unit'
    return vendor ? `${what} (${vendor})` : what
}
