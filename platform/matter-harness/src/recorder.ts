import mqtt, { type MqttClient } from 'mqtt'
import { isRecordedTopic, type RawMessage } from './normalise.ts'

export interface Received extends RawMessage {
    at: number
}

/** Records every message under the base topic and publishes requests to it. */
export class Recorder {
    readonly messages: Received[] = []
    #client: MqttClient | undefined
    #lastRecordedAt = Date.now()

    constructor(
        private readonly url: string,
        private readonly baseTopic: string
    ) {}

    async connect(): Promise<void> {
        const client = await mqtt.connectAsync(this.url, {
            clientId: 'nemu-matter-harness',
            clean: true,
        })
        this.#client = client
        const prefix = `${this.baseTopic}/`
        client.on('message', (topic, payload) => {
            if (!topic.startsWith(prefix)) return
            const message = {
                topic: topic.slice(prefix.length),
                payload: payload.toString('utf8'),
                at: Date.now(),
            }
            this.messages.push(message)
            if (isRecordedTopic(message.topic, message.payload))
                this.#lastRecordedAt = message.at
        })
        await client.subscribeAsync(`${this.baseTopic}/#`, { qos: 1 })
    }

    get lastRecordedAt(): number {
        return this.#lastRecordedAt
    }

    async publish(rest: string, payload: unknown): Promise<void> {
        if (!this.#client) throw new Error('recorder is not connected')
        await this.#client.publishAsync(
            `${this.baseTopic}/${rest}`,
            JSON.stringify(payload),
            { qos: 1 }
        )
    }

    async close(): Promise<void> {
        await this.#client?.endAsync(true)
    }
}
