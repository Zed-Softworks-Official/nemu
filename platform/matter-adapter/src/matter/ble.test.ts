import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { type BleHost, bleFromEnv } from './ble.ts'

const linuxWith = (...paths: string[]): BleHost => ({
    platform: 'linux',
    exists: (path) => paths.includes(path),
})

describe('bleFromEnv', () => {
    it('uses hci0 when Linux has it', () => {
        assert.deepEqual(
            bleFromEnv({}, linuxWith('/sys/class/bluetooth/hci0')),
            { enabled: true, hciId: 0 }
        )
    })

    it('stays off without an HCI adapter, so CI still starts', () => {
        assert.deepEqual(bleFromEnv({}, linuxWith()), {
            enabled: false,
            reason: 'no Bluetooth adapter hci0',
        })
    })

    it('looks for the HCI adapter MATTER_BLE_HCI_ID names', () => {
        const host = linuxWith('/sys/class/bluetooth/hci1')
        assert.deepEqual(bleFromEnv({ MATTER_BLE_HCI_ID: '1' }, host), {
            enabled: true,
            hciId: 1,
        })
        assert.equal(bleFromEnv({}, host).enabled, false)
    })

    it('stays off on macOS unless asked for', () => {
        const mac: BleHost = { platform: 'darwin', exists: () => true }
        assert.equal(bleFromEnv({}, mac).enabled, false)
        assert.deepEqual(bleFromEnv({ MATTER_BLE_ENABLE: 'on' }, mac), {
            enabled: true,
            hciId: 0,
        })
    })

    it('can be turned off even with an adapter present', () => {
        assert.equal(
            bleFromEnv(
                { MATTER_BLE_ENABLE: 'off' },
                linuxWith('/sys/class/bluetooth/hci0')
            ).enabled,
            false
        )
    })
})
