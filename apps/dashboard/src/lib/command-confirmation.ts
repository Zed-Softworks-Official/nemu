import type { Device, DeviceState } from '@nemu/protocol'
import { brightnessRange, brightnessToPercent } from '@nemu/protocol'
import { normalizeHex } from '~/lib/device-commands'
import { presentDevice } from '~/lib/device-presentation'

/** Devices round what they are asked for; mobile allows the same. */
const BRIGHTNESS_TOLERANCE_PERCENT = 1
const COLOR_TEMP_TOLERANCE_MIREDS = 1

/** The control a Command sets. A newer Command replaces one to the same. */
export function commandControl(payload: DeviceState): string {
    if (payload.outlet !== undefined) return `outlet:${payload.outlet}`
    if (payload.brightness !== undefined) return 'brightness'
    if (payload.color !== undefined || payload.color_temp !== undefined) {
        return 'color'
    }
    return 'power'
}

/** Whether `device` now reports what `payload` asked `before` for. */
export function reportsRequested(
    payload: DeviceState,
    device: Device,
    before: Device
): boolean {
    const presented = presentDevice(device)
    const requestedOn = payload.state === 'ON'
    switch (commandControl(payload)) {
        case 'brightness': {
            const range = brightnessRange(device)
            const requested = Number(payload.brightness)
            // A light moved to its minimum may only report that it is off.
            if (requested <= range.min && !presented.enabled) return true
            return (
                presented.level !== undefined &&
                Math.abs(
                    presented.level - brightnessToPercent(requested, range)
                ) <= BRIGHTNESS_TOLERANCE_PERCENT
            )
        }
        case 'color':
            if (payload.color_temp !== undefined) {
                return (
                    presented.colorTemp !== undefined &&
                    Math.abs(
                        presented.colorTemp - Number(payload.color_temp)
                    ) <= COLOR_TEMP_TOLERANCE_MIREDS
                )
            }
            return reportsColor(payload, device, before)
        case 'power':
            return presented.enabled === requestedOn
        default:
            return (
                presented.outlets?.find(
                    (outlet) => outlet.id === payload.outlet
                )?.enabled === requestedOn
            )
    }
}

/**
 * A light reports color in its own space and clips it to what it can show, so
 * it rarely reports the hex it was sent. Any new color counts.
 */
function reportsColor(
    payload: DeviceState,
    device: Device,
    before: Device
): boolean {
    const { hex } = payload.color as { hex: string }
    return (
        presentDevice(device).colorHex === normalizeHex(hex) ||
        colorReport(device) !== colorReport(before)
    )
}

function colorReport({ state }: Device): string {
    return JSON.stringify([
        state?.color,
        state?.hex,
        state?.hue,
        state?.saturation,
    ])
}
