import { type ChildProcess, execFile, spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { promisify } from 'node:util'
import {
    DEVICE_FIXTURES,
    type DeviceKind,
    type PowerReading,
} from './fixtures.ts'

const exec = promisify(execFile)

export interface Stoppable {
    stop(): Promise<void>
}

export async function freePort(): Promise<number> {
    return await new Promise((resolve, reject) => {
        const server = createServer()
        server.once('error', reject)
        server.listen(0, '127.0.0.1', () => {
            const address = server.address()
            server.close(() =>
                typeof address === 'object' && address
                    ? resolve(address.port)
                    : reject()
            )
        })
    })
}

async function onPath(binary: string): Promise<boolean> {
    try {
        await exec('sh', ['-c', `command -v ${binary}`])
        return true
    } catch {
        return false
    }
}

function logTo(child: ChildProcess, file: string): void {
    const log = createWriteStream(file, { flags: 'a' })
    child.stdout?.pipe(log)
    child.stderr?.pipe(log)
}

async function stopChild(
    child: ChildProcess,
    signal: NodeJS.Signals = 'SIGTERM'
): Promise<void> {
    if (child.exitCode !== null || child.signalCode !== null) return
    const exited = new Promise<void>((resolve) =>
        child.once('exit', () => resolve())
    )
    child.kill(signal)
    const timer = setTimeout(() => child.kill('SIGKILL'), 5_000)
    await exited
    clearTimeout(timer)
}

export interface Broker extends Stoppable {
    url: string
}

/**
 * Mosquitto on a free local port: `MATTER_HARNESS_MQTT_URL` when set, else a
 * `mosquitto` binary on PATH, else the eclipse-mosquitto image in Docker.
 */
export async function startBroker(runDir: string): Promise<Broker> {
    const external = process.env.MATTER_HARNESS_MQTT_URL
    if (external) return { url: external, stop: async () => {} }
    const port = await freePort()
    if (await onPath('mosquitto')) {
        const child = spawn('mosquitto', ['-p', String(port)], {
            stdio: ['ignore', 'pipe', 'pipe'],
        })
        logTo(child, join(runDir, 'mosquitto.log'))
        await waitForPort(port)
        return { url: `mqtt://127.0.0.1:${port}`, stop: () => stopChild(child) }
    }
    const name = `nemu-matter-harness-${process.pid}-${port}`
    await exec('docker', [
        'run',
        '--detach',
        '--rm',
        '--name',
        name,
        '--publish',
        `127.0.0.1:${port}:1883`,
        'eclipse-mosquitto:2.0.22',
        'mosquitto',
        '-c',
        '/mosquitto-no-auth.conf',
    ])
    await waitForPort(port)
    return {
        url: `mqtt://127.0.0.1:${port}`,
        stop: async () => {
            await exec('docker', ['rm', '--force', name]).catch(() => {})
        },
    }
}

async function waitForPort(port: number, timeoutMs = 20_000): Promise<void> {
    const { connect } = await import('node:net')
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
        const open = await new Promise<boolean>((resolve) => {
            const socket = connect(port, '127.0.0.1')
            socket.once('connect', () => {
                socket.destroy()
                resolve(true)
            })
            socket.once('error', () => resolve(false))
        })
        if (open) return
        await new Promise((resolve) => setTimeout(resolve, 200))
    }
    throw new Error(`nothing listening on 127.0.0.1:${port}`)
}

export interface AdapterOptions {
    brokerUrl: string
    baseTopic: string
    dataDir: string
    logFile: string
}

const RUST_ADAPTER = new URL(
    '../../matter/target/release/nemu-matter',
    import.meta.url
).pathname

/**
 * The adapter under test. `MATTER_HARNESS_ADAPTER_CMD` is a shell command that
 * starts any adapter speaking the MQTT contract; by default it is the Rust
 * adapter's release build. The adapter receives the Controller's environment
 * variables, with test certificates accepted.
 */
export function adapterCommand(): string {
    return (
        process.env.MATTER_HARNESS_ADAPTER_CMD ?? JSON.stringify(RUST_ADAPTER)
    )
}

export class Adapter implements Stoppable {
    #child: ChildProcess | undefined

    constructor(private readonly options: AdapterOptions) {}

    start(): void {
        const broker = new URL(this.options.brokerUrl)
        const { dataDir } = this.options
        this.#child = spawn('sh', ['-c', `exec ${adapterCommand()}`], {
            stdio: ['ignore', 'pipe', 'pipe'],
            env: {
                ...process.env,
                MQTT_HOST: broker.hostname,
                MQTT_PORT: broker.port,
                MQTT_BASE_TOPIC: this.options.baseTopic,
                MQTT_CLIENT_ID: 'nemu-matter',
                MATTER_DATA_DIR: dataDir,
                MATTER_PAA_DIR: join(dataDir, 'paa-roots'),
                MATTER_CD_DIR: join(dataDir, 'cd-roots'),
                // Dev/test only: accept the simulated Devices' test certificates.
                MATTER_ALLOW_EXAMPLE_ROOTS: '1',
                RUST_LOG: process.env.RUST_LOG ?? 'info',
                NO_COLOR: '1',
            },
        })
        logTo(this.#child, this.options.logFile)
    }

    async stop(): Promise<void> {
        if (this.#child) await stopChild(this.#child)
        this.#child = undefined
    }
}

const DEVICE_SCRIPT = new URL('./device.js', import.meta.url).pathname

/** A simulated matter.js Device in its own process, on storage that survives a restart. */
export class SimulatedDevice implements Stoppable {
    #child: ChildProcess | undefined
    manualPairingCode = ''

    constructor(
        readonly kind: DeviceKind,
        private readonly storageDir: string,
        private readonly logFile: string
    ) {}

    async start(): Promise<void> {
        const fixture = DEVICE_FIXTURES[this.kind]
        const child = spawn(
            process.execPath,
            [
                DEVICE_SCRIPT,
                this.kind,
                this.storageDir,
                String(fixture.port),
                String(fixture.discriminator),
                String(fixture.passcode),
            ],
            { stdio: ['pipe', 'pipe', 'pipe'] }
        )
        this.#child = child
        const log = createWriteStream(this.logFile, { flags: 'a' })
        child.stderr?.pipe(log)
        const lines = createInterface({
            input: child.stdout as NodeJS.ReadableStream,
        })
        const ready = new Promise<void>((resolve, reject) => {
            const timer = setTimeout(
                () => reject(new Error(`${this.kind} did not start`)),
                30_000
            )
            child.once('exit', (code) =>
                reject(new Error(`${this.kind} exited with ${code}`))
            )
            lines.on('line', (line) => {
                log.write(`${line}\n`)
                let message: { ready?: boolean; manualPairingCode?: string } =
                    {}
                try {
                    message = JSON.parse(line) as typeof message
                } catch {
                    return
                }
                if (message.ready) {
                    this.manualPairingCode = message.manualPairingCode ?? ''
                    clearTimeout(timer)
                    resolve()
                }
            })
        })
        await ready
    }

    setPower(reading: PowerReading): void {
        this.#child?.stdin?.write(
            `${JSON.stringify({ op: 'power', ...reading })}\n`
        )
    }

    /** Takes the Device off the network at once, as a pulled plug would. */
    async kill(): Promise<void> {
        if (this.#child) await stopChild(this.#child, 'SIGKILL')
        this.#child = undefined
    }

    async stop(): Promise<void> {
        if (this.#child) await stopChild(this.#child)
        this.#child = undefined
    }
}
