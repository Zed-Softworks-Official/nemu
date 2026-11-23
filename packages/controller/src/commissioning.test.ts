import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
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
    it('hands the Matter pairing code to the Controller and audits it once', async () => {
        const controller = home(false)
        const connection = await connectTo(controller)
        assert.equal(connection.getStatus().mode, 'relay')

        await connection.commissionMatter({ code: '34970112332' })
        assert.equal(controller.matterCommissioning?.code, '34970112332')
        await connection.cancelMatterCommission()
        assert.equal(controller.matterCommissioning, null)

        assert.deepEqual(controller.commissioningRequests, [
            { type: 'commissionMatter', via: 'relay' },
            { type: 'cancelMatterCommission', via: 'relay' },
        ])
        assert.deepEqual(controller.relayCommissioningAudit, [
            { protocol: 'matter' },
        ])
    })

    it('opens Zigbee permit-join and audits only the opening', async () => {
        const controller = home(false)
        const connection = await connectTo(controller)

        const opened = await connection.permitJoin(180)
        assert.deepEqual(opened, { ok: true, seconds: 180 })
        assert.equal(controller.zigbeeJoinOpenFor, 180)
        await connection.permitJoin(0)
        assert.equal(controller.zigbeeJoinOpenFor, 0)

        assert.deepEqual(controller.relayCommissioningAudit, [
            { protocol: 'zigbee' },
        ])
    })

    it('reads and saves the Controller’s Matter Wi-Fi', async () => {
        const controller = home(false)
        const connection = await connectTo(controller)

        assert.deepEqual(await connection.getMatterWifi(), {
            configured: false,
        })
        assert.deepEqual(
            await connection.saveMatterWifi({
                wifiSsid: 'home',
                wifiPassword: 'pw',
            }),
            { configured: true, networkName: 'home' }
        )
        assert.deepEqual(controller.relayCommissioningAudit, [])
    })

    it('is refused for an inactive Membership on either transport', async () => {
        for (const lanReachable of [true, false]) {
            const controller = home(lanReachable)
            controller.membershipActive = false
            const connection = await connectTo(controller)

            await assert.rejects(
                connection.commissionMatter({ code: '34970112332' }),
                { code: 'inactive_membership' }
            )
            await assert.rejects(connection.permitJoin(180), {
                code: 'inactive_membership',
            })
            assert.equal(controller.matterCommissioning, null)
            assert.equal(controller.zigbeeJoinOpenFor, 0)
            assert.deepEqual(controller.relayCommissioningAudit, [])
        }
    })
})
