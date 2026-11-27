/** Attribute snapshots shared by the Mapping tests. */
import type { AttributeSnapshot } from '../attributes.ts'
import {
    DEVICE_TYPE_AGGREGATOR,
    DEVICE_TYPE_DIMMABLE_LIGHT,
    DEVICE_TYPE_ON_OFF_PLUG,
    DEVICE_TYPE_ROOT_NODE,
} from './clusters.ts'

/** A Descriptor DeviceTypeList as the Rust adapter decoded it (field IDs). */
export const deviceTypes = (...types: number[]) =>
    types.map((deviceType) => ({ '0': deviceType, '1': 1 }))

/**
 * The harness plug as the matter.js session reports it: struct fields by name,
 * an outlet on endpoint 1 and an electrical sensor on endpoint 2.
 */
export const HARNESS_PLUG: AttributeSnapshot = {
    '0/29/0': [{ deviceType: DEVICE_TYPE_ROOT_NODE, revision: 5 }],
    '0/40/1': 'Nemu Harness',
    '0/40/3': 'Harness Plug',
    '0/40/5': '',
    '1/29/0': [{ deviceType: DEVICE_TYPE_ON_OFF_PLUG, revision: 5 }],
    '1/6/0': false,
    '2/29/0': [{ deviceType: 1296, revision: 1 }],
    '2/144/8': 60_000,
    '2/144/4': 120_100,
    '2/144/5': 500,
    '2/145/1': { energy: 1_500_000 },
}

/** The Rust adapter's `folds_energy_onto_single_plug` case. */
export const PLUG_WITH_AGGREGATOR_METER: AttributeSnapshot = {
    '0/29/0': deviceTypes(DEVICE_TYPE_ROOT_NODE),
    '0/40/3': 'Smart Plug',
    '1/29/0': deviceTypes(DEVICE_TYPE_AGGREGATOR),
    '1/144/8': 8_000,
    '2/29/0': deviceTypes(DEVICE_TYPE_ON_OFF_PLUG),
    '2/6/0': true,
}

/** The Rust adapter's `bulb_attrs`. */
export const BULB: AttributeSnapshot = {
    '0/29/0': deviceTypes(DEVICE_TYPE_ROOT_NODE),
    '0/40/3': 'Bulb A19',
    '1/29/0': deviceTypes(DEVICE_TYPE_DIMMABLE_LIGHT),
    '1/6/0': true,
    '1/8/0': 180,
}
