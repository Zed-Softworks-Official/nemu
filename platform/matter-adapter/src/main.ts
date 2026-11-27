/** The matter.js Matter Protocol adapter process. */
import { existsSync } from 'node:fs'
import { configFromEnv } from './config.ts'
import { consoleLog } from './log.ts'
import { bleFromEnv } from './matter/ble.ts'
import { createMatterSession } from './matter/session.ts'
import { Meters } from './meters/index.ts'
import { MqttBus } from './mqtt/bus.ts'
import { connectMqtt } from './mqtt/client.ts'
import { Service } from './service.ts'
import { NameStore } from './stores/names.ts'

const config = configFromEnv()
const log = consoleLog('matter')
const ble = bleFromEnv(process.env, {
    platform: process.platform,
    exists: existsSync,
})
if (!ble.enabled) log.info(`BLE off (${ble.reason}); commissioning on-network`)

const session = createMatterSession({
    dataDir: config.dataDir,
    paaDir: config.paaDir,
    cdDir: config.cdDir,
    allowTestCertificates: config.allowTestCertificates,
    ble: ble.enabled ? { hciId: ble.hciId } : undefined,
    log,
})
await session.start()

const mqtt = connectMqtt(config, log)
const bus = new MqttBus(mqtt, config.mqttBaseTopic, log)
const service = new Service(
    session,
    bus,
    log,
    Meters.load(config.dataDir, log),
    NameStore.load(config.dataDir, log)
)
let started = false
mqtt.onConnect(async () => {
    await bus.bridgeState('online')
    if (started) await service.publishInventory()
    else {
        started = true
        await service.start()
    }
})

let stopping = false
async function stop(signal: string): Promise<void> {
    if (stopping) return
    stopping = true
    log.info(`${signal}: stopping`)
    await bus.bridgeState('offline').catch(() => false)
    await mqtt.close().catch(() => {})
    await session.close().catch(() => {})
    process.exit(0)
}
process.on('SIGTERM', () => void stop('SIGTERM'))
process.on('SIGINT', () => void stop('SIGINT'))
