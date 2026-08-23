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

export type EndpointKind = 'light' | 'switch' | 'strip'

export type StripOutlet = {
    endpointId: number
    name: string
}

export type EndpointDevice = {
    /** Nemu external id: `nodeId` for single-endpoint nodes and strips, else `nodeId:endpoint`. */
    id: string
    nodeId: string
    endpointId: number
    /** Child OnOff endpoints when `kind` is `strip`. */
    outlets?: StripOutlet[]
    /** First energy-only endpoint folded into this device's state, if any. */
    energyEndpointId?: number
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
    // Tapo P316M streams RMSVoltage (144/11) and periodic energy (145/3, 145/4)
    // long before ActivePower (144/8) or CumulativeEnergyImported (145/1).
    const powerPrefix = `${endpoint}/${CLUSTER.electricalPower}/`
    const energyPrefix = `${endpoint}/${CLUSTER.electricalEnergy}/`
    for (const key of Object.keys(attributes)) {
        if (key.startsWith(powerPrefix) || key.startsWith(energyPrefix)) {
            return true
        }
    }
    return false
}

function endpointKind(
    attributes: AttributesData,
    endpoint: number
): 'light' | 'switch' | null {
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
 * Map a Matter node to Nemu devices.
 *
 * A power strip (2+ OnOff switch endpoints, no lights) is one device with
 * nested outlets. Single plugs and lights stay one device per functional
 * endpoint. Energy-only endpoints are never devices — their readings fold
 * into the strip or the lone plug/light on the node.
 */
export function mapNode(snapshot: NodeSnapshot): EndpointDevice[] {
    const { attributes, nodeId } = snapshot
    const base = nodeBaseName(attributes, nodeId)
    const model = nodeModel(attributes)
    const vendor = nodeVendor(attributes)
    const { functional, energyOnly } = classifyEndpoints(attributes)
    const firstEnergy = energyOnly[0]
    const lights = functional.filter((item) => item.kind === 'light')
    const switches = functional.filter((item) => item.kind === 'switch')

    if (switches.length >= 2 && lights.length === 0) {
        const outlets: StripOutlet[] = switches.map((item, index) => ({
            endpointId: item.endpointId,
            name: `Outlet ${index + 1}`,
        }))
        const firstOutlet = outlets[0]
        if (firstOutlet === undefined) return []
        return [
            {
                id: nodeId,
                nodeId,
                endpointId: firstOutlet.endpointId,
                outlets,
                energyEndpointId: firstEnergy,
                defaultName: base,
                kind: 'strip',
                model,
                description: describeKind('strip', vendor),
            },
        ]
    }

    // Tapo-style strips often publish Electrical Power/Energy on every
    // outlet before OnOff/descriptor is in the snapshot. Treat 2+ energy
    // endpoints as one strip so pairing can finish.
    if (lights.length === 0 && energyOnly.length >= 2) {
        const outlets: StripOutlet[] = energyOnly.map((endpointId, index) => ({
            endpointId,
            name: `Outlet ${index + 1}`,
        }))
        const firstOutlet = outlets[0]
        if (firstOutlet === undefined) return []
        return [
            {
                id: nodeId,
                nodeId,
                endpointId: firstOutlet.endpointId,
                outlets,
                defaultName: base,
                kind: 'strip',
                model,
                description: describeKind('strip', vendor),
            },
        ]
    }

    const single = functional.length === 1
    const devices: EndpointDevice[] = []
    let index = 0
    for (const { endpointId, kind } of functional) {
        index += 1
        const suffix = kind === 'switch' ? `Outlet ${index}` : `${index}`
        devices.push({
            id: single ? nodeId : `${nodeId}:${endpointId}`,
            nodeId,
            endpointId,
            energyEndpointId: single ? firstEnergy : undefined,
            defaultName: functional.length === 1 ? base : `${base} · ${suffix}`,
            kind,
            model,
            description: describeKind(kind, vendor),
        })
    }

    return devices
}

/**
 * Same as {@link mapNode}, then a last-chance strip/switch from any non-root
 * endpoints so a commissioned fabric node still joins Nemu before OnOff
 * appears. Used by the sidecar inventory — not by unit tests that assert
 * the strict functional mapping.
 */
export function mapNodeWithFallback(snapshot: NodeSnapshot): EndpointDevice[] {
    const mapped = mapNode(snapshot)
    if (mapped.length > 0) return mapped
    const endpoints = listEndpoints(snapshot.attributes)
    if (endpoints.length === 0) return []
    const base = nodeBaseName(snapshot.attributes, snapshot.nodeId)
    const model = nodeModel(snapshot.attributes)
    const vendor = nodeVendor(snapshot.attributes)
    const first = endpoints[0]
    if (first === undefined) return []
    if (endpoints.length === 1) {
        return [
            {
                id: snapshot.nodeId,
                nodeId: snapshot.nodeId,
                endpointId: first,
                defaultName: base,
                kind: 'switch',
                model,
                description: describeKind('switch', vendor),
            },
        ]
    }
    return [
        {
            id: snapshot.nodeId,
            nodeId: snapshot.nodeId,
            endpointId: first,
            outlets: endpoints.map((endpointId, index) => ({
                endpointId,
                name: `Outlet ${index + 1}`,
            })),
            defaultName: base,
            kind: 'strip',
            model,
            description: describeKind('strip', vendor),
        },
    ]
}

/** Fabric member with no clusters in the snapshot yet (commission just finished). */
export function placeholderDevice(nodeId: string): EndpointDevice {
    return {
        id: nodeId,
        nodeId,
        endpointId: 1,
        defaultName: `Matter ${nodeId}`,
        kind: 'switch',
        model: 'Matter device',
        description: 'Matter device',
    }
}

function classifyEndpoints(attributes: AttributesData): {
    functional: Array<{
        endpointId: number
        kind: Exclude<EndpointKind, 'strip'>
    }>
    energyOnly: number[]
} {
    const functional: Array<{
        endpointId: number
        kind: Exclude<EndpointKind, 'strip'>
    }> = []
    const energyOnly: number[] = []
    for (const endpoint of listEndpoints(attributes)) {
        const kind = endpointKind(attributes, endpoint)
        if (kind !== null) {
            functional.push({ endpointId: endpoint, kind })
        } else if (hasEnergyMeasurement(attributes, endpoint)) {
            energyOnly.push(endpoint)
        }
    }
    return { functional, energyOnly }
}

/**
 * `{nodeId}:{endpoint}` ids the previous per-outlet mapping published.
 * Empty when that mapping already used a bare nodeId (single endpoint).
 */
export function collapsedLegacyIds(snapshot: NodeSnapshot): string[] {
    const mapped = mapNode(snapshot)
    if (mapped.length !== 1 || mapped[0]?.id !== snapshot.nodeId) {
        return []
    }

    const { attributes, nodeId } = snapshot
    const { functional, energyOnly } = classifyEndpoints(attributes)
    const controlsHaveEnergy = functional.some((item) =>
        hasEnergyMeasurement(attributes, item.endpointId)
    )
    const energyEndpoint =
        !controlsHaveEnergy && energyOnly.length > 0 ? energyOnly[0] : undefined
    const oldTotal = functional.length + (energyEndpoint !== undefined ? 1 : 0)
    if (oldTotal <= 1) return []

    const ids = functional.map((item) => `${nodeId}:${item.endpointId}`)
    if (energyEndpoint !== undefined) {
        ids.push(`${nodeId}:${energyEndpoint}`)
    }
    return ids
}

export function deviceCoversEndpoint(
    device: EndpointDevice,
    endpoint: number
): boolean {
    if (device.outlets?.some((outlet) => outlet.endpointId === endpoint)) {
        return true
    }
    if (device.energyEndpointId === endpoint) return true
    return device.endpointId === endpoint
}

function describeKind(kind: EndpointKind, vendor: string): string {
    const what =
        kind === 'light'
            ? 'Matter light'
            : kind === 'strip'
              ? 'Matter smart strip'
              : 'Matter on/off plug-in unit'
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

export function descriptorType(kind: EndpointKind): string {
    if (kind === 'light') return 'light'
    if (kind === 'strip') return 'strip'
    return 'switch'
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
    if (kind === 'strip') {
        return [
            {
                type: 'strip',
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

/**
 * Retained MQTT state for a mapped device. Strips nest per-outlet OnOff (and
 * any per-outlet energy) under `outlets` and fold aggregator energy at the top
 * level — never a top-level `state`, so the home tile is not a single switch.
 */
export function stateForDevice(
    device: EndpointDevice,
    attributes: AttributesData
): Record<string, unknown> {
    if (device.kind === 'strip' && device.outlets !== undefined) {
        const state: Record<string, unknown> = {
            outlets: device.outlets.map((outlet) => ({
                id: String(outlet.endpointId),
                name: outlet.name,
                ...stateForEndpoint(attributes, outlet.endpointId),
            })),
        }
        if (device.energyEndpointId !== undefined) {
            Object.assign(
                state,
                stateForEndpoint(attributes, device.energyEndpointId)
            )
        }
        return state
    }

    const state = stateForEndpoint(attributes, device.endpointId)
    if (device.energyEndpointId !== undefined) {
        Object.assign(
            state,
            stateForEndpoint(attributes, device.energyEndpointId)
        )
    }
    return state
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

export function outletIdFromSet(
    payload: Record<string, unknown>
): number | undefined {
    const raw = payload.outlet
    if (typeof raw === 'number' && Number.isInteger(raw)) return raw
    if (typeof raw === 'string' && raw.trim().length > 0) {
        const parsed = Number.parseInt(raw.trim(), 10)
        if (Number.isInteger(parsed)) return parsed
    }
    return undefined
}

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
                'outlet',
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
