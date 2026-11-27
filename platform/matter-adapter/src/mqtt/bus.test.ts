import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { MqttBus } from './bus.ts'
import { FakeTransport } from './fake-transport.test-support.ts'

const setup = () => {
    const transport = new FakeTransport()
    const errors: string[] = []
    const bus = new MqttBus(transport, 'matter', {
        info: () => {},
        warn: () => {},
        error: (line) => errors.push(line),
    })
    return { transport, bus, errors }
}

describe('MQTT bus', () => {
    it('answers a health check itself, echoing the transaction', async () => {
        const { transport, bus } = setup()
        const handled: string[] = []
        bus.onRequest((incoming) => {
            handled.push(incoming.kind)
        })
        await transport.deliver(
            'matter/bridge/request/health/check',
            '{"transaction":"health-check"}'
        )
        assert.deepEqual(transport.published, [
            {
                topic: 'matter/bridge/response/health/check',
                payload: { status: 'ok', transaction: 'health-check' },
                retain: false,
            },
        ])
        assert.deepEqual(handled, [])
    })

    it('hands every other request to the service', async () => {
        const { transport, bus } = setup()
        const handled: unknown[] = []
        bus.onRequest((incoming) => {
            handled.push(incoming)
        })
        await transport.deliver('matter/2/set', '{"state":"ON"}')
        await transport.deliver('matter/2/unknown', '{}')
        assert.deepEqual(handled, [
            { kind: 'set', deviceId: '2', payload: { state: 'ON' } },
        ])
    })

    it('publishes retained inventory under the base topic', async () => {
        const { transport, bus } = setup()
        await bus.bridgeState('online')
        await bus.devices([])
        await bus.deviceState('2', { state: 'ON' })
        await bus.availability('2', 'online')
        assert.deepEqual(transport.published, [
            {
                topic: 'matter/bridge/state',
                payload: { state: 'online' },
                retain: true,
            },
            { topic: 'matter/bridge/devices', payload: [], retain: true },
            { topic: 'matter/2', payload: { state: 'ON' }, retain: true },
            {
                topic: 'matter/2/availability',
                payload: { state: 'online' },
                retain: true,
            },
        ])
    })

    it('responds with the transaction and only when there is one', async () => {
        const { transport, bus } = setup()
        await bus.respond('commission', 'commission-plug', { status: 'ok' })
        await bus.respond('commission', undefined, {
            status: 'error',
            error: 'pairing code is required',
        })
        assert.deepEqual(
            transport.published.map((message) => message.payload),
            [
                { status: 'ok', transaction: 'commission-plug' },
                { status: 'error', error: 'pairing code is required' },
            ]
        )
    })

    it('publishes an event', async () => {
        const { transport, bus } = setup()
        await bus.event({
            type: 'command_failed',
            data: { ieee_address: '2', transaction: 'c-1', error: 'refused' },
        })
        assert.deepEqual(transport.published, [
            {
                topic: 'matter/bridge/event',
                payload: {
                    type: 'command_failed',
                    data: {
                        ieee_address: '2',
                        transaction: 'c-1',
                        error: 'refused',
                    },
                },
                retain: false,
            },
        ])
    })

    it('refuses to publish a payload the protocol schema rejects', async () => {
        const { transport, bus, errors } = setup()
        const invalid = [{ external_id: '2' }] as never
        assert.equal(await bus.devices(invalid), false)
        assert.equal(await bus.availability('2', 'sideways' as never), false)
        assert.deepEqual(transport.published, [])
        assert.equal(errors.length, 2)
    })
})
