import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { ApiError } from '@nemu/protocol'
import { ControllerConnection } from './connection.ts'
import {
    createMemoryCredentialStore,
    FakeController,
    fakeControllerConnectors,
} from './testing.ts'

const connections: ControllerConnection[] = []

afterEach(() => {
    for (const connection of connections.splice(0)) connection.stop()
})

async function connectTo(controller: FakeController) {
    const connection = new ControllerConnection({
        reprobeIntervalMs: 60_000,
        controllerId: controller.controllerId,
        credentialStore: createMemoryCredentialStore({
            [controller.controllerId]: { clientToken: 'token' },
        }),
        lanCandidates: [controller.baseUrl],
        connectors: fakeControllerConnectors(controller),
    })
    connections.push(connection)
    await connection.start()
    return connection
}

function home(lanReachable: boolean) {
    return new FakeController({
        controllerId: 'lake',
        acceptedTokens: ['token'],
        lanReachable,
    })
}

function isLanOnlyRejection(error: unknown): boolean {
    return (
        error instanceof ApiError &&
        error.code === 'unsupported_action' &&
        /Home network/.test(error.message)
    )
}

describe('Commissioning over LAN', () => {
    it('opens and closes Zigbee permit-join on the Controller', async () => {
        const controller = home(true)
        const connection = await connectTo(controller)

        const opened = await connection.permitJoin(180)
        assert.deepEqual(opened, { ok: true, seconds: 180 })
        assert.equal(controller.zigbeeJoinOpenFor, 180)

        await connection.permitJoin(0)
        assert.equal(controller.zigbeeJoinOpenFor, 0)
        assert.deepEqual(controller.commissioningRequests, [
            { type: 'permitJoin', via: 'lan' },
            { type: 'permitJoin', via: 'lan' },
        ])
    })

    it('hands the Matter pairing code to the Controller and cancels there', async () => {
        const controller = home(true)
        const connection = await connectTo(controller)

        await connection.commissionMatter({ code: '34970112332' })
        assert.equal(controller.matterCommissioning?.code, '34970112332')

        await connection.cancelMatterCommission()
        assert.equal(controller.matterCommissioning, null)
        assert.deepEqual(controller.commissioningRequests, [
            { type: 'commissionMatter', via: 'lan' },
            { type: 'cancelMatterCommission', via: 'lan' },
        ])
    })
})

describe('Commissioning over Relay', () => {
    it('is rejected at once with unsupported_action and never sent', async () => {
        const controller = home(false)
        const connection = await connectTo(controller)
        assert.equal(connection.getStatus().mode, 'relay')

        await assert.rejects(
            connection.commissionMatter({ code: '34970112332' }),
            isLanOnlyRejection
        )
        await assert.rejects(connection.permitJoin(180), isLanOnlyRejection)
        await assert.rejects(
            connection.cancelMatterCommission(),
            isLanOnlyRejection
        )
        assert.deepEqual(controller.commissioningRequests, [])
        assert.equal(controller.matterCommissioning, null)
        assert.equal(controller.zigbeeJoinOpenFor, 0)
    })

    it('is refused by the Controller if a Relay request reaches it', async () => {
        const controller = home(false)
        const relay = controller.createTransport('relay', () => 'token')

        await assert.rejects(
            relay.commissionMatter({ code: '34970112332' }),
            isLanOnlyRejection
        )
        await assert.rejects(relay.permitJoin(180), isLanOnlyRejection)
        assert.equal(controller.matterCommissioning, null)
        assert.equal(controller.zigbeeJoinOpenFor, 0)
    })
})
