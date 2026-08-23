import { z } from 'zod'

const envSchema = z.object({
    MATTER_WS_URL: z.string().default('ws://127.0.0.1:5580/ws'),
    MQTT_URL: z.string().default('mqtt://127.0.0.1:1883'),
    MQTT_BASE_TOPIC: z.string().default('matter'),
    DATA_DIR: z.string().default('/data'),
    /** Host command that restarts matterjs-server so Noble drops a wedged BLE peripheral. */
    MATTERJS_RESTART_CMD: z.string().default(''),
})

export const env = envSchema.parse(process.env)
