import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ApiError } from '@nemu/protocol'
import { roomActionMessage } from './room-presentation.ts'

describe('roomActionMessage', () => {
    it('names the Devices and Components that keep a Room from being deleted', () => {
        const error = new ApiError('room_not_empty', 'Room not empty', 409, {
            devices: [{ id: 'lamp', name: 'Desk lamp' }],
            components: [
                {
                    deviceId: 'strip',
                    deviceName: 'Power strip',
                    componentId: 'l2',
                },
            ],
        })
        assert.equal(
            roomActionMessage(error),
            'Move Desk lamp and Power strip (l2) to another room first.'
        )
    })

    it('falls back to the Controller message without details', () => {
        assert.equal(
            roomActionMessage(
                new ApiError('room_not_empty', 'Move them first')
            ),
            'Move them first'
        )
        assert.equal(roomActionMessage(new Error('Boom')), 'Boom')
    })
})
