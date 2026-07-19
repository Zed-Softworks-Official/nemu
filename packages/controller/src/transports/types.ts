import type {
    CommandResult,
    Device,
    DeviceCommand,
    DeviceEvent,
} from '@nemu/protocol'

export interface ControllerTransport {
    readonly mode: 'lan' | 'relay'
    connect(): Promise<void>
    disconnect(): void
    getDevices(): Promise<Device[]>
    sendCommand(cmd: DeviceCommand): Promise<CommandResult>
    subscribeEvents(cb: (event: DeviceEvent) => void): () => void
}
