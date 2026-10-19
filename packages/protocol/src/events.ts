import { z } from 'zod'
import {
    capabilityChangeEventSchema,
    capabilitySnapshotEventSchema,
} from './capability.ts'
import { type DeviceState, deviceSchema, deviceStateSchema } from './device.ts'
import {
    designateHomeMeterMessageSchema,
    getHomeMeterDesignationMessageSchema,
    historyCursorMessageSchema,
    historyQueryFields,
} from './history.ts'

export const deviceEventSchema = z.discriminatedUnion('type', [
    z.object({
        type: z.literal('deviceState'),
        deviceId: z.string(),
        state: deviceStateSchema
            .nullish()
            .transform((value): DeviceState => value ?? {}),
    }),
    z.object({
        type: z.literal('deviceJoined'),
        device: deviceSchema,
    }),
    z.object({
        type: z.literal('deviceLeft'),
        deviceId: z.string(),
    }),
    z.object({
        type: z.literal('interview'),
        externalId: z.string(),
        status: z.enum(['started', 'successful', 'failed']),
        error: z.string().optional(),
        message: z.string().optional(),
    }),
    z.object({
        type: z.literal('commissionProgress'),
        stage: z.string(),
        message: z.string().optional(),
    }),
    z.object({
        type: z.literal('resync'),
    }),
    z.object({
        type: z.literal('health'),
        mqtt: z.boolean(),
        zigbee: z.boolean(),
        // Optional so old cores without a Matter bridge still parse.
        matter: z.boolean().optional(),
        db: z.boolean(),
    }),
    z.object({
        type: z.literal('commandResult'),
        requestId: z.string(),
        ok: z.boolean(),
        outcome: z.string().optional(),
        error: z
            .object({
                code: z.string(),
                message: z.string(),
            })
            .optional(),
    }),
    capabilitySnapshotEventSchema,
    capabilityChangeEventSchema,
])
export type DeviceEvent = z.infer<typeof deviceEventSchema>

export const clientWsMessageSchema = z.union([
    z.object({
        type: z.literal('command'),
        requestId: z.string(),
        deviceId: z.string(),
        payload: deviceStateSchema,
    }),
    z.object({
        type: z.literal('requestCapabilitySnapshot'),
    }),
    z.object({
        type: z.literal('historyQuery'),
        requestId: z.string(),
        ...historyQueryFields,
    }),
    historyCursorMessageSchema.extend({
        requestId: z.string(),
    }),
    designateHomeMeterMessageSchema.extend({
        requestId: z.string(),
    }),
    getHomeMeterDesignationMessageSchema.extend({
        requestId: z.string(),
    }),
])
export type ClientWsMessage = z.infer<typeof clientWsMessageSchema>
