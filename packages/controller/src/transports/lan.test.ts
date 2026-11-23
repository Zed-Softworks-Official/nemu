import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { after, before, beforeEach, describe, it } from 'node:test'
import { LanTransport } from './lan.ts'

type Received = { method: string; path: string; body: unknown }

const lamp = {
    id: 'lamp',
    name: 'Desk lamp',
    type: 'light',
    online: true,
    roomId: 'den',
}

let server: Server
let baseUrl: string
let received: Received[] = []
let reply: (request: Received) => { status: number; body?: unknown } = () => ({
    status: 200,
    body: lamp,
})

before(async () => {
    server = createServer((req, res) => {
        let raw = ''
        req.on('data', (chunk) => {
            raw += chunk
        })
        req.on('end', () => {
            const request = {
                method: req.method ?? '',
                path: req.url ?? '',
                body: raw ? JSON.parse(raw) : undefined,
            }
            received.push(request)
            const { status, body } = reply(request)
            res.writeHead(status, { 'content-type': 'application/json' })
            res.end(body === undefined ? '' : JSON.stringify(body))
        })
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

after(() => {
    server.close()
})

beforeEach(() => {
    received = []
    reply = () => ({ status: 200, body: lamp })
})

function lan(): LanTransport {
    return new LanTransport({ baseUrl, getToken: () => 'token-a' })
}

describe('LanTransport Device and Room setup', () => {
    it('renames a Device', async () => {
        assert.deepEqual(
            (await lan().renameDevice({ deviceId: 'lamp', name: 'Desk lamp' }))
                .name,
            'Desk lamp'
        )
        assert.deepEqual(received, [
            {
                method: 'PATCH',
                path: '/api/devices/lamp',
                body: { name: 'Desk lamp' },
            },
        ])
    })

    it('assigns a Device to a Room and clears it with null', async () => {
        await lan().assignRoom({ deviceId: 'lamp', roomId: 'den' })
        await lan().assignRoom({ deviceId: 'lamp', roomId: null })
        assert.deepEqual(
            received.map(({ path, body }) => ({ path, body })),
            [
                { path: '/api/devices/lamp', body: { roomId: 'den' } },
                { path: '/api/devices/lamp', body: { roomId: null } },
            ]
        )
    })

    it('assigns a Component to a Room', async () => {
        await lan().assignRoom({
            deviceId: 'strip',
            componentId: 'l 2',
            roomId: 'hall',
        })
        assert.deepEqual(received, [
            {
                method: 'PUT',
                path: '/api/devices/strip/components/l%202/room',
                body: { roomId: 'hall' },
            },
        ])
    })

    it('removes a Device', async () => {
        reply = () => ({ status: 204 })
        await lan().removeDevice('lamp')
        assert.deepEqual(
            received.map(({ method, path }) => ({ method, path })),
            [{ method: 'DELETE', path: '/api/devices/lamp' }]
        )
    })

    it('creates and renames a Room', async () => {
        reply = ({ body }) => ({
            status: 200,
            body: { id: 'den', name: (body as { name: string }).name },
        })
        assert.deepEqual(await lan().createRoom({ name: 'Den' }), {
            id: 'den',
            name: 'Den',
        })
        assert.deepEqual(
            await lan().renameRoom({ roomId: 'den', name: 'Study' }),
            { id: 'den', name: 'Study' }
        )
        assert.deepEqual(
            received.map(({ method, path, body }) => ({ method, path, body })),
            [
                { method: 'POST', path: '/api/rooms', body: { name: 'Den' } },
                {
                    method: 'PATCH',
                    path: '/api/rooms/den',
                    body: { name: 'Study' },
                },
            ]
        )
    })

    it('surfaces the Controller error code', async () => {
        reply = () => ({
            status: 403,
            body: {
                error: {
                    code: 'inactive_membership',
                    message: 'This Membership is not active',
                },
            },
        })
        await assert.rejects(
            lan().renameDevice({ deviceId: 'lamp', name: 'Lamp' }),
            { code: 'inactive_membership' }
        )
    })

    it('keeps the Devices that block a Room deletion', async () => {
        const details = {
            devices: [{ id: 'lamp', name: 'Desk lamp' }],
            components: [],
        }
        reply = () => ({
            status: 409,
            body: {
                error: {
                    code: 'room_not_empty',
                    message: 'Move these to another Room first: Desk lamp',
                    details,
                },
            },
        })
        await assert.rejects(lan().deleteRoom('den'), {
            code: 'room_not_empty',
            details,
        })
    })

    it('reports a Controller without the setup route as unsupported_action', async () => {
        reply = () => ({ status: 405 })
        await assert.rejects(
            lan().assignRoom({
                deviceId: 'strip',
                componentId: 'l2',
                roomId: 'hall',
            }),
            { code: 'unsupported_action' }
        )
    })
})
