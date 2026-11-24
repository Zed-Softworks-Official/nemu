import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Device } from './device.ts'
import { devicesInRoom, roomDeletionSummary } from './rooms.ts'

function device(overrides: Partial<Device>): Device {
    return {
        id: 'd',
        name: 'Device',
        type: 'light',
        protocol: 'zigbee',
        externalId: 'ext',
        roomId: null,
        online: true,
        state: {},
        ...overrides,
    }
}

describe('devicesInRoom', () => {
    it('counts Devices in the Room and Devices with a Component there, once each', () => {
        const devices = [
            device({ id: 'lamp', roomId: 'living' }),
            device({
                id: 'strip',
                roomId: 'office',
                componentRooms: { l1: 'living', l2: 'living' },
            }),
            device({ id: 'fan', roomId: 'office' }),
        ]
        assert.equal(devicesInRoom(devices, 'living').length, 2)
        assert.equal(devicesInRoom(devices, 'kitchen').length, 0)
    })
})

describe('roomDeletionSummary', () => {
    it('says how many Devices move and where', () => {
        assert.equal(
            roomDeletionSummary(1, 'Office'),
            '1 Device will move to Office.'
        )
        assert.equal(
            roomDeletionSummary(3, 'No Room'),
            '3 Devices will move to No Room.'
        )
        assert.equal(
            roomDeletionSummary(0, 'No Room'),
            'No Devices are in this Room.'
        )
    })
})
