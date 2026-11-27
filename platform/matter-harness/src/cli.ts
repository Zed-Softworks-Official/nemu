/**
 * Seam 1 harness: Mosquitto, simulated matter.js Devices and the adapter under
 * test, driven only over MQTT and compared with the golden payloads.
 *
 *   node dist/cli.js            run and compare with the golden file
 *   node dist/cli.js --record   run and write the golden file
 *
 * MATTER_HARNESS_ADAPTER_CMD   shell command that starts the adapter
 *                              (default: the Rust adapter's release build)
 * MATTER_HARNESS_GOLDEN        golden file (default: golden/matter-mqtt.json)
 * MATTER_HARNESS_OUTPUT        where this run's normalised output is written
 * MATTER_HARNESS_MQTT_URL      use this broker instead of starting Mosquitto
 * MATTER_HARNESS_STEPS, MATTER_HARNESS_IGNORE_TOPICS,
 * MATTER_HARNESS_UNCHECKED_STEPS
 *                              check only part of the scenario (see scope.ts)
 */
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import {
    Adapter,
    adapterCommand,
    SimulatedDevice,
    type Stoppable,
    startBroker,
} from './processes.ts'
import { Recorder } from './recorder.ts'
import {
    type Harness,
    runScenario,
    STEPS,
    type StepResult,
} from './scenario.ts'
import {
    applyScope,
    FULL_SCOPE,
    isFullScope,
    scopeFromEnv,
    unknownSteps,
} from './scope.ts'

const BASE_TOPIC = 'matter'
const packageDir = new URL('..', import.meta.url).pathname
const goldenPath =
    process.env.MATTER_HARNESS_GOLDEN ??
    join(packageDir, 'golden/matter-mqtt.json')
const outputPath =
    process.env.MATTER_HARNESS_OUTPUT ?? join(packageDir, '.run/last-run.json')
const record = process.argv.includes('--record')
const scope = record ? FULL_SCOPE : scopeFromEnv(process.env)

const log = (line: string) => process.stderr.write(`[harness] ${line}\n`)

async function main(): Promise<number> {
    const unknown = unknownSteps(
        scope,
        STEPS.map((step) => step.name)
    )
    if (unknown.length > 0) {
        log(`unknown steps in MATTER_HARNESS_STEPS: ${unknown.join(', ')}`)
        return 1
    }
    if (!isFullScope(scope))
        log(
            `partial run: steps ${[...(scope.steps ?? ['(all)'])].join(', ')}; ignoring topics ${scope.ignoredTopics.join(', ') || '(none)'}; not comparing ${[...(scope.uncheckedSteps ?? [])].join(', ') || '(none)'}`
        )
    const runDir = await mkdtemp(join(tmpdir(), 'nemu-matter-harness-'))
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

        const devices = {
            plug: new SimulatedDevice(
                'plug',
                join(runDir, 'plug'),
                join(runDir, 'plug.log')
            ),
            light: new SimulatedDevice(
                'light',
                join(runDir, 'light'),
                join(runDir, 'light.log')
            ),
            strip: new SimulatedDevice(
                'strip',
                join(runDir, 'strip'),
                join(runDir, 'strip.log')
            ),
        }
        // The strip starts in its own step, so earlier steps see no change.
        for (const device of [devices.plug, devices.light]) {
            await device.start()
        }
        for (const device of Object.values(devices)) cleanup.push(device)

        const dataDir = join(runDir, 'adapter')
        await mkdir(dataDir, { recursive: true })
        const adapter = new Adapter({
            brokerUrl: broker.url,
            baseTopic: BASE_TOPIC,
            dataDir,
            logFile: join(runDir, 'adapter.log'),
        })
        adapter.start()
        cleanup.push(adapter)

        const harness: Harness = {
            recorder,
            adapter,
            devices,
            names: {},
            ids: {},
            scope,
        }
        const steps = await runScenario(harness, log)
        const output = { steps }
        await mkdir(dirname(outputPath), { recursive: true })
        await writeFile(outputPath, `${JSON.stringify(output, null, 4)}\n`)
        log(`normalised output ${outputPath}`)

        if (record) {
            await mkdir(dirname(goldenPath), { recursive: true })
            await writeFile(goldenPath, `${JSON.stringify(output, null, 4)}\n`)
            log(`recorded ${goldenPath}`)
            return 0
        }
        const golden = JSON.parse(await readFile(goldenPath, 'utf8')) as {
            steps: StepResult[]
        }
        assert.deepStrictEqual(
            { steps: applyScope(steps, scope) },
            { steps: applyScope(golden.steps, scope) },
            `MQTT output differs from ${goldenPath}`
        )
        log('MQTT output matches the golden payloads')
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
