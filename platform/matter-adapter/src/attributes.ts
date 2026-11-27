/**
 * The Nemu-side picture of a Matter node: every attribute the node reported,
 * keyed by `endpoint/cluster/attribute` in decimal, for example `1/6/0` for
 * OnOff on endpoint 1. Values are JSON: integers as numbers, structs as objects
 * (fields by name, or by field ID in older fixtures), octet strings as hex.
 *
 * The Matter session produces snapshots; Mapping and Meters read them.
 */
export type AttributeSnapshot = Readonly<Record<string, unknown>>

/** Decimal node ID, for example `"2"`. Leads every Device ID of the node. */
export type NodeId = string

export function attributeKey(
    endpoint: number,
    cluster: number,
    attribute: number
): string {
    return `${endpoint}/${cluster}/${attribute}`
}
