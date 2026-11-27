import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { AttributeSnapshot, NodeId } from './attributes.ts'
import type { Log } from './log.ts'
import type {
    AttributeChanges,
    CommissionRequest,
    MatterSession,
} from './matter/session.ts'
import { MqttBus } from './mqtt/bus.ts'
import { FakeTransport } from './mqtt/fake-transport.test-support.ts'
import { type Names, Service } from './service.ts'

const quiet: Log = { info() {}, warn() {}, error() {} }

const PLUG: AttributeSnapshot = {
    '0/40/1': 'Nemu Harness',
    '0/40/3': 'Harness Plug',
    '0/29/0': [{ deviceType: 22, revision: 1 }],
    '1/29/0': [{ deviceType: 266, revision: 1 }],
    '1/6/0': false,
}

/** A fabric in memory. Invokes succeed, but the Device reports only when told to. */
class FakeSession implements MatterSession {
    nodes = new Map<NodeId, Record<string, unknown>>()
    invoked: unknown[][] = []
    failInvoke: Error | undefined
    joining: AttributeSnapshot | undefined = PLUG
    /** Nodes that answer; absent means not yet known. */
    online = new Map<NodeId, boolean>()
    removed: [NodeId, 'decommissioned' | 'forgotten'][] = []
    #listeners: ((nodeId: NodeId, changes: AttributeChanges) => void)[] = []
    #reachability: ((nodeId: NodeId, reachable: boolean) => void)[] = []
    #nextNode = 1

    async start() {}
    async close() {}
    nodeIds() {
        return [...this.nodes.keys()]
    }
    snapshot(nodeId: NodeId) {
        return this.nodes.get(nodeId)
    }
    isPairingCode(code: string) {
        return /^\d{11}$/.test(code)
    }
    async commission(request: CommissionRequest) {
        if (!this.joining) throw new Error('no device answered')
        if (request.signal?.aborted) throw new Error('aborted')
        const nodeId = String(this.#nextNode++)
        this.nodes.set(nodeId, { ...this.joining })
        return nodeId
    }
    async invoke(...args: unknown[]) {
        this.invoked.push(args)
        if (this.failInvoke) throw this.failInvoke
    }
    onAttributes(
        listener: (nodeId: NodeId, changes: AttributeChanges) => void
    ) {
        this.#listeners.push(listener)
    }
    reachable(nodeId: NodeId) {
        return this.online.get(nodeId)
    }
    onReachability(listener: (nodeId: NodeId, reachable: boolean) => void) {
        this.#reachability.push(listener)
    }
    async remove(nodeId: NodeId) {
        const outcome =
            this.online.get(nodeId) === false ? 'forgotten' : 'decommissioned'
        this.removed.push([nodeId, outcome])
        this.nodes.delete(nodeId)
        return outcome
    }
    /** The node starts or stops answering. */
    setReachable(nodeId: NodeId, reachable: boolean) {
        this.online.set(nodeId, reachable)
        for (const listener of this.#reachability) listener(nodeId, reachable)
    }
    /** The Device reports an attribute change. */
    report(nodeId: NodeId, changes: AttributeChanges) {
        Object.assign(this.nodes.get(nodeId) ?? {}, changes)
        for (const listener of this.#listeners) listener(nodeId, changes)
    }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 10))

/** Names in memory; `saved` is what a restart would read back. */
class MemoryNames implements Names {
    saved = new Map<string, string>()
    get(id: string) {
        return this.saved.get(id)
    }
    async set(id: string, name: string) {
        this.saved.set(id, name)
    }
    async retainOnly(keep: ReadonlySet<string>) {
        for (const id of [...this.saved.keys()])
            if (!keep.has(id)) this.saved.delete(id)
    }
}

async function started(
    session = new FakeSession(),
    names: Names = new MemoryNames()
) {
    const transport = new FakeTransport()
    const bus = new MqttBus(transport, 'matter', quiet)
    const service = new Service(session, bus, quiet, { names })
    await service.start()
    return { session, transport, names }
}

type Descriptor = { external_id: string; friendly_name: string }
const lastDevices = (transport: FakeTransport) =>
    transport.on('matter/bridge/devices').at(-1) as Descriptor[]

async function commissionedPlug() {
    const harness = await started()
    await harness.transport.deliver(
        'matter/bridge/request/commission',
        JSON.stringify({ code: '34970112332', transaction: 't1' })
    )
    await settle()
    return harness
}

describe('Service', () => {
    it('publishes an empty inventory at start', async () => {
        const { transport } = await started()
        assert.deepEqual(transport.on('matter/bridge/devices'), [[]])
    })

    it('acknowledges a commission, then publishes the new Device', async () => {
        const { transport } = await commissionedPlug()
        assert.deepEqual(transport.on('matter/bridge/response/commission'), [
            { status: 'ok', transaction: 't1' },
        ])
        const devices = transport.on('matter/bridge/devices').at(-1) as {
            external_id: string
            friendly_name: string
        }[]
        assert.equal(devices[0]?.external_id, '1')
        assert.equal(devices[0]?.friendly_name, 'Harness Plug')
        assert.deepEqual(transport.on('matter/1'), [{ state: 'OFF' }])
        assert.deepEqual(transport.on('matter/1/availability'), [
            { state: 'online' },
        ])
    })

    it('refuses a commission without a pairing code', async () => {
        const { transport } = await started()
        await transport.deliver(
            'matter/bridge/request/commission',
            JSON.stringify({ transaction: 't2' })
        )
        assert.deepEqual(transport.on('matter/bridge/response/commission'), [
            {
                status: 'error',
                error: 'pairing code is required',
                transaction: 't2',
            },
        ])
    })

    it('refuses an unreadable pairing code before acknowledging', async () => {
        const { transport } = await started()
        await transport.deliver(
            'matter/bridge/request/commission',
            JSON.stringify({ code: 'nonsense', transaction: 't3' })
        )
        assert.deepEqual(transport.on('matter/bridge/response/commission'), [
            {
                status: 'error',
                error: 'pairing code is required',
                transaction: 't3',
            },
        ])
    })

    it('reports a failed commission as a failed interview', async () => {
        const session = new FakeSession()
        session.joining = undefined
        const { transport } = await started(session)
        await transport.deliver(
            'matter/bridge/request/commission',
            JSON.stringify({ code: '34970112332' })
        )
        await settle()
        assert.deepEqual(transport.on('matter/bridge/event'), [
            {
                type: 'device_interview',
                data: {
                    ieee_address: 'commissioning',
                    status: 'failed',
                    error: 'no device answered',
                },
            },
        ])
    })

    it('publishes no confirmed state when the Device never reports it', async () => {
        const { session, transport } = await commissionedPlug()
        await transport.deliver('matter/1/set', JSON.stringify({ state: 'ON' }))
        await settle()
        assert.deepEqual(session.invoked, [['1', 1, 6, 1, undefined]])
        assert.deepEqual(transport.on('matter/1'), [{ state: 'OFF' }])
    })

    it('publishes the state once the Device reports it', async () => {
        const { session, transport } = await commissionedPlug()
        await transport.deliver('matter/1/set', JSON.stringify({ state: 'ON' }))
        session.report('1', { '1/6/0': true })
        await settle()
        assert.deepEqual(transport.on('matter/1'), [
            { state: 'OFF' },
            { state: 'ON' },
        ])
    })

    it('answers a failed invoke with command_failed carrying the Command ID', async () => {
        const { session, transport } = await commissionedPlug()
        session.failInvoke = new Error('timed out')
        await transport.deliver(
            'matter/1/set',
            JSON.stringify({ state: 'ON', transaction: 'cmd-1' })
        )
        await settle()
        assert.deepEqual(transport.on('matter/bridge/event'), [
            {
                type: 'command_failed',
                data: {
                    ieee_address: '1',
                    transaction: 'cmd-1',
                    error: 'timed out',
                },
            },
        ])
        assert.deepEqual(transport.on('matter/1'), [{ state: 'OFF' }])
    })

    describe('rename', () => {
        it('republishes the inventory with the new name and sends no response', async () => {
            const { transport } = await commissionedPlug()
            await transport.deliver(
                'matter/bridge/request/device/rename',
                JSON.stringify({ from: '1', to: 'Kettle', transaction: 'r1' })
            )
            assert.equal(lastDevices(transport)[0]?.friendly_name, 'Kettle')
            assert.deepEqual(
                transport.on('matter/bridge/response/device/rename'),
                []
            )
        })

        it('keeps the name across a restart', async () => {
            const { session, transport, names } = await commissionedPlug()
            await transport.deliver(
                'matter/bridge/request/device/rename',
                JSON.stringify({ from: '1', to: 'Kettle' })
            )
            const restarted = await started(session, names)
            assert.deepEqual(
                lastDevices(restarted.transport),
                lastDevices(transport)
            )
            assert.equal(
                lastDevices(restarted.transport)[0]?.friendly_name,
                'Kettle'
            )
        })

        it('ignores a rename without both names', async () => {
            const { transport } = await commissionedPlug()
            const before = transport.published.length
            await transport.deliver(
                'matter/bridge/request/device/rename',
                JSON.stringify({ from: '1' })
            )
            assert.equal(transport.published.length, before)
        })
    })

    describe('remove', () => {
        it('decommissions a reachable Device and clears its topics', async () => {
            const { session, transport } = await commissionedPlug()
            session.setReachable('1', true)
            await transport.deliver(
                'matter/bridge/request/device/remove',
                JSON.stringify({ id: '1', transaction: 'rm1' })
            )
            assert.deepEqual(session.removed, [['1', 'decommissioned']])
            assert.deepEqual(lastDevices(transport), [])
            for (const topic of [
                'matter/1',
                'matter/1/availability',
                'matter/1/capabilities',
                'matter/1/observations',
            ])
                assert.equal(transport.on(topic).at(-1), null, topic)
            assert.deepEqual(transport.on('matter/bridge/event'), [
                { type: 'device_leave', data: { ieee_address: '1' } },
            ])
            assert.deepEqual(
                transport.on('matter/bridge/response/device/remove'),
                [{ status: 'ok', data: { id: '1' }, transaction: 'rm1' }]
            )
        })

        it('still forgets a Device that is offline', async () => {
            const { session, transport } = await commissionedPlug()
            session.setReachable('1', false)
            await transport.deliver(
                'matter/bridge/request/device/remove',
                JSON.stringify({ id: '1' })
            )
            assert.deepEqual(session.removed, [['1', 'forgotten']])
            assert.deepEqual(lastDevices(transport), [])
        })

        it("forgets the removed Device's name", async () => {
            const { transport, names } = await commissionedPlug()
            await transport.deliver(
                'matter/bridge/request/device/rename',
                JSON.stringify({ from: '1', to: 'Kettle' })
            )
            await transport.deliver(
                'matter/bridge/request/device/remove',
                JSON.stringify({ id: '1' })
            )
            assert.equal(names.get('1'), undefined)
        })

        it('ignores reports from a node while it is being removed', async () => {
            const { session, transport } = await commissionedPlug()
            await transport.deliver(
                'matter/bridge/request/device/remove',
                JSON.stringify({ id: '1' })
            )
            session.nodes.set('1', { ...PLUG })
            session.report('1', { '1/6/0': true })
            session.setReachable('1', false)
            await settle()
            assert.equal(transport.on('matter/1').at(-1), null)
            assert.equal(transport.on('matter/1/availability').at(-1), null)
        })

        it('requires a Device ID', async () => {
            const { transport } = await commissionedPlug()
            await transport.deliver(
                'matter/bridge/request/device/remove',
                JSON.stringify({ transaction: 'rm2' })
            )
            assert.deepEqual(
                transport.on('matter/bridge/response/device/remove'),
                [
                    {
                        status: 'error',
                        error: 'device id is required',
                        transaction: 'rm2',
                    },
                ]
            )
        })
    })

    describe('availability', () => {
        it('publishes offline when the Device stops answering', async () => {
            const { session, transport } = await commissionedPlug()
            const before = transport.published.length
            session.setReachable('1', false)
            await settle()
            assert.deepEqual(
                transport.published.slice(before).map((m) => m.topic),
                ['matter/1/availability']
            )
            assert.deepEqual(transport.on('matter/1/availability').at(-1), {
                state: 'offline',
            })
        })

        it('republishes the inventory when it answers again', async () => {
            const { session, transport } = await commissionedPlug()
            session.setReachable('1', false)
            await settle()
            const before = transport.published.length
            session.setReachable('1', true)
            await settle()
            assert.deepEqual(
                transport.published.slice(before).map((m) => m.topic),
                ['matter/bridge/devices', 'matter/1', 'matter/1/availability']
            )
            assert.deepEqual(transport.on('matter/1/availability').at(-1), {
                state: 'online',
            })
        })

        it('publishes nothing when a Device that is online connects', async () => {
            const { session, transport } = await commissionedPlug()
            const before = transport.published.length
            session.setReachable('1', true)
            await settle()
            assert.equal(transport.published.length, before)
        })

        it('starts offline after a restart when the Device is unreachable', async () => {
            const session = new FakeSession()
            session.nodes.set('1', { ...PLUG })
            session.online.set('1', false)
            const { transport } = await started(session)
            assert.deepEqual(transport.on('matter/1/availability'), [
                { state: 'offline' },
            ])
        })
    })

    it('restores Devices from the fabric at start without commissioning', async () => {
        const session = new FakeSession()
        session.nodes.set('1', { ...PLUG })
        const { transport } = await started(session)
        assert.equal(lastDevices(transport)[0]?.external_id, '1')
        assert.deepEqual(transport.on('matter/1'), [{ state: 'OFF' }])
    })

    it('lists a node in the fabric that maps to no Device', async () => {
        const session = new FakeSession()
        session.nodes.set('4', {})
        const { transport } = await started(session)
        assert.deepEqual(
            lastDevices(transport).map((d) => [d.external_id, d.friendly_name]),
            [['4', 'Matter 4']]
        )
    })

    it('replaces a placeholder with the real Devices once the node reports', async () => {
        const session = new FakeSession()
        session.nodes.set('1', {})
        const { transport } = await started(session)
        session.report('1', { ...PLUG })
        await settle()
        assert.deepEqual(
            lastDevices(transport).map((d) => [d.external_id, d.friendly_name]),
            [['1', 'Harness Plug']]
        )
        assert.deepEqual(transport.on('matter/1').at(-1), { state: 'OFF' })
    })
})
