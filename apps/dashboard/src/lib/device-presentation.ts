import type { Device, DeviceState } from '@nemu/protocol'

export type DeviceCategory = 'light' | 'climate' | 'sensor' | 'outlet'

export type PresentedDevice = Device & {
    category: DeviceCategory
    manufacturer: string
    lastSeen: string
    summary: string
    enabled: boolean
    level?: number
    battery?: number
    temperature?: number
    humidity?: number
}

const categoryLabels: Record<DeviceCategory, string> = {
    light: 'Lights',
    climate: 'Climate',
    sensor: 'Sensors',
    outlet: 'Outlets',
}

export function presentDevice(device: Device): PresentedDevice {
    const state = device.state ?? {}
    const category = getDeviceCategory(device)
    const enabled =
        readBoolean(state, ['on', 'enabled', 'power']) ??
        readString(state, ['state'])?.toLowerCase() === 'on'
    const level = readNumber(state, ['brightness', 'level'])
    const battery = readNumber(state, ['battery', 'batteryLevel'])
    const temperature = readNumber(state, ['temperature'])
    const humidity = readNumber(state, ['humidity'])

    return {
        ...device,
        category,
        manufacturer:
            readString(state, ['manufacturer', 'vendor']) ?? 'Unknown',
        lastSeen: device.online ? 'Live now' : 'Last seen unavailable',
        summary: getDeviceSummary({
            device,
            enabled,
            level,
            temperature,
            humidity,
        }),
        enabled,
        level,
        battery,
        temperature,
        humidity,
    }
}

export function getCategoryLabel(category: DeviceCategory): string {
    return categoryLabels[category]
}

function getDeviceCategory(device: Device): DeviceCategory {
    const descriptor = `${device.name} ${device.type} ${device.model ?? ''}`
        .toLowerCase()
        .trim()

    if (
        descriptor.includes('light') ||
        descriptor.includes('lamp') ||
        descriptor.includes('bulb')
    ) {
        return 'light'
    }

    if (
        descriptor.includes('climate') ||
        descriptor.includes('temperature') ||
        descriptor.includes('thermostat')
    ) {
        return 'climate'
    }

    if (
        descriptor.includes('outlet') ||
        descriptor.includes('plug') ||
        descriptor.includes('socket')
    ) {
        return 'outlet'
    }

    return 'sensor'
}

function getDeviceSummary({
    device,
    enabled,
    level,
    temperature,
    humidity,
}: {
    device: Device
    enabled: boolean
    level?: number
    temperature?: number
    humidity?: number
}): string {
    if (!device.online) {
        return 'Offline'
    }

    if (temperature !== undefined) {
        return humidity === undefined
            ? `${formatNumber(temperature)}°`
            : `${formatNumber(temperature)}° · ${formatNumber(humidity)}% humidity`
    }

    if (level !== undefined) {
        return `${enabled ? 'On' : 'Off'} · ${formatNumber(level)}%`
    }

    return enabled ? 'On' : 'Ready'
}

function readBoolean(
    state: DeviceState,
    keys: readonly string[]
): boolean | undefined {
    for (const key of keys) {
        const value = state[key]
        if (typeof value === 'boolean') {
            return value
        }
    }

    return undefined
}

function readNumber(
    state: DeviceState,
    keys: readonly string[]
): number | undefined {
    for (const key of keys) {
        const value = state[key]
        if (typeof value === 'number' && Number.isFinite(value)) {
            return value
        }
    }

    return undefined
}

function readString(
    state: DeviceState,
    keys: readonly string[]
): string | undefined {
    for (const key of keys) {
        const value = state[key]
        if (typeof value === 'string' && value.trim().length > 0) {
            return value.trim()
        }
    }

    return undefined
}

function formatNumber(value: number): string {
    return new Intl.NumberFormat('en', {
        maximumFractionDigits: 1,
    }).format(value)
}
