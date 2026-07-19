import { z } from 'zod'
import { deviceSchema } from './device'

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

export const pairRequestSchema = z.object({
    code: z.string(),
    clientLabel: z.string(),
})
export type PairRequest = z.infer<typeof pairRequestSchema>

export const pairResponseSchema = z.object({
    clientToken: z.string(),
})
export type PairResponse = z.infer<typeof pairResponseSchema>
