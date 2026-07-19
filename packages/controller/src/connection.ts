import {
    type CommandResult,
    type ConnectionStatus,
    type Device,
    type DeviceCommand,
    type DeviceEvent,
    type PatchDeviceRequest,
    type PermitJoinResponse,
    type Room,
    statusFromMode,
} from '@nemu/protocol'
import type { ConvexReactClient } from 'convex/react'
import {
    discoverController,
    identifyController,
    type ProbeResult,
} from './discovery'
import {
    getClientToken,
    getRememberedControllerId,
    setRememberedBaseUrl,
    setRememberedControllerId,
} from './storage'
import { LanTransport } from './transports/lan'
import { type RelayApi, RelayTransport } from './transports/relay'
import type { ControllerTransport } from './transports/types'

export type ControllerConnectionOptions = {
    convex?: ConvexReactClient
    relayApi?: RelayApi
    /** Override discovery candidates (useful in tests / local core). */
    lanCandidates?: string[]
    /** How often to reprobe LAN while on relay. */
    reprobeIntervalMs?: number
    /** Manual controller id when identify isn't available yet. */
    controllerId?: string | null
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
    private reprobeTimer: ReturnType<typeof setInterval> | null = null
    private readonly options: ControllerConnectionOptions
    private started = false

    constructor(options: ControllerConnectionOptions = {}) {
        this.options = options
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

    async start(): Promise<void> {
        if (this.started) return
        this.started = true
        await this.reprobe()
        this.startReprobeLoop()
    }

    stop(): void {
        this.started = false
        if (this.reprobeTimer) {
            clearInterval(this.reprobeTimer)
            this.reprobeTimer = null
        }
        this.teardownTransport()
        this.setStatus(statusFromMode('offline'))
    }

    async reprobe(): Promise<void> {
        this.setStatus(statusFromMode('probing'))

        const probe = await discoverController(this.options.lanCandidates)
        if (probe) {
            const ok = await this.tryLan(probe)
            if (ok) return
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
            if (this.status.mode === 'lan') {
                await this.fallbackToRelayOrOffline()
            } else if (this.status.mode === 'relay') {
                this.teardownTransport()
                this.setStatus(statusFromMode('offline'))
            }
            throw err
        }
    }

    async permitJoin(seconds: number): Promise<PermitJoinResponse> {
        const transport = this.requireLanTransport('Device pairing')
        if (!transport.permitJoin) {
            throw new Error(
                'Device pairing is not supported by this controller'
            )
        }
        return await transport.permitJoin(seconds)
    }

    async getRooms(): Promise<Room[]> {
        const transport = this.requireLanTransport('Room loading')
        if (!transport.getRooms) {
            throw new Error('Rooms are not supported by this controller')
        }
        return await transport.getRooms()
    }

    async patchDevice(
        deviceId: string,
        patch: PatchDeviceRequest
    ): Promise<Device> {
        const transport = this.requireLanTransport('Device configuration')
        if (!transport.patchDevice) {
            throw new Error(
                'Device configuration is not supported by this controller'
            )
        }
        return await transport.patchDevice(deviceId, patch)
    }

    async forgetDevice(deviceId: string): Promise<void> {
        const transport = this.requireLanTransport('Forgetting devices')
        if (!transport.forgetDevice) {
            throw new Error(
                'Forgetting devices is not supported by this controller'
            )
        }
        await transport.forgetDevice(deviceId)
    }

    private requireLanTransport(operation: string): ControllerTransport {
        if (this.status.mode !== 'lan' || !this.transport) {
            throw new Error(`${operation} requires a Home connection`)
        }
        return this.transport
    }

    private async tryLan(probe: ProbeResult): Promise<boolean> {
        const token = getClientToken()
        // Without a token we can still probe health, but authenticated APIs will fail.
        // Prefer LAN when reachable; token acceptance is validated on first real call.
        try {
            let controllerId =
                this.options.controllerId ?? getRememberedControllerId()
            try {
                const identity = await identifyController(probe.baseUrl)
                controllerId = identity.controllerId
                setRememberedControllerId(identity.controllerId)
            } catch {
                // identify may not exist yet on core
            }

            const lan = new LanTransport({
                baseUrl: probe.baseUrl,
                getToken: getClientToken,
            })

            // WS may fail if /ws isn't implemented yet — still allow REST-only LAN.
            try {
                await lan.connect()
            } catch {
                // REST-only mode is acceptable for early milestones
            }

            this.attachTransport(lan)
            setRememberedBaseUrl(probe.baseUrl)
            this.setStatus({
                ...statusFromMode('lan'),
                baseUrl: probe.baseUrl,
                controllerId: controllerId ?? null,
            })

            // If we have a token, soft-check devices; failure drops to relay.
            if (token) {
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

    private async tryRelay(): Promise<boolean> {
        const { convex, relayApi } = this.options
        const controllerId =
            this.options.controllerId ?? getRememberedControllerId()
        const token = getClientToken()

        if (!convex || !relayApi || !controllerId || !token) {
            return false
        }

        try {
            const relay = new RelayTransport({
                convex,
                api: relayApi,
                controllerId,
                getToken: getClientToken,
            })
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
            for (const listener of this.eventListeners) {
                listener(event)
            }
            if (event.type === 'resync' || event.type === 'deviceLeft') {
                // UI hooks refetch; nothing else required here
            }
        })
    }

    private teardownTransport(): void {
        this.eventUnsub?.()
        this.eventUnsub = null
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
            if (
                this.status.mode === 'relay' ||
                this.status.mode === 'offline'
            ) {
                void this.upgradeToLanIfPossible()
            }
        }, interval)
    }

    private async upgradeToLanIfPossible(): Promise<void> {
        const probe = await discoverController(this.options.lanCandidates)
        if (!probe) return
        const previous = this.transport
        const ok = await this.tryLan(probe)
        if (ok && previous && previous !== this.transport) {
            previous.disconnect()
        }
    }
}
