import {
    type EventMessage,
    MatterClient,
    type MatterNode,
    type WebSocketLike,
} from '@matter-server/ws-client'
import mqtt, { type MqttClient } from 'mqtt'
import WebSocket from 'ws'
import type { env as Env } from './env'
import {
    commandsForSet,
    deviceDescriptor,
    type EndpointDevice,
    endpointOfPath,
    isStateAttributePath,
    mapNode,
    stateForEndpoint,
} from './mapping'
import type { NameStore } from './names'

const STATE_DEBOUNCE_MS = 50
const RECONNECT_MIN_MS = 1_000
const RECONNECT_MAX_MS = 30_000

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
        const state = stateForEndpoint(node.attributes, entry.device.endpointId)
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
                entry.device.endpointId !== endpoint
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
            })
            this.publishDeviceState(id)
            this.publishAvailability(id)
        }
    }

    private onNodeUpdated(nodeId: string): void {
        this.rebuildIndex()
        for (const [id, entry] of this.index) {
            if (entry.device.nodeId !== nodeId) continue
            this.publishAvailability(id)
            this.publishDeviceState(id)
        }
    }

    private onNodeRemoved(nodeId: string): void {
        const removed = [...this.index.entries()].filter(
            ([, entry]) => entry.device.nodeId === nodeId
        )
        this.rebuildIndex()
        this.publishDevices()
        for (const [id] of removed) {
            this.publishBridgeEvent('device_leave', { ieee_address: id })
            // Clear retained state/availability so stale payloads don't revive the device.
            this.mqttClient.publish(this.topic(id), '', { retain: true })
            this.mqttClient.publish(this.topic(`${id}/availability`), '', {
                retain: true,
            })
        }
        this.names.retainOnly(new Set(this.index.keys()))
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
        if (entry.device.kind === 'energy') {
            console.warn('ignoring set on read-only energy device', id)
            return
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
                entry.device.endpointId,
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

        try {
            const bluetooth = matter.serverInfo.bluetooth_enabled
            if (wifiSsid.length > 0) {
                await matter.setWifiCredentials(wifiSsid, wifiPassword)
            }

            const hasWifi =
                wifiSsid.length > 0 || matter.serverInfo.wifi_credentials_set
            // Wi-Fi join needs BLE so credentials can be delivered. Everything
            // else prefers on-network discovery first (already on LAN / Ethernet).
            const preferBle = bluetooth && hasWifi
            console.log(
                `commissioning preferBle=${preferBle} bluetooth=${bluetooth} wifi=${hasWifi}`
            )

            this.respond('commission', transaction, {
                status: 'ok',
                data: { pending: true },
            })
            this.runCommission(matter, code, {
                bluetooth,
                preferBle,
            }).catch((error) => {
                const message = commissionErrorMessage(error)
                console.error('commissioning failed', message)
                this.publishBridgeEvent('device_interview', {
                    ieee_address: 'commissioning',
                    status: 'failed',
                    error: message,
                })
            })
        } catch (error) {
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
            const node = await matter.commissionWithCode(code, false)
            console.log(`commissioned node ${String(node.node_id)}`)
            return
        }

        try {
            const node = await matter.commissionWithCode(code, true)
            console.log(`commissioned node ${String(node.node_id)}`)
        } catch (networkError) {
            if (!options.bluetooth) throw networkError
            console.warn(
                'on-network commission failed; retrying over Bluetooth',
                commissionErrorMessage(networkError)
            )
            const node = await matter.commissionWithCode(code, false)
            console.log(`commissioned node ${String(node.node_id)}`)
        }
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

function commissionErrorMessage(error: unknown): string {
    const raw = errorMessage(error)
    if (/credentials-not-configured|credentials are configured/i.test(raw)) {
        return 'This device needs a 2.4 GHz Wi-Fi network to join. Enter the network in the pairing step, put the device back in pairing mode, and try again.'
    }
    if (/connecting to peripheral|No device could be commissioned/i.test(raw)) {
        return 'Found the device over Bluetooth but could not finish pairing. Put it back in pairing mode, keep it close to the controller, and try again.'
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
