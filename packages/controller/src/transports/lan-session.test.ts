// Seam 3 (NEM-63 spec): `LanTransport` authorized by a Local session that it
// opens, reuses and renews by signing Controller challenges.

import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { createMemoryAccessClientKeyStore } from '../access-client-keys.ts'
import { FakeLanController } from '../fake-lan-controller.ts'
import { LocalSession } from '../local-session.ts'
import { pairWithController } from '../pairing.ts'
import { LanTransport } from './lan.ts'

const CODE = '135790'

let controller: FakeLanController | undefined

afterEach(() => {
    controller?.stop()
    controller = undefined
})

async function pairedHome(now?: () => number) {
    controller = await new FakeLanController({ code: CODE }).start()
    const keyStore = createMemoryAccessClientKeyStore()
    const { enrollment } = await pairWithController(controller.baseUrl, {
        code: CODE,
        clientLabel: 'Kitchen phone',
        userId: 'user_1',
        email: 'owner@example.com',
        keyStore,
    })
    controller.requests.length = 0
    const session = new LocalSession({
        baseUrl: controller.baseUrl,
        controllerId: controller.controllerId,
        keyStore,
        now,
    })
    const lan = new LanTransport({
        baseUrl: controller.baseUrl,
        localSession: session,
    })
    return { lan: controller, transport: lan, enrollment, keyStore }
}

const paths = (lan: FakeLanController) =>
    lan.requests.map((r) => `${r.method} ${r.path}`)

describe('LanTransport with a Local session', () => {
    it('opens a Local session by signing a challenge, then reuses it', async () => {
        const { lan, transport } = await pairedHome()

        assert.deepEqual(await transport.getDevices(), [])
        assert.deepEqual(await transport.getSession(), { role: 'owner' })

        assert.deepEqual(paths(lan), [
            'POST /api/local-sessions/challenge',
            'POST /api/local-sessions',
            'GET /api/devices',
            'GET /api/session',
        ])
        const authorizations = lan.requests
            .filter((r) => r.method === 'GET')
            .map((r) => r.authorization)
        assert.match(authorizations[0] ?? '', /^NemuSession .+/)
        assert.equal(authorizations[0], authorizations[1])
        assert.equal(
            lan.requests.some((r) => r.authorization?.startsWith('Bearer')),
            false
        )
    })

    it('opens one Local session for requests made at once', async () => {
        const { lan, transport } = await pairedHome()
        await Promise.all([
            transport.getDevices(),
            transport.getSession(),
            transport.getDevices(),
        ])
        assert.equal(lan.sessionCount(), 1)
    })

    it('renews before the Local session ends', async () => {
        let now = 1_000_000
        const { lan, transport } = await pairedHome(() => now)
        await transport.getDevices()
        now += 9 * 60_000 + 30_000
        await transport.getDevices()
        assert.equal(
            paths(lan).filter((p) => p === 'POST /api/local-sessions').length,
            2
        )
    })

    it('opens a new Local session once when the Controller ended it', async () => {
        const { lan, transport } = await pairedHome()
        await transport.getDevices()
        lan.expireSessions()

        assert.deepEqual(await transport.getDevices(), [])
        assert.deepEqual(paths(lan).slice(3), [
            'GET /api/devices',
            'POST /api/local-sessions/challenge',
            'POST /api/local-sessions',
            'GET /api/devices',
        ])
    })

    it('tells a revoked Access Client to pair again', async () => {
        const { lan, transport, enrollment } = await pairedHome()
        await transport.getDevices()
        lan.revoke(enrollment.accessClientId)

        await assert.rejects(transport.getDevices(), {
            code: 'unknown_access_client',
        })
    })

    it('reports an Access Client that has no keys for this Home', async () => {
        controller = await new FakeLanController({ code: CODE }).start()
        const transport = new LanTransport({
            baseUrl: controller.baseUrl,
            localSession: new LocalSession({
                baseUrl: controller.baseUrl,
                controllerId: controller.controllerId,
                keyStore: createMemoryAccessClientKeyStore(),
            }),
        })
        await assert.rejects(transport.getDevices(), { code: 'not_paired' })
        assert.deepEqual(controller.requests, [])
    })

    it('authorizes the WebSocket with the Local session in its query', async () => {
        const { lan, transport } = await pairedHome()
        const upgrades: string[] = []
        lan.onUpgrade((url) => upgrades.push(url))

        await assert.rejects(transport.connect())

        assert.equal(upgrades.length, 1)
        const url = new URL(upgrades[0] ?? '', lan.baseUrl)
        assert.equal(url.pathname, '/ws')
        assert.ok(url.searchParams.get('session'))
        assert.equal(url.searchParams.get('token'), null)
        transport.disconnect()
    })
})
