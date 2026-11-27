import type {
    AccessClient,
    ApplyUpdateResponse,
    AssignRoomRequest,
    CommandResult,
    CommissionRequest,
    CommissionResponse,
    CreateRoomRequest,
    Device,
    DeviceCommand,
    DeviceEvent,
    HealthSummary,
    HistoryQuery,
    HistoryQueryRead,
    HomeMeterDesignation,
    HomeMeterDesignationSelection,
    HouseholdMember,
    MatterWifiResponse,
    PatchDeviceRequest,
    PatchOutletRequest,
    PatchRoomRequest,
    PermitJoinResponse,
    ReleaseChannel,
    RenameDeviceRequest,
    RenameRoomRequest,
    Room,
    SaveMatterWifiRequest,
    SessionResponse,
    SwitchReleaseChannelResponse,
    UpdateStatusResponse,
} from '@nemu/protocol'

export interface ControllerTransport {
    readonly mode: 'lan' | 'relay'
    connect(): Promise<void>
    disconnect(): void
    getDevices(): Promise<Device[]>
    sendCommand(cmd: DeviceCommand): Promise<CommandResult>
    /**
     * Returns the active view only. Callers keep the result in memory;
     * this transport does not store the series.
     */
    queryHistory(query: HistoryQuery): Promise<HistoryQueryRead>
    /**
     * The current designation stays on the Controller. Callers hold only
     * the response for the active view.
     */
    getHomeMeterDesignation(): Promise<HomeMeterDesignation | null>
    designateHomeMeter(
        selection: HomeMeterDesignationSelection
    ): Promise<HomeMeterDesignation>
    subscribeEvents(cb: (event: DeviceEvent) => void): () => void
    requestCapabilitySnapshot?(): void | Promise<void>
    /** Fires after a dropped LAN socket opens again. */
    onSocketReopen?(cb: () => void): () => void
    permitJoin?(seconds: number): Promise<PermitJoinResponse>
    /** Matter commissioning, over LAN or Relay (ADR-0034). */
    /** LAN only, like Matter Wi-Fi: the Relay transport has neither. */
    commissionMatter?(request: CommissionRequest): Promise<CommissionResponse>
    /** Abort in-flight Matter commissioning. */
    cancelMatterCommission?(): Promise<CommissionResponse>
    getMatterWifi?(): Promise<MatterWifiResponse>
    saveMatterWifi?(request: SaveMatterWifiRequest): Promise<MatterWifiResponse>
    getRooms?(): Promise<Room[]>
    createRoom?(request: CreateRoomRequest): Promise<Room>
    patchRoom?(roomId: string, patch: PatchRoomRequest): Promise<Room>
    deleteRoom?(roomId: string, destinationRoomId: string | null): Promise<void>
    patchDevice?(deviceId: string, patch: PatchDeviceRequest): Promise<Device>
    patchOutlet?(
        deviceId: string,
        outletId: string,
        patch: PatchOutletRequest
    ): Promise<void>
    forgetDevice?(deviceId: string): Promise<void>
    /** Device and Room setup. Same requests and outcomes over LAN and Relay. */
    renameDevice?(request: RenameDeviceRequest): Promise<Device>
    assignRoom?(request: AssignRoomRequest): Promise<Device>
    removeDevice?(deviceId: string): Promise<void>
    renameRoom?(request: RenameRoomRequest): Promise<Room>
    getMembers?(): Promise<HouseholdMember[]>
    inviteMember?(email: string): Promise<HouseholdMember>
    removeMember?(memberId: string): Promise<void>
    /** The Home's Access Clients, by Access Client ID. */
    listAccessClients?(): Promise<AccessClient[]>
    revokeAccessClient?(accessClientId: string): Promise<void>
    /** Access Client revocation for the calling Access Client only. */
    revokeCurrentAccessClient?(): Promise<void>
    /** Leaving a Home: ends the caller's Membership and all its Access Clients. */
    leaveHome?(): Promise<void>
    getReleaseStatus?(): Promise<UpdateStatusResponse>
    getSession?(): Promise<SessionResponse>
    /** With `platformVersion`, no other Release is installed. */
    installRelease?(platformVersion?: string): Promise<ApplyUpdateResponse>
    rollbackRelease?(): Promise<ApplyUpdateResponse>
    switchReleaseChannel?(
        channel: ReleaseChannel
    ): Promise<SwitchReleaseChannelResponse>
    /** Owners get Controller details; Members get availability only. */
    getHealthSummary?(): Promise<HealthSummary>
}

export interface ControllerTransport {
    readonly mode: 'lan' | 'relay'
    connect(): Promise<void>
    disconnect(): void
    getDevices(): Promise<Device[]>
    sendCommand(cmd: DeviceCommand): Promise<CommandResult>
    subscribeEvents(cb: (event: DeviceEvent) => void): () => void
    permitJoin?(seconds: number): Promise<PermitJoinResponse>
    getRooms?(): Promise<Room[]>
    createRoom?(request: CreateRoomRequest): Promise<Room>
    patchRoom?(roomId: string, patch: PatchRoomRequest): Promise<Room>
    deleteRoom?(roomId: string, destinationRoomId: string | null): Promise<void>
    patchDevice?(deviceId: string, patch: PatchDeviceRequest): Promise<Device>
    patchOutlet?(
        deviceId: string,
        outletId: string,
        patch: PatchOutletRequest
    ): Promise<void>
    forgetDevice?(deviceId: string): Promise<void>
}
