/**
 * Deterministic fake Controllers for tests at the Controller-provider seam.
 *
 * A `FakeController` stands in for one Home's Controller. Pass
 * `fakeControllerConnectors(...controllers)` as `connectors` to a
 * `ControllerConnection` (or `ControllerProvider`) and the real LAN-then-Relay
 * selection runs against scripted reachability, credentials, Devices, Rooms,
 * events, Command results, and Device and Room setup (with Membership and
 * unsupported-Controller rejections). Nothing touches the network.
 */
import {
    ApiError,
    type AssignRoomRequest,
    type CommandResult,
    type CreateRoomRequest,
    type Device,
    type DeviceCommand,
    type DeviceEvent,
    type HistoryQueryRead,
    type HomeMeterDesignation,
    type IdentifyResponse,
    type PairResponse,
    type PatchDeviceRequest,
    type PatchRoomRequest,
    type RenameDeviceRequest,
    type RenameRoomRequest,
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
    /** Set false to act as a Controller that cannot answer a Rooms request. */
    roomsAvailable = true
    /** Override to script Command outcomes. */
    commandResult: (command: DeviceCommand) => CommandResult = () => ({
        requestId: `request-${this.commands.length}`,
        ok: true,
        outcome: 'accepted',
    })
    /** Commands received, in order, with the transport that carried them. */
    readonly commands: Array<{ command: DeviceCommand; via: TransportMode }> =
        []
    /** Set false to act as a Membership that is no longer active. */
    membershipActive = true
    /** Set false to act as a Controller that predates Device and Room setup. */
    setupSupported = true
    /** Setup requests that reached this Controller, with their transport. */
    readonly setupRequests: Array<{ type: string; via: TransportMode }> = []
    /** Device tombstones kept for removed Devices (ADR-0017). */
    readonly removedDevices: Device[] = []
    private createdRooms = 0
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

    /**
     * Apply one setup request with the Controller's rules: active Owners and
     * Members only, the same outcome over LAN and Relay.
     * @internal
     */
    setup<T>(type: string, via: TransportMode, apply: () => T): T {
        if (!this.setupSupported) {
            throw new ApiError(
                'unsupported_action',
                `This Controller does not support ${JSON.stringify(type)}. Update the Controller.`
            )
        }
        if (!this.membershipActive) {
            throw new ApiError(
                'membership_inactive',
                'This Membership is not active',
                403
            )
        }
        this.setupRequests.push({ type, via })
        return apply()
    }

    /** @internal */
    renameDevice({ deviceId, name }: RenameDeviceRequest): Device {
        const device = this.requireDevice(deviceId)
        device.name = requireName(name)
        return structuredClone(device)
    }

    /** @internal */
    assignRoom({ deviceId, componentId, roomId }: AssignRoomRequest): Device {
        const device = this.requireDevice(deviceId)
        if (roomId !== null) this.requireRoom(roomId)
        if (componentId === undefined) {
            device.roomId = roomId
        } else {
            const rooms = { ...device.componentRooms }
            if (roomId === null) delete rooms[componentId]
            else rooms[componentId] = roomId
            device.componentRooms =
                Object.keys(rooms).length > 0 ? rooms : undefined
        }
        return structuredClone(device)
    }

    /** @internal */
    removeDevice(deviceId: string): void {
        const device = this.requireDevice(deviceId)
        this.devices = this.devices.filter((other) => other !== device)
        this.removedDevices.push(device)
    }

    /** @internal */
    createRoom({ name, sortOrder }: CreateRoomRequest): Room {
        this.createdRooms += 1
        const room = {
            id: `room-${this.createdRooms}`,
            name: requireName(name),
            sortOrder: sortOrder ?? 0,
        }
        this.rooms.push(room)
        return structuredClone(room)
    }

    /** @internal */
    updateRoom(roomId: string, patch: PatchRoomRequest): Room {
        const room = this.requireRoom(roomId)
        if (patch.name !== undefined) room.name = requireName(patch.name)
        if (patch.sortOrder !== undefined) room.sortOrder = patch.sortOrder
        return structuredClone(room)
    }

    /** @internal */
    deleteRoom(roomId: string): void {
        const room = this.requireRoom(roomId)
        const occupied = this.devices.some(
            (device) =>
                device.roomId === roomId ||
                Object.values(device.componentRooms ?? {}).includes(roomId)
        )
        if (occupied) {
            throw new ApiError(
                'room_not_empty',
                "Move this Room's Devices and Components to another Room first",
                409
            )
        }
        this.rooms = this.rooms.filter((other) => other !== room)
    }

    private requireDevice(deviceId: string): Device {
        const device = this.devices.find((d) => d.id === deviceId)
        if (!device) {
            throw new ApiError('device_not_found', 'Device not found', 404)
        }
        return device
    }

    private requireRoom(roomId: string): Room {
        const room = this.rooms.find((r) => r.id === roomId)
        if (!room) throw new ApiError('room_not_found', 'Room not found', 404)
        return room
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
        if (!this.controller.roomsAvailable) {
            throw new Error('Relay command timed out')
        }
        return structuredClone(this.controller.rooms)
    }

    async sendCommand(command: DeviceCommand): Promise<CommandResult> {
        this.authorize()
        this.controller.commands.push({ command, via: this.mode })
        return this.controller.commandResult(command)
    }

    async renameDevice(request: RenameDeviceRequest): Promise<Device> {
        return this.setup('renameDevice', () =>
            this.controller.renameDevice(request)
        )
    }

    async assignRoom(request: AssignRoomRequest): Promise<Device> {
        return this.setup('assignRoom', () =>
            this.controller.assignRoom(request)
        )
    }

    async removeDevice(deviceId: string): Promise<void> {
        this.setup('removeDevice', () => this.controller.removeDevice(deviceId))
    }

    async forgetDevice(deviceId: string): Promise<void> {
        await this.removeDevice(deviceId)
    }

    async patchDevice(
        deviceId: string,
        patch: PatchDeviceRequest
    ): Promise<Device> {
        let device: Device | undefined
        if (patch.name !== undefined) {
            device = await this.renameDevice({ deviceId, name: patch.name })
        }
        if (patch.roomId !== undefined) {
            device = await this.assignRoom({ deviceId, roomId: patch.roomId })
        }
        if (!device) throw new ApiError('empty_patch', 'Nothing to change')
        return device
    }

    async createRoom(request: CreateRoomRequest): Promise<Room> {
        return this.setup('createRoom', () =>
            this.controller.createRoom(request)
        )
    }

    async renameRoom({ roomId, name }: RenameRoomRequest): Promise<Room> {
        return this.setup('updateRoom', () =>
            this.controller.updateRoom(roomId, { name })
        )
    }

    async patchRoom(roomId: string, patch: PatchRoomRequest): Promise<Room> {
        return this.setup('updateRoom', () =>
            this.controller.updateRoom(roomId, patch)
        )
    }

    async deleteRoom(roomId: string): Promise<void> {
        this.setup('deleteRoom', () => this.controller.deleteRoom(roomId))
    }

    private setup<T>(type: string, apply: () => T): T {
        this.authorize()
        return this.controller.setup(type, this.mode, apply)
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

function requireName(raw: string): string {
    const name = raw.trim()
    if (!name || name.length > 255) {
        throw new ApiError(
            'invalid_name',
            'Names must be 1 to 255 characters',
            400
        )
    }
    return name
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
