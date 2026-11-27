/**
 * Service: runs the request flows and keeps the published inventory in step
 * with the fabric. It speaks to Matter only through the session interface and
 * to Core only through the MQTT bus.
 *
 * Device state is published only from what a Device reports, never from what
 * was requested, so a Command is confirmed only once the Device confirms it.
 *
 * Devices come back after a restart from the fabric in the data directory, and
 * names from the name store beside it (ADR-0014). A Home backup quiesces the
 * adapter by pausing its container (ADR-0013); every store is written
 * atomically, so the paused data directory is always a consistent copy.
 */
import type { DeviceState } from '@nemu/protocol'
import type { NodeId } from './attributes.ts'
import type { Log } from './log.ts'
import {
    commandsForSet,
    deviceDescriptor,
    type EndpointDevice,
    isPlaceholder,
    mapNodeOrPlaceholder,
    stateForDevice,
    targetEndpoints,
} from './mapping/index.ts'
import type { AttributeChanges, MatterSession } from './matter/session.ts'
import type { MqttBus, Online } from './mqtt/bus.ts'
import { type Incoming, type Payload, transactionOf } from './mqtt/topics.ts'

/** Names given by rename, by Device ID. `NameStore` persists them. */
export interface Names {
    get(id: string): string | undefined
    set(id: string, name: string): Promise<void>
    retainOnly(keep: ReadonlySet<string>): Promise<void>
}

export interface Stores {
    names: Names
}

export class Service {
    /** Device ID to its Device. */
    #devices = new Map<string, EndpointDevice>()
    /** Last state published per Device ID, to skip unchanged republishes. */
    #published = new Map<string, string>()
    /** Last availability published per Device ID. */
    #availability = new Map<string, Online>()
    /** Nodes being removed: their reports and reachability are ignored. */
    #removed = new Set<NodeId>()
    #commissioning: AbortController | undefined

    constructor(
        private readonly session: MatterSession,
        private readonly bus: MqttBus,
        private readonly log: Log,
        private readonly stores: Stores
    ) {
        bus.onRequest((incoming) => this.#handle(incoming))
        session.onAttributes((nodeId, changes) =>
            this.#onAttributes(nodeId, changes)
        )
        session.onReachability((nodeId, reachable) =>
            this.#onReachability(nodeId, reachable)
        )
    }

    /** Indexes the fabric's nodes and publishes the inventory. */
    async start(): Promise<void> {
        for (const nodeId of this.session.nodeIds()) this.#index(nodeId)
        await this.publishInventory()
    }

    /** Retained `bridge/devices`, then every Device's state and availability. */
    async publishInventory(): Promise<void> {
        const descriptors = [...this.#devices.values()].map((device) =>
            deviceDescriptor(
                device,
                this.stores.names.get(device.id) ?? device.defaultName,
                this.session.snapshot(device.nodeId) ?? {}
            )
        )
        await this.bus.devices(descriptors)
        for (const device of this.#devices.values()) {
            await this.#publishState(device, true)
            // Unknown reachability (not yet connected) keeps the Rust answer.
            const online =
                this.session.reachable(device.nodeId) === false
                    ? 'offline'
                    : 'online'
            if (await this.bus.availability(device.id, online))
                this.#availability.set(device.id, online)
        }
    }

    async #handle(incoming: Incoming): Promise<void> {
        switch (incoming.kind) {
            case 'commission':
                return this.#commission(incoming.payload)
            case 'cancel':
                return this.#cancel(incoming.payload)
            case 'set':
                return this.#set(incoming.deviceId, incoming.payload)
            case 'rename':
                return this.#rename(incoming.payload)
            case 'remove':
                return this.#remove(incoming.payload)
            case 'capabilityIds':
                // TODO(NEM-118): Capability IDs.
                this.log.info(`${incoming.kind} is not handled yet`)
                return
            case 'health':
                return
        }
    }

    async #commission(payload: Payload): Promise<void> {
        const transaction = transactionOf(payload)
        if (this.#commissioning) {
            await this.bus.respond('commission', transaction, {
                status: 'error',
                error: 'pairing is still finishing; try again in a moment',
            })
            return
        }
        const code = typeof payload.code === 'string' ? payload.code.trim() : ''
        // An unreadable code gets the Rust adapter's answer for a missing one.
        if (!code || !this.session.isPairingCode(code)) {
            await this.bus.respond('commission', transaction, {
                status: 'error',
                error: 'pairing code is required',
            })
            return
        }
        // TODO(NEM-120): wifiSsid/wifiPassword and BLE commissioning.
        const attempt = new AbortController()
        this.#commissioning = attempt
        // Acknowledge first: commissioning takes seconds, and over BLE 20–40 s.
        await this.bus.respond('commission', transaction, { status: 'ok' })
        void this.#runCommission(code, attempt)
    }

    async #runCommission(
        code: string,
        attempt: AbortController
    ): Promise<void> {
        try {
            const nodeId = await this.session.commission({
                code,
                signal: attempt.signal,
            })
            this.log.info(`commissioned node ${nodeId}`)
            this.#removed.delete(nodeId)
            this.#index(nodeId)
            await this.publishInventory()
        } catch (error) {
            if (attempt.signal.aborted) {
                this.log.info('commissioning cancelled')
                return
            }
            this.log.warn(`commissioning failed: ${String(error)}`)
            await this.bus.event({
                type: 'device_interview',
                data: {
                    ieee_address: 'commissioning',
                    status: 'failed',
                    error:
                        error instanceof Error ? error.message : String(error),
                },
            })
        } finally {
            if (this.#commissioning === attempt) this.#commissioning = undefined
        }
    }

    async #cancel(payload: Payload): Promise<void> {
        this.#commissioning?.abort()
        await this.bus.respond('commission/cancel', transactionOf(payload), {
            status: 'ok',
        })
    }

    /** Like the Rust adapter, rename sends no response. */
    async #rename(payload: Payload): Promise<void> {
        const { from, to } = payload
        if (typeof from !== 'string' || typeof to !== 'string' || !to) return
        // Persist first, so a published name is never lost to a crash.
        await this.stores.names.set(from, to)
        await this.publishInventory()
    }

    /**
     * Removes the Device's node from the inventory at once, then from the
     * fabric: decommissioned when it answers, forgotten when it does not, so a
     * dead Device can't stay in the Home.
     */
    async #remove(payload: Payload): Promise<void> {
        const transaction = transactionOf(payload)
        const id = payload.id
        if (typeof id !== 'string' || !id) {
            await this.bus.respond('device/remove', transaction, {
                status: 'error',
                error: 'device id is required',
            })
            return
        }
        const nodeId =
            this.#devices.get(id)?.nodeId ?? (/^\d+$/.test(id) ? id : undefined)
        if (nodeId !== undefined) {
            this.#removed.add(nodeId)
            await this.#dropNode(nodeId)
            try {
                const outcome = await this.session.remove(nodeId)
                this.log.info(`removed node ${nodeId} (${outcome})`)
            } catch (error) {
                this.log.warn(
                    `removing node ${nodeId} failed: ${String(error)}`
                )
            }
        }
        await this.bus.respond('device/remove', transaction, {
            status: 'ok',
            data: { id },
        })
    }

    async #dropNode(nodeId: NodeId): Promise<void> {
        for (const [id, device] of [...this.#devices]) {
            if (device.nodeId !== nodeId) continue
            this.#devices.delete(id)
            this.#published.delete(id)
            this.#availability.delete(id)
            // Core tombstones the Device on device_leave (ADR-0017).
            await this.bus.event({
                type: 'device_leave',
                data: { ieee_address: id },
            })
            await this.bus.clearDevice(id)
        }
        await this.stores.names.retainOnly(new Set(this.#devices.keys()))
        await this.publishInventory()
    }

    /**
     * Offline when a node stops answering. When it answers again it is read
     * afresh and the whole inventory is republished, as the Rust adapter does
     * on recovery.
     */
    async #onReachability(nodeId: NodeId, reachable: boolean): Promise<void> {
        if (this.#removed.has(nodeId)) return
        const devices = this.#devicesOf(nodeId)
        // A node still being commissioned is published when that finishes.
        if (devices.length === 0) return
        if (!reachable) {
            for (const device of devices)
                await this.#publishAvailability(device.id, 'offline')
            return
        }
        const recovered = devices.some(
            (device) => this.#availability.get(device.id) === 'offline'
        )
        if (this.#reindex(nodeId) || recovered) await this.publishInventory()
    }

    /** Re-maps a node and says whether its Devices changed. */
    #reindex(nodeId: NodeId): boolean {
        const before = JSON.stringify(this.#devicesOf(nodeId))
        this.#index(nodeId)
        return JSON.stringify(this.#devicesOf(nodeId)) !== before
    }

    async #publishAvailability(id: string, online: Online): Promise<void> {
        if (this.#availability.get(id) === online) return
        if (await this.bus.availability(id, online))
            this.#availability.set(id, online)
    }

    #devicesOf(nodeId: NodeId): EndpointDevice[] {
        return [...this.#devices.values()].filter(
            (device) => device.nodeId === nodeId
        )
    }

    async #set(deviceId: string, payload: Payload): Promise<void> {
        const device = this.#devices.get(deviceId)
        if (!device) {
            this.log.warn(`set for unknown device ${deviceId}`)
            return
        }
        const { actions, ignored } = commandsForSet(payload)
        if (ignored.length > 0)
            this.log.info(`ignored set keys: ${ignored.join(', ')}`)
        try {
            for (const endpoint of targetEndpoints(device, payload)) {
                for (const action of actions) {
                    await this.session.invoke(
                        device.nodeId,
                        endpoint,
                        action.cluster,
                        action.command,
                        action.fields
                    )
                }
            }
        } catch (error) {
            this.log.warn(`set on ${deviceId} failed: ${String(error)}`)
            await this.bus.event({
                type: 'command_failed',
                data: {
                    ieee_address: deviceId,
                    transaction: transactionOf(payload) ?? null,
                    error:
                        error instanceof Error ? error.message : String(error),
                },
            })
        }
        // No state here: the Device's report publishes it (#onAttributes).
    }

    async #onAttributes(
        nodeId: NodeId,
        _changes: AttributeChanges
    ): Promise<void> {
        if (this.#removed.has(nodeId)) return
        // A placeholder (a node restored before its attributes were stored)
        // becomes its real Devices with the first report that maps.
        if (
            this.#devicesOf(nodeId).some(isPlaceholder) &&
            this.#reindex(nodeId)
        ) {
            await this.publishInventory()
            return
        }
        for (const device of this.#devices.values()) {
            if (device.nodeId === nodeId)
                await this.#publishState(device, false)
        }
    }

    async #publishState(
        device: EndpointDevice,
        always: boolean
    ): Promise<void> {
        const snapshot = this.session.snapshot(device.nodeId)
        if (!snapshot) return
        const state: DeviceState = stateForDevice(device, snapshot)
        const serialised = JSON.stringify(state)
        if (!always && this.#published.get(device.id) === serialised) return
        if (await this.bus.deviceState(device.id, state))
            this.#published.set(device.id, serialised)
    }

    /**
     * Maps a node's snapshot to its Devices, replacing what it was before. A
     * node in the fabric always has at least a placeholder Device, so one that
     * failed late in commissioning still shows up in the Home.
     */
    #index(nodeId: NodeId): void {
        for (const [id, device] of this.#devices) {
            if (device.nodeId === nodeId) this.#devices.delete(id)
        }
        const snapshot = this.session.snapshot(nodeId)
        if (!snapshot) return
        for (const device of mapNodeOrPlaceholder(nodeId, snapshot))
            this.#devices.set(device.id, device)
    }
}
