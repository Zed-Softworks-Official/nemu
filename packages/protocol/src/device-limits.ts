import { z } from 'zod'

const valueRangeSchema = z
    .object({ min: z.number(), max: z.number() })
    .refine((range) => range.min < range.max)
export type ValueRange = z.infer<typeof valueRangeSchema>

/**
 * The Device's own limits, in its native units. A limit that is missing or
 * makes no sense is treated as not reported, never as a broken Device.
 */
export const deviceLimitsSchema = z.object({
    /** Native brightness steps. */
    brightness: valueRangeSchema.optional().catch(undefined),
    /** Mireds. */
    colorTemp: valueRangeSchema
        .refine((range) => range.min > 0)
        .optional()
        .catch(undefined),
})
export type DeviceLimits = z.infer<typeof deviceLimitsSchema>

/**
 * Used when a Device reports no limits, or the Controller predates them: the
 * Zigbee and Matter level range, and the mireds most tunable lamps span
 * (6536 K to 2000 K). A Device clamps what it can't reach.
 */
export const DEFAULT_BRIGHTNESS_RANGE: ValueRange = { min: 0, max: 254 }
export const DEFAULT_COLOR_TEMP_RANGE: ValueRange = { min: 153, max: 500 }

type Limited = { limits?: DeviceLimits }

export function brightnessRange(device: Limited): ValueRange {
    return device.limits?.brightness ?? DEFAULT_BRIGHTNESS_RANGE
}

/** In mireds. */
export function colorTempRange(device: Limited): ValueRange {
    return device.limits?.colorTemp ?? DEFAULT_COLOR_TEMP_RANGE
}

export function clampToRange(value: number, range: ValueRange): number {
    return Math.min(range.max, Math.max(range.min, value))
}

/** A whole percentage of the Device's own range, always 0–100. */
export function brightnessToPercent(raw: number, range: ValueRange): number {
    const share = (clampToRange(raw, range) - range.min) / span(range)
    return Math.round(share * 100)
}

/** The native step nearest to a percentage of the Device's own range. */
export function percentToBrightness(
    percent: number,
    range: ValueRange
): number {
    const share = clampToRange(percent, { min: 0, max: 100 }) / 100
    return Math.round(range.min + share * span(range))
}

function span(range: ValueRange): number {
    return range.max - range.min
}

export function miredsToKelvin(mireds: number): number {
    return Math.round(1_000_000 / mireds)
}

/** Devices take whole mireds; the result always stays inside `range`. */
export function kelvinToMireds(kelvin: number, range: ValueRange): number {
    return clampToRange(Math.round(1_000_000 / kelvin), range)
}

/** A mired range as Kelvin. The most mireds are the fewest Kelvin. */
export function kelvinRange(mireds: ValueRange): ValueRange {
    return { min: miredsToKelvin(mireds.max), max: miredsToKelvin(mireds.min) }
}
