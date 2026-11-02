/**
 * Deterministic fake Controllers for tests at the Controller-provider seam.
 *
 * A `FakeController` stands in for one Home's Controller. Pass
 * `fakeControllerConnectors(...controllers)` as `connectors` to a
 * `ControllerConnection` (or `ControllerProvider`) and the real LAN-then-Relay
 * selection runs against scripted reachability, credentials, Devices, Rooms,
 * events, and Command results. Nothing touches the network.
 */
import {
    ApiError,
    type CommandResult,
    type Device,
    type DeviceCommand,
    type DeviceEvent,
    type HistoryQueryRead,
    type HomeMeterDesignation,
    type IdentifyResponse,
    type PairResponse,
    type Room,
    type SessionMintResult,
} from '@nemu/protocol'
import type { ControllerConnectors } from './connection.ts'
import type { ProbeResult } from './discovery.ts'
import type { GetToken } from './http.ts'
import type { ControllerTransport } from './transports/types.ts'

export type FakeControllerOptions = {
    controllerId: string
    name?: string
    /** LAN address this Controller answers on. */
    baseUrl?: string
    lanReachable?: boolean
    relayReachable?: boolean
    /** Six-digit code accepted by `pair`. */
    pairingCode?: string
    /** Tokens already issued to Access Clients. */
    acceptedTokens?: string[]
    devices?: Device[]
    rooms?: Room[]
}

type TransportMode = 'lan' | 'relay'

export class FakeController {
    readonly controllerId: string
    name: string
    baseUrl: string
    lanReachable: boolean
    relayReachable: boolean
    pairingCode: string
    devices: Device[]
    rooms: Room[]
    /** Override to script Command outcomes. */
    commandResult: (command: DeviceCommand) => CommandResult = () => ({
        requestId: `request-${this.commands.length}`,
        ok: true,
        outcome: 'accepted',
    })
    /** Commands received, in order, with the transport that carried them. */
    readonly commands: Array<{ command: DeviceCommand; via: TransportMode }> =
        []
    /** Every token any Access Client presented to this Controller. */
    readonly presentedTokens: Array<string | null> = []
    private readonly tokens: Set<string>
    private readonly transports = new Set<FakeTransport>()
    private issued = 0

    constructor(options: FakeControllerOptions) {
        this.controllerId = options.controllerId
        this.name = options.name ?? options.controllerId
        this.baseUrl = options.baseUrl ?? 'http://nemu.local:6368'
        this.lanReachable = options.lanReachable ?? true
        this.relayReachable = options.relayReachable ?? true
        this.pairingCode = options.pairingCode ?? '123456'
        this.tokens = new Set(options.acceptedTokens ?? [])
        this.devices = options.devices ?? []
        this.rooms = options.rooms ?? []
    }

    identity(): IdentifyResponse {
        return { controllerId: this.controllerId, name: this.name }
    }

    acceptsToken(token: string | null): boolean {
        return token !== null && this.tokens.has(token)
    }

    issueToken(): string {
        this.issued += 1
        const token = `${this.controllerId}-token-${this.issued}`
        this.tokens.add(token)
        return token
    }

    revokeToken(token: string): void {
        this.tokens.delete(token)
    }

    /** LAN code pairing, as `POST /api/pair` would answer. */
    pair(code: string): PairResponse {
        if (!this.lanReachable) {
            throw new ApiError('network_error', 'Network Error')
        }
        if (code !== this.pairingCode) {
            throw new ApiError(
                'invalid_code',
                'Pairing code is invalid or expired',
                401
            )
        }
        return {
            clientToken: this.issueToken(),
            controllerId: this.controllerId,
        }
    }

    /** Session mint over Relay for an existing Membership. */
    mintSession(): SessionMintResult {
        if (!this.relayReachable) {
            throw new Error(
                'Timed out waiting for the controller to mint a session'
            )
        }
        return {
            clientToken: this.issueToken(),
            controllerId: this.controllerId,
        }
    }

    /** Deliver an event to every connected transport. */
    emit(event: DeviceEvent): void {
        for (const transport of this.transports) transport.deliver(event)
    }

    /** Replace Devices and tell clients to refetch inventory. */
    setDevices(devices: Device[]): void {
        this.devices = devices
        this.emit({ type: 'resync' })
    }

    /** Disconnect live transports, as if the network dropped. */
    goOffline(): void {
        this.lanReachable = false
        this.relayReachable = false
        for (const transport of this.transports) transport.fail()
    }

    connectedTransports(): FakeTransport[] {
        return [...this.transports]
    }

    createTransport(mode: TransportMode, getToken: GetToken): FakeTransport {
        return new FakeTransport(this, mode, getToken)
    }

    /** @internal */
    track(transport: FakeTransport, connected: boolean): void {
        if (connected) this.transports.add(transport)
        else this.transports.delete(transport)
    }
}

export class FakeTransport implements ControllerTransport {
    readonly mode: TransportMode
    private readonly controller: FakeController
    private readonly getToken: GetToken
    private readonly listeners = new Set<(event: DeviceEvent) => void>()
    private failed = false

    constructor(
        controller: FakeController,
        mode: TransportMode,
        getToken: GetToken
    ) {
        this.controller = controller
        this.mode = mode
        this.getToken = getToken
    }

    /** The token this transport presents, for assertions. */
    currentToken(): string | null {
        return this.getToken()
    }

    async connect(): Promise<void> {
        if (!this.reachable()) {
            throw new ApiError('network_error', 'Network Error')
        }
        this.failed = false
        this.controller.track(this, true)
    }

    disconnect(): void {
        this.controller.track(this, false)
    }

    deliver(event: DeviceEvent): void {
        for (const listener of this.listeners) listener(event)
    }

    fail(): void {
        this.failed = true
    }

    async getDevices(): Promise<Device[]> {
        this.authorize()
        return structuredClone(this.controller.devices)
    }

    async getRooms(): Promise<Room[]> {
        this.authorize()
        return structuredClone(this.controller.rooms)
    }

    async sendCommand(command: DeviceCommand): Promise<CommandResult> {
        this.authorize()
        this.controller.commands.push({ command, via: this.mode })
        return this.controller.commandResult(command)
    }

    async queryHistory(): Promise<HistoryQueryRead> {
        throw new Error('History is not scripted on FakeController')
    }

    async getHomeMeterDesignation(): Promise<HomeMeterDesignation | null> {
        this.authorize()
        return null
    }

    async designateHomeMeter(): Promise<HomeMeterDesignation> {
        throw new Error('Home meter is not scripted on FakeController')
    }

    subscribeEvents(cb: (event: DeviceEvent) => void): () => void {
        this.listeners.add(cb)
        return () => {
            this.listeners.delete(cb)
        }
    }

    private reachable(): boolean {
        return this.mode === 'lan'
            ? this.controller.lanReachable
            : this.controller.relayReachable
    }

    private authorize(): void {
        if (this.failed || !this.reachable()) {
            throw new ApiError('network_error', 'Network Error')
        }
        const token = this.getToken()
        this.controller.presentedTokens.push(token)
        if (!this.controller.acceptsToken(token)) {
            throw new ApiError('unauthorized', 'Invalid client token', 401)
        }
    }
}

/**
 * Connectors that route discovery, identify, LAN, and Relay to fake
 * Controllers. Discovery returns the first reachable Controller whose
 * `baseUrl` is a candidate (or any reachable one without candidates).
 */
export function fakeControllerConnectors(
    ...controllers: FakeController[]
): ControllerConnectors {
    const byBaseUrl = (baseUrl: string) =>
        controllers.find(
            (controller) =>
                controller.lanReachable &&
                controller.baseUrl === baseUrl.replace(/\/$/, '')
        )

    return {
        async discover(
            candidates,
            rememberedBaseUrl
        ): Promise<ProbeResult | null> {
            const ordered = [
                ...(rememberedBaseUrl ? [rememberedBaseUrl] : []),
                ...(candidates ?? controllers.map((c) => c.baseUrl)),
            ]
            for (const baseUrl of ordered) {
                const controller = byBaseUrl(baseUrl)
                if (controller) {
                    return {
                        baseUrl: controller.baseUrl,
                        health: { status: 'ok' },
                    }
                }
            }
            return null
        },
        async identify(baseUrl) {
            const controller = byBaseUrl(baseUrl)
            if (!controller) {
                throw new ApiError('network_error', 'Network Error')
            }
            return controller.identity()
        },
        createLanTransport({ baseUrl, getToken }) {
            const controller = byBaseUrl(baseUrl)
            if (!controller) {
                throw new ApiError('network_error', 'Network Error')
            }
            return controller.createTransport('lan', getToken)
        },
        createRelayTransport({ controllerId, getToken }) {
            const controller = controllers.find(
                (candidate) => candidate.controllerId === controllerId
            )
            return controller?.createTransport('relay', getToken) ?? null
        },
    }
}

export {
    type AccessClientCredential,
    type ControllerCredentialStore,
    createMemoryCredentialStore,
} from './storage.ts'
