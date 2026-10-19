import { z } from 'zod'
import { deviceStateSchema } from './device.ts'

export const deviceCommandSchema = z.object({
    deviceId: z.string(),
    payload: deviceStateSchema,
})
export type DeviceCommand = z.infer<typeof deviceCommandSchema>

export const commandResultSchema = z.object({
    requestId: z.string(),
    ok: z.boolean(),
    outcome: z.string().optional(),
    error: z
        .object({
            code: z.string(),
            message: z.string(),
        })
        .optional(),
})
export type CommandResult = z.infer<typeof commandResultSchema>
