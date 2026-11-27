/**
 * Device lifecycle across adapter restarts and a Home backup (NEM-119), for
 * the matter.js adapter. Unlike cli.ts there is no golden file: the Rust
 * adapter recorded no restart. Each check compares the adapter with itself.
 *
 *   1. Commission the plug and rename it.
 *   2. Quiesce the adapter as a Home backup does (pause, ADR-0013), copy its
 *      data directory, and resume it.
 *   3. Restart the adapter: the same Devices and names come back from the
 *      data directory without commissioning, and the plug is controllable.
 *   4. Restore: start an adapter on the copy taken while paused. The same
 *      fabric and Devices come back.
 *   5. Take the plug offline: it becomes unavailable. Remove it: it leaves
 *      `bridge/devices`, and stays gone after another restart.
 *
 * TODO(NEM-118): check that assigned Capability IDs survive the restart too.
 *
 *   node dist/lifecycle.js
 *
 * MATTER_HARNESS_ADAPTER_CMD, MATTER_HARNESS_MQTT_URL and MATTER_HARNESS_KEEP
 * work as for cli.ts.
 */
import assert from 'node:assert/strict'
import { cp, mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
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
const log = (line: string) => process.stderr.write(`[lifecycle] ${line}\n`)

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

        log('1. commission the plug and rename it')
        let from = startAdapter(dataDir)
        await waitFor('the first inventory', () => devicesSince(from))
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
        await recorder.publish('bridge/request/device/rename', {
            from: id,
            to: NAME,
        })
        const before = await waitFor('the new name', () => named(from))

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
