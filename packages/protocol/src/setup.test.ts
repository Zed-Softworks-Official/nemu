import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { assignRoomRequestSchema, deleteRoomRequestSchema } from './api.ts'
import { deviceSchema } from './device.ts'
import {
    relayToClientEnvelopeSchema,
    relayToControllerEnvelopeSchema,
} from './relay.ts'

const lamp = {
    id: 'lamp',
    name: 'Lamp',
    type: 'light',
    online: true,
    roomId: 'den',
    componentRooms: { l2: 'hall' },
}

describe('Device and Room setup requests over Relay', () => {
    for (const message of [
        { type: 'renameDevice', deviceId: 'lamp', name: 'Desk lamp' },
        { type: 'assignRoom', deviceId: 'lamp', roomId: 'den' },
        { type: 'assignRoom', deviceId: 'lamp', roomId: null },
        {
            type: 'assignRoom',
            deviceId: 'strip',
            componentId: 'l2',
            roomId: 'hall',
        },
        { type: 'removeDevice', deviceId: 'lamp' },
        { type: 'createRoom', name: 'Den' },
        { type: 'updateRoom', roomId: 'den', name: 'Study' },
        { type: 'deleteRoom', roomId: 'den', destinationRoomId: 'hall' },
        { type: 'deleteRoom', roomId: 'den', destinationRoomId: null },
    ]) {
        it(`carries ${message.type} unchanged`, () => {
            const envelope = relayToControllerEnvelopeSchema.parse({
                requestId: 'r1',
                clientToken: 't',
                message,
            })
            assert.deepEqual(envelope.message, message)
        })
    }

    it('rejects a Room deletion without a destination', () => {
        assert.equal(
            relayToControllerEnvelopeSchema.safeParse({
                requestId: 'r1',
                clientToken: 't',
                message: { type: 'deleteRoom', roomId: 'den' },
            }).success,
            false
        )
    })

    it('rejects a rename without a name', () => {
        assert.equal(
            relayToControllerEnvelopeSchema.safeParse({
                requestId: 'r1',
                clientToken: 't',
                message: { type: 'renameDevice', deviceId: 'lamp', name: ' ' },
            }).success,
            false
        )
    })
})

describe('Device and Room setup outcomes over Relay', () => {
    it('returns the updated Device in the same shape as LAN', () => {
        const parsed = relayToClientEnvelopeSchema.parse({
            requestId: 'r1',
            signature: 's',
            message: { type: 'device', device: lamp },
        })
        assert.equal(parsed.message.type, 'device')
        assert.deepEqual(
            parsed.message.type === 'device' && parsed.message.device,
            deviceSchema.parse(lamp)
        )
    })

    it('returns the created or renamed Room', () => {
        const parsed = relayToClientEnvelopeSchema.parse({
            requestId: 'r1',
            signature: 's',
            message: {
                type: 'room',
                room: { id: 'den', name: 'Den', sortOrder: 0 },
            },
        })
        assert.deepEqual(parsed.message, {
            type: 'room',
            room: { id: 'den', name: 'Den', sortOrder: 0 },
        })
    })
})

describe('Device Component Rooms', () => {
    it('keeps Component Room assignments on a Device', () => {
        assert.deepEqual(deviceSchema.parse(lamp).componentRooms, {
            l2: 'hall',
        })
    })

    it('requires roomId to be explicit so a missing field never clears it', () => {
        assert.equal(
            assignRoomRequestSchema.safeParse({ deviceId: 'lamp' }).success,
            false
        )
        assert.deepEqual(
            assignRoomRequestSchema.parse({ deviceId: 'lamp', roomId: null }),
            { deviceId: 'lamp', roomId: null }
        )
    })
})

describe('Deleting a Room over LAN', () => {
    it('takes another Room or No Room as the destination', () => {
        assert.deepEqual(
            deleteRoomRequestSchema.parse({ destinationRoomId: 'hall' }),
            { destinationRoomId: 'hall' }
        )
        assert.deepEqual(
            deleteRoomRequestSchema.parse({ destinationRoomId: null }),
            { destinationRoomId: null }
        )
        assert.equal(deleteRoomRequestSchema.safeParse({}).success, false)
    })
})
