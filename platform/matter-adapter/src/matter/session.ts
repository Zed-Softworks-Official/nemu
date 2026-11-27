/**
 * Matter session: the only module that imports matter.js. It holds the Home's
 * Matter fabric under the data directory and offers everything else the
 * adapter needs in Nemu terms: node IDs, endpoints, cluster and attribute IDs,
 * and JSON values.
 */
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
    Environment,
    Logger,
    LogLevel,
    Seconds,
    ServerNode,
} from '@matter/main'
import { ControllerBehavior, StateStream } from '@matter/main/node'
import { DclCertificateService } from '@matter/main/protocol'
import { ManualPairingCodeCodec, QrPairingCodeCodec } from '@matter/main/types'
import {
    type AttributeSnapshot,
    attributeKey,
    type NodeId,
} from '../attributes.ts'
import type { Log } from '../log.ts'
import { attestationDecision, type Finding } from './attestation.ts'
import { toJson } from './values.ts'

export interface SessionOptions {
    /** The fabric and node storage live here. */
    dataDir: string
    paaDir: string
    cdDir: string
    allowTestCertificates: boolean
    /** UDP port the controller listens on; 0 lets the OS choose. */
    port?: number
    /** BLE commissioning on this HCI adapter; leave out to stay on-network only. */
    ble?: { hciId: number }
    log: Log
}

export interface WifiCredentials {
    ssid: string
    password: string
}

export interface CommissionRequest {
    /** Manual pairing code (digits, dashes allowed) or `MT:` QR payload. */
    code: string
    /** Aborting it cancels the attempt. */
    signal?: AbortSignal
    /**
     * Home Wi-Fi to give the Device. With it the attempt discovers over BLE as
     * well as on the network; without it, on the network only.
     */
    wifi?: WifiCredentials
}

/** Attribute values that changed, keyed `endpoint/cluster/attribute`. */
export type AttributeChanges = Record<string, unknown>

export interface MatterSession {
    start(): Promise<void>
    close(): Promise<void>
    /** Nodes in the fabric, ascending. */
    nodeIds(): NodeId[]
    /** Every attribute the node last reported, or undefined if it is unknown. */
    snapshot(nodeId: NodeId): AttributeSnapshot | undefined
    /** Whether a pairing code decodes, so a bad one is refused before the ack. */
    isPairingCode(code: string): boolean
    /** Whether a Bluetooth adapter is ready for commissioning. */
    bleAvailable(): boolean
    /** Commissions a Device onto the fabric and returns its node ID. */
    commission(request: CommissionRequest): Promise<NodeId>
    invoke(
        nodeId: NodeId,
        endpoint: number,
        cluster: number,
        command: number,
        fields?: Record<string, unknown>
    ): Promise<void>
    /** Attribute reports from any node, as they arrive. */
    onAttributes(
        listener: (nodeId: NodeId, changes: AttributeChanges) => void
    ): void
}

export class PairingCodeError extends Error {}

/** Decodes a pairing code into what discovery needs. Exported for tests. */
export function decodePairingCode(
    raw: string
):
    | { passcode: number; shortDiscriminator: number }
    | { passcode: number; longDiscriminator: number } {
    const code = raw.trim()
    if (code.toUpperCase().startsWith('MT:')) {
        const [first] = QrPairingCodeCodec.decode(code)
        if (!first) throw new PairingCodeError('pairing code is invalid')
        return {
            passcode: first.passcode,
            longDiscriminator: first.discriminator,
        }
    }
    const digits = code.replace(/[\s-]/g, '')
    if (!/^\d{11}(\d{10})?$/.test(digits))
        throw new PairingCodeError('pairing code is invalid')
    const decoded = ManualPairingCodeCodec.decode(digits)
    if (decoded.shortDiscriminator === undefined)
        throw new PairingCodeError('pairing code is invalid')
    return {
        passcode: decoded.passcode,
        shortDiscriminator: decoded.shortDiscriminator,
    }
}

type Controller = ServerNode
type Peer = Controller['peers'] extends Iterable<infer P> ? P : never
// Endpoints and behavior types are reached dynamically; matter.js types them
// per cluster, which the adapter's cluster-ID interface deliberately avoids.
// biome-ignore lint/suspicious/noExplicitAny: see above
type AnyEndpoint = any

export function createMatterSession(options: SessionOptions): MatterSession {
    return new MatterJsSession(options)
}

class MatterJsSession implements MatterSession {
    #node: Controller | undefined
    #abort = new AbortController()
    #listeners: ((nodeId: NodeId, changes: AttributeChanges) => void)[] = []

    constructor(private readonly options: SessionOptions) {}

    async start(): Promise<void> {
        Logger.level = LogLevel.WARN
        const environment = Environment.default
        environment.vars.set(
            'storage.path',
            join(this.options.dataDir, 'matter')
        )
        await this.#installTrustStore(environment)
        const ble = await this.#installBle(environment)
        this.#node = await ServerNode.create(
            ServerNode.RootEndpoint.with(ControllerBehavior),
            {
                id: 'nemu-matter',
                network: { port: this.options.port ?? 5540 },
                commissioning: { enabled: false },
                controller: { adminFabricLabel: 'Nemu', ble },
            }
        )
        await this.#node.start()
        if (ble && !this.bleAvailable())
            this.options.log.warn(
                'BLE failed to start; commissioning on-network only'
            )
        void this.#streamChanges(this.#node)
    }

    async close(): Promise<void> {
        this.#abort.abort()
        await this.#node?.close()
    }

    nodeIds(): NodeId[] {
        return this.#peers()
            .map((peer) => nodeIdOf(peer))
            .filter((id): id is NodeId => id !== undefined)
            .sort((a, b) => Number(BigInt(a) - BigInt(b)))
    }

    snapshot(nodeId: NodeId): AttributeSnapshot | undefined {
        const peer = this.#peer(nodeId)
        return peer ? snapshotOf(peer) : undefined
    }

    isPairingCode(code: string): boolean {
        try {
            decodePairingCode(code)
            return true
        } catch {
            return false
        }
    }

    bleAvailable(): boolean {
        return this.#node?.stateOf(ControllerBehavior).ble === true
    }

    async commission(request: CommissionRequest): Promise<NodeId> {
        const node = this.#requireNode()
        const identifier = decodePairingCode(request.code)
        let refusal: string | undefined
        const overBle = request.wifi !== undefined && this.bleAvailable()
        const peer = await node.peers.commission({
            ...identifier,
            ...(overBle && request.wifi
                ? {
                      // BLE and mDNS discovery run side by side; a Device
                      // already on the network skips the Wi-Fi steps.
                      discoveryCapabilities: { ble: true },
                      wifiNetwork: {
                          wifiSsid: request.wifi.ssid,
                          wifiCredentials: request.wifi.password,
                      },
                  }
                : {}),
            timeout: Seconds(120),
            abort: request.signal,
            onAttestationFailure: (findings: readonly Finding[]) => {
                const decision = attestationDecision(
                    findings,
                    this.options.allowTestCertificates
                )
                if (decision.accept) return true
                refusal = decision.reason
                return decision.reason
            },
        })
        if (refusal) throw new Error(refusal)
        const nodeId = nodeIdOf(peer)
        if (nodeId === undefined)
            throw new Error('commissioned node has no node ID')
        return nodeId
    }

    async invoke(
        nodeId: NodeId,
        endpoint: number,
        cluster: number,
        command: number,
        fields?: Record<string, unknown>
    ): Promise<void> {
        const peer = this.#peer(nodeId)
        if (!peer) throw new Error(`node ${nodeId} is not in the fabric`)
        const target = endpointsOf(peer).find(
            (candidate) => candidate.number === endpoint
        )
        if (!target)
            throw new Error(`node ${nodeId} has no endpoint ${endpoint}`)
        for (const [behaviorId, type] of Object.entries(
            target.behaviors.supported as Record<string, AnyEndpoint>
        )) {
            if (type?.cluster?.id !== cluster) continue
            const name = Object.entries(
                (type.cluster.commands ?? {}) as Record<string, AnyEndpoint>
            ).find(([, definition]) => commandIdOf(definition) === command)?.[0]
            if (!name)
                throw new Error(`cluster ${cluster} has no command ${command}`)
            const commands = target.commandsOf(behaviorId) as Record<
                string,
                (fields?: unknown) => Promise<unknown>
            >
            const call = commands[name]
            if (!call) throw new Error(`command ${name} is not available`)
            await call(fields)
            return
        }
        throw new Error(`endpoint ${endpoint} has no cluster ${cluster}`)
    }

    onAttributes(
        listener: (nodeId: NodeId, changes: AttributeChanges) => void
    ): void {
        this.#listeners.push(listener)
    }

    async #streamChanges(node: Controller): Promise<void> {
        try {
            for await (const change of StateStream(node, {
                abort: this.#abort.signal,
            })) {
                if (change.kind !== 'update') continue
                const nodeId = nodeIdOf(change.node as Peer)
                const cluster = (change.behavior as AnyEndpoint).cluster
                if (nodeId === undefined || typeof cluster?.id !== 'number')
                    continue
                const changes = attributeValues(
                    change.endpoint.number,
                    cluster,
                    change.changes
                )
                if (Object.keys(changes).length === 0) continue
                for (const listener of this.#listeners)
                    listener(nodeId, changes)
            }
        } catch (error) {
            if (!this.#abort.signal.aborted)
                this.options.log.error(
                    `matter state stream stopped: ${String(error)}`
                )
        }
    }

    /**
     * Registers matter.js BLE (noble over HCI) when the host has an adapter.
     * The import is dynamic so a host without Bluetooth never loads noble.
     */
    async #installBle(environment: Environment): Promise<boolean> {
        const ble = this.options.ble
        // matter.js also reads MATTER_BLE_ENABLE itself; this decision wins.
        environment.vars.set('ble.enable', false)
        if (!ble) return false
        try {
            await import('@matter/nodejs-ble')
            environment.vars.set('ble.hci.id', ble.hciId)
            environment.vars.set('ble.enable', true)
            this.options.log.info(`BLE commissioning on hci${ble.hciId}`)
            return true
        } catch (error) {
            this.options.log.warn(
                `BLE is unavailable; commissioning on-network only: ${String(error)}`
            )
            return false
        }
    }

    /** Loads the production roots from the existing root folders (DER files). */
    async #installTrustStore(environment: Environment): Promise<void> {
        const service = new DclCertificateService(environment, {
            offline: true,
            fetchTestCertificates: false,
            acceptTestCertificates: this.options.allowTestCertificates,
            updateInterval: null,
        })
        environment.set(DclCertificateService, service)
        await service.construction
        const loaded = { paa: 0, cd: 0 }
        for (const [dir, kind, key] of [
            [this.options.paaDir, 'PAA', 'paa'],
            [this.options.cdDir, 'CDSigner', 'cd'],
        ] as const) {
            for (const der of await derFiles(dir)) {
                try {
                    await service.addCertificate(der, kind, {
                        isProduction: true,
                    })
                    loaded[key] += 1
                } catch (error) {
                    this.options.log.warn(
                        `skipping unreadable ${kind} certificate: ${String(error)}`
                    )
                }
            }
        }
        this.options.log.info(
            `trust store: ${loaded.paa} PAA roots, ${loaded.cd} CD signers; test certificates ${this.options.allowTestCertificates ? 'allowed (dev/test)' : 'refused'}`
        )
    }

    #requireNode(): Controller {
        if (!this.#node) throw new Error('matter session is not started')
        return this.#node
    }

    #peers(): Peer[] {
        return this.#node ? [...this.#node.peers] : []
    }

    #peer(nodeId: NodeId): Peer | undefined {
        return this.#peers().find((peer) => nodeIdOf(peer) === nodeId)
    }
}

async function derFiles(dir: string): Promise<Uint8Array[]> {
    let names: string[]
    try {
        names = await readdir(dir)
    } catch {
        return []
    }
    const files = names
        .filter((name) => name.toLowerCase().endsWith('.der'))
        .sort()
    return Promise.all(
        files.map(
            async (name) => new Uint8Array(await readFile(join(dir, name)))
        )
    )
}

function nodeIdOf(peer: Peer): NodeId | undefined {
    const id = (peer as AnyEndpoint).peerAddress?.nodeId
    return id === undefined ? undefined : String(id)
}

function endpointsOf(peer: Peer): AnyEndpoint[] {
    return [...((peer as AnyEndpoint).endpoints as Iterable<AnyEndpoint>)]
}

function commandIdOf(definition: AnyEndpoint): number | undefined {
    const id = definition?.requestId ?? definition?.id
    return typeof id === 'number' ? id : undefined
}

function snapshotOf(peer: Peer): AttributeSnapshot {
    const snapshot: Record<string, unknown> = {}
    for (const endpoint of endpointsOf(peer)) {
        for (const [behaviorId, type] of Object.entries(
            endpoint.behaviors.supported as Record<string, AnyEndpoint>
        )) {
            const cluster = type?.cluster
            if (typeof cluster?.id !== 'number') continue
            Object.assign(
                snapshot,
                attributeValues(
                    endpoint.number,
                    cluster,
                    endpoint.stateOf(behaviorId)
                )
            )
        }
    }
    return snapshot
}

/** Named attribute values of one cluster, re-keyed by attribute ID. */
function attributeValues(
    endpoint: number,
    cluster: AnyEndpoint,
    values: Record<string, unknown>
): Record<string, unknown> {
    const out: Record<string, unknown> = {}
    const attributes = (cluster.attributes ?? {}) as Record<string, AnyEndpoint>
    for (const [name, value] of Object.entries(values)) {
        const id = attributes[name]?.id
        if (typeof id !== 'number' || value === undefined) continue
        out[attributeKey(endpoint, cluster.id, id)] = toJson(value)
    }
    return out
}
