import { join } from 'node:path'

/** The adapter's settings. The environment variables are the Rust adapter's. */
export interface Config {
    mqttHost: string
    mqttPort: number
    mqttBaseTopic: string
    mqttClientId: string
    /** Holds the Matter fabric and every adapter store. Home backup covers it. */
    dataDir: string
    /** Production PAA roots (DER files). */
    paaDir: string
    /** Certification Declaration signer certificates (DER files). */
    cdDir: string
    /**
     * Dev/test only: trust the CHIP test PAA and accept test attestation.
     * Production attestation rejects test certificates unless this is set.
     */
    allowTestCertificates: boolean
}

type Env = Readonly<Record<string, string | undefined>>

export function configFromEnv(env: Env = process.env): Config {
    const dataDir = env.MATTER_DATA_DIR || '/data'
    return {
        mqttHost: env.MQTT_HOST || '127.0.0.1',
        mqttPort: port(env.MQTT_PORT) ?? 1883,
        mqttBaseTopic: env.MQTT_BASE_TOPIC || 'matter',
        mqttClientId: env.MQTT_CLIENT_ID || 'nemu-matter',
        dataDir,
        paaDir: env.MATTER_PAA_DIR || join(dataDir, 'paa-roots'),
        cdDir: env.MATTER_CD_DIR || join(dataDir, 'cd-roots'),
        allowTestCertificates: flag(env.MATTER_ALLOW_EXAMPLE_ROOTS),
    }
}

function port(raw: string | undefined): number | undefined {
    if (raw === undefined || !/^\d+$/.test(raw.trim())) return undefined
    const value = Number(raw)
    return value > 0 && value <= 65_535 ? value : undefined
}

function flag(raw: string | undefined): boolean {
    return ['1', 'true', 'yes', 'on'].includes((raw ?? '').toLowerCase())
}
