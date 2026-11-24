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
    it('never carries a Matter pairing code or Wi-Fi credentials', async () => {
        const controller = home(false)
        controller.matterWifi = { configured: true, networkName: 'home' }
        const connection = await connectTo(controller)
        assert.equal(connection.getStatus().mode, 'relay')
        const transport = controller.createTransport('relay', () => 'token')

        // The connection refuses, and so does the Controller if it is asked.
        for (const target of [connection, transport]) {
            await assert.rejects(
                target.commissionMatter({ code: '34970112332' }),
                { code: 'unsupported_action' }
            )
            await assert.rejects(target.getMatterWifi(), {
                code: 'unsupported_action',
            })
            await assert.rejects(
                target.saveMatterWifi({ wifiSsid: 'lake', wifiPassword: 'pw' }),
                { code: 'unsupported_action' }
            )
        }
        assert.equal(controller.matterCommissioning, null)
        assert.deepEqual(controller.matterWifi, {
            configured: true,
            networkName: 'home',
        })
        assert.deepEqual(controller.commissioningRequests, [])
        assert.deepEqual(controller.relayCommissioningAudit, [])
    })

    it('can cancel Matter commissioning that LAN started', async () => {
        const controller = home(true)
        const connection = await connectTo(controller)
        await connection.commissionMatter({ code: '34970112332' })
        controller.lanReachable = false
        await connection.reprobe()
        assert.equal(connection.getStatus().mode, 'relay')

        await connection.cancelMatterCommission()
        assert.equal(controller.matterCommissioning, null)
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

    it('reads and saves Matter Wi-Fi over LAN', async () => {
        const controller = home(true)
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

            if (lanReachable) {
                await assert.rejects(
                    connection.commissionMatter({ code: '34970112332' }),
                    { code: 'inactive_membership' }
                )
            }
            await assert.rejects(connection.permitJoin(180), {
                code: 'inactive_membership',
            })
            assert.equal(controller.matterCommissioning, null)
            assert.equal(controller.zigbeeJoinOpenFor, 0)
            assert.deepEqual(controller.relayCommissioningAudit, [])
        }
    })
})
