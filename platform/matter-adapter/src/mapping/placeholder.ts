/**
 * A node in the fabric whose attributes map to no Device yet, for example one
 * that joined the fabric but failed before its first read. It still appears in
 * the inventory, so a Device in the fabric is never missing from the Home.
 * Ported from the Rust adapter's `placeholder_device`.
 */
import type { AttributeSnapshot, NodeId } from '../attributes.ts'
import { type EndpointDevice, mapNodeWithFallback } from './node.ts'

export function placeholderDevice(nodeId: NodeId): EndpointDevice {
    return {
        id: nodeId,
        nodeId,
        endpoint: 1,
        kind: 'switch',
        defaultName: `Matter ${nodeId}`,
        model: 'Matter device',
        description: 'Matter device',
    }
}

export function isPlaceholder(device: EndpointDevice): boolean {
    return (
        JSON.stringify(device) ===
        JSON.stringify(placeholderDevice(device.nodeId))
    )
}

/** The node's Devices (with the Rust fallback), or its placeholder when none map. */
export function mapNodeOrPlaceholder(
    nodeId: NodeId,
    snapshot: AttributeSnapshot
): EndpointDevice[] {
    const devices = mapNodeWithFallback(nodeId, snapshot)
    return devices.length > 0 ? devices : [placeholderDevice(nodeId)]
}
