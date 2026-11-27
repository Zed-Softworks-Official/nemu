import {
    ApiError,
    type ApplyUpdateResponse,
    type AssignRoomRequest,
    type BootstrapOwnerRequest,
    CapabilitySession,
    type CapabilityView,
    type ClientToken,
    type CommandResult,
    type CommissionRequest,
    type CommissionResponse,
    type ConnectionStatus,
    type CreateRoomRequest,
    type Device,
    type DeviceCommand,
    type DeviceEvent,
    type HealthSummary,
    type HistoryQuery,
    type HistoryQueryRead,
    type HomeMeterDesignation,
    type HomeMeterDesignationSelection,
    type HouseholdMember,
    type IdentifyResponse,
    type MatterWifiResponse,
    type PatchDeviceRequest,
    type PatchOutletRequest,
    type PatchRoomRequest,
    type PermitJoinResponse,
    type ReleaseChannel,
    type RenameDeviceRequest,
    type RenameRoomRequest,
    type Room,
    type SaveMatterWifiRequest,
    type SessionResponse,
    type SwitchReleaseChannelResponse,
    statusFromMode,
    type UpdateStatusResponse,
} from '@nemu/protocol'
import type { ConvexReactClient } from 'convex/react'
import {
    type AccessClientKeyStore,
    type PairAgainReason,
    pairAgainReason,
} from './access-client-keys.ts'
import {
    discoverController,
    identifyController,
    isLocalDevDashboard,
    isLoopbackControllerUrl,
    type ProbeResult,
} from './discovery.ts'
import type { GetToken, LocalSessionAuth } from './http.ts'
import { LocalSession } from './local-session.ts'
import {
    type ReleaseUpdate,
    ReleaseUpdateFollower,
    type ReleaseUpdateKind,
} from './release-update.ts'
import {
    type ControllerCredentialStore,
    defaultCredentialStore,
    getRememberedBaseUrl,
    getRememberedControllerId,
    setRememberedBaseUrl,
    setRememberedControllerId,
} from './storage.ts'
import { LanTransport } from './transports/lan.ts'
import { type RelayApi, RelayTransport } from './transports/relay.ts'
import type { ControllerTransport } from './transports/types.ts'

/**
 * How the connection reaches Controllers. Defaults use real HTTP,
 * WebSocket, and Convex Relay; tests pass a fake Controller here
 * (see `@nemu/controller/testing`).
 */
function unsupported(operation: string): ApiError {
    return new ApiError(
        'unsupported_action',
        `${operation} is not supported by this Controller. Update the Controller.`
    )
}

export type ControllerConnectors = {
    discover: (
        candidates: string[] | undefined,
        rememberedBaseUrl: string | null
    ) => Promise<ProbeResult | null>
    identify: (baseUrl: string) => Promise<IdentifyResponse>
    createLanTransport: (options: {
        baseUrl: string
        /** Bearer token, until NEM-131. Always null with a key store. */
        getToken: GetToken
        /** With a key store: the Local session for this Home's keys. */
        localSession?: LocalSessionAuth
        /** With a key store: this client's Access Client ID, or null. */
        accessClientId?: string | null
    }) => ControllerTransport
    /**
     * Returns null when Relay is not configured. The default Relay
     * transport seals with `accessClientKeyStore` and never sends the
     * token; `getToken` is for test fakes until NEM-131.
     */
    createRelayTransport: (options: {
        controllerId: string
        getToken: GetToken
        /** With a key store: this client's Access Client ID. */
        accessClientId?: string
    }) => ControllerTransport | null
}

/**
 * This client must pair again at home: it holds no keys for the Home, or the
 * Controller no longer knows or has revoked its Access Client.
 */
export type PairingLoss = {
    controllerId: string
    reason: PairAgainReason
}

export type ControllerConnectionOptions = {
    convex?: ConvexReactClient
    relayApi?: RelayApi
    /**
     * This client's Access Client keys and pinned Controller keys. With a
     * key store the connection authorizes with keys only: Local sessions on
     * LAN, sealed envelopes over Relay (ADR-0001). Stored bearer tokens are
     * ignored, so a client that only holds one is unpaired.
     */
    accessClientKeyStore?: AccessClientKeyStore
    /** Override discovery candidates (useful in tests / local core). */
    lanCandidates?: string[]
    /** How often to reprobe LAN while on relay. */
    reprobeIntervalMs?: number
    /**
     * The selected Home. When set, the connection only attaches to a LAN
     * Controller that identifies as this Home and only uses this Home's
     * credential. Without it the connection adopts whichever Controller
     * answers (dashboard single-Home behavior).
     */
    controllerId?: string | null
    /** Per-Home Access Client credentials. Defaults to localStorage. */
    credentialStore?: ControllerCredentialStore
    /**
     * When set, relay is skipped until this returns true. The local socket
     * still connects. Callers use it so `relay:send` waits for Convex auth.
     */
    relayAllowed?: () => boolean
    connectors?: Partial<ControllerConnectors>
}

type StatusListener = (status: ConnectionStatus) => void
type PairingLossListener = (loss: PairingLoss | null) => void

/**
 * Owns transport selection: probe LAN first, fall back to Convex relay,
 * and upgrade back to LAN when the controller becomes reachable again.
 */
export class ControllerConnection {
    private status: ConnectionStatus = statusFromMode('probing')
    private transport: ControllerTransport | null = null
    private readonly statusListeners = new Set<StatusListener>()
    private readonly eventListeners = new Set<(event: DeviceEvent) => void>()
    private eventUnsub: (() => void) | null = null
    private reopenUnsub: (() => void) | null = null
    private reprobeTimer: ReturnType<typeof setInterval> | null = null
    private readonly options: ControllerConnectionOptions
    private started = false
    private readonly capabilitySession = new CapabilitySession()
    private readonly credentialStore: ControllerCredentialStore
    private readonly connectors: ControllerConnectors
    /** Controller adopted from LAN identify when no Home is selected. */
    private identifiedControllerId: string | null = null
    /** An update this client started and follows. */
    private readonly releaseUpdates: ReleaseUpdateFollower
    private pairingLoss: PairingLoss | null = null
    private readonly pairingLossListeners = new Set<PairingLossListener>()
    /** Forgetting revoked keys, which `connect` waits for. */
    private forgetting: Promise<void> | null = null

    constructor(options: ControllerConnectionOptions = {}) {
        this.options = options
        this.credentialStore = options.credentialStore ?? defaultCredentialStore
        this.connectors = {
            discover: (candidates, rememberedBaseUrl) =>
                discoverController(candidates, rememberedBaseUrl),
            identify: (baseUrl) => identifyController(baseUrl),
            createLanTransport: ({ baseUrl, getToken, localSession }) =>
                new LanTransport({ baseUrl, getToken, localSession }),
            createRelayTransport: ({ controllerId }) => {
                const { convex, relayApi, accessClientKeyStore } = this.options
                if (!convex || !relayApi || !accessClientKeyStore) return null
                return new RelayTransport({
                    convex,
                    api: relayApi,
                    controllerId,
                    keyStore: accessClientKeyStore,
                })
            },
            ...options.connectors,
        }
        this.releaseUpdates = new ReleaseUpdateFollower({
            getReleaseStatus: () => this.getReleaseStatus(),
            installRelease: (version) => this.installRelease(version),
            rollbackRelease: () => this.rollbackRelease(),
            reconnect: () => this.connect(),
            abandonReconnect: () => {
                if (!this.started) this.teardownTransport()
            },
        })
    }

    private get selectedControllerId(): string | null {
        return this.options.controllerId ?? null
    }

    private activeControllerId(): string | null {
        return (
            this.selectedControllerId ??
            this.identifiedControllerId ??
            getRememberedControllerId()
        )
    }

    private get keyStore(): AccessClientKeyStore | null {
        return this.options.accessClientKeyStore ?? null
    }

    private readonly getToken: GetToken = () => {
        // With keys, a stored bearer token is not a credential.
        if (this.keyStore) return null
        const controllerId = this.activeControllerId()
        if (!controllerId) return null
        return this.credentialStore.get(controllerId)?.clientToken ?? null
    }

    private rememberedBaseUrl(): string | null {
        const selected = this.selectedControllerId
        if (!selected) return getRememberedBaseUrl()
        return this.credentialStore.get(selected)?.baseUrl ?? null
    }

    getStatus(): ConnectionStatus {
        return this.status
    }

    subscribeStatus(cb: StatusListener): () => void {
        this.statusListeners.add(cb)
        cb(this.status)
        return () => {
            this.statusListeners.delete(cb)
        }
    }

    /** Why this client must pair again at home, or null. */
    getPairingLoss(): PairingLoss | null {
        return this.pairingLoss
    }

    subscribePairingLoss(cb: PairingLossListener): () => void {
        this.pairingLossListeners.add(cb)
        cb(this.pairingLoss)
        return () => {
            this.pairingLossListeners.delete(cb)
        }
    }

    subscribeEvents(cb: (event: DeviceEvent) => void): () => void {
        this.eventListeners.add(cb)
        return () => {
            this.eventListeners.delete(cb)
        }
    }

    getCapabilityView(): CapabilityView | null {
        return this.capabilitySession.view()
    }

    subscribeCapabilityView(
        cb: (view: CapabilityView | null) => void
    ): () => void {
        return this.capabilitySession.subscribe(cb)
    }

    async start(): Promise<void> {
        if (this.started) return
        this.started = true
        await this.reprobe()
        // Stopped while probing, e.g. the person switched Homes or signed out.
        if (!this.started) {
            this.teardownTransport()
            return
        }
        this.startReprobeLoop()
    }

    stop(): void {
        this.started = false
        if (this.reprobeTimer) {
            clearInterval(this.reprobeTimer)
            this.reprobeTimer = null
        }
        this.releaseUpdates.stop()
        this.teardownTransport()
        this.setStatus(statusFromMode('offline'))
    }

    async reprobe(): Promise<void> {
        this.setStatus(statusFromMode('probing'))
        await this.connect()
    }

    private async connect(): Promise<void> {
        if (!(await this.recoveredFromPairingLoss())) {
            this.teardownTransport()
            this.setStatus(statusFromMode('offline'))
            return
        }
        const probe = await this.discover()
        if (probe) {
            const ok = await this.tryLan(probe)
            if (ok) return
            // A reachable local core beats relay to a paired prod controller.
            if (
                isLocalDevDashboard() &&
                isLoopbackControllerUrl(probe.baseUrl)
            ) {
                this.teardownTransport()
                this.setStatus(statusFromMode('offline'))
                return
            }
        }

        const relayOk = await this.tryRelay()
        if (!relayOk) {
            this.teardownTransport()
            this.setStatus(statusFromMode('offline'))
        }
    }

    async getDevices(): Promise<Device[]> {
        if (!this.transport) throw new Error('Not connected')
        try {
            return await this.transport.getDevices()
        } catch (err) {
            if (this.status.mode === 'lan') {
                await this.fallbackToRelayOrOffline()
            }
            throw err
        }
    }

    async sendCommand(cmd: DeviceCommand): Promise<CommandResult> {
        if (!this.transport) throw new Error('Not connected')
        try {
            return await this.transport.sendCommand(cmd)
        } catch (err) {
            // The Controller answered, so this path works. A refused Command
            // for one Device must not take down control of the whole Home.
            if (err instanceof ApiError && err.status !== undefined) throw err
            if (this.status.mode === 'lan') {
                await this.fallbackToRelayOrOffline()
            } else if (this.status.mode === 'relay') {
                this.teardownTransport()
                this.setStatus(statusFromMode('offline'))
            }
            throw err
        }
    }

    /*
     * Zigbee commissioning works over LAN and Relay for every Membership
     * (ADR-0034). Starting Matter commissioning, and Matter Wi-Fi, need the
     * Home network: pairing codes and Wi-Fi credentials must not cross Relay
     * until its envelopes are encrypted end to end (NEM-63). Like setup,
     * commissioning never queues: it needs a live connection.
     */
    async permitJoin(seconds: number): Promise<PermitJoinResponse> {
        const transport = this.requireConnectedTransport('Device pairing')
        if (!transport.permitJoin) {
            throw new Error(
                'Device pairing is not supported by this controller'
            )
        }
        return await transport.permitJoin(seconds)
    }

    async commissionMatter(
        request: CommissionRequest
    ): Promise<CommissionResponse> {
        const transport = this.requireHomeNetworkTransport('Matter pairing')
        if (!transport.commissionMatter) {
            throw new Error(
                'Matter pairing is not supported by this controller'
            )
        }
        return await transport.commissionMatter(request)
    }

    async cancelMatterCommission(): Promise<CommissionResponse> {
        const transport = this.requireConnectedTransport('Matter pairing')
        if (!transport.cancelMatterCommission) {
            throw new Error(
                'Matter pairing is not supported by this controller'
            )
        }
        return await transport.cancelMatterCommission()
    }

    async getMatterWifi(): Promise<MatterWifiResponse> {
        const transport = this.requireHomeNetworkTransport('Matter pairing')
        if (!transport.getMatterWifi) {
            throw new Error(
                'Matter pairing is not supported by this controller'
            )
        }
        return await transport.getMatterWifi()
    }

    async saveMatterWifi(
        request: SaveMatterWifiRequest
    ): Promise<MatterWifiResponse> {
        const transport = this.requireHomeNetworkTransport('Matter pairing')
        if (!transport.saveMatterWifi) {
            throw new Error(
                'Matter pairing is not supported by this controller'
            )
        }
        return await transport.saveMatterWifi(request)
    }

    async getRooms(): Promise<Room[]> {
        const transport = this.requireConnectedTransport('Room loading')
        if (!transport.getRooms) {
            throw new Error('Rooms are not supported by this controller')
        }
        return await transport.getRooms()
    }

    /** Device and Room setup works the same over LAN and Relay. */
    async renameDevice(request: RenameDeviceRequest): Promise<Device> {
        const transport = this.requireSetupTransport()
        if (!transport.renameDevice) throw unsupported('Renaming Devices')
        return await transport.renameDevice(request)
    }

    /** Assign a Device, or one Component with `componentId`, to a Room. */
    async assignRoom(request: AssignRoomRequest): Promise<Device> {
        const transport = this.requireSetupTransport()
        if (!transport.assignRoom) throw unsupported('Assigning Rooms')
        return await transport.assignRoom(request)
    }

    /** Remove a Device. The Controller keeps a Device tombstone. */
    async removeDevice(deviceId: string): Promise<void> {
        const transport = this.requireSetupTransport()
        if (!transport.removeDevice) throw unsupported('Removing Devices')
        await transport.removeDevice(deviceId)
    }

    async createRoom(request: CreateRoomRequest): Promise<Room> {
        const transport = this.requireSetupTransport()
        if (!transport.createRoom) throw unsupported('Creating Rooms')
        return await transport.createRoom(request)
    }

    async renameRoom(request: RenameRoomRequest): Promise<Room> {
        const transport = this.requireSetupTransport()
        if (!transport.renameRoom) throw unsupported('Renaming Rooms')
        return await transport.renameRoom(request)
    }

    async patchRoom(roomId: string, patch: PatchRoomRequest): Promise<Room> {
        const transport = this.requireSetupTransport()
        if (!transport.patchRoom) throw unsupported('Updating Rooms')
        return await transport.patchRoom(roomId, patch)
    }

    /**
     * Delete a Room and move its Devices and Components to
     * `destinationRoomId`, or to No Room when it is `null`, in one step.
     */
    async deleteRoom(
        roomId: string,
        destinationRoomId: string | null
    ): Promise<void> {
        const transport = this.requireSetupTransport()
        if (!transport.deleteRoom) throw unsupported('Deleting Rooms')
        await transport.deleteRoom(roomId, destinationRoomId)
    }

    async patchDevice(
        deviceId: string,
        patch: PatchDeviceRequest
    ): Promise<Device> {
        const transport = this.requireSetupTransport()
        if (!transport.patchDevice) throw unsupported('Device configuration')
        return await transport.patchDevice(deviceId, patch)
    }

    async patchOutlet(
        deviceId: string,
        outletId: string,
        patch: PatchOutletRequest
    ): Promise<void> {
        const transport = this.transport
        if (!transport?.patchOutlet) {
            throw new Error('Outlet renaming requires a Home connection')
        }
        await transport.patchOutlet(deviceId, outletId, patch)
    }

    async forgetDevice(deviceId: string): Promise<void> {
        await this.removeDevice(deviceId)
    }

    /**
     * Returns the active History view. The connection does not retain the
     * series after this promise settles.
     */
    async queryHistory(query: HistoryQuery): Promise<HistoryQueryRead> {
        const transport = this.requireConnectedTransport('Energy History')
        return await transport.queryHistory(query)
    }

    async getHomeMeterDesignation(): Promise<HomeMeterDesignation | null> {
        const transport = this.requireConnectedTransport('Home meter')
        return await transport.getHomeMeterDesignation()
    }

    async designateHomeMeter(
        selection: HomeMeterDesignationSelection
    ): Promise<HomeMeterDesignation> {
        const transport = this.requireConnectedTransport('Home meter')
        return await transport.designateHomeMeter(selection)
    }

    /**
     * The caller's Membership role for this session, over LAN or Relay.
     * Use it only to decide what to show; the Controller still enforces
     * every permission.
     */
    async getSession(): Promise<SessionResponse> {
        const transport = this.requireConnectedTransport('Membership role')
        if (!transport.getSession) {
            throw new Error(
                'Membership role is not supported by this controller'
            )
        }
        return await transport.getSession()
    }

    async getReleaseStatus(): Promise<UpdateStatusResponse> {
        const transport = this.requireConnectedTransport('Installed Release')
        if (!transport.getReleaseStatus) {
            throw new Error(
                'Installed Release is not supported by this controller'
            )
        }
        return await transport.getReleaseStatus()
    }

    /**
     * The role-aware Controller health summary, the same over LAN and Relay.
     * Owners see Controller details; Members see service and Device
     * availability only (ADR-0006).
     */
    async getHealthSummary(): Promise<HealthSummary> {
        const transport = this.requireConnectedTransport('Controller health')
        if (!transport.getHealthSummary) {
            throw new Error(
                'Controller health is not supported by this controller'
            )
        }
        return await transport.getHealthSummary()
    }

    async installRelease(
        platformVersion?: string
    ): Promise<ApplyUpdateResponse> {
        const transport = this.requireConnectedTransport('Install Release')
        if (!transport.installRelease) {
            throw new Error('Install is not supported by this controller')
        }
        return await transport.installRelease(platformVersion)
    }

    async rollbackRelease(): Promise<ApplyUpdateResponse> {
        const transport = this.requireConnectedTransport('Roll back Release')
        if (!transport.rollbackRelease) {
            throw new Error('Rollback is not supported by this controller')
        }
        return await transport.rollbackRelease()
    }

    getReleaseUpdate(): ReleaseUpdate | null {
        return this.releaseUpdates.current()
    }

    subscribeReleaseUpdate(
        cb: (update: ReleaseUpdate | null) => void
    ): () => void {
        return this.releaseUpdates.subscribe(cb)
    }

    /** Forget a finished update's outcome. A running one is kept. */
    dismissReleaseUpdate(): void {
        this.releaseUpdates.dismiss()
    }

    /**
     * Installs the available Release, or rolls back the last one, and treats
     * the Controller's restart as expected: it reconnects over LAN or Relay,
     * then reads Release status to report the outcome. Resolves once the
     * Controller has started; follow it with `subscribeReleaseUpdate`.
     * With `confirmedVersion`, no other Release is installed. Nothing is sent,
     * or queued, while the Controller is unreachable.
     */
    async startReleaseUpdate(
        kind: ReleaseUpdateKind,
        confirmedVersion?: string
    ): Promise<void> {
        await this.releaseUpdates.start(kind, confirmedVersion)
    }

    async switchReleaseChannel(
        channel: ReleaseChannel
    ): Promise<SwitchReleaseChannelResponse> {
        const transport = this.requireConnectedTransport('Release channel')
        if (!transport.switchReleaseChannel) {
            throw new Error(
                'Release channel is not supported by this controller'
            )
        }
        return await transport.switchReleaseChannel(channel)
    }

    async getMembers(): Promise<HouseholdMember[]> {
        const transport = this.requireConnectedTransport('Household members')
        if (!transport.getMembers) {
            throw new Error(
                'Household members are not supported by this controller'
            )
        }
        return await transport.getMembers()
    }

    async inviteMember(email: string): Promise<HouseholdMember> {
        const transport = this.requireConnectedTransport('Inviting people')
        if (!transport.inviteMember) {
            throw new Error(
                'Inviting people is not supported by this controller'
            )
        }
        return await transport.inviteMember(email)
    }

    async removeMember(memberId: string): Promise<void> {
        const transport = this.requireConnectedTransport('Removing people')
        if (!transport.removeMember) {
            throw new Error(
                'Removing people is not supported by this controller'
            )
        }
        await transport.removeMember(memberId)
    }

    async getTokens(): Promise<ClientToken[]> {
        const transport = this.requireConnectedTransport('Paired devices')
        if (!transport.getTokens) {
            throw new Error(
                'Paired devices are not supported by this controller'
            )
        }
        return await transport.getTokens()
    }

    async revokeToken(tokenId: string): Promise<void> {
        const transport = this.requireConnectedTransport('Revoking devices')
        if (!transport.revokeToken) {
            throw new Error(
                'Revoking devices is not supported by this controller'
            )
        }
        await transport.revokeToken(tokenId)
    }

    /** Access Client revocation: only this Access Client loses access. */
    async revokeCurrentToken(): Promise<void> {
        const transport = this.requireConnectedTransport(
            'Removing this Access Client'
        )
        if (!transport.revokeCurrentToken) {
            throw new Error(
                'Removing this Access Client is not supported by this controller'
            )
        }
        await transport.revokeCurrentToken()
    }

    /**
     * Leaving a Home: the Controller ends the caller's Membership and revokes
     * every Access Client it holds, this one included.
     */
    async leaveHome(): Promise<void> {
        const transport = this.requireConnectedTransport('Leaving the Home')
        if (!transport.leaveHome) {
            throw new Error(
                'Leaving the Home is not supported by this controller'
            )
        }
        await transport.leaveHome()
    }

    async bootstrapOwner(
        request: BootstrapOwnerRequest
    ): Promise<HouseholdMember> {
        const transport = this.requireConnectedTransport('Household setup')
        // First-Owner setup pairs on the home network (NEM-126), so Relay
        // has no bootstrapOwner.
        if (!transport.bootstrapOwner) {
            throw new Error('Set up the first Owner on the home network')
        }
        return await transport.bootstrapOwner(request)
    }

    /** Setup never queues: it needs a live LAN or Relay connection now. */
    private requireSetupTransport(): ControllerTransport {
        return this.requireConnectedTransport('Device and Room setup')
    }

    /** Refuses over Relay before anything is built or sent. */
    private requireHomeNetworkTransport(
        operation: string
    ): ControllerTransport {
        const transport = this.requireConnectedTransport(operation)
        if (transport.mode !== 'lan') {
            throw new ApiError(
                'unsupported_action',
                `${operation} is not available over Relay. It needs the Home network.`
            )
        }
        return transport
    }

    private requireConnectedTransport(operation: string): ControllerTransport {
        if (
            (this.status.mode !== 'lan' && this.status.mode !== 'relay') ||
            !this.transport
        ) {
            throw new Error(`${operation} requires a controller connection`)
        }
        return this.transport
    }

    private discover(): Promise<ProbeResult | null> {
        return this.connectors.discover(
            this.options.lanCandidates,
            this.rememberedBaseUrl()
        )
    }

    private async tryLan(probe: ProbeResult): Promise<boolean> {
        // Without a token we can still probe health, but authenticated APIs will fail.
        // Prefer LAN when reachable; token acceptance is validated on first real call.
        try {
            const selected = this.selectedControllerId
            let controllerId = this.activeControllerId()
            try {
                const identity = await this.connectors.identify(probe.baseUrl)
                // Never send the selected Home's credential to another Home.
                if (selected && identity.controllerId !== selected) {
                    return false
                }
                controllerId = identity.controllerId
                if (!selected) {
                    this.identifiedControllerId = identity.controllerId
                    setRememberedControllerId(identity.controllerId)
                }
            } catch {
                // A selected Home must prove its identity before LAN use.
                if (selected) return false
                // identify may not exist yet on core
            }
            const keyStore = this.keyStore
            const record =
                keyStore && controllerId
                    ? await keyStore.load(controllerId)
                    : null
            const token = keyStore ? null : this.getToken()

            const lan = this.watchAccess(
                this.connectors.createLanTransport({
                    baseUrl: probe.baseUrl,
                    getToken: this.getToken,
                    ...(keyStore
                        ? {
                              accessClientId:
                                  record?.enrollment.accessClientId ?? null,
                              localSession:
                                  record && controllerId
                                      ? new LocalSession({
                                            baseUrl: probe.baseUrl,
                                            controllerId,
                                            keyStore,
                                        })
                                      : undefined,
                          }
                        : {}),
                })
            )

            // WS may fail if /ws isn't implemented yet — still allow REST-only LAN.
            try {
                await lan.connect()
            } catch {
                // REST-only mode is acceptable for early milestones
            }

            this.attachTransport(lan)
            this.rememberLanAddress(controllerId, probe.baseUrl)
            this.setStatus({
                ...statusFromMode('lan'),
                baseUrl: probe.baseUrl,
                controllerId: controllerId ?? null,
            })

            // If we have a token, soft-check devices; failure drops to relay.
            // On localhost that token is often the prod house — keep LAN so
            // setup can re-pair instead of jumping to nemu.local over relay.
            const credentialed = token !== null || record !== null
            if (credentialed && !isLoopbackControllerUrl(probe.baseUrl)) {
                try {
                    await lan.getDevices()
                } catch {
                    this.teardownTransport()
                    return false
                }
            }

            return true
        } catch {
            return false
        }
    }

    private rememberLanAddress(
        controllerId: string | null,
        baseUrl: string
    ): void {
        if (!this.selectedControllerId) {
            setRememberedBaseUrl(baseUrl)
            return
        }
        if (!controllerId) return
        const credential = this.credentialStore.get(controllerId)
        if (!credential || credential.baseUrl === baseUrl) return
        this.credentialStore.set(controllerId, { ...credential, baseUrl })
    }

    private async tryRelay(): Promise<boolean> {
        const controllerId = this.activeControllerId()
        const token = this.getToken()

        if (this.options.relayAllowed && !this.options.relayAllowed()) {
            return false
        }

        if (!controllerId) return false
        if (this.pairingLoss) return false
        const keyStore = this.keyStore
        const record = keyStore ? await keyStore.load(controllerId) : null
        if (!(keyStore ? record !== null : token !== null)) return false

        try {
            const created = this.connectors.createRelayTransport({
                controllerId,
                getToken: this.getToken,
                ...(record
                    ? { accessClientId: record.enrollment.accessClientId }
                    : {}),
            })
            if (!created) return false
            const relay = this.watchAccess(created)
            await relay.connect()
            this.attachTransport(relay)
            this.setStatus({
                ...statusFromMode('relay'),
                controllerId,
            })
            return true
        } catch {
            return false
        }
    }

    private async fallbackToRelayOrOffline(): Promise<void> {
        this.teardownTransport()
        const ok = await this.tryRelay()
        if (!ok) {
            this.setStatus(statusFromMode('offline'))
        }
    }

    /**
     * With a key store, watches every call on `transport` for the errors that
     * mean this client must pair again at home. The caller still gets the
     * error; the connection forgets revoked keys and stays offline.
     */
    private watchAccess(transport: ControllerTransport): ControllerTransport {
        if (!this.keyStore) return transport
        const notice = (error: unknown) => this.noticeAccessError(error)
        return new Proxy(transport, {
            get(target, property) {
                const value = Reflect.get(target, property, target)
                if (typeof value !== 'function') return value
                return (...args: unknown[]) => {
                    const result = value.apply(target, args)
                    if (result instanceof Promise) result.catch(notice)
                    return result
                }
            },
        })
    }

    private noticeAccessError(error: unknown): void {
        const reason = pairAgainReason(error)
        const keyStore = this.keyStore
        const controllerId = this.activeControllerId()
        if (!reason || !keyStore || !controllerId) return
        // The Controller refused these keys, so they are worth nothing now.
        // Without keys there is nothing to forget.
        if (reason !== 'not_paired') {
            this.forgetting = keyStore.clear(controllerId).catch(() => {})
        }
        this.setPairingLoss({ controllerId, reason })
        this.teardownTransport()
        this.setStatus(statusFromMode('offline'))
    }

    /**
     * False while this client must still pair again. Pairing again (keys for
     * the Home in the store) clears the loss.
     */
    private async recoveredFromPairingLoss(): Promise<boolean> {
        const loss = this.pairingLoss
        if (!loss) return true
        await this.forgetting
        const record = await this.keyStore?.load(loss.controllerId)
        if (!record) return false
        this.setPairingLoss(null)
        return true
    }

    private setPairingLoss(loss: PairingLoss | null): void {
        this.pairingLoss = loss
        for (const listener of this.pairingLossListeners) listener(loss)
    }

    private attachTransport(transport: ControllerTransport): void {
        this.teardownTransport()
        this.transport = transport
        this.eventUnsub = transport.subscribeEvents((event) => {
            this.capabilitySession.deliver(event, () =>
                this.requestCapabilitySnapshot()
            )
            for (const listener of this.eventListeners) {
                listener(event)
            }
        })
        this.reopenUnsub =
            transport.onSocketReopen?.(() => {
                this.capabilitySession.connect(() =>
                    this.requestCapabilitySnapshot()
                )
            }) ?? null
        this.capabilitySession.connect(() => this.requestCapabilitySnapshot())
    }

    private requestCapabilitySnapshot(): void | Promise<void> {
        return this.transport?.requestCapabilitySnapshot?.()
    }

    private teardownTransport(): void {
        this.eventUnsub?.()
        this.eventUnsub = null
        this.reopenUnsub?.()
        this.reopenUnsub = null
        this.capabilitySession.disconnect()
        this.transport?.disconnect()
        this.transport = null
    }

    private setStatus(status: ConnectionStatus): void {
        this.status = status
        for (const listener of this.statusListeners) {
            listener(status)
        }
    }

    private startReprobeLoop(): void {
        const interval = this.options.reprobeIntervalMs ?? 10_000
        this.reprobeTimer = setInterval(() => {
            // Following an update reconnects on its own.
            if (this.releaseUpdates.current()?.phase === 'updating') return
            if (
                this.status.mode === 'relay' ||
                this.status.mode === 'offline'
            ) {
                void this.upgradeToLanIfPossible()
            }
        }, interval)
    }

    private async upgradeToLanIfPossible(): Promise<void> {
        const probe = await this.discover()
        if (!this.started) return
        if (!probe) {
            // LAN is the only path this loop upgrades to, but an offline
            // client must also notice when Relay comes back.
            if (this.status.mode === 'offline') await this.tryRelay()
            return
        }
        const previous = this.transport
        const ok = await this.tryLan(probe)
        if (ok && previous && previous !== this.transport) {
            previous.disconnect()
        }
        // A failed LAN check has already dropped the previous transport.
        if (!ok && !this.transport) await this.fallbackToRelayOrOffline()
    }
}
