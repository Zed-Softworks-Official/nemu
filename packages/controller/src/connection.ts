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
    discoverController,
    identifyController,
    isLocalDevDashboard,
    isLoopbackControllerUrl,
    type ProbeResult,
} from './discovery.ts'
import type { GetToken } from './http.ts'
import {
    controllerAnswered,
    RELEASE_UPDATE_POLL_MS,
    RELEASE_UPDATE_TIMEOUT_MS,
    type ReleaseUpdate,
    type ReleaseUpdateKind,
    type ReleaseUpdateProgress,
    releaseUpdateIsCutOff,
    releaseUpdateOutcome,
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
        getToken: GetToken
    }) => ControllerTransport
    /** Returns null when Relay is not configured. */
    createRelayTransport: (options: {
        controllerId: string
        getToken: GetToken
    }) => ControllerTransport | null
}

export type ControllerConnectionOptions = {
    convex?: ConvexReactClient
    relayApi?: RelayApi
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
    // --- NEM-96: an update this client started and follows ---
    private releaseUpdate: ReleaseUpdate | null = null
    private releaseUpdateRun: { cancelled: boolean } | null = null
    private releaseUpdateTimer: ReturnType<typeof setTimeout> | null = null
    private readonly releaseUpdateListeners = new Set<
        (update: ReleaseUpdate | null) => void
    >()
    // --- end NEM-96 ---

    constructor(options: ControllerConnectionOptions = {}) {
        this.options = options
        this.credentialStore = options.credentialStore ?? defaultCredentialStore
        this.connectors = {
            discover: (candidates, rememberedBaseUrl) =>
                discoverController(candidates, rememberedBaseUrl),
            identify: (baseUrl) => identifyController(baseUrl),
            createLanTransport: (lan) => new LanTransport(lan),
            createRelayTransport: ({ controllerId, getToken }) => {
                const { convex, relayApi } = this.options
                if (!convex || !relayApi) return null
                return new RelayTransport({
                    convex,
                    api: relayApi,
                    controllerId,
                    getToken,
                })
            },
            ...options.connectors,
        }
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

    private readonly getToken: GetToken = () => {
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
        this.stopFollowingRelease()
        this.teardownTransport()
        this.setStatus(statusFromMode('offline'))
    }

    async reprobe(): Promise<void> {
        this.setStatus(statusFromMode('probing'))
        await this.connect()
    }

    private async connect(): Promise<void> {
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
     * Commissioning works over LAN and Relay for every Membership
     * (ADR-0034). Like setup, it never queues: it needs a live connection.
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
        const transport = this.requireConnectedTransport('Matter pairing')
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
        const transport = this.requireConnectedTransport('Matter pairing')
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
        const transport = this.requireConnectedTransport('Matter pairing')
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

    // --- NEM-86: session role ---
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
    // --- end NEM-86 ---

    async getReleaseStatus(): Promise<UpdateStatusResponse> {
        const transport = this.requireConnectedTransport('Installed Release')
        if (!transport.getReleaseStatus) {
            throw new Error(
                'Installed Release is not supported by this controller'
            )
        }
        return await transport.getReleaseStatus()
    }

    // NEM-88: Controller health summary.
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

    async installRelease(): Promise<ApplyUpdateResponse> {
        const transport = this.requireConnectedTransport('Install Release')
        if (!transport.installRelease) {
            throw new Error('Install is not supported by this controller')
        }
        return await transport.installRelease()
    }

    async rollbackRelease(): Promise<ApplyUpdateResponse> {
        const transport = this.requireConnectedTransport('Roll back Release')
        if (!transport.rollbackRelease) {
            throw new Error('Rollback is not supported by this controller')
        }
        return await transport.rollbackRelease()
    }

    // --- NEM-96: install or roll back, and follow the restart ---
    getReleaseUpdate(): ReleaseUpdate | null {
        return this.releaseUpdate
    }

    subscribeReleaseUpdate(
        cb: (update: ReleaseUpdate | null) => void
    ): () => void {
        this.releaseUpdateListeners.add(cb)
        cb(this.releaseUpdate)
        return () => {
            this.releaseUpdateListeners.delete(cb)
        }
    }

    /** Forget a finished update's outcome. A running one is kept. */
    dismissReleaseUpdate(): void {
        if (this.releaseUpdate?.phase === 'finished') {
            this.setReleaseUpdate(null)
        }
    }

    /**
     * Installs the available Release, or rolls back the last one, and treats
     * the Controller's restart as expected: it reconnects over LAN or Relay,
     * then reads Release status to report the outcome. Resolves once the
     * Controller has started; follow it with `subscribeReleaseUpdate`.
     * Nothing is sent, or queued, while the Controller is unreachable.
     */
    async startReleaseUpdate(kind: ReleaseUpdateKind): Promise<void> {
        if (this.releaseUpdateRun) {
            throw new ApiError(
                'update_in_progress',
                'An update is already running'
            )
        }
        const run = { cancelled: false }
        this.releaseUpdateRun = run
        try {
            const before = await this.getReleaseStatus()
            const retry = kind === 'rollback' && before.rollbackStuck
            if (before.maintenanceMode && !retry) {
                throw new ApiError(
                    'in_maintenance',
                    'The Controller is already updating'
                )
            }
            const { started } =
                kind === 'install'
                    ? await this.installRelease()
                    : await this.rollbackRelease()
            if (!started) {
                throw new ApiError(
                    'update_not_started',
                    'The Controller did not start the update'
                )
            }
            if (run.cancelled) return
            this.setReleaseUpdate({
                phase: 'updating',
                kind,
                reconnecting: false,
            })
            void this.followRelease(run, kind, before)
        } catch (error) {
            if (this.releaseUpdateRun === run) this.releaseUpdateRun = null
            throw error
        }
    }

    private async followRelease(
        run: { cancelled: boolean },
        kind: ReleaseUpdateKind,
        before: UpdateStatusResponse
    ): Promise<void> {
        const startedAt = Date.now()
        let quietSince = startedAt
        const progress: ReleaseUpdateProgress = {
            kind,
            before,
            sawMaintenance: false,
            lostConnection: false,
            quietMs: 0,
        }
        const finish = (
            outcome: Extract<ReleaseUpdate, { phase: 'finished' }>['outcome'],
            release: UpdateStatusResponse | null
        ) => {
            this.releaseUpdateRun = null
            this.setReleaseUpdate({ phase: 'finished', kind, outcome, release })
        }
        const reconnecting = (value: boolean) => {
            const current = this.releaseUpdate
            if (
                current?.phase === 'updating' &&
                current.reconnecting !== value
            ) {
                this.setReleaseUpdate({ ...current, reconnecting: value })
            }
        }

        while (Date.now() - startedAt < RELEASE_UPDATE_TIMEOUT_MS) {
            await new Promise<void>((resolve) => {
                this.releaseUpdateTimer = setTimeout(
                    resolve,
                    RELEASE_UPDATE_POLL_MS
                )
            })
            if (run.cancelled) return
            try {
                const status = await this.getReleaseStatus()
                if (run.cancelled) return
                reconnecting(false)
                if (status.maintenanceMode) progress.sawMaintenance = true
                progress.quietMs = Date.now() - quietSince
                const outcome = releaseUpdateOutcome(progress, status)
                if (outcome) {
                    finish(outcome, status)
                    return
                }
            } catch (error) {
                if (run.cancelled) return
                if (releaseUpdateIsCutOff(error)) {
                    finish('unknown', null)
                    return
                }
                // Core is up but its Updater isn't yet, or is restarting.
                if (controllerAnswered(error)) {
                    reconnecting(false)
                    continue
                }
                progress.lostConnection = true
                reconnecting(true)
                await this.connect()
                if (run.cancelled) {
                    if (!this.started) this.teardownTransport()
                    return
                }
                quietSince = Date.now()
            }
        }
        finish('unknown', null)
    }

    private stopFollowingRelease(): void {
        if (this.releaseUpdateRun) this.releaseUpdateRun.cancelled = true
        this.releaseUpdateRun = null
        if (this.releaseUpdateTimer) clearTimeout(this.releaseUpdateTimer)
        this.releaseUpdateTimer = null
        this.setReleaseUpdate(null)
    }

    private setReleaseUpdate(update: ReleaseUpdate | null): void {
        this.releaseUpdate = update
        for (const listener of this.releaseUpdateListeners) listener(update)
    }
    // --- end NEM-96 ---

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
        if (!transport.bootstrapOwner) {
            throw new Error(
                'Household setup is not supported by this controller'
            )
        }
        return await transport.bootstrapOwner(request)
    }

    /** Setup never queues: it needs a live LAN or Relay connection now. */
    private requireSetupTransport(): ControllerTransport {
        return this.requireConnectedTransport('Device and Room setup')
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
            const token = this.getToken()

            const lan = this.connectors.createLanTransport({
                baseUrl: probe.baseUrl,
                getToken: this.getToken,
            })

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
            if (token && !isLoopbackControllerUrl(probe.baseUrl)) {
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

        if (!controllerId || !token) {
            return false
        }

        try {
            const relay = this.connectors.createRelayTransport({
                controllerId,
                getToken: this.getToken,
            })
            if (!relay) return false
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
            if (this.releaseUpdate?.phase === 'updating') return
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
