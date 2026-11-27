/**
 * Deterministic fake Controllers for tests at the Controller-provider seam.
 *
 * A `FakeController` stands in for one Home's Controller. Pass
 * `fakeControllerConnectors(...controllers)` as `connectors` to a
 * `ControllerConnection` (or `ControllerProvider`) and the real LAN-then-Relay
 * selection runs against scripted reachability, credentials, Devices, Rooms,
 * events, Command results, Device and Room setup (with Membership and
 * unsupported-Controller rejections), and commissioning over LAN and Relay
 * with progress events. Nothing touches the network.
 */
import {
    ApiError,
    type ApplyUpdateResponse,
    type AssignRoomRequest,
    type ClientToken,
    type CommandResult,
    type CommissioningProgress,
    type CommissionRequest,
    type CommissionResponse,
    type CreateRoomRequest,
    type Device,
    type DeviceCommand,
    type DeviceEvent,
    type HealthSummary,
    type HistoryQuery,
    type HistoryQueryRead,
    type HomeMeterDesignation,
    type HouseholdMember,
    type IdentifyResponse,
    type MatterWifiResponse,
    type PairResponse,
    type PatchDeviceRequest,
    type PatchRoomRequest,
    type PermitJoinResponse,
    type RenameDeviceRequest,
    type RenameRoomRequest,
    type Room,
    type SaveMatterWifiRequest,
    type SessionMintResult,
    type SessionResponse,
    type SessionRole,
    type UpdateStatusResponse,
} from '@nemu/protocol'
import type { ControllerConnectors } from './connection.ts'
import type { ProbeResult } from './discovery.ts'
import type { GetToken } from './http.ts'
import type { ReleaseUpdateKind } from './release-update.ts'
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
    /** Tokens already issued to this Membership's Access Clients. */
    acceptedTokens?: string[]
    /** Tokens held by other Memberships; leaving never revokes these. */
    otherMembershipTokens?: string[]
    devices?: Device[]
    rooms?: Room[]
    /** The designated Home meter, or null when none is set. */
    homeMeter?: HomeMeterDesignation | null
    /** This Membership's role. Defaults to `member`. */
    role?: SessionRole
}

type TransportMode = 'lan' | 'relay'

/** Readings behind the fake Controller health summary. */
export type FakeHealthReadings = {
    mqtt: boolean
    zigbee: boolean
    matter: boolean
    database: boolean
    relayConnected: boolean
}

export class FakeController {
    readonly controllerId: string
    name: string
    baseUrl: string
    lanReachable: boolean
    relayReachable: boolean
    pairingCode: string
    devices: Device[]
    rooms: Room[]
    homeMeter: HomeMeterDesignation | null
    /** Override to script History. By default History is not scripted. */
    history: (query: HistoryQuery) => HistoryQueryRead = () => {
        throw new Error('History is not scripted on FakeController')
    }
    /** History queries received, in order, with the transport that carried them. */
    readonly historyQueries: Array<{
        query: HistoryQuery
        via: TransportMode
    }> = []
    /** False when the Controller is reached but fails to return its Devices. */
    devicesAvailable = true
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
    /** Set true to act as the Home's last Owner, who cannot leave. */
    lastOwner = false
    /** Transports that carried a successful `leaveHome`. */
    readonly leftVia: TransportMode[] = []
    /** Transports that carried a successful `revokeCurrent`. */
    readonly revokedVia: TransportMode[] = []
    /** Seconds Zigbee permit-join was last opened for; 0 when closed. */
    zigbeeJoinOpenFor = 0
    /** The Matter commissioning in progress on this Controller, if any. */
    matterCommissioning: CommissionRequest | null = null
    /** Wi-Fi the Controller has saved for Matter commissioning. */
    matterWifi: MatterWifiResponse = { configured: false }
    /** Commissioning requests that reached this Controller. */
    readonly commissioningRequests: Array<{
        type: string
        via: TransportMode
    }> = []
    /**
     * Audit log entries for commissioning started over Relay, as Core writes
     * them: the protocol only, never a Device identifier.
     */
    readonly relayCommissioningAudit: Array<{ protocol: 'zigbee' }> = []
    /** Household members the Controller lists. */
    members: HouseholdMember[] = []
    /** Access Clients the Controller lists. */
    accessClients: ClientToken[] = []
    /** Installed Release status, or null when the Controller cannot read it. */
    releaseStatus: UpdateStatusResponse | null = null

    /** This Membership's role, reported by `getSession` over LAN and Relay. */
    role: SessionRole
    /** Scripted service and Controller readings for the health summary. */
    health: FakeHealthReadings = {
        mqtt: true,
        zigbee: true,
        matter: true,
        database: true,
        relayConnected: true,
    }
    /** Transports that carried a health summary request. */
    readonly healthRequests: TransportMode[] = []
    /** Transports that carried a Release status read. */
    readonly releaseStatusRequests: TransportMode[] = []
    /** The Release a rollback returns to. */
    previousPlatformVersion = '0.0.0'
    /** Installs and rollbacks that reached this Controller. */
    readonly releaseUpdates: Array<{
        type: ReleaseUpdateKind
        via: TransportMode
        /** The confirmed Release, when the client sent one. */
        platformVersion?: string
    }> = []
    private reachableBeforeRestart: { lan: boolean; relay: boolean } | null =
        null
    private readonly tokens: Set<string>
    private readonly otherMembershipTokens: Set<string>
    private readonly transports = new Set<FakeTransport>()
    private issued = 0

    constructor(options: FakeControllerOptions) {
        this.controllerId = options.controllerId
        this.name = options.name ?? options.controllerId
        this.baseUrl = options.baseUrl ?? 'http://nemu.local:6368'
        this.lanReachable = options.lanReachable ?? true
        this.relayReachable = options.relayReachable ?? true
        this.pairingCode = options.pairingCode ?? '123456'
        this.otherMembershipTokens = new Set(
            options.otherMembershipTokens ?? []
        )
        this.tokens = new Set([
            ...(options.acceptedTokens ?? []),
            ...this.otherMembershipTokens,
        ])
        this.devices = options.devices ?? []
        this.rooms = options.rooms ?? []
        this.homeMeter = options.homeMeter ?? null
        this.role = options.role ?? 'member'
    }

    /** The session's Membership role; an inactive Membership is refused. */
    session(): SessionResponse {
        if (!this.membershipActive) {
            throw new ApiError(
                'inactive_membership',
                'This Membership is not active',
                403
            )
        }
        return { role: this.role }
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

    /** `leaveHome`: ends this Membership and revokes all of its tokens. */
    leaveHome(via: TransportMode): void {
        if (!this.membershipActive) {
            throw new ApiError(
                'inactive_membership',
                'This Membership is not active',
                403
            )
        }
        if (this.lastOwner) {
            throw new ApiError(
                'last_owner',
                'The last Owner cannot leave the Home',
                403
            )
        }
        for (const token of [...this.tokens]) {
            if (!this.otherMembershipTokens.has(token)) {
                this.tokens.delete(token)
            }
        }
        this.leftVia.push(via)
    }

    /** `revokeCurrent`: revokes only the presenting Access Client. */
    revokeCurrent(token: string, via: TransportMode): void {
        this.tokens.delete(token)
        this.revokedVia.push(via)
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

    /** Report Matter commissioning progress, as the Controller does. */
    commissionProgress(stage: string, message?: string): void {
        this.emit({ type: 'commissionProgress', stage, message })
    }

    /**
     * Report a Protocol-neutral commissioning step, as the Controller does:
     * over LAN only. Relay carries no progress until NEM-63 encrypts it.
     */
    commissioningStep(progress: CommissioningProgress): void {
        const event: DeviceEvent = { type: 'commissioningStep', ...progress }
        for (const transport of this.transports) {
            if (transport.mode === 'lan') transport.deliver(event)
        }
    }

    /** A new Device joins the Home, ending any commissioning in progress. */
    joinDevice(device: Device): void {
        this.devices = [...this.devices, structuredClone(device)]
        this.matterCommissioning = null
        this.emit({ type: 'deviceJoined', device: structuredClone(device) })
    }

    /**
     * Apply one commissioning request with the Controller's rules: active
     * Owners and Members only, and nothing carrying a Matter pairing code or
     * Wi-Fi credentials over Relay (ADR-0034, NEM-63). Zigbee commissioning
     * started over Relay is audited before it starts.
     * @internal
     */
    commission<T>(
        type: string,
        via: TransportMode,
        apply: () => T,
        startsZigbee = false
    ): T {
        this.refuseLanOnly(type, via)
        this.requireActiveMembership()
        if (via === 'relay' && startsZigbee) {
            this.relayCommissioningAudit.push({ protocol: 'zigbee' })
        }
        this.commissioningRequests.push({ type, via })
        return apply()
    }

    /** @internal Like Core's `LAN_ONLY_ACTIONS`. */
    refuseLanOnly(type: string, via: TransportMode): void {
        const lanOnly = ['commissionMatter', 'getMatterWifi', 'saveMatterWifi']
        if (via === 'relay' && lanOnly.includes(type)) {
            throw new ApiError(
                'unsupported_action',
                `${JSON.stringify(type)} is not available over Relay. It needs this phone on the Home network.`
            )
        }
    }

    /** @internal */
    requireActiveMembership(): void {
        if (!this.membershipActive) {
            throw new ApiError(
                'inactive_membership',
                'This Membership is not active',
                403
            )
        }
    }

    /**
     * Release status as Core returns it: any active Owner or Member may read
     * it; installing and rolling back stay Owner-only.
     * @internal
     */
    readRelease(via: TransportMode): UpdateStatusResponse {
        if (!this.membershipActive) {
            throw new ApiError(
                'inactive_membership',
                'This Membership is not active',
                403
            )
        }
        if (!this.releaseStatus) {
            throw new ApiError(
                'updater_unavailable',
                'The Updater is unavailable',
                503
            )
        }
        this.releaseStatusRequests.push(via)
        return structuredClone(this.releaseStatus)
    }

    /**
     * Starts an install or rollback as Core does: Owners only. The Home
     * enters maintenance and answers; it restarts on `restart()`.
     * @internal
     */
    startReleaseUpdate(
        type: ReleaseUpdateKind,
        via: TransportMode,
        platformVersion?: string
    ): ApplyUpdateResponse {
        this.requireActiveMembership()
        if (this.role !== 'owner') {
            throw new ApiError(
                'owner_required',
                'Only the home owner can do that',
                403
            )
        }
        const release = this.requireReleaseStatus()
        const available = release.availableRelease?.platformVersion
        if (platformVersion !== undefined && platformVersion !== available) {
            throw new ApiError(
                'release_changed',
                'A different Release is available now. Check it before installing.',
                409
            )
        }
        this.releaseUpdates.push({ type, via, platformVersion })
        release.maintenanceMode = true
        return { started: true }
    }

    /** The Controller restarts: nothing answers over LAN or Relay. */
    restart(): void {
        this.reachableBeforeRestart ??= {
            lan: this.lanReachable,
            relay: this.relayReachable,
        }
        this.goOffline()
    }

    /** The Controller is back, on the transports it answered before. */
    finishRestart(): void {
        if (!this.reachableBeforeRestart) return
        this.lanReachable = this.reachableBeforeRestart.lan
        this.relayReachable = this.reachableBeforeRestart.relay
        this.reachableBeforeRestart = null
    }

    /**
     * Ends the update. A failed install returns to the Release it replaced,
     * which stays available, as on a Home whose health gate failed.
     */
    finishReleaseUpdate(
        outcome: 'installed' | 'rolledBack' | 'notApplied' | 'rollbackStuck'
    ): void {
        const release = this.requireReleaseStatus()
        const type = this.releaseUpdates.at(-1)?.type
        if (outcome === 'installed') {
            this.previousPlatformVersion = release.platformVersion
            release.platformVersion =
                release.availableRelease?.platformVersion ?? 'unknown'
            release.newerReleaseAvailable = false
            release.availableRelease = null
        }
        if (outcome === 'rolledBack' && type === 'rollback') {
            release.platformVersion = this.previousPlatformVersion
        }
        if (outcome !== 'notApplied') release.rollbackSnapshotAvailable = true
        release.rollbackStuck = outcome === 'rollbackStuck'
        release.maintenanceMode = outcome === 'rollbackStuck'
        this.finishRestart()
    }

    private requireReleaseStatus(): UpdateStatusResponse {
        if (!this.releaseStatus) {
            throw new ApiError(
                'updater_unavailable',
                'The Updater is unavailable',
                503
            )
        }
        return this.releaseStatus
    }

    /**
     * The summary Core would return for this caller: Owners get Controller
     * details, Members only service and Device availability (ADR-0006).
     * @internal
     */
    healthSummary(via: TransportMode): HealthSummary {
        if (!this.membershipActive) {
            throw new ApiError(
                'inactive_membership',
                'This Membership is not active',
                403
            )
        }
        this.healthRequests.push(via)
        const { mqtt, zigbee, matter, database, relayConnected } = this.health
        const common = {
            status: database ? (mqtt ? 'ok' : 'degraded') : 'error',
            services: { mqtt, zigbee, matter },
            devices: {
                online: this.devices.filter((device) => device.online).length,
                total: this.devices.length,
            },
        } as const
        return this.role === 'owner'
            ? {
                  view: 'owner',
                  ...common,
                  controller: { database, relayConnected },
              }
            : { view: 'member', ...common }
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
                'inactive_membership',
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

    /** Room deletions this Controller carried out, in order. */
    readonly deletedRooms: Array<{
        roomId: string
        destinationRoomId: string | null
        via: TransportMode
    }> = []

    /** Audit log entries for Room deletions, with Core's detail. */
    readonly roomDeletionAudit: Array<{
        roomId: string
        roomName: string
        destinationRoomId: string | null
        devicesMoved: number
        componentsMoved: number
    }> = []

    /**
     * @internal Like Core: moves every Device in the Room, and every
     * Component explicitly assigned to it, to the destination, then deletes
     * the Room. A Component moving to No Room loses its explicit
     * assignment. An invalid destination changes nothing.
     */
    deleteRoom(
        roomId: string,
        destinationRoomId: string | null,
        via: TransportMode
    ): void {
        if (destinationRoomId === roomId) {
            throw new ApiError(
                'invalid_destination',
                "Choose another Room, or No Room, for this Room's Devices",
                400
            )
        }
        const room = this.requireRoom(roomId)
        if (
            destinationRoomId !== null &&
            !this.rooms.some((other) => other.id === destinationRoomId)
        ) {
            throw new ApiError(
                'destination_not_found',
                'The destination Room no longer exists',
                404
            )
        }
        let devicesMoved = 0
        let componentsMoved = 0
        for (const device of this.devices) {
            if (device.roomId === roomId) {
                device.roomId = destinationRoomId
                devicesMoved += 1
            }
            const rooms = { ...device.componentRooms }
            for (const [componentId, assigned] of Object.entries(rooms)) {
                if (assigned !== roomId) continue
                componentsMoved += 1
                if (destinationRoomId === null) delete rooms[componentId]
                else rooms[componentId] = destinationRoomId
            }
            device.componentRooms =
                Object.keys(rooms).length > 0 ? rooms : undefined
        }
        this.rooms = this.rooms.filter((other) => other !== room)
        this.deletedRooms.push({ roomId, destinationRoomId, via })
        this.roomDeletionAudit.push({
            roomId,
            roomName: room.name,
            destinationRoomId,
            devicesMoved,
            componentsMoved,
        })
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
        if (!this.controller.devicesAvailable) {
            throw new Error('Relay command timed out')
        }
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
        // As on the Controller: the Room is checked before the rename.
        let device: Device | undefined
        if (patch.roomId !== undefined) {
            device = await this.assignRoom({ deviceId, roomId: patch.roomId })
        }
        if (patch.name !== undefined) {
            device = await this.renameDevice({ deviceId, name: patch.name })
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

    async deleteRoom(
        roomId: string,
        destinationRoomId: string | null
    ): Promise<void> {
        this.setup('deleteRoom', () =>
            this.controller.deleteRoom(roomId, destinationRoomId, this.mode)
        )
    }

    async permitJoin(seconds: number): Promise<PermitJoinResponse> {
        return this.commission(
            'permitJoin',
            () => {
                this.controller.zigbeeJoinOpenFor = seconds
                return { ok: true, seconds }
            },
            seconds > 0
        )
    }

    async commissionMatter(
        request: CommissionRequest
    ): Promise<CommissionResponse> {
        return this.commission('commissionMatter', () => {
            this.controller.matterCommissioning = structuredClone(request)
            return { ok: true }
        })
    }

    async cancelMatterCommission(): Promise<CommissionResponse> {
        return this.commission('cancelMatterCommission', () => {
            this.controller.matterCommissioning = null
            return { ok: true }
        })
    }

    /** Reading saved Wi-Fi is not a commissioning step, so it isn't recorded. */
    async getMatterWifi(): Promise<MatterWifiResponse> {
        this.authorize()
        this.controller.refuseLanOnly('getMatterWifi', this.mode)
        this.controller.requireActiveMembership()
        return structuredClone(this.controller.matterWifi)
    }

    async saveMatterWifi(
        request: SaveMatterWifiRequest
    ): Promise<MatterWifiResponse> {
        return this.commission('saveMatterWifi', () => {
            this.controller.matterWifi = {
                configured: true,
                networkName: request.wifiSsid.trim(),
            }
            return structuredClone(this.controller.matterWifi)
        })
    }

    private commission<T>(
        type: string,
        apply: () => T,
        startsZigbee = false
    ): T {
        this.authorize()
        return this.controller.commission(type, this.mode, apply, startsZigbee)
    }

    private setup<T>(type: string, apply: () => T): T {
        this.authorize()
        return this.controller.setup(type, this.mode, apply)
    }

    async getSession(): Promise<SessionResponse> {
        this.authorize()
        return this.controller.session()
    }

    async revokeCurrentToken(): Promise<void> {
        this.authorize()
        this.controller.revokeCurrent(this.getToken() ?? '', this.mode)
    }

    async leaveHome(): Promise<void> {
        this.authorize()
        this.controller.leaveHome(this.mode)
    }

    async queryHistory(query: HistoryQuery): Promise<HistoryQueryRead> {
        this.authorize()
        this.controller.historyQueries.push({ query, via: this.mode })
        return structuredClone(this.controller.history(query))
    }

    async getHomeMeterDesignation(): Promise<HomeMeterDesignation | null> {
        this.authorize()
        return structuredClone(this.controller.homeMeter)
    }

    async getHealthSummary(): Promise<HealthSummary> {
        this.authorize()
        return this.controller.healthSummary(this.mode)
    }

    async designateHomeMeter(): Promise<HomeMeterDesignation> {
        throw new Error('Home meter is not scripted on FakeController')
    }

    async getMembers(): Promise<HouseholdMember[]> {
        this.authorize()
        return structuredClone(this.controller.members)
    }

    async getTokens(): Promise<ClientToken[]> {
        this.authorize()
        return structuredClone(this.controller.accessClients)
    }

    async getReleaseStatus(): Promise<UpdateStatusResponse> {
        this.authorize()
        // The rule lives on the controller so LAN and Relay agree.
        return this.controller.readRelease(this.mode)
    }

    async installRelease(
        platformVersion?: string
    ): Promise<ApplyUpdateResponse> {
        this.authorize()
        return this.controller.startReleaseUpdate(
            'install',
            this.mode,
            platformVersion
        )
    }

    async rollbackRelease(): Promise<ApplyUpdateResponse> {
        this.authorize()
        return this.controller.startReleaseUpdate('rollback', this.mode)
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
