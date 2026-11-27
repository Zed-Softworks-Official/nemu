/** Attribute snapshots shared by the Meters tests. */
import type { AttributeSnapshot } from '../attributes.ts'
import { deviceTypes } from '../mapping/fixtures.test-support.ts'

/**
 * The Rust adapter's `plug-under-load` fixture
 * (`platform/matter/fixtures/plug-under-load.json`), unchanged: ActivePower
 * reads 0 while RMSPower shows a 60 W load, and the energy record carries a
 * Device end timestamp.
 */
export const PLUG_UNDER_LOAD_FIXTURE: AttributeSnapshot = {
    '0/29/0': [{ '0': 22, '1': 1 }],
    '0/40/3': 'Smart Plug',
    '1/29/0': [{ '0': 14, '1': 1 }],
    '1/144/8': 0,
    '1/144/13': 60000,
    '1/144/11': 120100,
    '1/144/12': 500,
    '1/145/1': { '0': 1500000, '2': 1700000000 },
    '2/29/0': [{ '0': 266, '1': 1 }],
    '2/6/0': true,
}

/** The Rust meter tests' inline `plug_under_load()` (no Device timestamp). */
export const PLUG_UNDER_LOAD: AttributeSnapshot = {
    '0/29/0': deviceTypes(22),
    '0/40/3': 'Smart Plug',
    '1/29/0': deviceTypes(14),
    '1/144/8': 0,
    '1/144/13': 60_000,
    '1/144/11': 120_100,
    '1/144/12': 500,
    '1/145/1': { '0': 1_500_000 },
    '2/29/0': deviceTypes(266),
    '2/6/0': true,
}
