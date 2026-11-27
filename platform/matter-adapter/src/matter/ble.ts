/**
 * Whether the adapter commissions over Bluetooth LE, and on which HCI adapter.
 *
 * BLE is optional. A host with no Bluetooth adapter (CI, a macOS dev machine,
 * a container started without the HCI device) still runs the adapter, and it
 * commissions on-network only.
 *
 * `MATTER_BLE_ENABLE`:
 * - unset or `auto` (default): on when Linux has `/sys/class/bluetooth/hci<id>`.
 * - `true`: always try. On macOS noble uses CoreBluetooth instead of HCI.
 * - `false`: never.
 *
 * `MATTER_BLE_HCI_ID`: the HCI adapter number, default 0 (`hci0`).
 *
 * matter.js reads `MATTER_*` variables into its own settings, and these two
 * are its `ble.enable` and `ble.hci.id`; the session sets both explicitly.
 */

export type BleSettings =
    | { enabled: true; hciId: number }
    | { enabled: false; reason: string }

type Env = Readonly<Record<string, string | undefined>>

export interface BleHost {
    platform: NodeJS.Platform
    /** Whether a path exists; used to find the HCI adapter. */
    exists(path: string): boolean
}

export function bleFromEnv(env: Env, host: BleHost): BleSettings {
    const mode =
        (env.MATTER_BLE_ENABLE ?? 'auto').trim().toLowerCase() || 'auto'
    const raw = env.MATTER_BLE_HCI_ID?.trim()
    const hciId = raw && /^\d+$/.test(raw) ? Number(raw) : 0
    if (['0', 'false', 'no', 'off'].includes(mode))
        return { enabled: false, reason: 'MATTER_BLE_ENABLE is false' }
    if (['1', 'true', 'yes', 'on'].includes(mode))
        return { enabled: true, hciId }
    if (host.platform !== 'linux')
        return {
            enabled: false,
            reason: `no HCI adapter on ${host.platform} (set MATTER_BLE_ENABLE=true to try)`,
        }
    if (!host.exists(`/sys/class/bluetooth/hci${hciId}`))
        return { enabled: false, reason: `no Bluetooth adapter hci${hciId}` }
    return { enabled: true, hciId }
}
