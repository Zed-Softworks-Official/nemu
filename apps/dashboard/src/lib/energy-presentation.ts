import type { PresentedDevice } from './device-presentation'

type MeterValues =
    | { power: number; energy?: number }
    | { power?: undefined; energy: number }

export type MeterReading = MeterValues & {
    id: string
    device: PresentedDevice
    scope: 'Device' | 'Component'
    name: string
    online: boolean
}

export type LivePowerReading = MeterReading & {
    online: true
    power: number
}

export type PowerSample = {
    timestamp: number
    watts: number
}

export type PowerSession = {
    sourceId: string
    samples: PowerSample[]
}

const MAX_POWER_SAMPLES = 120

export function buildMeterReadings(devices: PresentedDevice[]): MeterReading[] {
    const readings: MeterReading[] = []

    for (const device of devices) {
        const deviceValues = readMeterValues(device.power, device.energy)
        if (deviceValues !== undefined) {
            readings.push({
                ...deviceValues,
                id: `device:${device.id}`,
                device,
                scope: 'Device',
                name: device.name,
                online: device.online,
            })
        }

        for (const outlet of device.outlets ?? []) {
            const componentValues = readMeterValues(outlet.power, outlet.energy)
            if (componentValues === undefined) continue

            readings.push({
                ...componentValues,
                id: `component:${device.id}:${outlet.id}`,
                device,
                scope: 'Component',
                name: outlet.name,
                online: device.online,
            })
        }
    }

    return readings.sort((left, right) => {
        if (left.online !== right.online) return left.online ? -1 : 1
        return (
            left.name.localeCompare(right.name) ||
            left.id.localeCompare(right.id)
        )
    })
}

export function isLivePowerReading(
    reading: MeterReading
): reading is LivePowerReading {
    return reading.online && reading.power !== undefined
}

export function appendPowerSample({
    session,
    sourceId,
    watts,
    timestamp,
}: {
    session: PowerSession | undefined
    sourceId: string
    watts: number
    timestamp: number
}): PowerSession {
    if (session?.sourceId !== sourceId) {
        return { sourceId, samples: [{ timestamp, watts }] }
    }

    const latest = session.samples.at(-1)
    if (
        latest !== undefined &&
        latest.watts === watts &&
        timestamp - latest.timestamp < 1_000
    ) {
        return session
    }

    return {
        sourceId,
        samples: [...session.samples, { timestamp, watts }].slice(
            -MAX_POWER_SAMPLES
        ),
    }
}

export function formatPower(watts: number): string {
    return `${new Intl.NumberFormat('en', {
        maximumFractionDigits: Math.abs(watts) >= 10 ? 0 : 1,
    }).format(watts)} W`
}

export function formatEnergy(kwh: number): string {
    return `${new Intl.NumberFormat('en', {
        maximumFractionDigits: 3,
    }).format(kwh)} kWh`
}

export function formatVoltage(volts: number): string {
    return formatGauge(volts, 'V')
}

export function formatCurrent(amperes: number): string {
    return formatGauge(amperes, 'A')
}

function readMeterValues(
    power: number | undefined,
    energy: number | undefined
): MeterValues | undefined {
    const validPower = isPowerReading(power) ? power : undefined
    const validEnergy = isEnergyReading(energy) ? energy : undefined

    if (validPower !== undefined) {
        return validEnergy === undefined
            ? { power: validPower }
            : { power: validPower, energy: validEnergy }
    }
    if (validEnergy !== undefined) return { energy: validEnergy }
    return undefined
}

function isPowerReading(value: number | undefined): value is number {
    return value !== undefined && Number.isFinite(value)
}

function isEnergyReading(value: number | undefined): value is number {
    return value !== undefined && Number.isFinite(value) && value >= 0
}

function formatGauge(value: number, unit: 'A' | 'V'): string {
    return `${new Intl.NumberFormat('en', {
        maximumFractionDigits: Math.abs(value) >= 10 ? 0 : 2,
    }).format(value)} ${unit}`
}
