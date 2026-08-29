import { z } from 'zod'
import { type DeviceState, deviceSchema, deviceStateSchema } from './device'

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
        error: z
            .object({
                code: z.string(),
                message: z.string(),
            })
            .optional(),
    }),
])
export type DeviceEvent = z.infer<typeof deviceEventSchema>

export const clientWsMessageSchema = z.object({
    type: z.literal('command'),
    requestId: z.string(),
    deviceId: z.string(),
    payload: deviceStateSchema,
})
export type ClientWsMessage = z.infer<typeof clientWsMessageSchema>
