import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { configFromEnv } from './config.ts'

describe('adapter configuration', () => {
    it('reads the same environment variables as the Rust adapter', () => {
        const config = configFromEnv({
            MQTT_HOST: 'broker',
            MQTT_PORT: '1884',
            MQTT_BASE_TOPIC: 'matter-test',
            MQTT_CLIENT_ID: 'nemu-matter-test',
            MATTER_DATA_DIR: '/var/nemu/matter',
            MATTER_PAA_DIR: '/roots/paa',
            MATTER_CD_DIR: '/roots/cd',
        })
        assert.deepEqual(config, {
            mqttHost: 'broker',
            mqttPort: 1884,
            mqttBaseTopic: 'matter-test',
            mqttClientId: 'nemu-matter-test',
            dataDir: '/var/nemu/matter',
            paaDir: '/roots/paa',
            cdDir: '/roots/cd',
            allowTestCertificates: false,
        })
    })

    it('defaults like the Rust adapter', () => {
        assert.deepEqual(configFromEnv({}), {
            mqttHost: '127.0.0.1',
            mqttPort: 1883,
            mqttBaseTopic: 'matter',
            mqttClientId: 'nemu-matter',
            dataDir: '/data',
            paaDir: '/data/paa-roots',
            cdDir: '/data/cd-roots',
            allowTestCertificates: false,
        })
    })

    it('keeps test certificates off unless MATTER_ALLOW_EXAMPLE_ROOTS is set', () => {
        for (const value of ['1', 'true', 'YES', 'on']) {
            assert.equal(
                configFromEnv({ MATTER_ALLOW_EXAMPLE_ROOTS: value })
                    .allowTestCertificates,
                true,
                value
            )
        }
        for (const value of ['', '0', 'false', 'off', 'nope']) {
            assert.equal(
                configFromEnv({ MATTER_ALLOW_EXAMPLE_ROOTS: value })
                    .allowTestCertificates,
                false,
                value
            )
        }
    })

    it('falls back to the default port when MQTT_PORT is not a port', () => {
        assert.equal(configFromEnv({ MQTT_PORT: 'eighteen' }).mqttPort, 1883)
        assert.equal(configFromEnv({ MQTT_PORT: '70000' }).mqttPort, 1883)
    })
})
