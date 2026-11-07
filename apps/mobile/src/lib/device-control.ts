import {
    type CapabilityCurrentState,
    canonicalQuantity,
    type Device,
    type DeviceState,
} from '@nemu/protocol'

const BRIGHTNESS_MAX = 254
const COLOR_TEMP_MIN_MIREDS = 153
const COLOR_TEMP_MAX_MIREDS = 500

/** A Device control the Device's reported state shows it supports. */
export type DeviceControl =
    | {
          key: string
          kind: 'toggle'
          label: string
          on: boolean
          payload: (desired: boolean) => DeviceState
      }
    | {
          key: string
          kind: 'level'
          label: string
          value: number
          min: number
          max: number
          step: number
          format: (value: number) => string
          payload: (desired: number) => DeviceState
      }

function record(value: unknown): Record<string, unknown> | null {
    return typeof value === 'object' && value !== null
        ? (value as Record<string, unknown>)
        : null
}

function finiteNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value)
        ? value
        : undefined
}

function onOff(value: unknown): boolean | undefined {
    if (typeof value === 'boolean') return value
    if (typeof value !== 'string') return undefined
    const lower = value.toLowerCase()
    if (lower === 'on') return true
    if (lower === 'off') return false
    return undefined
}

function outletsOf(
    state: DeviceState
): { id: string; name: string; on: boolean }[] {
    if (!Array.isArray(state.outlets)) return []
    return state.outlets.flatMap((item) => {
        const outlet = record(item)
        const id =
            typeof outlet?.id === 'number' ? String(outlet.id) : outlet?.id
        const on = onOff(outlet?.state)
        if (typeof id !== 'string' || on === undefined) return []
        const name =
            typeof outlet?.name === 'string' && outlet.name.trim()
                ? outlet.name.trim()
                : `Outlet ${id}`
        return [{ id, name, on }]
    })
}

export function controlsForDevice(device: Device): DeviceControl[] {
    const state = device.state ?? {}
    const controls: DeviceControl[] = []
    const outlets = outletsOf(state)

    if (outlets.length > 0) {
        for (const outlet of outlets) {
            controls.push({
                key: `outlet:${outlet.id}`,
                kind: 'toggle',
                label: outlet.name,
                on: outlet.on,
                payload: (desired) => ({
                    outlet: outlet.id,
                    state: desired ? 'ON' : 'OFF',
                }),
            })
        }
    } else {
        const on =
            onOff(state.state) ??
            onOff(state.on) ??
            onOff(state.enabled) ??
            onOff(state.power)
        if (on !== undefined) {
            controls.push({
                key: 'power',
                kind: 'toggle',
                label: 'Power',
                on,
                payload: (desired) => ({ state: desired ? 'ON' : 'OFF' }),
            })
        }
    }

    const brightness =
        finiteNumber(state.brightness) ?? finiteNumber(state.level)
    if (brightness !== undefined) {
        controls.push({
            key: 'brightness',
            kind: 'level',
            label: 'Brightness',
            value: Math.round((brightness / BRIGHTNESS_MAX) * 100),
            min: 0,
            max: 100,
            step: 10,
            format: (value) => `${value}%`,
            payload: (desired) => ({
                brightness: Math.round((desired / 100) * BRIGHTNESS_MAX),
            }),
        })
    }

    const colorTemp =
        finiteNumber(state.color_temp) ?? finiteNumber(state.colorTemp)
    if (colorTemp !== undefined) {
        controls.push({
            key: 'colorTemp',
            kind: 'level',
            label: 'Color temperature',
            value: colorTemp,
            min: COLOR_TEMP_MIN_MIREDS,
            max: COLOR_TEMP_MAX_MIREDS,
            step: 25,
            format: (value) => `${Math.round(1_000_000 / value)}K`,
            payload: (desired) => ({ color_temp: Math.round(desired) }),
        })
    }

    return controls
}

const KIND_PRESENTATION: Record<
    CapabilityCurrentState['kind'],
    { label: string; unit: string }
> = {
    power: { label: 'Power draw', unit: 'W' },
    importedEnergy: { label: 'Energy used', unit: 'Wh' },
    exportedEnergy: { label: 'Energy returned', unit: 'Wh' },
    voltage: { label: 'Voltage', unit: 'V' },
    current: { label: 'Current', unit: 'A' },
}

export type PresentedCapability = {
    id: string
    label: string
    /** Null when the Capability is unavailable or has not reported. */
    reading: string | null
    available: boolean
}

export function capabilitiesForDevice(
    device: Device,
    capabilities: readonly CapabilityCurrentState[]
): PresentedCapability[] {
    return capabilities
        .filter(
            (capability) =>
                capability.device.protocol === device.protocol &&
                capability.device.externalId === device.externalId
        )
        .map((capability) => {
            const { label, unit } = KIND_PRESENTATION[capability.kind]
            const available = capability.availability.status === 'available'
            const scoped =
                capability.physicalScope.kind === 'component'
                    ? `${label} (${capability.physicalScope.componentId})`
                    : label
            return {
                id: capability.capabilityId,
                label: scoped,
                available,
                reading:
                    available && capability.value !== undefined
                        ? `${formatQuantity(canonicalQuantity(capability.value))} ${unit}`
                        : null,
            }
        })
}

function formatQuantity(value: number): string {
    return Number(value.toFixed(2)).toString()
}
