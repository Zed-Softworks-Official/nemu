import {
    type EventMessage,
    MatterClient,
    MatterNode,
    type WebSocketLike,
} from '@matter-server/ws-client'
import mqtt, { type MqttClient } from 'mqtt'
import WebSocket from 'ws'
import type { env as Env } from './env'
import {
    hostLanInfo,
    ipsForMacs,
    ipv4Addresses,
    listLanNeighborRecords,
    macsFromText,
    pingReachable,
} from './lan-discover'
import {
    collapsedLegacyIds,
    commandsForSet,
    descriptorType,
    deviceCoversEndpoint,
    deviceDescriptor,
    type EndpointDevice,
    endpointOfPath,
    isStateAttributePath,
    mapNode,
    outletIdFromSet,
    stateForDevice,
} from './mapping'
import type { NameStore } from './names'
import { type ParsedPairingCode, parsePairingCode } from './pairing-code'

const STATE_DEBOUNCE_MS = 50
const RECONNECT_MIN_MS = 1_000
const RECONNECT_MAX_MS = 30_000
const LAN_COMMISSION_TIMEOUT_MS = 45_000
const LAN_COMMISSION_ATTEMPTS = 4
const LAN_COMMISSION_RETRY_MS = 5_000
const LAN_MDNS_DISCOVER_MS = 15_000

/** MatterClient with a hook into raw server events. */
class RawEventClient extends MatterClient {
    onEvent?: (event: EventMessage) => void

    protected override onRawEvent(event: EventMessage): void {
        this.onEvent?.(event)
    }
}

type IndexedDevice = {
    device: EndpointDevice
    friendlyName: string
    rawNodeId: number | bigint
}

export class MatterMqttBridge {
    private readonly mqttClient: MqttClient
    private matter: RawEventClient | null = null
    private matterConnected = false
    private stopped = false
    private reconnectDelay = RECONNECT_MIN_MS
    /** external id → device info, rebuilt on every inventory change. */
    private index = new Map<string, IndexedDevice>()
    private stateTimers = new Map<string, ReturnType<typeof setTimeout>>()
    private commissioning = false

    constructor(
        private readonly config: typeof Env,
        private readonly names: NameStore
    ) {
        this.mqttClient = mqtt.connect(config.MQTT_URL, {
            will: {
                topic: this.topic('bridge/state'),
                payload: Buffer.from(JSON.stringify({ state: 'offline' })),
                qos: 1,
                retain: true,
            },
        })
    }

    async start(): Promise<void> {
        this.mqttClient.on('connect', () => {
            console.log('mqtt connected')
            this.mqttClient.subscribe([
                this.topic('+/set'),
                this.topic('+/get'),
                this.topic('bridge/request/#'),
            ])
            if (this.matterConnected) {
                this.publishOnline()
            }
        })
        this.mqttClient.on('message', (topic, payload) => {
            this.handleMqttMessage(topic, payload.toString()).catch((error) => {
                console.error('mqtt message handling failed', topic, error)
            })
        })

        await this.connectMatterLoop()
    }

    async stop(): Promise<void> {
        this.stopped = true
        this.publish('bridge/state', JSON.stringify({ state: 'offline' }), true)
        this.matter?.disconnect()
        await new Promise<void>((resolve) =>
            this.mqttClient.end(false, {}, () => resolve())
        )
    }

    private topic(suffix: string): string {
        return `${this.config.MQTT_BASE_TOPIC}/${suffix}`
    }

    private publish(suffix: string, payload: string, retain = false): void {
        this.mqttClient.publish(this.topic(suffix), payload, { qos: 1, retain })
    }

    // ── matterjs-server connection ────────────────────────────────────────────

    private async connectMatterLoop(): Promise<void> {
        while (!this.stopped) {
            try {
                await this.connectMatter()
                return
            } catch (error) {
                console.error('matterjs-server connection failed', error)
                if (isMatterWsRefused(error)) {
                    console.error(
                        `matterjs-server is not listening on ${this.config.MATTER_WS_URL}. Check docker compose logs matterjs-server (often /data permissions) and start it with: pnpm infra`
                    )
                }
                await delay(this.reconnectDelay)
                this.reconnectDelay = Math.min(
                    this.reconnectDelay * 2,
                    RECONNECT_MAX_MS
                )
            }
        }
    }

    private async connectMatter(): Promise<void> {
        const client = new RawEventClient(
            this.config.MATTER_WS_URL,
            (url) => new WebSocket(url) as unknown as WebSocketLike
        )
        client.onEvent = (event) => this.handleMatterEvent(event)
        client.addEventListener('connection_lost', () => this.onMatterLost())

        await client.startListening()
        this.matter = client
        this.matterConnected = true
        this.reconnectDelay = RECONNECT_MIN_MS
        console.log(
            `connected to matterjs-server (sdk ${client.serverInfo.sdk_version}, bluetooth=${client.serverInfo.bluetooth_enabled}, ${Object.keys(client.nodes).length} nodes)`
        )
        this.publishOnline()
    }

    private onMatterLost(): void {
        if (!this.matterConnected) return
        this.matterConnected = false
        this.matter = null
        console.warn('matterjs-server connection lost')
        this.publish('bridge/state', JSON.stringify({ state: 'offline' }), true)
        if (!this.stopped) {
            void this.connectMatterLoop()
        }
    }

    private publishOnline(): void {
        this.publish('bridge/state', JSON.stringify({ state: 'online' }), true)
        this.rebuildIndex()
        this.publishDevices()
        this.emitCollapsedLeaves()
        for (const id of this.index.keys()) {
            this.publishDeviceState(id)
            this.publishAvailability(id)
        }
    }

    // ── inventory ─────────────────────────────────────────────────────────────

    private rebuildIndex(): void {
        const next = new Map<string, IndexedDevice>()
        for (const node of Object.values(this.matter?.nodes ?? {})) {
            const nodeId = String(node.node_id)
            for (const device of mapNode({
                nodeId,
                available: node.available,
                attributes: node.attributes,
            })) {
                next.set(device.id, {
                    device,
                    friendlyName:
                        this.names.get(device.id) ?? device.defaultName,
                    rawNodeId: node.node_id,
                })
            }
        }
        this.index = next
    }

    private publishDevices(): void {
        const descriptors = [...this.index.values()].map(
            ({ device, friendlyName }) => deviceDescriptor(device, friendlyName)
        )
        this.publish('bridge/devices', JSON.stringify(descriptors), true)
    }

    private nodeOf(id: string): MatterNode | undefined {
        const entry = this.index.get(id)
        if (!entry) return undefined
        return this.matter?.nodes[entry.device.nodeId]
    }

    private publishDeviceState(id: string): void {
        const entry = this.index.get(id)
        const node = this.nodeOf(id)
        if (!entry || !node) return
        const state = stateForDevice(entry.device, node.attributes)
        this.publish(id, JSON.stringify(state), true)
    }

    private publishAvailability(id: string): void {
        const node = this.nodeOf(id)
        if (!node) return
        this.publish(
            `${id}/availability`,
            JSON.stringify({ state: node.available ? 'online' : 'offline' }),
            true
        )
    }

    // ── matterjs-server events ────────────────────────────────────────────────

    private handleMatterEvent(event: EventMessage): void {
        // The client library applies the event to `client.nodes` after this
        // hook runs, so defer all reads until the next macrotask.
        if (event.event === 'attribute_updated') {
            const [nodeId, path] = event.data
            if (!isStateAttributePath(path)) return
            const endpoint = endpointOfPath(path)
            if (endpoint === undefined) return
            this.scheduleStateRefresh(String(nodeId), endpoint)
            return
        }

        if (event.event === 'node_added') {
            setImmediate(() => this.onNodeAdded(String(event.data.node_id)))
            return
        }

        if (event.event === 'node_updated') {
            setImmediate(() => this.onNodeUpdated(String(event.data.node_id)))
            return
        }

        if (event.event === 'node_removed') {
            setImmediate(() => this.onNodeRemoved(String(event.data)))
            return
        }
    }

    private scheduleStateRefresh(nodeId: string, endpoint: number): void {
        for (const [id, entry] of this.index) {
            if (
                entry.device.nodeId !== nodeId ||
                !deviceCoversEndpoint(entry.device, endpoint)
            )
                continue
            const existing = this.stateTimers.get(id)
            if (existing) clearTimeout(existing)
            this.stateTimers.set(
                id,
                setTimeout(() => {
                    this.stateTimers.delete(id)
                    this.publishDeviceState(id)
                }, STATE_DEBOUNCE_MS)
            )
        }
    }

    private onNodeAdded(nodeId: string): void {
        this.rebuildIndex()
        this.publishDevices()
        for (const [id, entry] of this.index) {
            if (entry.device.nodeId !== nodeId) continue
            this.publishJoin(id, entry)
        }
    }

    private onNodeUpdated(nodeId: string): void {
        const previousIds = new Set(
            [...this.index.entries()]
                .filter(([, entry]) => entry.device.nodeId === nodeId)
                .map(([id]) => id)
        )
        this.rebuildIndex()
        const current = [...this.index.entries()].filter(
            ([, entry]) => entry.device.nodeId === nodeId
        )
        const added = current.filter(([id]) => !previousIds.has(id))
        const gone = [...previousIds].filter(
            (id) => !current.some(([currentId]) => currentId === id)
        )
        if (added.length > 0 || gone.length > 0) {
            this.publishDevices()
            for (const [id, entry] of added) {
                this.publishJoin(id, entry)
            }
            for (const id of gone) {
                this.publishLeave(id)
            }
        }
        this.emitCollapsedLeavesForNode(nodeId)
        for (const [id] of current) {
            this.publishAvailability(id)
            this.publishDeviceState(id)
        }
    }

    private publishJoin(id: string, entry: IndexedDevice): void {
        this.publishBridgeEvent('device_joined', {
            friendly_name: entry.friendlyName,
            ieee_address: id,
        })
        this.publishBridgeEvent('device_interview', {
            friendly_name: entry.friendlyName,
            ieee_address: id,
            status: 'successful',
            supported: true,
            definition: {
                model: entry.device.model,
                description: entry.device.description,
            },
            type: descriptorType(entry.device.kind),
        })
        this.publishDeviceState(id)
        this.publishAvailability(id)
    }

    private onNodeRemoved(nodeId: string): void {
        const removed = [...this.index.entries()].filter(
            ([, entry]) => entry.device.nodeId === nodeId
        )
        this.rebuildIndex()
        this.publishDevices()
        for (const [id] of removed) {
            this.publishLeave(id)
        }
        this.names.retainOnly(new Set(this.index.keys()))
    }

    private emitCollapsedLeaves(): void {
        for (const node of Object.values(this.matter?.nodes ?? {})) {
            this.emitCollapsedLeavesForNode(String(node.node_id))
        }
    }

    private emitCollapsedLeavesForNode(nodeId: string): void {
        const node = this.matter?.nodes[nodeId]
        if (!node) return
        for (const id of collapsedLegacyIds({
            nodeId,
            available: node.available,
            attributes: node.attributes,
        })) {
            if (this.index.has(id)) continue
            this.publishLeave(id)
        }
    }

    private publishLeave(id: string): void {
        this.publishBridgeEvent('device_leave', { ieee_address: id })
        // Clear retained state/availability so stale payloads don't revive the device.
        this.mqttClient.publish(this.topic(id), '', { retain: true })
        this.mqttClient.publish(this.topic(`${id}/availability`), '', {
            retain: true,
        })
    }

    private publishBridgeEvent(
        type: string,
        data: Record<string, unknown>
    ): void {
        this.publish('bridge/event', JSON.stringify({ type, data }))
    }

    // ── MQTT command handling ─────────────────────────────────────────────────

    private async handleMqttMessage(
        topic: string,
        payload: string
    ): Promise<void> {
        const base = `${this.config.MQTT_BASE_TOPIC}/`
        if (!topic.startsWith(base)) return
        const rest = topic.slice(base.length)

        if (rest === 'bridge/request/commission') {
            await this.handleCommission(parseJson(payload))
            return
        }
        if (rest === 'bridge/request/device/remove') {
            await this.handleRemove(parseJson(payload))
            return
        }
        if (rest === 'bridge/request/device/rename') {
            this.handleRename(parseJson(payload))
            return
        }
        if (rest.startsWith('bridge/')) return

        if (rest.endsWith('/set')) {
            await this.handleSet(
                rest.slice(0, -'/set'.length),
                parseJson(payload)
            )
            return
        }
        if (rest.endsWith('/get')) {
            this.publishDeviceState(rest.slice(0, -'/get'.length))
        }
    }

    private async handleSet(
        id: string,
        payload: Record<string, unknown>
    ): Promise<void> {
        const entry = this.index.get(id)
        const matter = this.matter
        if (!entry || !matter) {
            console.warn('set for unknown device', id)
            return
        }

        let endpointId: number
        if (entry.device.kind === 'strip') {
            const outlet = outletIdFromSet(payload)
            const known = entry.device.outlets?.some(
                (item) => item.endpointId === outlet
            )
            if (outlet === undefined || !known) {
                console.warn(
                    'set for strip requires a known outlet',
                    id,
                    payload.outlet
                )
                return
            }
            endpointId = outlet
        } else {
            endpointId = entry.device.endpointId
        }

        const { actions, ignoredKeys } = commandsForSet(payload)
        if (ignoredKeys.length > 0) {
            console.warn(
                `ignoring unsupported set keys for ${id}:`,
                ignoredKeys.join(', ')
            )
        }
        for (const action of actions) {
            await matter.deviceCommand(
                entry.rawNodeId,
                endpointId,
                action.clusterId,
                action.commandName,
                action.payload
            )
        }
    }

    private async handleCommission(
        payload: Record<string, unknown>
    ): Promise<void> {
        const transaction =
            typeof payload.transaction === 'string'
                ? payload.transaction
                : undefined
        const code = normalizePairingCode(
            typeof payload.code === 'string' ? payload.code : ''
        )
        const wifiSsid =
            typeof payload.wifiSsid === 'string' ? payload.wifiSsid.trim() : ''
        const wifiPassword =
            typeof payload.wifiPassword === 'string' ? payload.wifiPassword : ''
        const matter = this.matter

        if (!matter) {
            this.respond('commission', transaction, {
                status: 'error',
                error: 'matter server not connected',
            })
            return
        }
        if (code.length === 0) {
            this.respond('commission', transaction, {
                status: 'error',
                error: 'pairing code is required',
            })
            return
        }
        if (this.commissioning) {
            this.respond('commission', transaction, {
                status: 'error',
                error: 'commissioning already in progress',
            })
            return
        }

        try {
            const bluetooth = matter.serverInfo.bluetooth_enabled
            if (wifiSsid.length > 0) {
                await matter.setWifiCredentials(wifiSsid, wifiPassword)
            }

            const hasWifi =
                wifiSsid.length > 0 || matter.serverInfo.wifi_credentials_set
            // Wi-Fi join has to go over BLE. On-network first looks like a
            // win when the strip is already on LAN, but PASE is refused after
            // a half-finished commission and we never reach Bluetooth.
            const preferBle = bluetooth && hasWifi
            console.log(
                `commissioning preferBle=${preferBle} bluetooth=${bluetooth} wifi=${hasWifi}`
            )

            this.respond('commission', transaction, {
                status: 'ok',
                data: { pending: true },
            })
            this.commissioning = true
            this.runCommission(matter, code, {
                bluetooth,
                preferBle,
            })
                .catch((error) => {
                    const message = commissionErrorMessage(error)
                    console.error('commissioning failed', message)
                    this.publishBridgeEvent('device_interview', {
                        ieee_address: 'commissioning',
                        status: 'failed',
                        error: message,
                    })
                })
                .finally(() => {
                    this.commissioning = false
                })
        } catch (error) {
            this.commissioning = false
            this.respond('commission', transaction, {
                status: 'error',
                error: commissionErrorMessage(error),
            })
        }
    }

    private async runCommission(
        matter: RawEventClient,
        code: string,
        options: { bluetooth: boolean; preferBle: boolean }
    ): Promise<void> {
        if (options.preferBle) {
            await this.commissionOverBleThenLan(matter, code)
            return
        }

        try {
            const node = await matter.commissionWithCode(code, true)
            console.log(`commissioned node ${String(node.node_id)} on-network`)
        } catch (networkError) {
            if (!options.bluetooth) throw networkError
            console.warn(
                'on-network commission failed; retrying over Bluetooth',
                commissionErrorMessage(networkError)
            )
            await this.commissionOverBleThenLan(matter, code)
        }
    }

    /**
     * BLE must carry Wi-Fi credentials. After join, matterjs often reconnects
     * to a stale IPv4 (previous DHCP lease on another subnet). Finish on the
     * real LAN address with `commission_on_network` + `ip_addr`.
     */
    private async commissionOverBleThenLan(
        matter: RawEventClient,
        code: string
    ): Promise<void> {
        const host = await hostLanInfo()

        try {
            const node = await matter.commissionWithCode(code, false)
            console.log(
                `commissioned node ${String(node.node_id)} over bluetooth`
            )
            return
        } catch (error) {
            const parsed = parsePairingCode(code)
            if (parsed === undefined || isBlePairingFailure(error)) {
                throw error
            }

            const fromMdns = await commissionableIpv4s(matter)
            const records =
                host === null ? [] : await listLanNeighborRecords(host)
            const fromMac = ipsForMacs(
                records,
                macsFromText(errorMessage(error))
            )
            const ips = await filterReachableIps([...fromMdns, ...fromMac])

            if (ips.length === 0 || !isStuckReconnect(error)) {
                throw error
            }

            console.warn(
                `BLE commission stuck at reconnect (${errorMessage(error)}); finishing on LAN at ${ips.join(', ')}`
            )
            const node = await this.commissionOnLan(matter, parsed, ips)
            console.log(
                `commissioned node ${String(node.node_id)} on-network after BLE Wi-Fi join`
            )
        }
    }

    private async commissionOnLan(
        matter: RawEventClient,
        parsed: ParsedPairingCode,
        ips: string[]
    ): Promise<MatterNode> {
        let lastError: unknown
        for (let attempt = 0; attempt < LAN_COMMISSION_ATTEMPTS; attempt++) {
            for (const ip of ips) {
                try {
                    const data = await matter.sendCommand(
                        'commission_on_network',
                        0,
                        {
                            setup_pin_code: parsed.passcode,
                            ip_addr: ip,
                            ...discoveryFilter(parsed),
                        },
                        LAN_COMMISSION_TIMEOUT_MS
                    )
                    return new MatterNode(data)
                } catch (error) {
                    lastError = error
                    console.warn(
                        `on-network commission at ${ip} failed`,
                        errorMessage(error)
                    )
                }
            }
            if (attempt + 1 < LAN_COMMISSION_ATTEMPTS) {
                await delay(LAN_COMMISSION_RETRY_MS)
            }
        }
        throw lastError instanceof Error
            ? lastError
            : new Error('on-network commission failed')
    }

    private async handleRemove(
        payload: Record<string, unknown>
    ): Promise<void> {
        const transaction =
            typeof payload.transaction === 'string'
                ? payload.transaction
                : undefined
        const id = typeof payload.id === 'string' ? payload.id : ''
        const matter = this.matter
        const entry = this.index.get(id)

        if (!matter || !entry) {
            this.respond('device/remove', transaction, {
                status: 'error',
                error: matter
                    ? `unknown device: ${id}`
                    : 'matter server not connected',
            })
            return
        }

        try {
            // Removing any sibling unpairs the whole node; every endpoint
            // device of this node disappears with the node_removed event.
            await matter.removeNode(entry.rawNodeId)
            this.respond('device/remove', transaction, {
                status: 'ok',
                data: { id },
            })
        } catch (error) {
            this.respond('device/remove', transaction, {
                status: 'error',
                error: errorMessage(error),
            })
        }
    }

    private handleRename(payload: Record<string, unknown>): void {
        const transaction =
            typeof payload.transaction === 'string'
                ? payload.transaction
                : undefined
        const from = typeof payload.from === 'string' ? payload.from : undefined
        const to = typeof payload.to === 'string' ? payload.to.trim() : ''

        if (from === undefined || to.length === 0) {
            this.respond('device/rename', transaction, {
                status: 'error',
                error: 'from and to are required',
            })
            return
        }

        // `from` is the external id (core renames by external id).
        this.names.set(from, to)
        const entry = this.index.get(from)
        if (entry) {
            entry.friendlyName = to
        }
        this.publishDevices()
        this.respond('device/rename', transaction, {
            status: 'ok',
            data: { from, to },
        })
    }

    private respond(
        endpoint: string,
        transaction: string | undefined,
        body: {
            status: 'ok' | 'error'
            data?: Record<string, unknown>
            error?: string
        }
    ): void {
        const payload: Record<string, unknown> = {
            status: body.status,
            data: body.data ?? {},
        }
        if (body.error !== undefined) payload.error = body.error
        if (transaction !== undefined) payload.transaction = transaction
        this.publish(`bridge/response/${endpoint}`, JSON.stringify(payload))
    }
}

function parseJson(payload: string): Record<string, unknown> {
    try {
        const value = JSON.parse(payload) as unknown
        return typeof value === 'object' && value !== null
            ? (value as Record<string, unknown>)
            : {}
    } catch {
        return {}
    }
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
}

function normalizePairingCode(code: string): string {
    const trimmed = code.trim()
    if (trimmed.toUpperCase().startsWith('MT:')) return trimmed
    return trimmed.replace(/[\s-]/g, '')
}

function discoveryFilter(parsed: ParsedPairingCode): {
    filter_type?: number
    filter?: number
} {
    if (parsed.longDiscriminator !== undefined) {
        return { filter_type: 2, filter: parsed.longDiscriminator }
    }
    if (parsed.shortDiscriminator !== undefined) {
        return { filter_type: 1, filter: parsed.shortDiscriminator }
    }
    return {}
}

function isBlePairingFailure(error: unknown): boolean {
    return /Can not connect to peripheral|does not advertise Matter Service|unexpected state|connecting to peripheral|discovery of node|No device could be commissioned/i.test(
        errorMessage(error)
    )
}

function isStuckReconnect(error: unknown): boolean {
    const raw = errorMessage(error)
    if (isBlePairingFailure(error)) return false
    if (/timed out|pairing window|credentials-not-configured/i.test(raw)) {
        return false
    }
    return /peer-unreachable|no address known|Address udp:\/\/\S+ unreachable/i.test(
        raw
    )
}

async function commissionableIpv4s(matter: RawEventClient): Promise<string[]> {
    try {
        const nodes =
            await matter.discoverCommissionableNodes(LAN_MDNS_DISCOVER_MS)
        return ipv4Addresses(nodes.flatMap((node) => node.addresses ?? []))
    } catch (error) {
        console.warn(
            'commissionable mDNS discovery failed',
            errorMessage(error)
        )
        return []
    }
}

async function filterReachableIps(ips: string[]): Promise<string[]> {
    const reachable: string[] = []
    for (const ip of ips) {
        if (await pingReachable(ip)) {
            reachable.push(ip)
        } else {
            console.warn(`skip unreachable LAN candidate ${ip}`)
        }
    }
    return reachable
}

function commissionErrorMessage(error: unknown): string {
    const raw = errorMessage(error)
    if (/credentials-not-configured|credentials are configured/i.test(raw)) {
        return 'This device needs a 2.4 GHz Wi-Fi network to join. Enter the network in the pairing step, put the device back in pairing mode, and try again.'
    }
    if (
        /connecting to peripheral|Can not connect to peripheral|does not advertise Matter Service|unexpected state|discovery of node|No device could be commissioned/i.test(
            raw
        )
    ) {
        return 'Found the device over Bluetooth but it is not accepting a pairing session. Factory-reset it (hold any outlet switch 10 seconds), keep it close to the controller, and try again with 2.4 GHz Wi-Fi filled in.'
    }
    if (/timed out/i.test(raw)) {
        return 'Bluetooth pairing timed out. Factory-reset the device (hold any outlet switch 10 seconds), keep it close to the controller, and try again with 2.4 GHz Wi-Fi filled in.'
    }
    if (
        /Could not connect to device|No device could be commissioned|unreachable/i.test(
            raw
        )
    ) {
        return 'The device is on Wi-Fi but not in pairing mode. Factory-reset it (hold any outlet switch 10 seconds), then pair once with 2.4 GHz Wi-Fi filled in.'
    }
    return raw
}

function isMatterWsRefused(error: unknown): boolean {
    if (!(error instanceof Error)) return false
    const hay = `${error.message} ${error.cause ?? ''}`
    return /ECONNREFUSED|WebSocket Error/i.test(hay)
}

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}
