import type { Device, DeviceState } from '@nemu/protocol'
import {
    brightnessToPercent,
    COLOR_TEMP_MAX_MIREDS,
    COLOR_TEMP_MIN_MIREDS,
    normalizeHex,
} from '~/lib/device-commands'

export type DeviceCategory = 'light' | 'climate' | 'sensor' | 'outlet'

export type PresentedOutlet = {
    id: string
    name: string
    enabled: boolean
}

export type PresentedDevice = Device & {
    category: DeviceCategory
    manufacturer: string
    lastSeen: string
    summary: string
    enabled: boolean
    level?: number
    colorTemp?: number
    colorHex?: string
    supportsPower: boolean
    supportsBrightness: boolean
    supportsColorTemp: boolean
    supportsColor: boolean
    battery?: number
    temperature?: number
    humidity?: number
    outlets?: PresentedOutlet[]
    power?: number
    energy?: number
    voltage?: number
    current?: number
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
    const outlets = readOutlets(state)
    const isStrip =
        device.type === 'strip' || (outlets !== undefined && outlets.length > 0)
    const enabled =
        readBoolean(state, ['on', 'enabled', 'power']) ??
        readString(state, ['state'])?.toLowerCase() === 'on'
    const rawBrightness = readNumber(state, ['brightness', 'level'])
    const level =
        rawBrightness === undefined
            ? undefined
            : brightnessToPercent(rawBrightness)
    const colorTemp = readNumber(state, ['color_temp', 'colorTemp'])
    const colorHex = readColorHex(state)
    const battery = readNumber(state, ['battery', 'batteryLevel'])
    const temperature = readNumber(state, ['temperature'])
    const humidity = readNumber(state, ['humidity'])
    const power = readNumber(state, ['power'])
    const energy = readNumber(state, ['energy'])
    const voltage = readNumber(state, ['voltage'])
    const current = readNumber(state, ['current'])
    const supportsPower =
        !isStrip &&
        (category === 'light' ||
            category === 'outlet' ||
            readBoolean(state, ['on', 'enabled', 'power']) !== undefined ||
            readString(state, ['state']) !== undefined)
    const supportsBrightness = rawBrightness !== undefined
    const supportsColorTemp = colorTemp !== undefined
    const supportsColor = colorHex !== undefined || hasColorObject(state)

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
            colorTemp,
            colorHex,
            temperature,
            humidity,
            outlets,
            power,
        }),
        enabled,
        level,
        colorTemp,
        colorHex,
        supportsPower,
        supportsBrightness,
        supportsColorTemp,
        supportsColor,
        battery,
        temperature,
        humidity,
        outlets,
        power,
        energy,
        voltage,
        current,
    }
}

export function getCategoryLabel(category: DeviceCategory): string {
    return categoryLabels[category]
}

export function colorTempLabel(mireds: number): string {
    const kelvin = Math.round(1_000_000 / clamp(mireds, 1, 1000))
    return `${kelvin}K`
}

export { COLOR_TEMP_MAX_MIREDS, COLOR_TEMP_MIN_MIREDS }

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
        descriptor.includes('socket') ||
        descriptor.includes('strip')
    ) {
        return 'outlet'
    }

    return 'sensor'
}

function getDeviceSummary({
    device,
    enabled,
    level,
    colorTemp,
    colorHex,
    temperature,
    humidity,
    outlets,
    power,
}: {
    device: Device
    enabled: boolean
    level?: number
    colorTemp?: number
    colorHex?: string
    temperature?: number
    humidity?: number
    outlets?: PresentedOutlet[]
    power?: number
}): string {
    if (!device.online) {
        return 'Offline'
    }

    if (outlets !== undefined && outlets.length > 0) {
        const onCount = outlets.filter((outlet) => outlet.enabled).length
        const base = `${onCount} of ${outlets.length} on`
        return power === undefined ? base : `${base} · ${formatPower(power)}`
    }

    if (temperature !== undefined) {
        return humidity === undefined
            ? `${formatNumber(temperature)}°`
            : `${formatNumber(temperature)}° · ${formatNumber(humidity)}% humidity`
    }

    const parts: string[] = [enabled ? 'On' : 'Off']
    if (level !== undefined) {
        parts.push(`${formatNumber(level)}%`)
    }
    if (colorTemp !== undefined) {
        parts.push(colorTempLabel(colorTemp))
    } else if (colorHex) {
        parts.push(colorHex)
    }

    if (parts.length > 1 || enabled) {
        return parts.join(' · ')
    }

    return 'Ready'
}

function readOutlets(state: DeviceState): PresentedOutlet[] | undefined {
    const raw = state.outlets
    if (!Array.isArray(raw) || raw.length === 0) return undefined

    const outlets: PresentedOutlet[] = []
    for (const item of raw) {
        if (typeof item !== 'object' || item === null) continue
        const record = item as Record<string, unknown>
        const id =
            typeof record.id === 'string'
                ? record.id
                : typeof record.id === 'number'
                  ? String(record.id)
                  : undefined
        if (id === undefined) continue
        const name =
            typeof record.name === 'string' && record.name.trim().length > 0
                ? record.name.trim()
                : `Outlet ${id}`
        const enabled =
            record.state === 'ON' ||
            record.state === true ||
            record.state === 'on'
        outlets.push({ id, name, enabled })
    }

    return outlets.length > 0 ? outlets : undefined
}

function hasColorObject(state: DeviceState): boolean {
    const color = state.color
    return typeof color === 'object' && color !== null
}

function readColorHex(state: DeviceState): string | undefined {
    const direct = readString(state, ['color', 'hex'])
    if (direct) {
        return normalizeHex(direct) ?? undefined
    }

    const color = state.color
    if (typeof color === 'string') {
        return normalizeHex(color) ?? undefined
    }

    if (typeof color === 'object' && color !== null) {
        const record = color as Record<string, unknown>
        if (typeof record.hex === 'string') {
            return normalizeHex(record.hex) ?? undefined
        }
        if (
            typeof record.r === 'number' &&
            typeof record.g === 'number' &&
            typeof record.b === 'number'
        ) {
            return rgbToHex(record.r, record.g, record.b)
        }
        if (
            typeof record.hue === 'number' &&
            typeof record.saturation === 'number'
        ) {
            return hsvToHex(record.hue, record.saturation / 100, 1)
        }
        if (typeof record.h === 'number' && typeof record.s === 'number') {
            const s = record.s > 1 ? record.s / 100 : record.s
            return hsvToHex(record.h, s, 1)
        }
        if (typeof record.x === 'number' && typeof record.y === 'number') {
            return xyToHex(record.x, record.y)
        }
    }

    const hue = readNumber(state, ['hue'])
    const saturation = readNumber(state, ['saturation'])
    if (hue !== undefined && saturation !== undefined) {
        return hsvToHex(hue, saturation / 100, 1)
    }

    return undefined
}

function rgbToHex(r: number, g: number, b: number): string {
    const toByte = (value: number) =>
        clamp(Math.round(value <= 1 ? value * 255 : value), 0, 255)
            .toString(16)
            .padStart(2, '0')
            .toUpperCase()
    return `#${toByte(r)}${toByte(g)}${toByte(b)}`
}

function hsvToHex(h: number, s: number, v: number): string {
    const hue = ((h % 360) + 360) % 360
    const c = v * s
    const x = c * (1 - Math.abs(((hue / 60) % 2) - 1))
    const m = v - c
    let r = 0
    let g = 0
    let b = 0

    if (hue < 60) [r, g, b] = [c, x, 0]
    else if (hue < 120) [r, g, b] = [x, c, 0]
    else if (hue < 180) [r, g, b] = [0, c, x]
    else if (hue < 240) [r, g, b] = [0, x, c]
    else if (hue < 300) [r, g, b] = [x, 0, c]
    else [r, g, b] = [c, 0, x]

    return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255)
}

/** Approximate CIE 1931 xy → sRGB hex for UI display. */
function xyToHex(x: number, y: number): string {
    if (y <= 0) return '#FFFFFF'
    const z = 1 - x - y
    const Y = 1
    const X = (Y / y) * x
    const Z = (Y / y) * z

    let r = X * 1.656_492 - Y * 0.354_851 - Z * 0.255_038
    let g = -X * 0.707_196 + Y * 1.655_397 + Z * 0.036_152
    let b = X * 0.051_713 - Y * 0.121_364 + Z * 1.011_53

    const gamma = (value: number) =>
        value <= 0.003_130_8
            ? 12.92 * value
            : 1.055 * value ** (1 / 2.4) - 0.055

    r = gamma(Math.max(0, r))
    g = gamma(Math.max(0, g))
    b = gamma(Math.max(0, b))

    const max = Math.max(r, g, b, 1e-6)
    return rgbToHex((r / max) * 255, (g / max) * 255, (b / max) * 255)
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

export function formatPower(watts: number): string {
    return `${new Intl.NumberFormat('en', {
        maximumFractionDigits: watts >= 10 ? 0 : 1,
    }).format(watts)} W`
}

export function formatEnergy(kwh: number): string {
    return `${new Intl.NumberFormat('en', {
        maximumFractionDigits: 3,
    }).format(kwh)} kWh`
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value))
}
