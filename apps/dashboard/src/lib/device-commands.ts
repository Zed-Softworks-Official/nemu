import {
    clampToRange,
    type DeviceState,
    percentToBrightness,
    type ValueRange,
} from '@nemu/protocol'

export function brightnessPercentToPayload(
    percent: number,
    range: ValueRange
): DeviceState {
    return { brightness: percentToBrightness(percent, range) }
}

export function powerPayload(on: boolean): DeviceState {
    return { state: on ? 'ON' : 'OFF' }
}

export function outletPayload(outletId: string, on: boolean): DeviceState {
    return { outlet: outletId, state: on ? 'ON' : 'OFF' }
}

export function colorTempPayload(
    mireds: number,
    range: ValueRange
): DeviceState {
    return { color_temp: Math.round(clampToRange(mireds, range)) }
}

export function colorHexPayload(hex: string): DeviceState {
    const normalized = normalizeHex(hex)
    if (!normalized) {
        throw new Error('Invalid color')
    }
    return { color: { hex: normalized } }
}

export function normalizeHex(value: string): string | null {
    const trimmed = value.trim()
    const match = trimmed.match(/^#?([0-9a-fA-F]{6})$/)
    if (!match?.[1]) return null
    return `#${match[1].toUpperCase()}`
}
