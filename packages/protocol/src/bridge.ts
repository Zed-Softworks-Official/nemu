/**
 * MQTT payloads a Protocol adapter publishes under its base topic, in the
 * zigbee2mqtt-shaped dialect Core reads (`platform/core/src/mqtt/z2m.rs`).
 * The Matter adapter validates what it publishes against these before sending.
 *
 * These describe the existing contract. Changing one changes what Core reads,
 * so each change needs matching Core work.
 */
import { z } from 'zod'
import {
    canonicalUnitSchema,
    capabilityConstraintRevisionSchema,
    capabilityDirectionalitySchema,
    capabilityKindSchema,
    capabilityPhysicalScopeSchema,
    numericCapabilityValueSchema,
    observationEnvelopeSchemaVersionSchema,
} from './capability.ts'
import { commissioningProgressSchema } from './commissioning-progress.ts'
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
    /** A Device ID that is gone: removed (Core tombstones it, ADR-0017) or folded into a strip. */
    z.strictObject({
        type: z.literal('device_leave'),
        data: z.strictObject({ ieee_address: z.string() }),
    }),
    z.strictObject({
        type: z.literal('commission_progress'),
        data: z.strictObject({ stage: z.string(), message: z.string() }),
    }),
])
export type BridgeEvent = z.infer<typeof bridgeEventSchema>

/**
 * Non-retained `bridge/commissioning`: progress in Protocol-neutral steps
 * (`commissioning-progress.ts`). Added alongside `bridge/event`, whose
 * `commission_progress` and `device_interview` events stay as they are, so a
 * Core that ignores this topic still works.
 */
export const bridgeCommissioningSchema = commissioningProgressSchema
/** The Device a Capability manifest or observation belongs to. */
export const bridgeCapabilityDeviceSchema = z.strictObject({
    protocol: z.string().min(1),
    externalId: z.string().min(1),
})

/**
 * What a Capability is before Core assigns it an ID: its Device, its
 * Component path, its kind and where it measures.
 */
export const bridgeCapabilityIdentitySchema = z.strictObject({
    device: bridgeCapabilityDeviceSchema,
    componentPath: z.array(z.string()),
    kind: capabilityKindSchema,
    physicalScope: capabilityPhysicalScopeSchema,
})
export type BridgeCapabilityIdentity = z.input<
    typeof bridgeCapabilityIdentitySchema
>

/**
 * Retained `{id}/capabilities`: the Capability manifest Core registers
 * (`platform/core/src/capabilities/adapter.rs`). An empty
 * `supportedObservationEnvelopeVersions` keeps the Device's readings out of
 * History.
 */
export const bridgeCapabilityManifestSchema = z.strictObject({
    schemaVersion: z.literal(1),
    supportedObservationEnvelopeVersions: z.array(
        observationEnvelopeSchemaVersionSchema
    ),
    device: bridgeCapabilityDeviceSchema,
    capabilities: z.array(
        z.strictObject({
            identity: bridgeCapabilityIdentitySchema,
            unit: canonicalUnitSchema,
            directionality: capabilityDirectionalitySchema,
            constraintRevisions: z
                .array(capabilityConstraintRevisionSchema)
                .min(1),
        })
    ),
})
export type BridgeCapabilityManifest = z.input<
    typeof bridgeCapabilityManifestSchema
>

/** Retained `{id}/observations`: one envelope of readings. */
export const bridgeObservationReportSchema = z.strictObject({
    schemaVersion: observationEnvelopeSchemaVersionSchema.optional(),
    observationId: z.string().min(1).optional(),
    observedAt: z.iso.datetime({ offset: true }).optional(),
    timeTrust: z.enum(['trustworthy', 'untrustworthy']),
    observations: z.array(
        z.strictObject({
            identity: bridgeCapabilityIdentitySchema,
            capabilityId: z.string().min(1).optional(),
            /** Set only when the adapter knows a cumulative counter was reset. */
            reset: z.boolean().optional(),
            reading: z.discriminatedUnion('status', [
                z.strictObject({
                    status: z.literal('value'),
                    value: numericCapabilityValueSchema,
                }),
                z.strictObject({ status: z.literal('unavailable') }),
            ]),
        })
    ),
})
export type BridgeObservationReport = z.input<
    typeof bridgeObservationReportSchema
>
