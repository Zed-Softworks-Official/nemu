/**
 * The container's health check (Dockerfile HEALTHCHECK). It asks the running
 * adapter over MQTT, as Core does, so it fails when the adapter is wedged or
 * off the broker. It connects with its own client ID: reusing the adapter's
 * would disconnect the adapter.
 *
 *   node dist/healthcheck.js   exit 0 when the adapter answers within 4 s
 */
import { randomUUID } from 'node:crypto'
import mqtt from 'mqtt'
import { configFromEnv } from './config.ts'

export interface HealthProbeTransport {
    publish(topic: string, payload: string): Promise<void>
    onMessage(listener: (topic: string, payload: string) => void): void
}

/** True when `{base}/bridge/response/health/check` answers ok for `transaction`. */
export function probeHealth(
    transport: HealthProbeTransport,
    base: string,
    transaction: string,
    timeoutMs: number
): Promise<boolean> {
    return new Promise((resolve) => {
        const timer = setTimeout(() => resolve(false), timeoutMs)
        transport.onMessage((topic, payload) => {
            if (topic !== `${base}/bridge/response/health/check`) return
            if (isOk(payload, transaction)) {
                clearTimeout(timer)
                resolve(true)
            }
        })
        transport
            .publish(
                `${base}/bridge/request/health/check`,
                JSON.stringify({ transaction })
            )
            .catch(() => {
                clearTimeout(timer)
                resolve(false)
            })
    })
}

function isOk(payload: string, transaction: string): boolean {
    try {
        const body = JSON.parse(payload) as Record<string, unknown>
        return body.transaction === transaction && body.status === 'ok'
    } catch {
        return false
    }
}

async function main(): Promise<number> {
    const config = configFromEnv()
    const base = config.mqttBaseTopic
    const client = await mqtt.connectAsync({
        host: config.mqttHost,
        port: config.mqttPort,
        clientId: `nemu-matter-healthcheck-${randomUUID()}`,
        clean: true,
        reconnectPeriod: 0,
        connectTimeout: 3_000,
    })
    try {
        await client.subscribeAsync(`${base}/bridge/response/health/check`)
        const healthy = await probeHealth(
            {
                publish: async (topic, payload) => {
                    await client.publishAsync(topic, payload, { qos: 1 })
                },
                onMessage: (listener) =>
                    client.on('message', (topic, payload) =>
                        listener(topic, payload.toString('utf8'))
                    ),
            },
            base,
            randomUUID(),
            4_000
        )
        return healthy ? 0 : 1
    } finally {
        await client.endAsync(true).catch(() => {})
    }
}

if (import.meta.url === `file://${process.argv[1]}`) {
    process.exitCode = await main().catch(() => 1)
}
