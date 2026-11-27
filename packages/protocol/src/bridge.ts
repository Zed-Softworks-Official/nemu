/**
 * MQTT payloads a Protocol adapter publishes under its base topic, in the
 * zigbee2mqtt-shaped dialect Core reads (`platform/core/src/mqtt/z2m.rs`).
 * The Matter adapter validates what it publishes against these before sending.
 *
 * These describe the existing contract. Changing one changes what Core reads,
 * so each change needs matching Core work.
 */
import { z } from 'zod'
import { deviceStateSchema } from './device.ts'

const onlineSchema = z.enum(['online', 'offline'])

/** Retained `bridge/state`; also the adapter's MQTT last will. */
export const bridgeStateSchema = z.strictObject({ state: onlineSchema })
export type BridgeState = z.infer<typeof bridgeStateSchema>

/** One feature in a descriptor's `exposes`, for example a binary `state`. */
export const bridgeExposeFeatureSchema = z.looseObject({
    type: z.string(),
    name: z.string(),
    property: z.string(),
    access: z.number().int(),
    value_on: z.string().optional(),
    value_off: z.string().optional(),
    value_min: z.number().optional(),
    value_max: z.number().optional(),
})

export const bridgeExposeSchema = z.looseObject({
    type: z.string(),
    features: z.array(bridgeExposeFeatureSchema),
})

/** One entry of retained `bridge/devices`. */
export const bridgeDeviceSchema = z.strictObject({
    /** Device ID; also the Device's topic. */
    external_id: z.string().min(1),
    /** Core's key for the Device. Equal to `external_id` for Matter. */
    ieee_address: z.string().min(1),
    friendly_name: z.string(),
    type: z.string(),
    supported: z.boolean(),
    definition: z.strictObject({
        model: z.string(),
        description: z.string(),
        exposes: z.array(bridgeExposeSchema),
    }),
})
export type BridgeDevice = z.infer<typeof bridgeDeviceSchema>

export const bridgeDevicesSchema = z.array(bridgeDeviceSchema)

/** Retained `{id}`: the state the Device last reported. */
export const bridgeDeviceStateSchema = deviceStateSchema

/** Retained `{id}/availability`. */
export const bridgeAvailabilitySchema = z.strictObject({ state: onlineSchema })
export type BridgeAvailability = z.infer<typeof bridgeAvailabilitySchema>

/** `bridge/response/{endpoint}`, echoing the request's `transaction`. */
export const bridgeResponseSchema = z.discriminatedUnion('status', [
    z.looseObject({
        status: z.literal('ok'),
        transaction: z.string().optional(),
    }),
    z.looseObject({
        status: z.literal('error'),
        error: z.string(),
        transaction: z.string().optional(),
    }),
])
export type BridgeResponse = z.infer<typeof bridgeResponseSchema>

/** `bridge/event`. Core reads the Command ID back from `transaction`. */
export const bridgeEventSchema = z.discriminatedUnion('type', [
    z.strictObject({
        type: z.literal('command_failed'),
        data: z.strictObject({
            ieee_address: z.string(),
            transaction: z.string().nullable(),
            error: z.string(),
        }),
    }),
    z.strictObject({
        type: z.literal('device_interview'),
        data: z.strictObject({
            ieee_address: z.string(),
            status: z.enum(['started', 'successful', 'failed']),
            message: z.string().optional(),
            error: z.string().optional(),
        }),
    }),
    z.strictObject({
        type: z.literal('commission_progress'),
        data: z.strictObject({ stage: z.string(), message: z.string() }),
    }),
])
export type BridgeEvent = z.infer<typeof bridgeEventSchema>
