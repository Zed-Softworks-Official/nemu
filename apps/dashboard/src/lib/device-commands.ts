import type { DeviceState } from '@nemu/protocol'

export const BRIGHTNESS_MAX = 254
export const COLOR_TEMP_MIN_MIREDS = 153
export const COLOR_TEMP_MAX_MIREDS = 500

export function brightnessPercentToPayload(percent: number): DeviceState {
    const clamped = clamp(percent, 0, 100)
    return {
        brightness: Math.round((clamped / 100) * BRIGHTNESS_MAX),
    }
}

export function powerPayload(on: boolean): DeviceState {
    return { state: on ? 'ON' : 'OFF' }
}

export function colorTempPayload(mireds: number): DeviceState {
    return {
        color_temp: Math.round(
            clamp(mireds, COLOR_TEMP_MIN_MIREDS, COLOR_TEMP_MAX_MIREDS)
        ),
    }
}

export function colorHexPayload(hex: string): DeviceState {
    const normalized = normalizeHex(hex)
    if (!normalized) {
        throw new Error('Invalid color')
    }
    return { color: { hex: normalized } }
}

export function brightnessToPercent(raw: number): number {
    // Zigbee2MQTT reports brightness as 0–254.
    return clamp(Math.round((raw / BRIGHTNESS_MAX) * 100), 0, 100)
}

export function normalizeHex(value: string): string | null {
    const trimmed = value.trim()
    const match = trimmed.match(/^#?([0-9a-fA-F]{6})$/)
    if (!match?.[1]) return null
    return `#${match[1].toUpperCase()}`
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value))
}
