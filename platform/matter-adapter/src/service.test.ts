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
    ble = true
    /** Commission requests in order, and what failed each one (if anything). */
    requests: CommissionRequest[] = []
    failBle: Error | undefined
    failNetwork: Error | undefined
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
        return /^\d{11}$/.test(code.replace(/-/g, ''))
    }
    bleAvailable() {
        return this.ble
    }
    async commission(request: CommissionRequest) {
        this.requests.push(request)
        const failure = request.wifi ? this.failBle : this.failNetwork
        if (failure) throw failure
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
    set(id: string, name: string) {
        this.saved.set(id, name)
    }
    retainOnly(keep: ReadonlySet<string>) {
        for (const id of [...this.saved.keys()])
            if (!keep.has(id)) this.saved.delete(id)
    }
}

async function started(
    session = new FakeSession(),
    log: Log = quiet,
    names: Names = new MemoryNames(),
    meters = new Meters()
) {
    const transport = new FakeTransport()
    const bus = new MqttBus(transport, 'matter', quiet)
    const service = new Service(session, bus, log, meters, names)
    await service.start()
    return { session, transport, names }
}

type Descriptor = { external_id: string; friendly_name: string }
const lastDevices = (transport: FakeTransport) =>
    transport.on('matter/bridge/devices').at(-1) as Descriptor[]

type Event = { type: string; data: Record<string, unknown> }
const events = (transport: FakeTransport) =>
    transport.on('matter/bridge/event') as Event[]
const failures = (transport: FakeTransport) =>
    events(transport).filter((event) => event.data.status === 'failed')
/** The commission_progress stages, in the order published. */
const stages = (transport: FakeTransport) =>
    events(transport)
        .filter((event) => event.type === 'commission_progress')
        .map((event) => event.data.stage)

/** Every `bridge/commissioning` payload, in order. */
const steps = (transport: FakeTransport) =>
    transport.on('matter/bridge/commissioning')

/** A Log that keeps every line, to check what reaches the logs. */
function capturedLog(): Log & { lines: string[] } {
    const lines: string[] = []
    return {
        lines,
        info: (line) => lines.push(line),
        warn: (line) => lines.push(line),
        error: (line) => lines.push(line),
    }
}

const CODE = '34970112332'
const WIFI = { wifiSsid: 'Home', wifiPassword: 'hunter2-secret' }

async function commission(
    session: FakeSession,
    payload: Record<string, unknown>,
    log: Log = quiet
) {
    const harness = await started(session, log)
    await harness.transport.deliver(
        'matter/bridge/request/commission',
        JSON.stringify({ code: CODE, transaction: 't1', ...payload })
    )
    await settle()
    return harness
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
        assert.deepEqual(failures(transport), [
            {
                type: 'device_interview',
                data: {
                    ieee_address: 'commissioning',
                    status: 'failed',
                    error: 'Put the device back in pairing mode and try again. If it is new, enter your 2.4 GHz home Wi-Fi.',
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
        assert.deepEqual(
            events(transport).filter(
                (event) => event.type === 'command_failed'
            ),
            [
                {
                    type: 'command_failed',
                    data: {
                        ieee_address: '1',
                        transaction: 'cmd-1',
                        error: 'timed out',
                    },
                },
            ]
        )
        assert.deepEqual(transport.on('matter/1'), [{ state: 'OFF' }])
    })

    describe('commissioning over BLE onto Wi-Fi', () => {
        it('gives the Device home Wi-Fi when the request names it', async () => {
            const session = new FakeSession()
            const { transport } = await commission(session, WIFI)
            assert.deepEqual(
                session.requests.map((request) => request.wifi),
                [{ ssid: 'Home', password: 'hunter2-secret' }]
            )
            assert.deepEqual(stages(transport), [
                'looking',
                'connecting',
                'wifi',
                'joining',
                'setting_up',
                'connected',
            ])
            assert.equal(
                (transport.on('matter/bridge/devices').at(-1) as unknown[])
                    .length,
                1
            )
        })

        it('acknowledges before the slow BLE step starts', async () => {
            const session = new FakeSession()
            let ackedFirst = false
            const transport = new FakeTransport()
            session.commission = async () => {
                ackedFirst =
                    transport.on('matter/bridge/response/commission').length ===
                    1
                return new Promise<string>(() => {})
            }
            const bus = new MqttBus(transport, 'matter', quiet)
            const service = new Service(session, bus, quiet)
            await service.start()
            await transport.deliver(
                'matter/bridge/request/commission',
                JSON.stringify({ code: CODE, transaction: 't1', ...WIFI })
            )
            await settle()
            assert.equal(ackedFirst, true)
            assert.deepEqual(
                transport.on('matter/bridge/response/commission'),
                [{ status: 'ok', transaction: 't1' }]
            )
        })

        it('publishes each stage as commission_progress and a started interview', async () => {
            const { transport } = await commission(new FakeSession(), {})
            assert.deepEqual(events(transport).slice(0, 2), [
                {
                    type: 'commission_progress',
                    data: {
                        stage: 'looking',
                        message: 'Looking for your device',
                    },
                },
                {
                    type: 'device_interview',
                    data: {
                        ieee_address: 'commissioning',
                        status: 'started',
                        message: 'Looking for your device',
                    },
                },
            ])
            assert.deepEqual(stages(transport), [
                'looking',
                'connecting',
                'joining',
                'setting_up',
                'connected',
            ])
        })

        it('falls back to on-network when BLE fails', async () => {
            const session = new FakeSession()
            session.failBle = new Error('BLE scan found nothing')
            const { transport } = await commission(session, WIFI)
            assert.deepEqual(
                session.requests.map((request) => request.wifi !== undefined),
                [true, false]
            )
            assert.deepEqual(failures(transport), [])
            assert.equal(stages(transport).at(-1), 'connected')
        })

        it('commissions on-network when the host has no Bluetooth adapter', async () => {
            const session = new FakeSession()
            session.ble = false
            const { transport } = await commission(session, WIFI)
            assert.deepEqual(
                session.requests.map((request) => request.wifi),
                [undefined]
            )
            assert.ok(!stages(transport).includes('wifi'))
            assert.equal(stages(transport).at(-1), 'connected')
        })

        it('does not fall back when the Device fails attestation', async () => {
            const session = new FakeSession()
            session.failBle = new Error(
                'device attestation failed: PaaNotTrusted: unknown root'
            )
            const { transport } = await commission(session, WIFI)
            assert.equal(session.requests.length, 1)
            assert.deepEqual(failures(transport), [
                {
                    type: 'device_interview',
                    data: {
                        ieee_address: 'commissioning',
                        status: 'failed',
                        error: 'This device could not be verified. Check that Nemu has Matter trust roots installed.',
                    },
                },
            ])
        })

        it('fails with the Rust adapter answer when both attempts fail', async () => {
            const session = new FakeSession()
            session.failBle = new Error('BLE scan found nothing')
            session.failNetwork = new Error('not discovered')
            const { transport } = await commission(session, WIFI)
            assert.deepEqual(failures(transport), [
                {
                    type: 'device_interview',
                    data: {
                        ieee_address: 'commissioning',
                        status: 'failed',
                        error: 'Put the device back in pairing mode and keep it near the controller.',
                    },
                },
            ])
        })

        it('treats a blank SSID as no Wi-Fi', async () => {
            const session = new FakeSession()
            await commission(session, { wifiSsid: '  ', wifiPassword: 'x' })
            assert.deepEqual(
                session.requests.map((request) => request.wifi),
                [undefined]
            )
        })

        it('lists a commissioned node that maps to no Device as a placeholder', async () => {
            // The Rust adapter's ensure_node_in_index: a node that joined the
            // fabric always appears, so its "did not appear" failure never fires.
            const session = new FakeSession()
            session.joining = { '0/40/3': 'Bridge' }
            const { transport } = await commission(session, {})
            assert.deepEqual(failures(transport), [])
            assert.deepEqual(
                lastDevices(transport).map((d) => [
                    d.external_id,
                    d.friendly_name,
                ]),
                [['1', 'Matter 1']]
            )
            assert.ok(stages(transport).includes('connected'))
        })

        it('never logs the pairing code, passcode or Wi-Fi password', async () => {
            const log = capturedLog()
            const session = new FakeSession()
            // matter.js errors can echo what they were given.
            session.failBle = new Error(
                `PASE failed for ${CODE} (passcode 20202021) on Home with hunter2-secret`
            )
            session.failNetwork = new Error(`3497-011-2332 not discovered`)
            await commission(session, { ...WIFI, code: '3497-011-2332' }, log)
            const output = log.lines.join('\n')
            assert.ok(output.includes('BLE commission failed'), output)
            for (const secret of [
                '3497-011-2332',
                CODE,
                '20202021',
                'hunter2-secret',
            ])
                assert.ok(!output.includes(secret), `${secret} in: ${output}`)
        })
    })

    describe('commissioning progress in Protocol-neutral steps', () => {
        it('publishes each step it reaches, then completed', async () => {
            const { transport } = await commission(new FakeSession(), {})
            assert.deepEqual(steps(transport), [
                { status: 'active', step: 'discovering' },
                { status: 'active', step: 'connecting' },
                { status: 'active', step: 'joining_network' },
                { status: 'active', step: 'setting_up' },
                { status: 'completed' },
            ])
            assert.ok(
                transport.published
                    .filter((m) => m.topic === 'matter/bridge/commissioning')
                    .every((m) => !m.retain)
            )
        })

        it('reports configuring the network when it sends Wi-Fi over BLE', async () => {
            const { transport } = await commission(new FakeSession(), WIFI)
            assert.deepEqual(
                steps(transport).map((p) => (p as { step?: string }).step),
                [
                    'discovering',
                    'connecting',
                    'configuring_network',
                    'joining_network',
                    'setting_up',
                    undefined,
                ]
            )
        })

        it('names verifying as the failed step when attestation fails, before the failed interview', async () => {
            const session = new FakeSession()
            session.failBle = new Error(
                'device attestation failed: PaaNotTrusted: unknown root'
            )
            const { transport } = await commission(session, WIFI)
            assert.deepEqual(steps(transport).at(-1), {
                status: 'failed',
                step: 'verifying',
                reason: 'not_verified',
            })
            const order = transport.published
                .filter(
                    (m) =>
                        m.topic === 'matter/bridge/commissioning' ||
                        m.topic === 'matter/bridge/event'
                )
                .map(
                    (m) =>
                        m.payload as {
                            status?: string
                            data?: { status?: string }
                        }
                )
                .filter(
                    (p) => p.status === 'failed' || p.data?.status === 'failed'
                )
            assert.equal(order.length, 2)
            assert.equal(order[0]?.status, 'failed')
            assert.equal(order[1]?.data?.status, 'failed')
        })

        it('names the network step when the Device cannot join the Wi-Fi', async () => {
            const session = new FakeSession()
            session.failBle = new Error('Wi-Fi association failed: auth')
            session.failNetwork = new Error('not discovered')
            const { transport } = await commission(session, WIFI)
            assert.deepEqual(steps(transport).at(-1), {
                status: 'failed',
                step: 'configuring_network',
                reason: 'network_rejected',
            })
        })

        it('names discovering when no Device is found', async () => {
            const session = new FakeSession()
            session.failNetwork = new Error('not discovered')
            const { transport } = await commission(session, {})
            assert.deepEqual(steps(transport).at(-1), {
                status: 'failed',
                step: 'discovering',
                reason: 'unreachable',
            })
        })

        it('names the step reached before matter.js when an on-network error names none', async () => {
            const session = new FakeSession()
            session.failNetwork = new Error('something odd')
            const { transport } = await commission(session, {})
            assert.deepEqual(steps(transport).at(-1), {
                status: 'failed',
                step: 'connecting',
                reason: 'unreachable',
            })
        })

        it('does not blame the Wi-Fi step for a BLE error that names none', async () => {
            // The wifi stage is announced before the one matter.js call, so
            // it proves nothing about where that call failed.
            const session = new FakeSession()
            session.failBle = new Error('something odd')
            session.failNetwork = new Error('something else odd')
            const { transport } = await commission(session, WIFI)
            assert.ok(
                steps(transport).some(
                    (p) =>
                        (p as { step?: string }).step === 'configuring_network'
                )
            )
            assert.deepEqual(steps(transport).at(-1), {
                status: 'failed',
                step: 'connecting',
                reason: 'unreachable',
            })
        })

        it('blames the step reached before matter.js when BLE times out', async () => {
            const session = new FakeSession()
            session.failBle = new Error('operation timed out')
            session.failNetwork = new Error('something odd')
            const { transport } = await commission(session, WIFI)
            assert.deepEqual(steps(transport).at(-1), {
                status: 'failed',
                step: 'connecting',
                reason: 'timed_out',
            })
        })

        it('never names configuring_network for the on-network fallback', async () => {
            // On-network commissioning sends no Wi-Fi, so it has no network
            // step to fail, whatever the error text says.
            for (const wifi of [{}, WIFI]) {
                const session = new FakeSession()
                session.ble = false
                session.failNetwork = new Error('wifi network commissioning')
                const { transport } = await commission(session, wifi)
                assert.ok(
                    steps(transport).every(
                        (p) =>
                            (p as { step?: string }).step !==
                            'configuring_network'
                    ),
                    JSON.stringify(steps(transport))
                )
                assert.deepEqual(steps(transport).at(-1), {
                    status: 'failed',
                    step: 'connecting',
                    reason: 'unreachable',
                })
            }
        })

        it('completes when the Device maps to nothing, as a placeholder', async () => {
            // A node that joined the fabric always appears (NEM-119), as with
            // the Rust adapter's ensure_node_in_index.
            const session = new FakeSession()
            session.joining = { '0/40/3': 'Bridge' }
            const { transport } = await commission(session, {})
            assert.deepEqual(steps(transport).at(-1), { status: 'completed' })
        })

        it('publishes no failure when the Owner cancels', async () => {
            const session = new FakeSession()
            let release: () => void = () => {}
            session.commission = async (request) => {
                await new Promise<void>((resolve) => {
                    release = resolve
                })
                if (request.signal?.aborted) throw new Error('aborted')
                return '1'
            }
            const { transport } = await commission(session, {})
            await transport.deliver(
                'matter/bridge/request/commission/cancel',
                JSON.stringify({ transaction: 't2' })
            )
            release()
            await settle()
            assert.ok(
                steps(transport).every(
                    (p) => (p as { status: string }).status === 'active'
                ),
                JSON.stringify(steps(transport))
            )
        })

        it('never carries the pairing code, passcode or Wi-Fi credentials', async () => {
            const code = '3497-011-2332'
            const secrets = [code, CODE, '20202021', 'Home', 'hunter2-secret']
            for (const failures of [
                {
                    ble: `PASE failed for ${CODE} (passcode 20202021) on Home with hunter2-secret`,
                    network: `${code} not discovered`,
                },
                {
                    ble: `Wi-Fi Home rejected hunter2-secret`,
                    network: `timed out after ${CODE}`,
                },
                {
                    ble: `attestation failed for ${CODE} on Home/hunter2-secret`,
                    network: '',
                },
            ]) {
                const session = new FakeSession()
                session.failBle = new Error(failures.ble)
                if (failures.network)
                    session.failNetwork = new Error(failures.network)
                const { transport } = await commission(session, {
                    ...WIFI,
                    code,
                })
                const published = steps(transport)
                assert.ok(published.length > 0)
                for (const payload of published) {
                    assert.deepEqual(
                        Object.keys(payload as object).filter(
                            (key) => !['status', 'step', 'reason'].includes(key)
                        ),
                        []
                    )
                    const text = JSON.stringify(payload)
                    for (const secret of secrets)
                        assert.ok(
                            !text.includes(secret),
                            `${secret} in ${text}`
                        )
                }
            }
        })
    })
})

const LIGHT: AttributeSnapshot = {
    '0/40/1': 'Nemu Harness',
    '0/40/3': 'Harness Light',
    '0/29/0': [{ deviceType: 22, revision: 1 }],
    '1/29/0': [{ deviceType: 268, revision: 1 }],
    '1/6/0': true,
    '1/8/0': 100,
    '1/8/2': 1,
    '1/8/3': 254,
    '1/768/7': 250,
    '1/768/16395': 200,
    '1/768/16396': 400,
}

async function commissionedLight() {
    const session = new FakeSession()
    session.joining = LIGHT
    const harness = await started(session)
    await harness.transport.deliver(
        'matter/bridge/request/commission',
        JSON.stringify({ code: '34970112332', transaction: 't1' })
    )
    await settle()
    return harness
}

describe('Service with a light', () => {
    it('sends brightness clamped to 254 and publishes only what the light reports', async () => {
        const { session, transport } = await commissionedLight()
        await transport.deliver(
            'matter/1/set',
            JSON.stringify({ brightness: 300 })
        )
        await settle()
        assert.deepEqual(session.invoked, [
            [
                '1',
                1,
                8,
                0x04,
                {
                    transitionTime: 0,
                    optionsMask: {},
                    optionsOverride: {},
                    level: 254,
                },
            ],
        ])
        assert.deepEqual(transport.on('matter/1'), [
            { state: 'ON', brightness: 100, color_temp: 250 },
        ])
        session.report('1', { '1/8/0': 254 })
        await settle()
        assert.deepEqual(transport.on('matter/1').at(-1), {
            state: 'ON',
            brightness: 254,
            color_temp: 250,
        })
    })

    it('republishes the descriptor when the light changes its limits', async () => {
        const { session, transport } = await commissionedLight()
        const before = transport.on('matter/bridge/devices').length
        session.report('1', { '1/8/0': 120 })
        await settle()
        assert.equal(transport.on('matter/bridge/devices').length, before)
        session.report('1', { '1/768/16396': 370 })
        await settle()
        const devices = transport.on('matter/bridge/devices').at(-1) as {
            definition: { exposes: { features: { value_max?: number }[] }[] }
        }[]
        assert.equal(
            devices[0]?.definition.exposes[0]?.features[2]?.value_max,
            370
        )
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

describe('Service lifecycle', () => {
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
            const restarted = await started(session, quiet, names)
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
            assert.deepEqual(
                events(transport).filter((e) => e.type === 'device_leave'),
                [{ type: 'device_leave', data: { ieee_address: '1' } }]
            )
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

const STRIP: AttributeSnapshot = {
    '0/40/1': 'Nemu Harness',
    '0/40/3': 'Harness Strip',
    '0/29/0': [{ deviceType: 22, revision: 1 }],
    '1/29/0': [{ deviceType: 266, revision: 1 }],
    '1/6/0': false,
    '2/29/0': [{ deviceType: 266, revision: 1 }],
    '2/6/0': false,
}

/** Fails every invoke on endpoint 1, as an outlet that stopped answering. */
class FirstOutletFails extends FakeSession {
    override async invoke(...args: unknown[]) {
        this.invoked.push(args)
        if (args[1] === 1) throw new Error('outlet 1 timed out')
    }
}

async function commissionedStrip(session = new FakeSession()) {
    session.joining = STRIP
    const harness = await started(session)
    await harness.transport.deliver(
        'matter/bridge/request/commission',
        JSON.stringify({ code: '34970112332', transaction: 't1' })
    )
    await settle()
    return harness
}

describe('Service with a strip', () => {
    it('publishes one Device with each outlet in its state', async () => {
        const { transport } = await commissionedStrip()
        const devices = transport.on('matter/bridge/devices').at(-1) as {
            external_id: string
            type: string
        }[]
        assert.deepEqual(
            devices.map((device) => [device.external_id, device.type]),
            [['1', 'strip']]
        )
        assert.deepEqual(transport.on('matter/1').at(-1), {
            outlets: [
                { id: '1', name: 'Outlet 1', state: 'OFF' },
                { id: '2', name: 'Outlet 2', state: 'OFF' },
            ],
        })
    })

    it('announces the folded per-endpoint IDs as gone, once each', async () => {
        const { transport } = await commissionedStrip()
        await transport.deliver(
            'matter/bridge/request/commission',
            JSON.stringify({ code: '34970112332', transaction: 't2' })
        )
        await settle()
        assert.deepEqual(
            events(transport)
                .filter((event) => event.type === 'device_leave')
                .map((event) => event.data.ieee_address),
            ['1:1', '1:2', '2:1', '2:2']
        )
    })

    it('sets only the named outlet, and confirms it from the report', async () => {
        const { session, transport } = await commissionedStrip()
        await transport.deliver(
            'matter/1/set',
            JSON.stringify({ state: 'ON', outlet: '2', transaction: 'c1' })
        )
        await settle()
        assert.deepEqual(
            session.invoked.map((args) => args.slice(0, 4)),
            [['1', 2, 6, 0x01]]
        )
        session.report('1', { '2/6/0': true })
        await settle()
        assert.deepEqual(transport.on('matter/1').at(-1), {
            outlets: [
                { id: '1', name: 'Outlet 1', state: 'OFF' },
                { id: '2', name: 'Outlet 2', state: 'ON' },
            ],
        })
    })

    it('sets every outlet without one, past a failing outlet', async () => {
        const { session, transport } = await commissionedStrip(
            new FirstOutletFails()
        )
        await transport.deliver(
            'matter/1/set',
            JSON.stringify({ state: 'OFF', transaction: 'c2' })
        )
        await settle()
        assert.deepEqual(
            session.invoked.map((args) => args.slice(0, 4)),
            [
                ['1', 1, 6, 0x00],
                ['1', 2, 6, 0x00],
            ]
        )
        assert.deepEqual(
            events(transport)
                .filter((event) => event.type === 'command_failed')
                .map((event) => event.data),
            [
                {
                    ieee_address: '1',
                    transaction: 'c2',
                    error: 'outlet 1 timed out',
                },
            ]
        )
    })

    it('names an outlet from the name store, as the Rust adapter keys it', async () => {
        const session = new FakeSession()
        session.nodes.set('1', { ...STRIP })
        const names = new MemoryNames()
        names.set('1#2', 'Kettle')
        const { transport } = await started(session, quiet, names)
        assert.deepEqual(transport.on('matter/1').at(-1), {
            outlets: [
                { id: '1', name: 'Outlet 1', state: 'OFF' },
                { id: '2', name: 'Kettle', state: 'OFF' },
            ],
        })
    })
})

describe('Service start after the Rust adapter (NEM-121)', () => {
    it('sends the old Devices away before the inventory, clearing their topics', async () => {
        const session = new FakeSession()
        session.nodes.set('1', { ...PLUG })
        const transport = new FakeTransport()
        const bus = new MqttBus(transport, 'matter', quiet)
        await new Service(session, bus, quiet).start(['1', '2', '3:1'])
        const order = transport.published.map((m) => [m.topic, m.payload])
        const devices = order.findIndex(
            ([topic]) => topic === 'matter/bridge/devices'
        )
        const leaves = order.filter(
            ([topic]) => topic === 'matter/bridge/event'
        )
        // Node 1 is on this fabric now, so it stays.
        assert.deepEqual(leaves, [
            [
                'matter/bridge/event',
                { type: 'device_leave', data: { ieee_address: '2' } },
            ],
            [
                'matter/bridge/event',
                { type: 'device_leave', data: { ieee_address: '3:1' } },
            ],
        ])
        const lastLeave = order
            .map(([topic]) => topic)
            .lastIndexOf('matter/bridge/event')
        assert.ok(lastLeave < devices)
        for (const topic of [
            'matter/2',
            'matter/2/availability',
            'matter/2/capabilities',
            'matter/2/observations',
        ])
            assert.deepEqual(transport.on(topic), [null], topic)
        assert.deepEqual(
            lastDevices(transport).map((d) => d.external_id),
            ['1']
        )
    })
})

/**
 * The exact `bridge/event` payloads Core reads, as the Rust adapter published
 * them (platform/matter/src/service.rs `publish_progress`, `drop_node` and the
 * commission failure path, deleted in NEM-121). The harness doesn't record
 * `bridge/event`, so these tests replace golden coverage for it: a payload
 * that gains, loses or renames a field fails here.
 */
describe('bridge/event payloads, pinned to the Rust adapter', () => {
    const bridgeEvents = (transport: FakeTransport) =>
        transport.published.filter(
            (message) => message.topic === 'matter/bridge/event'
        )

    it('commission_progress is {type, data: {stage, message}}, not retained', async () => {
        const { transport } = await commission(new FakeSession(), {})
        assert.deepStrictEqual(bridgeEvents(transport)[0], {
            topic: 'matter/bridge/event',
            payload: {
                type: 'commission_progress',
                data: { stage: 'looking', message: 'Looking for your device' },
            },
            retain: false,
        })
    })

    it('a started device_interview is {ieee_address: "commissioning", status, message}', async () => {
        const { transport } = await commission(new FakeSession(), {})
        assert.deepStrictEqual(bridgeEvents(transport)[1], {
            topic: 'matter/bridge/event',
            payload: {
                type: 'device_interview',
                data: {
                    ieee_address: 'commissioning',
                    status: 'started',
                    message: 'Looking for your device',
                },
            },
            retain: false,
        })
    })

    it('a failed device_interview is {ieee_address: "commissioning", status, error}', async () => {
        const session = new FakeSession()
        session.failNetwork = new Error('not discovered')
        const { transport } = await commission(session, {})
        const failed = bridgeEvents(transport).filter(
            (message) => (message.payload as Event).data.status === 'failed'
        )
        assert.deepStrictEqual(failed, [
            {
                topic: 'matter/bridge/event',
                payload: {
                    type: 'device_interview',
                    data: {
                        ieee_address: 'commissioning',
                        status: 'failed',
                        error: 'Put the device back in pairing mode and try again. If it is new, enter your 2.4 GHz home Wi-Fi.',
                    },
                },
                retain: false,
            },
        ])
    })

    it('device_leave is {ieee_address: <Device ID>}', async () => {
        const { transport } = await commissionedPlug()
        await transport.deliver(
            'matter/bridge/request/device/remove',
            JSON.stringify({ id: '1', transaction: 'rm1' })
        )
        const leaves = bridgeEvents(transport).filter(
            (message) => (message.payload as Event).type === 'device_leave'
        )
        assert.deepStrictEqual(leaves, [
            {
                topic: 'matter/bridge/event',
                payload: { type: 'device_leave', data: { ieee_address: '1' } },
                retain: false,
            },
        ])
    })
})
