import type { MqttTransport } from './bus.ts'

export interface Published {
    topic: string
    /** Parsed JSON, or `null` for an empty (clearing) payload. */
    payload: unknown
    retain: boolean
}

/** An in-memory broker connection: records publishes, delivers messages. */
export class FakeTransport implements MqttTransport {
    readonly published: Published[] = []
    #listener:
        | ((topic: string, payload: string) => void | Promise<void>)
        | undefined

    async publish(
        topic: string,
        payload: string,
        options: { retain: boolean }
    ): Promise<void> {
        this.published.push({
            topic,
            payload: payload === '' ? null : JSON.parse(payload),
            retain: options.retain,
        })
    }

    onMessage(
        listener: (topic: string, payload: string) => void | Promise<void>
    ): void {
        this.#listener = listener
    }

    async deliver(topic: string, payload: string): Promise<void> {
        await this.#listener?.(topic, payload)
    }

    /** Publishes to one topic, in order. */
    on(topic: string): unknown[] {
        return this.published
            .filter((message) => message.topic === topic)
            .map((message) => message.payload)
    }
}
