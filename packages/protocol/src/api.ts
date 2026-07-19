import { z } from 'zod'
import { deviceSchema, roomSchema } from './device'

export const apiErrorBodySchema = z.object({
    error: z.object({
        code: z.string(),
        message: z.string(),
    }),
})
export type ApiErrorBody = z.infer<typeof apiErrorBodySchema>

export class ApiError extends Error {
    readonly code: string
    readonly status?: number

    constructor(code: string, message: string, status?: number) {
        super(message)
        this.name = 'ApiError'
        this.code = code
        this.status = status
    }
}

export const healthResponseSchema = z.object({
    status: z.string(),
})
export type HealthResponse = z.infer<typeof healthResponseSchema>

export const identifyResponseSchema = z.object({
    controllerId: z.string(),
    name: z.string(),
})
export type IdentifyResponse = z.infer<typeof identifyResponseSchema>

export const devicesResponseSchema = z.object({
    devices: z.array(deviceSchema),
})
export type DevicesResponse = z.infer<typeof devicesResponseSchema>

export const roomsResponseSchema = z.object({
    rooms: z.array(roomSchema),
})
export type RoomsResponse = z.infer<typeof roomsResponseSchema>

export const permitJoinRequestSchema = z.object({
    seconds: z.number().int().min(1).max(254),
})
export type PermitJoinRequest = z.infer<typeof permitJoinRequestSchema>

export const permitJoinResponseSchema = z.object({
    ok: z.boolean(),
    seconds: z.number().int().min(1).max(254),
})
export type PermitJoinResponse = z.infer<typeof permitJoinResponseSchema>

export const patchDeviceRequestSchema = z
    .object({
        name: z.string().trim().min(1).optional(),
        roomId: z.string().nullable().optional(),
    })
    .refine((value) => value.name !== undefined || value.roomId !== undefined, {
        message: 'name or roomId is required',
    })
export type PatchDeviceRequest = z.infer<typeof patchDeviceRequestSchema>

export const pairRequestSchema = z.object({
    code: z.string(),
    clientLabel: z.string(),
})
export type PairRequest = z.infer<typeof pairRequestSchema>

export const pairResponseSchema = z.object({
    clientToken: z.string(),
})
export type PairResponse = z.infer<typeof pairResponseSchema>
