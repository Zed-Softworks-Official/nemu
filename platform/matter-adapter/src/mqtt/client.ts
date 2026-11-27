/** The broker connection, over mqtt.js, with the Rust adapter's session settings. */
import mqtt, { type MqttClient } from 'mqtt'
import type { Config } from '../config.ts'
import type { Log } from '../log.ts'
import type { MqttTransport } from './bus.ts'
import { SUBSCRIPTIONS } from './topics.ts'

export interface MqttConnection extends MqttTransport {
    /** Called on every (re)connect, once the subscriptions are in place. */
    onConnect(listener: () => void | Promise<void>): void
    close(): Promise<void>
}

export function connectMqtt(config: Config, log: Log): MqttConnection {
    const base = config.mqttBaseTopic
    const client: MqttClient = mqtt.connect({
        host: config.mqttHost,
        port: config.mqttPort,
        clientId: config.mqttClientId,
        clean: false,
        keepalive: 30,
        reconnectPeriod: 2_000,
        will: {
            topic: `${base}/bridge/state`,
            payload: Buffer.from(JSON.stringify({ state: 'offline' })),
            qos: 1,
            retain: true,
        },
    })
    const connectListeners: (() => void | Promise<void>)[] = []
    client.on('connect', () => {
        log.info(`mqtt connected to ${config.mqttHost}:${config.mqttPort}`)
        client
            .subscribeAsync(SUBSCRIPTIONS(base), { qos: 1 })
            .then(async () => {
                for (const listener of connectListeners) await listener()
            })
            .catch((error: unknown) =>
                log.error(`mqtt subscribe failed: ${String(error)}`)
            )
    })
    client.on('error', (error) => log.warn(`mqtt error: ${error.message}`))
    client.on('offline', () => log.warn('mqtt offline; reconnecting'))

    return {
        async publish(topic, payload, { retain }) {
            await client.publishAsync(topic, payload, { qos: 1, retain })
        },
        onMessage(listener) {
            client.on('message', (topic, payload) => {
                void listener(topic, payload.toString('utf8'))
            })
        },
        onConnect(listener) {
            connectListeners.push(listener)
        },
        async close() {
            await client.endAsync()
        },
    }
}
