/**
 * Pure translation between matterjs-server node data and Nemu's
 * zigbee2mqtt-shaped MQTT dialect. No I/O here so everything is unit-testable.
 *
 * Attribute paths are `endpoint/cluster/attribute` with decimal ids, as
 * published by matterjs-server. Struct values arrive with numeric field-id
 * keys (`{"0": …}`) or camelCase keys depending on server version; both are
 * accepted.
 */

export const CLUSTER = {
    onOff: 6,
    levelControl: 8,
    descriptor: 29,
    basicInformation: 40,
    colorControl: 768,
    electricalPower: 144,
    electricalEnergy: 145,
} as const

export const DEVICE_TYPE = {
    rootNode: 22,
    powerSource: 17,
    aggregator: 14,
    onOffLight: 256,
    dimmableLight: 257,
    colorTemperatureLight: 268,
    extendedColorLight: 269,
    onOffPlugInUnit: 266,
    dimmablePlugInUnit: 267,
    electricalSensor: 1296,
} as const

const LIGHT_DEVICE_TYPES: ReadonlySet<number> = new Set([
    DEVICE_TYPE.onOffLight,
    DEVICE_TYPE.dimmableLight,
    DEVICE_TYPE.colorTemperatureLight,
    DEVICE_TYPE.extendedColorLight,
])

const PLUG_DEVICE_TYPES: ReadonlySet<number> = new Set([
    DEVICE_TYPE.onOffPlugInUnit,
    DEVICE_TYPE.dimmablePlugInUnit,
])

export type AttributesData = Record<string, unknown>

export type NodeSnapshot = {
    nodeId: string
    available: boolean
    attributes: AttributesData
}

export type EndpointKind = 'light' | 'switch' | 'energy'

export type EndpointDevice = {
    /** Nemu external id: `nodeId` for single-endpoint nodes, else `nodeId:endpoint`. */
    id: string
    nodeId: string
    endpointId: number
    defaultName: string
    kind: EndpointKind
    model: string
    description: string
}

export type DeviceCommandAction = {
    clusterId: number
    commandName: string
    payload: Record<string, unknown>
}

function attr(
    attributes: AttributesData,
    endpoint: number,
    cluster: number,
    attribute: number
): unknown {
    return attributes[`${endpoint}/${cluster}/${attribute}`]
}

function structField(
    value: unknown,
    fieldId: number,
    ...names: string[]
): unknown {
    if (typeof value !== 'object' || value === null) return undefined
    const record = value as Record<string, unknown>
    if (record[String(fieldId)] !== undefined) return record[String(fieldId)]
    for (const name of names) {
        if (record[name] !== undefined) return record[name]
    }
    return undefined
}

function asNumber(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'bigint') return Number(value)
    return undefined
}

/** Endpoint ids present in the attribute map, ascending, excluding the root. */
export function listEndpoints(attributes: AttributesData): number[] {
    const endpoints = new Set<number>()
    for (const key of Object.keys(attributes)) {
        const endpoint = Number.parseInt(key.split('/')[0] ?? '', 10)
        if (Number.isInteger(endpoint) && endpoint > 0) {
            endpoints.add(endpoint)
        }
    }
    return [...endpoints].sort((a, b) => a - b)
}

export function deviceTypesOf(
    attributes: AttributesData,
    endpoint: number
): number[] {
    const list = attr(attributes, endpoint, CLUSTER.descriptor, 0)
    if (!Array.isArray(list)) return []
    const types: number[] = []
    for (const entry of list) {
        const id = asNumber(structField(entry, 0, 'deviceType', 'type'))
        if (id !== undefined) types.push(id)
    }
    return types
}

function hasOnOff(attributes: AttributesData, endpoint: number): boolean {
    return attr(attributes, endpoint, CLUSTER.onOff, 0) !== undefined
}

function hasEnergyMeasurement(
    attributes: AttributesData,
    endpoint: number
): boolean {
    return (
        attr(attributes, endpoint, CLUSTER.electricalPower, 8) !== undefined ||
        attr(attributes, endpoint, CLUSTER.electricalEnergy, 1) !== undefined
    )
}

function endpointKind(
    attributes: AttributesData,
    endpoint: number
): EndpointKind | null {
    const types = deviceTypesOf(attributes, endpoint)
    if (
        types.some(
            (t) => t === DEVICE_TYPE.aggregator || t === DEVICE_TYPE.rootNode
        )
    ) {
        // Aggregator/root endpoints are skipped unless they carry a usable
        // OnOff cluster themselves.
        return hasOnOff(attributes, endpoint) ? 'switch' : null
    }
    if (types.some((t) => LIGHT_DEVICE_TYPES.has(t))) return 'light'
    if (types.some((t) => PLUG_DEVICE_TYPES.has(t))) return 'switch'
    if (hasOnOff(attributes, endpoint)) {
        // Unknown device type with an OnOff cluster still gets a switch tile.
        return 'switch'
    }
    return null
}

export function nodeBaseName(
    attributes: AttributesData,
    nodeId: string
): string {
    const label = attr(attributes, 0, CLUSTER.basicInformation, 5)
    if (
        typeof label === 'string' &&
        label.trim().length > 0 &&
        !label.includes('\u0000')
    ) {
        return label.trim()
    }
    const product = attr(attributes, 0, CLUSTER.basicInformation, 3)
    if (typeof product === 'string' && product.trim().length > 0) {
        return product.trim()
    }
    return `Matter ${nodeId}`
}

function nodeModel(attributes: AttributesData): string {
    const product = attr(attributes, 0, CLUSTER.basicInformation, 3)
    return typeof product === 'string' && product.trim().length > 0
        ? product.trim()
        : 'Matter device'
}

function nodeVendor(attributes: AttributesData): string {
    const vendor = attr(attributes, 0, CLUSTER.basicInformation, 1)
    return typeof vendor === 'string' ? vendor.trim() : ''
}

/**
 * Split a node into one Nemu device per functional endpoint. A Matter power
 * strip is one fabric node with one On/Off Plug-in Unit endpoint per outlet;
 * each becomes its own device (Nemu's UI is one power switch per tile).
 *
 * Endpoints that only carry Electrical Power/Energy Measurement (and no
 * OnOff anywhere else on the node exposes them) surface as a read-only
 * "All outlets" sibling so the later energy section has a device to attach to.
 */
export function mapNode(snapshot: NodeSnapshot): EndpointDevice[] {
    const { attributes, nodeId } = snapshot
    const base = nodeBaseName(attributes, nodeId)
    const model = nodeModel(attributes)
    const vendor = nodeVendor(attributes)

    const functional: Array<{ endpointId: number; kind: EndpointKind }> = []
    const energyOnly: number[] = []

    for (const endpoint of listEndpoints(attributes)) {
        const kind = endpointKind(attributes, endpoint)
        if (kind !== null) {
            functional.push({ endpointId: endpoint, kind })
        } else if (hasEnergyMeasurement(attributes, endpoint)) {
            energyOnly.push(endpoint)
        }
    }

    // Only surface a dedicated energy endpoint when no controllable endpoint
    // carries the measurement clusters itself.
    const controlsHaveEnergy = functional.some((f) =>
        hasEnergyMeasurement(attributes, f.endpointId)
    )
    const energyEndpoint =
        !controlsHaveEnergy && energyOnly.length > 0 ? energyOnly[0] : undefined

    const total = functional.length + (energyEndpoint !== undefined ? 1 : 0)
    const single = total === 1

    const devices: EndpointDevice[] = []
    let outletIndex = 0
    for (const { endpointId, kind } of functional) {
        outletIndex += 1
        const suffix =
            kind === 'switch' ? `Outlet ${outletIndex}` : `${outletIndex}`
        devices.push({
            id: single ? nodeId : `${nodeId}:${endpointId}`,
            nodeId,
            endpointId,
            defaultName: functional.length === 1 ? base : `${base} · ${suffix}`,
            kind,
            model,
            description: describeKind(kind, vendor),
        })
    }

    if (energyEndpoint !== undefined) {
        devices.push({
            id: single ? nodeId : `${nodeId}:${energyEndpoint}`,
            nodeId,
            endpointId: energyEndpoint,
            defaultName: single ? base : `${base} · All outlets`,
            kind: 'energy',
            model,
            description: describeKind('energy', vendor),
        })
    }

    return devices
}

function describeKind(kind: EndpointKind, vendor: string): string {
    const what =
        kind === 'light'
            ? 'Matter light'
            : kind === 'switch'
              ? 'Matter on/off plug-in unit'
              : 'Matter energy meter'
    return vendor.length > 0 ? `${what} (${vendor})` : what
}

/**
 * z2m-shaped device descriptor for `matter/bridge/devices` (superset-compatible
 * with `Z2mDeviceDescriptor` in nemu-core).
 */
export function deviceDescriptor(
    device: EndpointDevice,
    friendlyName: string
): Record<string, unknown> {
    return {
        external_id: device.id,
        ieee_address: device.id,
        friendly_name: friendlyName,
        type: descriptorType(device.kind),
        supported: true,
        definition: {
            model: device.model,
            description: device.description,
            exposes: synthesizeExposes(device.kind),
        },
    }
}

function descriptorType(kind: EndpointKind): string {
    if (kind === 'light') return 'light'
    if (kind === 'switch') return 'switch'
    return 'sensor'
}

function synthesizeExposes(kind: EndpointKind): unknown[] {
    if (kind === 'light') {
        return [
            {
                type: 'light',
                features: [
                    {
                        type: 'binary',
                        name: 'state',
                        property: 'state',
                        access: 7,
                        value_on: 'ON',
                        value_off: 'OFF',
                    },
                    {
                        type: 'numeric',
                        name: 'brightness',
                        property: 'brightness',
                        access: 7,
                        value_min: 0,
                        value_max: 254,
                    },
                ],
            },
        ]
    }
    if (kind === 'switch') {
        return [
            {
                type: 'switch',
                features: [
                    {
                        type: 'binary',
                        name: 'state',
                        property: 'state',
                        access: 7,
                        value_on: 'ON',
                        value_off: 'OFF',
                    },
                ],
            },
        ]
    }
    return []
}

/**
 * Retained state JSON for one endpoint, mirroring z2m payloads: `state`,
 * `brightness`, `color_temp`, `color`, plus read-only energy keys in SI units.
 */
export function stateForEndpoint(
    attributes: AttributesData,
    endpoint: number
): Record<string, unknown> {
    const state: Record<string, unknown> = {}

    const onOff = attr(attributes, endpoint, CLUSTER.onOff, 0)
    if (typeof onOff === 'boolean') {
        state.state = onOff ? 'ON' : 'OFF'
    }

    const level = asNumber(attr(attributes, endpoint, CLUSTER.levelControl, 0))
    if (level !== undefined) {
        state.brightness = Math.max(0, Math.min(254, Math.round(level)))
    }

    const colorTemp = asNumber(
        attr(attributes, endpoint, CLUSTER.colorControl, 7)
    )
    if (colorTemp !== undefined && colorTemp > 0) {
        state.color_temp = Math.round(colorTemp)
    }

    const currentX = asNumber(
        attr(attributes, endpoint, CLUSTER.colorControl, 3)
    )
    const currentY = asNumber(
        attr(attributes, endpoint, CLUSTER.colorControl, 4)
    )
    if (currentX !== undefined && currentY !== undefined) {
        state.color = {
            x: round4(currentX / 65536),
            y: round4(currentY / 65536),
        }
    }

    // Electrical Power Measurement (0x0090): mV / mA / mW on the wire.
    const activePower = asNumber(
        attr(attributes, endpoint, CLUSTER.electricalPower, 8)
    )
    if (activePower !== undefined) {
        state.power = round2(activePower / 1000)
    }
    const voltage = asNumber(
        attr(attributes, endpoint, CLUSTER.electricalPower, 4) ??
            attr(attributes, endpoint, CLUSTER.electricalPower, 11)
    )
    if (voltage !== undefined) {
        state.voltage = round2(voltage / 1000)
    }
    const current = asNumber(
        attr(attributes, endpoint, CLUSTER.electricalPower, 5) ??
            attr(attributes, endpoint, CLUSTER.electricalPower, 12)
    )
    if (current !== undefined) {
        state.current = round3(current / 1000)
    }

    // Electrical Energy Measurement (0x0091): CumulativeEnergyImported.energy in mWh.
    const imported = attr(attributes, endpoint, CLUSTER.electricalEnergy, 1)
    const energyMwh = asNumber(structField(imported, 0, 'energy'))
    if (energyMwh !== undefined) {
        state.energy = round3(energyMwh / 1_000_000)
    }

    return state
}

/** Attribute paths that feed the state payload; anything else never triggers a republish. */
export function isStateAttributePath(path: string): boolean {
    const parts = path.split('/')
    if (parts.length !== 3) return false
    const cluster = Number.parseInt(parts[1] ?? '', 10)
    return (
        cluster === CLUSTER.onOff ||
        cluster === CLUSTER.levelControl ||
        cluster === CLUSTER.colorControl ||
        cluster === CLUSTER.electricalPower ||
        cluster === CLUSTER.electricalEnergy
    )
}

export function endpointOfPath(path: string): number | undefined {
    const endpoint = Number.parseInt(path.split('/')[0] ?? '', 10)
    return Number.isInteger(endpoint) ? endpoint : undefined
}

const NO_TRANSITION = { transitionTime: 0, optionsMask: 0, optionsOverride: 0 }

/**
 * Translate a z2m-style `set` payload into Matter cluster commands for one
 * endpoint. Unknown and read-only (energy) keys are dropped; the caller logs them.
 */
export function commandsForSet(payload: Record<string, unknown>): {
    actions: DeviceCommandAction[]
    ignoredKeys: string[]
} {
    const actions: DeviceCommandAction[] = []
    const ignoredKeys: string[] = []
    let stateHandled = false

    if (payload.brightness !== undefined) {
        const brightness = asNumber(payload.brightness)
        if (brightness !== undefined) {
            actions.push({
                clusterId: CLUSTER.levelControl,
                commandName: 'moveToLevelWithOnOff',
                payload: {
                    level: Math.max(0, Math.min(254, Math.round(brightness))),
                    ...NO_TRANSITION,
                },
            })
            // moveToLevelWithOnOff already implies the on/off transition.
            stateHandled = true
        } else {
            ignoredKeys.push('brightness')
        }
    }

    if (payload.state !== undefined && !stateHandled) {
        const raw = payload.state
        const normalized =
            typeof raw === 'string' ? raw.trim().toUpperCase() : raw
        if (normalized === 'ON' || normalized === true) {
            actions.push({
                clusterId: CLUSTER.onOff,
                commandName: 'on',
                payload: {},
            })
        } else if (normalized === 'OFF' || normalized === false) {
            actions.push({
                clusterId: CLUSTER.onOff,
                commandName: 'off',
                payload: {},
            })
        } else if (normalized === 'TOGGLE') {
            actions.push({
                clusterId: CLUSTER.onOff,
                commandName: 'toggle',
                payload: {},
            })
        } else {
            ignoredKeys.push('state')
        }
    }

    if (payload.color_temp !== undefined) {
        const mireds = asNumber(payload.color_temp)
        if (mireds !== undefined) {
            actions.push({
                clusterId: CLUSTER.colorControl,
                commandName: 'moveToColorTemperature',
                payload: {
                    colorTemperatureMireds: Math.round(mireds),
                    ...NO_TRANSITION,
                },
            })
        } else {
            ignoredKeys.push('color_temp')
        }
    }

    if (payload.color !== undefined) {
        const xy = colorToXy(payload.color)
        if (xy) {
            actions.push({
                clusterId: CLUSTER.colorControl,
                commandName: 'moveToColor',
                payload: {
                    colorX: Math.round(xy.x * 65536),
                    colorY: Math.round(xy.y * 65536),
                    ...NO_TRANSITION,
                },
            })
        } else {
            ignoredKeys.push('color')
        }
    }

    for (const key of Object.keys(payload)) {
        if (
            ![
                'state',
                'brightness',
                'color_temp',
                'color',
                'transition',
            ].includes(key)
        ) {
            ignoredKeys.push(key)
        }
    }

    return { actions, ignoredKeys }
}

function colorToXy(value: unknown): { x: number; y: number } | null {
    if (typeof value !== 'object' || value === null) return null
    const record = value as Record<string, unknown>
    const x = asNumber(record.x)
    const y = asNumber(record.y)
    if (x !== undefined && y !== undefined) {
        return { x: clamp01(x), y: clamp01(y) }
    }
    if (typeof record.hex === 'string') {
        return hexToXy(record.hex)
    }
    return null
}

/** sRGB hex → CIE 1931 xy (the same conversion z2m applies for hex colors). */
export function hexToXy(hex: string): { x: number; y: number } | null {
    const match = hex.trim().match(/^#?([0-9a-fA-F]{6})$/)
    const digits = match?.[1]
    if (digits === undefined) return null
    const rgb = [0, 1, 2].map((i) => {
        const channel =
            Number.parseInt(digits.slice(i * 2, i * 2 + 2), 16) / 255
        return channel > 0.04045
            ? ((channel + 0.055) / 1.055) ** 2.4
            : channel / 12.92
    }) as [number, number, number]
    const [r, g, b] = rgb
    const X = r * 0.4124 + g * 0.3576 + b * 0.1805
    const Y = r * 0.2126 + g * 0.7152 + b * 0.0722
    const Z = r * 0.0193 + g * 0.1192 + b * 0.9505
    const sum = X + Y + Z
    if (sum === 0) return { x: 0.3127, y: 0.329 }
    return { x: round4(X / sum), y: round4(Y / sum) }
}

function clamp01(value: number): number {
    return Math.max(0, Math.min(1, value))
}

function round2(value: number): number {
    return Math.round(value * 100) / 100
}

function round3(value: number): number {
    return Math.round(value * 1000) / 1000
}

function round4(value: number): number {
    return Math.round(value * 10000) / 10000
}
