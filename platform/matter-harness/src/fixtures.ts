/** Fixed identities and readings for the simulated Devices, so every run is the same. */

export type DeviceKind = 'plug' | 'light' | 'strip'

export interface PowerReading {
    /** Electrical Power Measurement ActivePower, mW. */
    activePower: number
    /** Voltage, mV. */
    voltage: number
    /** ActiveCurrent, mA. */
    activeCurrent: number
    /** Electrical Energy Measurement CumulativeEnergyImported, mWh. */
    energyImported: number
}

/**
 * Discriminators are multiples of 256. A manual pairing code carries only the
 * top four bits, and the Rust commissioner looks the Device up by the full
 * discriminator those bits imply (short 0xf becomes 3840).
 */
export interface DeviceFixture {
    productName: string
    productId: number
    deviceType: number
    port: number
    discriminator: number
    passcode: number
    power: PowerReading
    light: {
        level: number
        minLevel: number
        maxLevel: number
        mireds: number
        minMireds: number
        maxMireds: number
    }
}

const NO_LIGHT = {
    level: 0,
    minLevel: 0,
    maxLevel: 0,
    mireds: 0,
    minMireds: 0,
    maxMireds: 0,
}
const NO_POWER = {
    activePower: 0,
    voltage: 0,
    activeCurrent: 0,
    energyImported: 0,
}

export const DEVICE_FIXTURES: Record<DeviceKind, DeviceFixture> = {
    plug: {
        productName: 'Harness Plug',
        productId: 0x8001,
        deviceType: 0x010a,
        port: 5641,
        discriminator: 3840,
        passcode: 20202021,
        power: {
            activePower: 60_000,
            voltage: 120_100,
            activeCurrent: 500,
            energyImported: 1_500_000,
        },
        light: NO_LIGHT,
    },
    light: {
        productName: 'Harness Light',
        productId: 0x8002,
        deviceType: 0x010c,
        port: 5642,
        discriminator: 3328,
        passcode: 20202022,
        power: NO_POWER,
        light: {
            level: 100,
            minLevel: 1,
            maxLevel: 254,
            mireds: 250,
            minMireds: 200,
            maxMireds: 400,
        },
    },
    strip: {
        productName: 'Harness Strip',
        productId: 0x8003,
        deviceType: 0x010a,
        port: 5643,
        discriminator: 2816,
        passcode: 20202024,
        power: NO_POWER,
        light: NO_LIGHT,
    },
}

/** The strip's outlets, each an On/Off Plug-in Unit endpoint (1, 2, ...). */
export const STRIP_OUTLETS = 2

/** The plug's second load, sent mid-run to produce a fresh observation. */
export const SECOND_LOAD: PowerReading = {
    activePower: 1_250_000,
    voltage: 119_800,
    activeCurrent: 10_400,
    energyImported: 1_512_000,
}
