/**
 * MQTT bus: the adapter's only link to Core (ADR-0002, ADR-0019). It parses
 * incoming topics, answers the health check, correlates responses by
 * `transaction`, and validates every outgoing payload against
 * `@nemu/protocol` before publishing it.
 */
import {
    type BridgeCapabilityManifest,
    type BridgeDevice,
    type BridgeEvent,
    type BridgeObservationReport,
    type BridgeResponse,
    bridgeAvailabilitySchema,
    bridgeCapabilityManifestSchema,
    bridgeCommissioningSchema,
    bridgeDeviceStateSchema,
    bridgeDevicesSchema,
    bridgeEventSchema,
    bridgeObservationReportSchema,
    bridgeResponseSchema,
    bridgeStateSchema,
    type CommissioningProgress,
    type DeviceState,
} from '@nemu/protocol'
import type { z } from 'zod'
import type { Log } from '../log.ts'
import { type Incoming, parseIncoming, transactionOf } from './topics.ts'

/** A broker connection. The real one wraps mqtt.js (`client.ts`). */
export interface MqttTransport {
    publish(
        topic: string,
        payload: string,
        options: { retain: boolean }
    ): Promise<void>
    onMessage(
        listener: (topic: string, payload: string) => void | Promise<void>
    ): void
}

export type Online = 'online' | 'offline'

/** A response body before the bus adds the request's `transaction`. */
export type ResponseBody =
    | ({ status: 'ok' } & Record<string, unknown>)
    | ({ status: 'error'; error: string } & Record<string, unknown>)

export class MqttBus {
    #handler: ((incoming: Incoming) => void | Promise<void>) | undefined

    constructor(
        private readonly transport: MqttTransport,
        private readonly base: string,
        private readonly log: Log
    ) {
        transport.onMessage((topic, payload) => this.#receive(topic, payload))
    }

    /** Receives every request except the health check, which the bus answers. */
    onRequest(handler: (incoming: Incoming) => void | Promise<void>): void {
        this.#handler = handler
    }

    bridgeState(state: Online): Promise<boolean> {
        return this.#publish('bridge/state', bridgeStateSchema, { state }, true)
    }

    devices(devices: BridgeDevice[]): Promise<boolean> {
        return this.#publish(
            'bridge/devices',
            bridgeDevicesSchema,
            devices,
            true
        )
    }

    deviceState(id: string, state: DeviceState): Promise<boolean> {
        return this.#publish(id, bridgeDeviceStateSchema, state, true)
    }

    availability(id: string, state: Online): Promise<boolean> {
        return this.#publish(
            `${id}/availability`,
            bridgeAvailabilitySchema,
            { state },
            true
        )
    }

    capabilities(
        id: string,
        manifest: BridgeCapabilityManifest
    ): Promise<boolean> {
        return this.#publish(
            `${id}/capabilities`,
            bridgeCapabilityManifestSchema,
            manifest,
            true
        )
    }

    observations(
        id: string,
        report: BridgeObservationReport
    ): Promise<boolean> {
        return this.#publish(
            `${id}/observations`,
            bridgeObservationReportSchema,
            report,
            true
        )
    }

    /** Clears a retained topic with an empty payload. */
    async clearRetained(rest: string): Promise<boolean> {
        try {
            await this.transport.publish(`${this.base}/${rest}`, '', {
                retain: true,
            })
            return true
        } catch (error) {
            this.log.warn(`clear ${rest} failed: ${String(error)}`)
            return false
        }
    }

    respond(
        endpoint: string,
        transaction: string | undefined,
        body: ResponseBody
    ): Promise<boolean> {
        const payload: BridgeResponse =
            transaction === undefined ? body : { ...body, transaction }
        return this.#publish(
            `bridge/response/${endpoint}`,
            bridgeResponseSchema,
            payload,
            false
        )
    }

    event(event: BridgeEvent): Promise<boolean> {
        return this.#publish('bridge/event', bridgeEventSchema, event, false)
    }

    /** Commissioning progress in Protocol-neutral steps (NEM-110). */
    commissioning(progress: CommissioningProgress): Promise<boolean> {
        return this.#publish(
            'bridge/commissioning',
            bridgeCommissioningSchema,
            progress,
            false
        )
    }

    async #receive(topic: string, payload: string): Promise<void> {
        const incoming = parseIncoming(this.base, topic, payload)
        if (!incoming) return
        if (incoming.kind === 'health') {
            await this.respond(
                'health/check',
                transactionOf(incoming.payload),
                {
                    status: 'ok',
                }
            )
            return
        }
        try {
            await this.#handler?.(incoming)
        } catch (error) {
            this.log.error(`handling ${topic} failed: ${String(error)}`)
        }
    }

    async #publish<S extends z.ZodType>(
        rest: string,
        schema: S,
        payload: z.input<S>,
        retain: boolean
    ): Promise<boolean> {
        const checked = schema.safeParse(payload)
        if (!checked.success) {
            this.log.error(
                `not publishing ${rest}: payload fails the protocol schema: ${checked.error.message}`
            )
            return false
        }
        try {
            await this.transport.publish(
                `${this.base}/${rest}`,
                JSON.stringify(payload),
                { retain }
            )
            return true
        } catch (error) {
            this.log.warn(`publish ${rest} failed: ${String(error)}`)
            return false
        }
    }
}
