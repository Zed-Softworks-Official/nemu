import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import type { AttributeSnapshot, NodeId } from './attributes.ts'
import type { Log } from './log.ts'
import type {
    AttributeChanges,
    CommissionRequest,
    MatterSession,
} from './matter/session.ts'
import { Meters } from './meters/index.ts'
import { MqttBus } from './mqtt/bus.ts'
import { FakeTransport } from './mqtt/fake-transport.test-support.ts'
import { Service } from './service.ts'

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
    #listeners: ((nodeId: NodeId, changes: AttributeChanges) => void)[] = []
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
    /** The Device reports an attribute change. */
    report(nodeId: NodeId, changes: AttributeChanges) {
        Object.assign(this.nodes.get(nodeId) ?? {}, changes)
        for (const listener of this.#listeners) listener(nodeId, changes)
    }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 10))

async function started(session = new FakeSession()) {
    const transport = new FakeTransport()
    const bus = new MqttBus(transport, 'matter', quiet)
    const service = new Service(session, bus, quiet)
    await service.start()
    return { session, transport }
}

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
})

const METERED_PLUG: AttributeSnapshot = {
    ...PLUG,
    '2/29/0': [{ deviceType: 1296, revision: 1 }],
    '2/144/8': 60_000,
    '2/144/4': 120_100,
    '2/144/5': 500,
    '2/145/1': { energy: 1_500_000 },
}

const ASSIGNED_IDS = JSON.stringify({
    capabilities: ['power', 'voltage', 'current', 'importedEnergy'].map(
        (kind) => ({
            identity: { kind, physicalScope: { kind: 'device' } },
            capabilityId: `capability-plug-${kind}`,
        })
    ),
})

type Report = { observations: { capabilityId?: string }[] }

describe('Service meters', () => {
    async function meteredPlug(meters = new Meters()) {
        const session = new FakeSession()
        session.joining = METERED_PLUG
        const transport = new FakeTransport()
        const service = new Service(
            session,
            new MqttBus(transport, 'matter', quiet),
            quiet,
            meters
        )
        await service.start()
        await transport.deliver(
            'matter/bridge/request/commission',
            JSON.stringify({ code: '34970112332' })
        )
        await settle()
        return { session, transport }
    }

    it('publishes the Capability manifest and a first reading on commission', async () => {
        const { transport } = await meteredPlug()
        const manifests = transport.on('matter/1/capabilities') as {
            capabilities: unknown[]
        }[]
        assert.equal(manifests.length, 1)
        assert.equal(manifests[0]?.capabilities.length, 4)
        assert.equal(transport.on('matter/1/observations').length, 1)
        assert.equal(
            transport.published.find(
                (message) => message.topic === 'matter/1/observations'
            )?.retain,
            true
        )
    })

    it('does not republish readings for an OnOff change', async () => {
        const { session, transport } = await meteredPlug()
        session.report('1', { '1/6/0': true })
        await settle()
        assert.equal(transport.on('matter/1/observations').length, 1)
    })

    it('stamps assigned Capability IDs from the next load change', async () => {
        const { session, transport } = await meteredPlug()
        await transport.deliver('matter/1/capability-ids', ASSIGNED_IDS)
        await settle()
        assert.equal(transport.on('matter/1/observations').length, 1)
        // Rust republishes the unchanged state on assignment and on a reading.
        assert.equal(transport.on('matter/1').length, 2)
        session.report('1', { '2/144/8': 1_250_000 })
        await settle()
        assert.equal(transport.on('matter/1').length, 3)
        const report = transport.on('matter/1/observations').at(-1) as Report
        assert.deepEqual(
            report.observations.map((entry) => entry.capabilityId),
            [
                'capability-plug-power',
                'capability-plug-voltage',
                'capability-plug-current',
                'capability-plug-importedEnergy',
            ]
        )
    })

    it('keeps assigned Capability IDs across an adapter restart', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'nemu-service-'))
        try {
            const { session, transport } = await meteredPlug(Meters.load(dir))
            await transport.deliver('matter/1/capability-ids', ASSIGNED_IDS)
            await settle()

            // A new process on the same data dir and fabric.
            const restarted = new FakeTransport()
            const service = new Service(
                session,
                new MqttBus(restarted, 'matter', quiet),
                quiet,
                Meters.load(dir)
            )
            await service.start()
            session.report('1', { '2/144/8': 61_000 })
            await settle()
            const report = restarted
                .on('matter/1/observations')
                .at(-1) as Report
            assert.equal(
                report.observations[0]?.capabilityId,
                'capability-plug-power'
            )
        } finally {
            rmSync(dir, { recursive: true, force: true })
        }
    })
})
