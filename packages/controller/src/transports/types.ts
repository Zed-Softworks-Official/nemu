import type {
    CommandResult,
    CreateRoomRequest,
    Device,
    DeviceCommand,
    DeviceEvent,
    PatchDeviceRequest,
    PatchRoomRequest,
    PermitJoinResponse,
    Room,
} from '@nemu/protocol'

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
    forgetDevice?(deviceId: string): Promise<void>
}
