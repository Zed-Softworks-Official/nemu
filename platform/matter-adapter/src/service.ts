/**
 * Service: runs the request flows and keeps the published inventory in step
 * with the fabric. It speaks to Matter only through the session interface and
 * to Core only through the MQTT bus.
 *
 * Device state is published only from what a Device reports, never from what
 * was requested, so a Command is confirmed only once the Device confirms it.
 */
import type { DeviceState } from '@nemu/protocol'
import type { NodeId } from './attributes.ts'
import {
    commissionDevice,
    type ProgressStage,
    redact,
} from './commissioning.ts'
import type { Log } from './log.ts'
import {
    commandsForSet,
    deviceDescriptor,
    type EndpointDevice,
    isLimitAttribute,
    mapNode,
    stateForDevice,
    targetEndpoints,
} from './mapping/index.ts'
import type {
    AttributeChanges,
    MatterSession,
    WifiCredentials,
} from './matter/session.ts'
import { isMeterAttribute, Meters } from './meters/index.ts'
import type { MqttBus } from './mqtt/bus.ts'
import { type Incoming, type Payload, transactionOf } from './mqtt/topics.ts'

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
    /** Friendly names set by rename. TODO(NEM-119): persist in the name store. */
    #names = new Map<string, string>()
    #commissioning: AbortController | undefined

    constructor(
        private readonly session: MatterSession,
        private readonly bus: MqttBus,
        private readonly log: Log,
        private readonly meters: Meters = new Meters()
    ) {
        bus.onRequest((incoming) => this.#handle(incoming))
        session.onAttributes((nodeId, changes) =>
            this.#onAttributes(nodeId, changes)
        )
    }

    /** Indexes the fabric's nodes and publishes the inventory. */
    async start(): Promise<void> {
        for (const nodeId of this.session.nodeIds()) this.#index(nodeId)
        await this.publishInventory()
    }

    /** Retained `bridge/devices`, then every Device's state and availability. */
    async publishInventory(): Promise<void> {
        await this.#publishDescriptors()
        for (const device of this.#devices.values()) {
            await this.#publishState(device, true)
            await this.#publishMeter(device, false)
            // TODO(NEM-119): offline when the node is unreachable, online when it recovers.
            await this.bus.availability(device.id, 'online')
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
            case 'remove':
                // TODO(NEM-119): rename and remove. Remove also clears
                // `{id}/capabilities` and `{id}/observations`
                // (`bus.clearRetained`) and calls `meters.forget(id)`.
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
        const wifi = wifiOf(payload)
        const attempt = new AbortController()
        this.#commissioning = attempt
        // Acknowledge first: commissioning takes seconds, and over BLE 20–40 s.
        await this.bus.respond('commission', transaction, { status: 'ok' })
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
            await this.#progress('setting_up', 'Setting up the device')
            this.#index(nodeId)
            await this.publishInventory()
            if (![...this.#devices.values()].some((d) => d.nodeId === nodeId)) {
                await this.#interviewFailed(
                    'The device connected but did not appear on the controller.'
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
            await this.#interviewFailed(message)
        } finally {
            if (this.#commissioning === attempt) this.#commissioning = undefined
        }
    }

    /** The Rust adapter's `publish_progress`: both events, in this order. */
    async #progress(stage: ProgressStage, message: string): Promise<void> {
        await this.bus.event({
            type: 'commission_progress',
            data: { stage, message },
        })
        await this.bus.event({
            type: 'device_interview',
            data: { ieee_address: 'commissioning', status: 'started', message },
        })
    }

    async #interviewFailed(error: string): Promise<void> {
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
        changes: AttributeChanges
    ): Promise<void> {
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
                    this.#names.get(device.id) ?? device.defaultName,
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

    /** Maps a node's snapshot to its Devices, replacing what it was before. */
    #index(nodeId: NodeId): void {
        for (const [id, device] of this.#devices) {
            if (device.nodeId === nodeId) this.#devices.delete(id)
        }
        const snapshot = this.session.snapshot(nodeId)
        if (!snapshot) return
        for (const device of mapNode(nodeId, snapshot))
            this.#devices.set(device.id, device)
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
