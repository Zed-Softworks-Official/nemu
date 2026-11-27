/**
 * Service: runs the request flows and keeps the published inventory in step
 * with the fabric. It speaks to Matter only through the session interface and
 * to Core only through the MQTT bus.
 *
 * Device state is published only from what a Device reports, never from what
 * was requested, so a Command is confirmed only once the Device confirms it.
 *
 * Devices come back after a restart from the fabric in the data directory, and
 * names, meter identities and Capability IDs from the stores beside it
 * (ADR-0014). A Home backup quiesces the adapter by pausing its container
 * (ADR-0013). Every store is written atomically, so the paused data directory
 * is a consistent copy.
 */
import type { CommissioningStep, DeviceState } from '@nemu/protocol'
import type { NodeId } from './attributes.ts'
import {
    CommissionFailure,
    commissionDevice,
    type FailedStep,
    type ProgressStage,
    redact,
    stepOf,
} from './commissioning.ts'
import type { Log } from './log.ts'
import {
    collapsedLegacyIds,
    commandsForSet,
    deviceDescriptor,
    type EndpointDevice,
    isLimitAttribute,
    isPlaceholder,
    mapNodeOrPlaceholder,
    stateForDevice,
    targetEndpoints,
} from './mapping/index.ts'
import type {
    AttributeChanges,
    MatterSession,
    WifiCredentials,
} from './matter/session.ts'
import { isMeterAttribute, Meters } from './meters/index.ts'
import type { MqttBus, Online } from './mqtt/bus.ts'
import { type Incoming, type Payload, transactionOf } from './mqtt/topics.ts'
import { NameStore } from './stores/names.ts'

/** Names given by rename, by Device ID. `NameStore` persists them. */
export interface Names {
    get(id: string): string | undefined
    set(id: string, name: string): void
    retainOnly(keep: ReadonlySet<string>): void
}

/** Whether an `endpoint/cluster/attribute` key is a descriptor limit. */
function isLimitPath(key: string): boolean {
    const [, cluster, attribute] = key.split('/').map(Number)
    return (
        cluster !== undefined &&
        attribute !== undefined &&
        isLimitAttribute(cluster, attribute)
    )
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
    /** The last step the commissioning in progress reached. */
    #reached: CommissioningStep = 'discovering'
    /** Legacy Device IDs already announced as gone. */
    #leaves = new Set<string>()

    constructor(
        private readonly session: MatterSession,
        private readonly bus: MqttBus,
        private readonly log: Log,
        private readonly meters: Meters = new Meters(),
        private readonly names: Names = NameStore.inMemory()
    ) {
        bus.onRequest((incoming) => this.#handle(incoming))
        session.onAttributes((nodeId, changes) =>
            this.#onAttributes(nodeId, changes)
        )
        session.onReachability((nodeId, reachable) =>
            this.#onReachability(nodeId, reachable)
        )
    }

    /**
     * Indexes the fabric's nodes and publishes the inventory. First, each of
     * `goneDeviceIds` (Devices on the Rust adapter's fabric, NEM-121) leaves
     * the Home as a removed Device does, unless a node on this fabric has
     * that ID now.
     */
    async start(goneDeviceIds: readonly string[] = []): Promise<void> {
        for (const nodeId of this.session.nodeIds()) this.#index(nodeId)
        for (const id of goneDeviceIds)
            if (!this.#devices.has(id)) await this.#announceGone(id)
        await this.publishInventory()
    }

    /**
     * Tells Core a Device left (it tombstones it, ADR-0017) and clears its
     * retained topics.
     */
    async #announceGone(id: string): Promise<void> {
        await this.bus.event({
            type: 'device_leave',
            data: { ieee_address: id },
        })
        for (const topic of [
            id,
            `${id}/availability`,
            `${id}/capabilities`,
            `${id}/observations`,
        ])
            await this.bus.clearRetained(topic)
    }

    /** Retained `bridge/devices`, then every Device's state and availability. */
    async publishInventory(): Promise<void> {
        await this.#publishDescriptors()
        for (const device of this.#devices.values()) {
            await this.#publishState(device, true)
            await this.#publishMeter(device, false)
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
            case 'capabilityIds':
                return this.#capabilityIds(incoming.deviceId, incoming.payload)
            case 'rename':
                return this.#rename(incoming.payload)
            case 'remove':
                return this.#remove(incoming.payload)
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
        const wifi = wifiOf(payload)
        const attempt = new AbortController()
        this.#commissioning = attempt
        // Acknowledge first: commissioning takes seconds, and over BLE 20–40 s.
        await this.bus.respond('commission', transaction, { status: 'ok' })
        this.#reached = 'discovering'
        await this.#progress('looking', 'Looking for your device')
        void this.#runCommission(code, wifi, attempt)
    }

    async #runCommission(
        code: string,
        wifi: WifiCredentials | undefined,
        attempt: AbortController
    ): Promise<void> {
        try {
            const nodeId = await commissionDevice(
                this.session,
                { code, wifi, signal: attempt.signal },
                (stage, message) => this.#progress(stage, message),
                this.log
            )
            this.log.info(`commissioned node ${nodeId}`)
            this.#removed.delete(nodeId)
            await this.#progress('setting_up', 'Setting up the device')
            this.#index(nodeId)
            await this.publishInventory()
            if (![...this.#devices.values()].some((d) => d.nodeId === nodeId)) {
                await this.#interviewFailed(
                    'The device connected but did not appear on the controller.',
                    { step: 'setting_up', reason: 'unknown' }
                )
                return
            }
            await this.#progress('connected', 'Connected')
        } catch (error) {
            if (attempt.signal.aborted) {
                this.log.info('commissioning cancelled')
                return
            }
            const message =
                error instanceof Error ? error.message : String(error)
            this.log.warn(
                `commissioning failed: ${redact(message, { code, wifi })}`
            )
            await this.#interviewFailed(
                message,
                error instanceof CommissionFailure
                    ? error.failed
                    : { step: this.#reached, reason: 'unknown' }
            )
        } finally {
            if (this.#commissioning === attempt) this.#commissioning = undefined
        }
    }

    /**
     * The Rust adapter's `publish_progress`: both events, in this order. Then
     * the stage's Protocol-neutral step on `bridge/commissioning`, which
     * carries only the step.
     */
    async #progress(stage: ProgressStage, message: string): Promise<void> {
        await this.bus.event({
            type: 'commission_progress',
            data: { stage, message },
        })
        await this.bus.event({
            type: 'device_interview',
            data: { ieee_address: 'commissioning', status: 'started', message },
        })
        const step = stepOf(stage)
        if (step) this.#reached = step
        await this.bus.commissioning(
            step ? { status: 'active', step } : { status: 'completed' }
        )
    }

    /**
     * The failed step on `bridge/commissioning`, then the Rust adapter's
     * failed interview with its Owner-facing message. The step goes first so
     * an Access Client has it when the failure ends its pairing view.
     */
    async #interviewFailed(error: string, failed: FailedStep): Promise<void> {
        await this.bus.commissioning({ status: 'failed', ...failed })
        await this.bus.event({
            type: 'device_interview',
            data: { ieee_address: 'commissioning', status: 'failed', error },
        })
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
        // Stored first, so a published name is never lost to a crash.
        this.names.set(from, to)
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

    /** The Rust adapter's `drop_node`. */
    async #dropNode(nodeId: NodeId): Promise<void> {
        for (const device of this.#devicesOf(nodeId)) {
            const { id } = device
            this.#devices.delete(id)
            this.#published.delete(id)
            this.#availability.delete(id)
            await this.#announceGone(id)
            this.meters.forget(id)
        }
        // Keep the names of the remaining Devices and their strip outlets.
        const keep = new Set(this.#devices.keys())
        for (const device of this.#devices.values())
            for (const outlet of device.outlets ?? [])
                keep.add(outletKey(device.nodeId, outlet.endpoint))
        this.names.retainOnly(keep)
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
        // Keep going after a failure, so one outlet of a strip does not stop
        // the others, and report the first one.
        let failure: { error: unknown } | undefined
        for (const endpoint of targetEndpoints(device, payload)) {
            for (const action of actions) {
                try {
                    await this.session.invoke(
                        device.nodeId,
                        endpoint,
                        action.cluster,
                        action.command,
                        action.fields
                    )
                } catch (error) {
                    failure ??= { error }
                }
            }
        }
        if (failure) {
            const { error } = failure
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
        changes: AttributeChanges
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
        const freshMeter = Object.keys(changes).some(isMeterAttribute)
        let indexed = false
        for (const device of [...this.#devices.values()]) {
            if (device.nodeId !== nodeId) continue
            indexed = true
            // A meter report republishes the unchanged state too, as Rust's
            // `publish_state` does (golden plug-load-changes).
            await this.#publishState(device, freshMeter)
            await this.#publishMeter(device, freshMeter)
        }
        // New brightness or color temperature limits change the descriptor.
        if (indexed && Object.keys(changes).some(isLimitPath))
            await this.#publishDescriptors()
    }

    /**
     * Stores the Capability IDs Core assigned. Like the Rust adapter, they are
     * stamped from the next fresh reading on: the unchanged envelope is not
     * republished (golden quirk 4). The Device state is, as in Rust.
     */
    async #capabilityIds(deviceId: string, payload: Payload): Promise<void> {
        if (!this.meters.assign(deviceId, payload)) return
        const device = this.#devices.get(deviceId)
        if (!device) return
        await this.#publishState(device, true)
        await this.#publishMeter(device, false)
    }

    async #publishMeter(device: EndpointDevice, fresh: boolean): Promise<void> {
        const snapshot = this.session.snapshot(device.nodeId)
        if (!snapshot) return
        const update = this.meters.update(device, snapshot, fresh)
        switch (update.kind) {
            case 'publish':
                await this.bus.capabilities(device.id, update.manifest)
                await this.bus.observations(device.id, update.report)
                return
            case 'manifest':
                this.log.warn(
                    `skipped a meter observation for ${device.id}: the clock is unavailable`
                )
                await this.bus.capabilities(device.id, update.manifest)
                return
            case 'clear':
                await this.bus.clearRetained(`${device.id}/capabilities`)
                await this.bus.clearRetained(`${device.id}/observations`)
                return
            case 'none':
                return
        }
    }

    async #publishDescriptors(): Promise<void> {
        await this.bus.devices(
            [...this.#devices.values()].map((device) =>
                deviceDescriptor(
                    device,
                    this.names.get(device.id) ?? device.defaultName,
                    this.session.snapshot(device.nodeId) ?? {}
                )
            )
        )
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
        for (const device of mapNodeOrPlaceholder(nodeId, snapshot)) {
            // A strip outlet's name is stored as `{nodeId}#{endpoint}`, as in Rust.
            for (const outlet of device.outlets ?? []) {
                const name = this.names.get(outletKey(nodeId, outlet.endpoint))
                if (name) outlet.name = name
            }
            this.#devices.set(device.id, device)
        }
        // Per-endpoint IDs a strip folded in leave, once each, as in Rust.
        for (const id of collapsedLegacyIds(nodeId, snapshot)) {
            if (this.#leaves.has(id)) continue
            this.#leaves.add(id)
            void this.bus.event({
                type: 'device_leave',
                data: { ieee_address: id },
            })
        }
    }
}

/** Home Wi-Fi from a commission request, as the Rust adapter read it. */
function wifiOf(payload: Payload): WifiCredentials | undefined {
    const ssid =
        typeof payload.wifiSsid === 'string' ? payload.wifiSsid.trim() : ''
    if (!ssid) return undefined
    const password =
        typeof payload.wifiPassword === 'string' ? payload.wifiPassword : ''
    return { ssid, password }
}

/** The name-store key of a strip outlet, the Rust adapter's `{nodeId}#{endpoint}`. */
function outletKey(nodeId: NodeId, endpoint: number): string {
    return `${nodeId}#${endpoint}`
}
