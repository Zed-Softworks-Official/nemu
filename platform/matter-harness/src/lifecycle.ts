/**
 * Device lifecycle across adapter restarts and a Home backup (NEM-119), for
 * the matter.js adapter. Unlike cli.ts there is no golden file: the Rust
 * adapter recorded no restart. Each check compares the adapter with itself.
 *
 *   0. Start over a data directory the Rust adapter left (NEM-121): its
 *      Devices leave the Home, its stores move to `rust-adapter-archive/`,
 *      and the new node 1 does not inherit the Rust node 1's name.
 *   1. Commission the plug, rename it, and assign its Capability IDs.
 *   2. Quiesce the adapter as a Home backup does (pause, ADR-0013), copy its
 *      data directory, and resume it.
 *   3. Restart the adapter: the same Devices, names and Capability IDs come
 *      back from the data directory without commissioning, and the plug is
 *      controllable.
 *   4. Restore: start an adapter on the copy taken while paused. The same
 *      fabric and Devices come back.
 *   5. Take the plug offline: it becomes unavailable. Remove it: it leaves
 *      `bridge/devices`, and stays gone after another restart.
 *
 *   node dist/lifecycle.js
 *
 * MATTER_HARNESS_ADAPTER_CMD, MATTER_HARNESS_MQTT_URL and MATTER_HARNESS_KEEP
 * work as for cli.ts.
 */
import assert from 'node:assert/strict'
import { cp, mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { SECOND_LOAD } from './fixtures.ts'
import {
    Adapter,
    adapterCommand,
    SimulatedDevice,
    type Stoppable,
    startBroker,
} from './processes.ts'
import { type Received, Recorder } from './recorder.ts'

const BASE_TOPIC = 'matter'
const NAME = 'Kitchen Kettle'
const RUST_NAME = 'Rust-era Plug'
const log = (line: string) => process.stderr.write(`[lifecycle] ${line}\n`)

interface Observations {
    observations: { capabilityId?: string; identity: { kind: string } }[]
}

interface Descriptor {
    external_id: string
    friendly_name: string
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Messages since `from` on one topic, parsed; `null` for a cleared topic. */
function since(recorder: Recorder, from: number, topic: string): unknown[] {
    return recorder.messages
        .slice(from)
        .filter((message: Received) => message.topic === topic)
        .map((message) =>
            message.payload === '' ? null : JSON.parse(message.payload)
        )
}

async function waitFor<T>(
    what: string,
    check: () => T | undefined,
    timeoutMs = 60_000
): Promise<T> {
    const deadline = Date.now() + timeoutMs
    for (;;) {
        const value = check()
        if (value !== undefined) return value
        if (Date.now() > deadline)
            throw new Error(
                `timed out after ${timeoutMs} ms waiting for ${what}`
            )
        await sleep(200)
    }
}

async function main(): Promise<number> {
    const runDir = await mkdtemp(join(tmpdir(), 'nemu-matter-lifecycle-'))
    log(`run directory ${runDir}`)
    log(`adapter ${adapterCommand()}`)
    const cleanup: Stoppable[] = []
    let keep = process.env.MATTER_HARNESS_KEEP === '1'
    try {
        const broker = await startBroker(runDir)
        cleanup.push(broker)
        const recorder = new Recorder(broker.url, BASE_TOPIC)
        await recorder.connect()
        cleanup.push({ stop: () => recorder.close() })

        const plug = new SimulatedDevice(
            'plug',
            join(runDir, 'plug'),
            join(runDir, 'plug.log')
        )
        await plug.start()
        cleanup.push(plug)

        const dataDir = join(runDir, 'adapter')
        const backupDir = join(runDir, 'backup')
        await mkdir(dataDir, { recursive: true })
        let adapter: Adapter | undefined
        let runs = 0
        cleanup.push({ stop: async () => adapter?.stop() })
        /** Starts an adapter on `dir`; returns the index its messages start at. */
        const startAdapter = (dir: string) => {
            runs += 1
            const from = recorder.messages.length
            adapter = new Adapter({
                brokerUrl: broker.url,
                baseTopic: BASE_TOPIC,
                dataDir: dir,
                logFile: join(runDir, `adapter-${runs}.log`),
            })
            adapter.start()
            return from
        }
        const devicesSince = (from: number) =>
            since(recorder, from, 'bridge/devices').at(-1) as
                | Descriptor[]
                | undefined
        const named = (from: number) => {
            const devices = devicesSince(from)
            return devices?.some((device) => device.friendly_name === NAME)
                ? devices
                : undefined
        }
        const availability = (from: number, id: string) =>
            (
                since(recorder, from, `${id}/availability`).at(-1) as
                    | { state: string }
                    | undefined
            )?.state
        const control = async (from: number, id: string, state: string) => {
            await recorder.publish(`${id}/set`, { state })
            await waitFor(`${id} to report ${state}`, () =>
                since(recorder, from, id).some(
                    (payload) =>
                        (payload as { state?: string } | null)?.state === state
                )
                    ? true
                    : undefined
            )
        }

        log('0. the Rust adapter left Devices 1 and 2:3 here')
        await writeFile(
            join(dataDir, 'adopted-nodes.json'),
            JSON.stringify({ node_ids: [1] })
        )
        await writeFile(
            join(dataDir, 'names.json'),
            JSON.stringify({ names: { '1': RUST_NAME, '2:3': 'Old Lamp' } })
        )
        let from = startAdapter(dataDir)
        await waitFor('the first inventory', () => devicesSince(from))
        const leaves = since(recorder, from, 'bridge/event')
            .filter(
                (event) => (event as { type?: string }).type === 'device_leave'
            )
            .map(
                (event) =>
                    (event as { data: { ieee_address: string } }).data
                        .ieee_address
            )
            .sort()
        assert.deepStrictEqual(leaves, ['1', '2:3'])
        const top = await readdir(dataDir)
        assert.ok(top.includes('rust-adapter-archive'), top.join(', '))
        assert.ok(!top.includes('adopted-nodes.json'), top.join(', '))
        assert.deepStrictEqual(
            // The pending-leaves file goes once the leaves are published.
            (await readdir(join(dataDir, 'rust-adapter-archive')))
                .filter((file) => file !== 'pending-device-leaves.json')
                .sort(),
            ['adopted-nodes.json', 'names.json']
        )

        log('1. commission the plug and rename it')
        await recorder.publish('bridge/request/commission', {
            code: plug.manualPairingCode,
            transaction: 'commission',
        })
        const id = (
            await waitFor(
                'the plug in bridge/devices',
                () => devicesSince(from)?.[0],
                120_000
            )
        ).external_id
        assert.notEqual(devicesSince(from)?.[0]?.friendly_name, RUST_NAME)
        await recorder.publish('bridge/request/device/rename', {
            from: id,
            to: NAME,
        })
        const before = await waitFor('the new name', () => named(from))
        const manifest = await waitFor(
            'the Capability manifest',
            () =>
                since(recorder, from, `${id}/capabilities`).at(-1) as
                    | { capabilities: { identity: { kind: string } }[] }
                    | undefined
        )
        const assigned = (kind: string) => `capability-lifecycle-${kind}`
        await recorder.publish(`${id}/capability-ids`, {
            capabilities: manifest.capabilities.map((capability) => ({
                identity: capability.identity,
                capabilityId: assigned(capability.identity.kind),
            })),
        })
        /** Waits for a reading of `power` mW that carries the assigned IDs. */
        const stamped = (from: number, power: number) =>
            waitFor(`a reading of ${power} mW with the assigned IDs`, () => {
                const report = since(recorder, from, `${id}/observations`).at(
                    -1
                ) as Observations | undefined
                if (!report || !JSON.stringify(report).includes(String(power)))
                    return undefined
                return report.observations.every(
                    (observation) =>
                        observation.capabilityId ===
                        assigned(observation.identity.kind)
                )
                    ? true
                    : undefined
            })

        log('2. quiesce, copy the data directory, resume')
        adapter?.pause()
        await cp(dataDir, backupDir, { recursive: true })
        adapter?.resume()
        await control(from, id, 'ON')

        log('3. restart: Devices and names come back from the data directory')
        await adapter?.stop()
        from = startAdapter(dataDir)
        assert.deepStrictEqual(
            await waitFor('the inventory after restart', () => named(from)),
            before
        )
        await waitFor('the plug online', () =>
            availability(from, id) === 'online' ? true : undefined
        )
        await control(from, id, 'OFF')
        plug.setPower(SECOND_LOAD)
        await stamped(from, SECOND_LOAD.activePower)

        log('4. restore: the copy taken while quiesced brings back the fabric')
        await adapter?.stop()
        from = startAdapter(backupDir)
        // The copy holds the fabric, the node and its name. matter.js may not
        // yet have stored the node's attributes when the adapter was paused,
        // so the Device can first appear as a placeholder until it reports.
        await waitFor('the restored inventory', () =>
            isDeepStrictEqual(devicesSince(from), before) ? true : undefined
        )
        await control(from, id, 'ON')

        log('5. offline: unavailable, then removed while offline')
        await plug.kill()
        await waitFor(
            'the plug offline',
            () => (availability(from, id) === 'offline' ? true : undefined),
            150_000
        )
        await recorder.publish('bridge/request/device/remove', {
            id,
            transaction: 'remove-offline',
        })
        await waitFor('the remove response', () =>
            since(recorder, from, 'bridge/response/device/remove').length > 0
                ? true
                : undefined
        )
        assert.deepStrictEqual(
            since(recorder, from, 'bridge/response/device/remove'),
            [{ status: 'ok', data: { id }, transaction: 'remove-offline' }]
        )
        assert.deepStrictEqual(devicesSince(from), [])
        assert.equal(since(recorder, from, id).at(-1), null)

        await adapter?.stop()
        from = startAdapter(backupDir)
        assert.deepStrictEqual(
            await waitFor('the inventory after removal', () =>
                devicesSince(from)
            ),
            []
        )
        log('lifecycle checks passed')
        return 0
    } catch (error) {
        log(
            error instanceof Error
                ? (error.stack ?? error.message)
                : String(error)
        )
        log(`logs kept in ${runDir}`)
        keep = true
        return 1
    } finally {
        for (const item of cleanup.reverse()) await item.stop().catch(() => {})
        if (!keep) await rm(runDir, { recursive: true, force: true })
    }
}

process.exitCode = await main()
