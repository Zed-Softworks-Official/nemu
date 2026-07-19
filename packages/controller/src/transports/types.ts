import type {
    CommandResult,
    Device,
    DeviceCommand,
    DeviceEvent,
    PatchDeviceRequest,
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
    patchDevice?(deviceId: string, patch: PatchDeviceRequest): Promise<Device>
    forgetDevice?(deviceId: string): Promise<void>
}
