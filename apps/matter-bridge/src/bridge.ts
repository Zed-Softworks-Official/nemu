import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import {
    type EventMessage,
    MatterClient,
    MatterNode,
    type WebSocketLike,
} from '@matter-server/ws-client'
import mqtt, { type MqttClient } from 'mqtt'
import WebSocket from 'ws'
import type { env as Env } from './env'
import { nodeIdFromEventData } from './event-id'
import {
    commissionCandidateIps,
    hostLanInfo,
    ipsForMacs,
    ipv4Addresses,
    listLanNeighborRecords,
    listLanNeighbors,
    macsFromText,
    pingReachable,
    watchNewLanIps,
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
    mapNodeWithFallback,
    outletIdFromSet,
    placeholderDevice,
    stateForDevice,
} from './mapping'
import type { NameStore } from './names'
import { type ParsedPairingCode, parsePairingCode } from './pairing-code'

const STATE_DEBOUNCE_MS = 50
const INDEX_REBUILD_MS = 100
const RECONNECT_MIN_MS = 1_000
const RECONNECT_MAX_MS = 30_000
const LAN_COMMISSION_TIMEOUT_MS = 20_000
const LAN_COMMISSION_ATTEMPTS = 2
const LAN_COMMISSION_RETRY_MS = 2_000
const LAN_MDNS_DISCOVER_MS = 15_000
const BLE_RETRY_ATTEMPTS = 2
const BLE_RETRY_DELAY_MS = 2_000
const BLE_COMMISSION_TIMEOUT_MS = 45_000
const MATTER_READY_TIMEOUT_MS = 90_000
const execCommand = promisify(exec)

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
    private connectingMatter = false
    private stopped = false
    private reconnectDelay = RECONNECT_MIN_MS
    /** external id → device info, rebuilt on every inventory change. */
    private index = new Map<string, IndexedDevice>()
    private stateTimers = new Map<string, ReturnType<typeof setTimeout>>()
    private indexTimers = new Map<string, ReturnType<typeof setTimeout>>()
    private commissioning = false
    private commissionGeneration = 0

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
        if (this.connectingMatter) return
        this.connectingMatter = true
        try {
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
                    if (this.commissioning) {
                        this.publishInterviewProgress(
                            'Waiting for the controller to come back'
                        )
                    }
                    await delay(this.reconnectDelay)
                    this.reconnectDelay = Math.min(
                        this.reconnectDelay * 2,
                        RECONNECT_MAX_MS
                    )
                }
            }
        } finally {
            this.connectingMatter = false
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
        if (this.commissioning) {
            this.publishInterviewProgress(
                'Waiting for the controller to come back'
            )
        }
        if (!this.stopped) {
            void this.connectMatterLoop()
        }
    }

    private publishOnline(): void {
        this.publish('bridge/state', JSON.stringify({ state: 'online' }), true)
        const previous = new Set(this.index.keys())
        this.rebuildIndex()
        this.publishDevices()
        this.emitCollapsedLeaves()
        let imported = false
        for (const [id, entry] of this.index) {
            if (previous.has(id) && !this.commissioning) {
                this.publishDeviceState(id)
                this.publishAvailability(id)
                continue
            }
            this.publishJoin(id, entry)
            imported = true
        }
        if (this.commissioning) {
            this.adoptFabricNodes(imported)
        }
    }

    // ── inventory ─────────────────────────────────────────────────────────────

    private devicesForNode(node: MatterNode): EndpointDevice[] {
        const nodeId = String(node.node_id)
        const mapped = mapNodeWithFallback({
            nodeId,
            available: node.available,
            attributes: node.attributes,
        })
        if (mapped.length > 0) return mapped
        return [placeholderDevice(nodeId)]
    }

    private rebuildIndex(): void {
        const next = new Map<string, IndexedDevice>()
        for (const node of Object.values(this.matter?.nodes ?? {})) {
            for (const device of this.devicesForNode(node)) {
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
            const id = String(nodeId)
            this.scheduleIndexRebuildIfUnknown(id)
            if (!isStateAttributePath(path)) return
            const endpoint = endpointOfPath(path)
            if (endpoint === undefined) return
            this.scheduleStateRefresh(id, endpoint)
            return
        }

        if (event.event === 'node_added') {
            const nodeId = nodeIdFromEventData(event.data)
            if (nodeId !== undefined) {
                setImmediate(() => this.onNodeAdded(nodeId))
            }
            return
        }

        if (event.event === 'node_updated') {
            const nodeId = nodeIdFromEventData(event.data)
            if (nodeId !== undefined) {
                setImmediate(() => this.onNodeUpdated(nodeId))
            }
            return
        }

        if (event.event === 'node_removed') {
            const nodeId = nodeIdFromEventData(event.data)
            if (nodeId !== undefined) {
                setImmediate(() => this.onNodeRemoved(nodeId))
            }
            return
        }
    }

    private nodeInIndex(nodeId: string): boolean {
        for (const entry of this.index.values()) {
            if (entry.device.nodeId === nodeId) return true
        }
        return false
    }

    private scheduleIndexRebuildIfUnknown(nodeId: string): void {
        if (this.nodeInIndex(nodeId)) return
        const existing = this.indexTimers.get(nodeId)
        if (existing) clearTimeout(existing)
        this.indexTimers.set(
            nodeId,
            setTimeout(() => {
                this.indexTimers.delete(nodeId)
                if (!this.nodeInIndex(nodeId)) this.onNodeUpdated(nodeId)
            }, INDEX_REBUILD_MS)
        )
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
        const previousEntries = [...this.index.entries()].filter(
            ([, entry]) => entry.device.nodeId === nodeId
        )
        const previousIds = new Set(previousEntries.map(([id]) => id))
        this.rebuildIndex()
        let current = [...this.index.entries()].filter(
            ([, entry]) => entry.device.nodeId === nodeId
        )
        // Incomplete snapshot (energy trickle, start_listening): keep the last
        // mapping while the node is still on the fabric so we do not MQTT-leave
        // a strip that just joined.
        if (
            current.length === 0 &&
            previousEntries.length > 0 &&
            this.matter?.nodes[nodeId] !== undefined
        ) {
            for (const [id, entry] of previousEntries) {
                this.index.set(id, entry)
            }
            current = previousEntries
            for (const [id] of current) {
                this.publishAvailability(id)
                this.publishDeviceState(id)
            }
            return
        }
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

    /** Import fabric nodes that are not yet in the MQTT index. */
    private importUnmappedNodes(): boolean {
        let imported = false
        for (const node of Object.values(this.matter?.nodes ?? {})) {
            const nodeId = String(node.node_id)
            if (this.nodeInIndex(nodeId)) continue
            this.onNodeAdded(nodeId)
            if (this.nodeInIndex(nodeId)) imported = true
        }
        return imported
    }

    private hasUnmappedNodes(): boolean {
        for (const node of Object.values(this.matter?.nodes ?? {})) {
            if (!this.nodeInIndex(String(node.node_id))) return true
        }
        return false
    }

    /**
     * If matterjs already has the node (LED solid, previous half-finished
     * pair), publish a join and skip another commission attempt.
     * Republishes join when the sidecar already indexed the node — core or
     * the wizard may have missed the first MQTT event.
     */
    private async adoptExistingNodes(): Promise<boolean> {
        if (this.importUnmappedNodes()) {
            console.log(
                'device already on the Matter fabric; skipping commission'
            )
            return true
        }
        if (this.index.size > 0) {
            this.publishInterviewProgress('Adding it to your home')
            this.republishJoins()
            console.log(
                'device already indexed; republishing join so pairing can finish'
            )
            return true
        }
        if (!this.hasUnmappedNodes()) return false
        this.publishInterviewProgress('Adding it to your home')
        this.republishJoins()
        return this.importUnmappedNodes() || this.index.size > 0
    }

    private republishJoins(): void {
        this.rebuildIndex()
        this.publishDevices()
        for (const [id, entry] of this.index) {
            this.publishJoin(id, entry)
        }
    }

    /**
     * Node is already on this fabric (reconnect or a previous half-finished
     * pair). Stop in-flight BLE/LAN so we do not commission it again.
     */
    private adoptFabricNodes(imported: boolean): void {
        if (!imported) return
        console.log('adopting nodes already on the Matter fabric')
        this.commissionGeneration += 1
        this.commissioning = false
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

        if (rest === 'bridge/request/commission/cancel') {
            this.handleCancelCommission(parseJson(payload))
            return
        }
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
            this.publishInterviewProgress('Looking for your device')
            const generation = this.commissionGeneration
            this.runCommission(matter, code, {
                bluetooth,
                preferBle,
            })
                .catch((error) => {
                    if (generation !== this.commissionGeneration) return
                    const message = commissionErrorMessage(error)
                    console.error('commissioning failed', message)
                    this.publishBridgeEvent('device_interview', {
                        ieee_address: 'commissioning',
                        status: 'failed',
                        error: message,
                    })
                })
                .finally(() => {
                    if (generation === this.commissionGeneration) {
                        this.commissioning = false
                    }
                })
        } catch (error) {
            this.commissioning = false
            this.respond('commission', transaction, {
                status: 'error',
                error: commissionErrorMessage(error),
            })
        }
    }

    private handleCancelCommission(payload: Record<string, unknown>): void {
        const transaction =
            typeof payload.transaction === 'string'
                ? payload.transaction
                : undefined
        this.abortCommission(true)
        this.respond('commission/cancel', transaction, {
            status: 'ok',
            data: {},
        })
    }

    private abortCommission(restartBle: boolean): void {
        const wasCommissioning = this.commissioning
        this.commissionGeneration += 1
        this.commissioning = false
        if (!wasCommissioning || !restartBle) return
        console.log('cancelling in-flight commission')
        void this.resetMatterBle().catch((error) => {
            console.error('BLE reset after cancel failed', errorMessage(error))
        })
    }

    private async resetMatterBle(): Promise<void> {
        const cmd = this.config.MATTERJS_RESTART_CMD.trim()
        if (cmd.length > 0) {
            console.log(`resetting matterjs-server BLE: ${cmd}`)
            try {
                await execCommand(cmd, { timeout: MATTER_READY_TIMEOUT_MS })
            } catch (error) {
                console.warn(
                    'matterjs-server restart failed',
                    errorMessage(error)
                )
                this.matter?.disconnect()
            }
        } else {
            this.matter?.disconnect()
        }
        await this.waitForMatter()
    }

    private async waitForMatter(): Promise<RawEventClient> {
        const deadline = Date.now() + MATTER_READY_TIMEOUT_MS
        if (!this.matterConnected && !this.stopped) {
            void this.connectMatterLoop()
        }
        while (Date.now() < deadline) {
            if (this.matter && this.matterConnected) return this.matter
            await delay(250)
        }
        throw new Error('matter server did not reconnect')
    }

    private async runCommission(
        matter: RawEventClient,
        code: string,
        options: { bluetooth: boolean; preferBle: boolean }
    ): Promise<void> {
        if (await this.adoptExistingNodes()) return
        this.publishInterviewProgress('Connecting to your device')
        if (options.preferBle) {
            await this.commissionOverBleThenLan(code)
            return
        }

        try {
            const node = await matter.commissionWithCode(code, true)
            this.finishCommission(node, 'on-network')
        } catch (networkError) {
            if (!options.bluetooth) throw networkError
            console.warn(
                'on-network commission failed; retrying over Bluetooth',
                commissionErrorMessage(networkError)
            )
            await this.commissionOverBleThenLan(code)
        }
    }

    /**
     * BLE must carry Wi-Fi credentials. After join, matterjs often hangs on
     * operational reconnect (LED already solid) instead of returning. Race
     * BLE against fabric adopt, then finish on LAN neighbor / mDNS IPs.
     */
    private async commissionOverBleThenLan(code: string): Promise<void> {
        const host = await hostLanInfo()
        const before =
            host === null
                ? new Set<string>()
                : new Set(await listLanNeighbors(host, { liveOnly: false }))
        const lanWatch = host === null ? null : watchNewLanIps(before, host)
        let lastError: unknown

        try {
            for (let attempt = 0; attempt < BLE_RETRY_ATTEMPTS; attempt++) {
                if (await this.adoptExistingNodes()) return
                let matter = this.matter
                if (!matter) {
                    try {
                        matter = await this.waitForMatter()
                    } catch {
                        throw lastError instanceof Error
                            ? lastError
                            : new Error('matter server not connected')
                    }
                }
                try {
                    this.publishInterviewProgress('Connecting to your device')
                    const node = await this.commissionBleOrAdopt(matter, code)
                    this.finishCommission(node, 'over bluetooth')
                    return
                } catch (error) {
                    lastError = error
                    if (await this.adoptExistingNodes()) return
                    if (
                        attempt + 1 < BLE_RETRY_ATTEMPTS &&
                        isNobleBleFailure(error)
                    ) {
                        console.warn(
                            `BLE connect failed; retrying without restarting matterjs (${errorMessage(error)})`
                        )
                        await delay(BLE_RETRY_DELAY_MS)
                        continue
                    }
                    break
                }
            }

            const error = lastError
            if (await this.adoptExistingNodes()) return
            const parsed = parsePairingCode(code)
            const matter = this.matter
            if (parsed === undefined || matter === null) {
                throw error instanceof Error
                    ? error
                    : new Error('commissioning failed')
            }

            this.publishInterviewProgress('Adding it to your home')
            this.republishJoins()
            if (this.index.size > 0) {
                console.log(
                    'finishing pairing from fabric inventory after BLE stall'
                )
                return
            }
            const fromMdns = await commissionableIpv4s(matter)
            const records =
                host === null
                    ? []
                    : await listLanNeighborRecords(host, { liveOnly: false })
            const fromMac = ipsForMacs(
                records,
                macsFromText(errorMessage(error))
            )
            const discovered = [
                ...(lanWatch?.found() ?? []),
                ...fromMdns,
                ...fromMac,
            ]
            const candidates =
                host === null
                    ? discovered
                    : commissionCandidateIps(discovered, [], host)
            const lanIps = await filterReachableIps(candidates)

            if (lanIps.length > 0) {
                console.warn(
                    `BLE commission stalled (${errorMessage(error)}); finishing on LAN at ${lanIps.join(', ')}`
                )
                const node = await this.commissionOnLan(matter, parsed, lanIps)
                this.finishCommission(node, 'on-network after BLE')
                return
            }

            throw error instanceof Error
                ? error
                : new Error('commissioning failed')
        } finally {
            lanWatch?.stop()
        }
    }

    /**
     * BLE `commission_with_code` can sit past Wi-Fi join until the default
     * 5-minute timeout. Adopt as soon as the node is on this fabric.
     */
    private async commissionBleOrAdopt(
        matter: RawEventClient,
        code: string
    ): Promise<MatterNode> {
        const ble = matter.commissionWithCode(code, false, {
            timeout: BLE_COMMISSION_TIMEOUT_MS,
        })
        void ble.catch((error) => {
            console.warn('background BLE commission ended', errorMessage(error))
        })
        return await new Promise<MatterNode>((resolve, reject) => {
            let settled = false
            const finish = (next: () => void) => {
                if (settled) return
                settled = true
                clearInterval(timer)
                next()
            }
            const timer = setInterval(() => {
                if (!this.importUnmappedNodes()) return
                const node = this.firstFabricNode()
                if (node === undefined) return
                finish(() => resolve(node))
            }, 250)
            void ble.then(
                (node) => finish(() => resolve(node)),
                (error) => finish(() => reject(error))
            )
        })
    }

    private firstFabricNode(): MatterNode | undefined {
        const nodes = Object.values(this.matter?.nodes ?? {})
        return nodes[0]
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

    private finishCommission(node: MatterNode, via: string): void {
        const nodeId = String(node.node_id)
        console.log(`commissioned node ${nodeId} ${via}`)
        this.onNodeAdded(nodeId)
    }

    private publishInterviewProgress(message: string): void {
        this.publishBridgeEvent('device_interview', {
            ieee_address: 'commissioning',
            status: 'started',
            message,
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

function isNobleBleFailure(error: unknown): boolean {
    return /interface not found|DBus\.Properties|unexpected state|Can not connect to peripheral|Error while connecting to peripheral|does not advertise Matter Service|No device could be commissioned|discovery of node/i.test(
        errorMessage(error)
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
        return 'Found the device over Bluetooth but the adapter could not open a pairing session. Disconnect other Bluetooth devices on this machine, factory-reset the strip (hold any outlet switch 10 seconds), keep it close, and try once more with 2.4 GHz Wi-Fi filled in.'
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
