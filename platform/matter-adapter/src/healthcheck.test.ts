import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { type HealthProbeTransport, probeHealth } from './healthcheck.ts'
import { MqttBus } from './mqtt/bus.ts'
import { FakeTransport } from './mqtt/fake-transport.test-support.ts'

const quiet = { info() {}, warn() {}, error() {} }

/** A broker with the adapter's bus on it, or with nothing answering. */
function broker(answering: boolean): HealthProbeTransport {
    const adapter = new FakeTransport()
    if (answering) new MqttBus(adapter, 'matter', quiet)
    let listener: ((topic: string, payload: string) => void) | undefined
    const originalPublish = adapter.publish.bind(adapter)
    adapter.publish = async (topic, payload, options) => {
        await originalPublish(topic, payload, options)
        listener?.(topic, payload)
    }
    return {
        async publish(topic, payload) {
            await adapter.deliver(topic, payload)
        },
        onMessage(next) {
            listener = next
        },
    }
}

describe('container health probe', () => {
    it('is healthy when the adapter answers its health check', async () => {
        assert.equal(
            await probeHealth(broker(true), 'matter', 'probe-1', 500),
            true
        )
    })

    it('is unhealthy when nothing answers in time', async () => {
        assert.equal(
            await probeHealth(broker(false), 'matter', 'probe-1', 50),
            false
        )
    })

    it('ignores an answer to another transaction', async () => {
        let listener: ((topic: string, payload: string) => void) | undefined
        const transport: HealthProbeTransport = {
            async publish() {
                listener?.(
                    'matter/bridge/response/health/check',
                    JSON.stringify({
                        status: 'ok',
                        transaction: 'someone-else',
                    })
                )
            },
            onMessage(next) {
                listener = next
            },
        }
        assert.equal(
            await probeHealth(transport, 'matter', 'probe-1', 50),
            false
        )
    })
})
