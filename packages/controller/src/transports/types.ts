import type {
    BootstrapOwnerRequest,
    ClientToken,
    CommandResult,
    CommissionRequest,
    CommissionResponse,
    CreateRoomRequest,
    Device,
    DeviceCommand,
    DeviceEvent,
    HouseholdMember,
    MatterWifiResponse,
    PatchDeviceRequest,
    PatchOutletRequest,
    PatchRoomRequest,
    PermitJoinResponse,
    Room,
    SaveMatterWifiRequest,
} from '@nemu/protocol'

export interface ControllerTransport {
    readonly mode: 'lan' | 'relay'
    connect(): Promise<void>
    disconnect(): void
    getDevices(): Promise<Device[]>
    sendCommand(cmd: DeviceCommand): Promise<CommandResult>
    subscribeEvents(cb: (event: DeviceEvent) => void): () => void
    permitJoin?(seconds: number): Promise<PermitJoinResponse>
    /** Matter commissioning. LAN transport only, same policy as permitJoin. */
    commissionMatter?(request: CommissionRequest): Promise<CommissionResponse>
    /** Abort in-flight Matter commissioning. LAN transport only. */
    cancelMatterCommission?(): Promise<CommissionResponse>
    getMatterWifi?(): Promise<MatterWifiResponse>
    saveMatterWifi?(request: SaveMatterWifiRequest): Promise<MatterWifiResponse>
    getRooms?(): Promise<Room[]>
    createRoom?(request: CreateRoomRequest): Promise<Room>
    patchRoom?(roomId: string, patch: PatchRoomRequest): Promise<Room>
    deleteRoom?(roomId: string): Promise<void>
    patchDevice?(deviceId: string, patch: PatchDeviceRequest): Promise<Device>
    patchOutlet?(
        deviceId: string,
        outletId: string,
        patch: PatchOutletRequest
    ): Promise<void>
    forgetDevice?(deviceId: string): Promise<void>
    getMembers?(): Promise<HouseholdMember[]>
    inviteMember?(email: string): Promise<HouseholdMember>
    removeMember?(memberId: string): Promise<void>
    getTokens?(): Promise<ClientToken[]>
    revokeToken?(tokenId: string): Promise<void>
    revokeCurrentToken?(): Promise<void>
    bootstrapOwner?(request: BootstrapOwnerRequest): Promise<HouseholdMember>
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
    deleteRoom?(roomId: string): Promise<void>
    patchDevice?(deviceId: string, patch: PatchDeviceRequest): Promise<Device>
    patchOutlet?(
        deviceId: string,
        outletId: string,
        patch: PatchOutletRequest
    ): Promise<void>
    forgetDevice?(deviceId: string): Promise<void>
}
