/** The Matter Commands that carry out a `{id}/set` request. */
import {
    CLUSTER_COLOR_CONTROL,
    CLUSTER_LEVEL_CONTROL,
    CLUSTER_ON_OFF,
    COMMAND_MOVE_TO_COLOR,
    COMMAND_MOVE_TO_COLOR_TEMPERATURE,
    COMMAND_MOVE_TO_LEVEL_WITH_ON_OFF,
    COMMAND_OFF,
    COMMAND_ON,
    COMMAND_TOGGLE,
} from './clusters.ts'
import { deviceCoversEndpoint, type EndpointDevice } from './node.ts'
import { asNumber } from './snapshot.ts'
import { round4 } from './state.ts'

/** One cluster command, sent to each target endpoint. */
export interface DeviceCommand {
    cluster: number
    command: number
    /** Request fields by their matter.js names. */
    fields?: Record<string, unknown>
}

export interface SetCommands {
    actions: DeviceCommand[]
    /** Keys of the request that are not a setting this Device takes. */
    ignored: string[]
}

/** Keys that ride along with a set without being a setting. */
const PASSIVE_KEYS = new Set(['transaction', 'outlet', 'transition'])
const SETTING_KEYS = new Set(['state', 'brightness', 'color_temp', 'color'])

/**
 * The Rust adapter's trailing fields: move at once, with no option overrides.
 * The Device still applies its own limits, for example its physical mireds.
 */
const IMMEDIATE = { transitionTime: 0, optionsMask: {}, optionsOverride: {} }

/** Ported from the Rust adapter's `commands_for_set`, in the same order. */
export function commandsForSet(payload: Record<string, unknown>): SetCommands {
    const actions: DeviceCommand[] = []
    const ignored: string[] = []
    const requestedOff =
        payload.state === false ||
        (typeof payload.state === 'string' &&
            payload.state.trim().toUpperCase() === 'OFF')
    let stateHandled = false

    if ('brightness' in payload) {
        const level = asNumber(payload.brightness)
        if (level === undefined) ignored.push('brightness')
        else if (!requestedOff) {
            // MoveToLevelWithOnOff turns the light on, or off at its minimum.
            actions.push({
                cluster: CLUSTER_LEVEL_CONTROL,
                command: COMMAND_MOVE_TO_LEVEL_WITH_ON_OFF,
                fields: { ...IMMEDIATE, level: clamp(level, 0, 254) },
            })
            stateHandled = true
        }
    }

    if ('state' in payload && (!stateHandled || requestedOff)) {
        const command = onOffCommand(payload.state)
        if (command === undefined) ignored.push('state')
        else actions.push({ cluster: CLUSTER_ON_OFF, command })
    }

    if ('color_temp' in payload) {
        const mireds = asNumber(payload.color_temp)
        if (mireds === undefined) ignored.push('color_temp')
        else
            actions.push({
                cluster: CLUSTER_COLOR_CONTROL,
                command: COMMAND_MOVE_TO_COLOR_TEMPERATURE,
                fields: {
                    ...IMMEDIATE,
                    colorTemperatureMireds: clamp(mireds, 0, 0xffff),
                },
            })
    }

    if ('color' in payload) {
        const xy = colorToXy(payload.color)
        if (xy === undefined) ignored.push('color')
        else
            actions.push({
                cluster: CLUSTER_COLOR_CONTROL,
                command: COMMAND_MOVE_TO_COLOR,
                fields: {
                    ...IMMEDIATE,
                    colorX: clamp(xy[0] * 65536, 0, 0xffff),
                    colorY: clamp(xy[1] * 65536, 0, 0xffff),
                },
            })
    }

    for (const key of Object.keys(payload)) {
        if (!SETTING_KEYS.has(key) && !PASSIVE_KEYS.has(key)) ignored.push(key)
    }
    return { actions, ignored }
}

/** Rounds, then saturates into the range, as Rust's `round() as uN` does. */
function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(Math.round(value), min), max)
}

function onOffCommand(raw: unknown): number | undefined {
    const value =
        typeof raw === 'boolean'
            ? raw
                ? 'ON'
                : 'OFF'
            : typeof raw === 'string'
              ? raw.trim().toUpperCase()
              : ''
    if (value === 'ON') return COMMAND_ON
    if (value === 'OFF') return COMMAND_OFF
    if (value === 'TOGGLE') return COMMAND_TOGGLE
    return undefined
}

function colorToXy(value: unknown): [number, number] | undefined {
    if (value === null || typeof value !== 'object' || Array.isArray(value))
        return undefined
    const record = value as Record<string, unknown>
    const x = asNumber(record.x)
    const y = asNumber(record.y)
    if (x !== undefined && y !== undefined) return [unit(x), unit(y)]
    return typeof record.hex === 'string' ? hexToXy(record.hex) : undefined
}

const unit = (value: number) => Math.min(Math.max(value, 0), 1)

/** A `#rrggbb` sRGB color as CIE xy. */
export function hexToXy(hex: string): [number, number] | undefined {
    const trimmed = hex.trim()
    if (!trimmed.startsWith('#')) return undefined
    const digits = trimmed.slice(1)
    if (!/^[0-9a-fA-F]{6}$/.test(digits)) return undefined
    const [r = 0, g = 0, b = 0] = [0, 2, 4].map((at) => {
        const channel = Number.parseInt(digits.slice(at, at + 2), 16) / 255
        return channel > 0.04045
            ? ((channel + 0.055) / 1.055) ** 2.4
            : channel / 12.92
    })
    const x = r * 0.4124 + g * 0.3576 + b * 0.1805
    const y = r * 0.2126 + g * 0.7152 + b * 0.0722
    const z = r * 0.0193 + g * 0.1192 + b * 0.9505
    const sum = x + y + z
    if (sum === 0) return [0.3127, 0.329]
    return [round4(x / sum), round4(y / sum)]
}

/** The endpoints a set goes to. */
export function targetEndpoints(
    device: EndpointDevice,
    payload: Record<string, unknown>
): number[] {
    // The outlet the payload names, else every outlet of a strip.
    const outlet = outletFromSet(payload)
    if (outlet !== undefined && deviceCoversEndpoint(device, outlet))
        return [outlet]
    if (device.outlets) return device.outlets.map((entry) => entry.endpoint)
    return [device.endpoint]
}

/** The `outlet` of a set, as a number or a decimal string. */
export function outletFromSet(
    payload: Record<string, unknown>
): number | undefined {
    const raw = payload.outlet
    const value =
        typeof raw === 'number'
            ? raw
            : typeof raw === 'string' && /^\d+$/.test(raw.trim())
              ? Number(raw.trim())
              : undefined
    return value !== undefined &&
        Number.isInteger(value) &&
        value >= 0 &&
        value <= 0xffff
        ? value
        : undefined
}
