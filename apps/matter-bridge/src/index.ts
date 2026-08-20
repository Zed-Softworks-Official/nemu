import { MatterMqttBridge } from './bridge'
import { env } from './env'
import { NameStore } from './names'

const names = new NameStore(env.DATA_DIR)
const bridge = new MatterMqttBridge(env, names)

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
        console.log(`received ${signal}; shutting down`)
        bridge
            .stop()
            .catch((error) => console.error('shutdown error', error))
            .finally(() => process.exit(0))
    })
}

bridge.start().catch((error) => {
    console.error('fatal error', error)
    process.exit(1)
})
