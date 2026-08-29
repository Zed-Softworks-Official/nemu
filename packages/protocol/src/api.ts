import { z } from 'zod'
import { parseDeviceList, roomSchema } from './device'

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
    version: z.string().optional(),
    lanHostname: z.string().optional(),
})
export type IdentifyResponse = z.infer<typeof identifyResponseSchema>

export const devicesResponseSchema = z.object({
    devices: z.array(z.unknown()).transform((items) => parseDeviceList(items)),
})
export type DevicesResponse = z.infer<typeof devicesResponseSchema>

export const roomsResponseSchema = z.object({
    rooms: z.array(roomSchema),
})
export type RoomsResponse = z.infer<typeof roomsResponseSchema>

export const createRoomRequestSchema = z.object({
    name: z.string().trim().min(1),
    sortOrder: z.number().int().optional(),
})
export type CreateRoomRequest = z.infer<typeof createRoomRequestSchema>

export const patchRoomRequestSchema = z
    .object({
        name: z.string().trim().min(1).optional(),
        sortOrder: z.number().int().optional(),
    })
    .refine(
        (value) => value.name !== undefined || value.sortOrder !== undefined,
        { message: 'name or sortOrder is required' }
    )
export type PatchRoomRequest = z.infer<typeof patchRoomRequestSchema>

export const permitJoinRequestSchema = z.object({
    seconds: z.number().int().min(0).max(254),
})
export type PermitJoinRequest = z.infer<typeof permitJoinRequestSchema>

export const permitJoinResponseSchema = z.object({
    ok: z.boolean(),
    seconds: z.number().int().min(0).max(254),
})
export type PermitJoinResponse = z.infer<typeof permitJoinResponseSchema>

export const commissionRequestSchema = z.object({
    /** Matter pairing code: `MT:…` QR payload or 11/21-digit manual code. */
    code: z.string().trim().min(1),
    wifiSsid: z.string().optional(),
    wifiPassword: z.string().optional(),
})
export type CommissionRequest = z.infer<typeof commissionRequestSchema>

export const commissionResponseSchema = z.object({
    ok: z.boolean(),
})
export type CommissionResponse = z.infer<typeof commissionResponseSchema>

export const matterWifiResponseSchema = z.object({
    configured: z.boolean(),
    networkName: z.string().optional(),
})
export type MatterWifiResponse = z.infer<typeof matterWifiResponseSchema>

export const saveMatterWifiRequestSchema = z.object({
    wifiSsid: z.string().trim().min(1).max(32),
    wifiPassword: z.string().max(64),
})
export type SaveMatterWifiRequest = z.infer<typeof saveMatterWifiRequestSchema>

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
    userId: z.string(),
    email: z.string(),
    displayName: z.string().optional(),
})
export type PairRequest = z.infer<typeof pairRequestSchema>

export const pairResponseSchema = z.object({
    clientToken: z.string(),
    controllerId: z.string(),
})
export type PairResponse = z.infer<typeof pairResponseSchema>

export const pairingCodeResponseSchema = z.object({
    code: z.string(),
    expiresAt: z.string(),
})
export type PairingCodeResponse = z.infer<typeof pairingCodeResponseSchema>

export const clientTokenSchema = z.object({
    id: z.string(),
    label: z.string(),
    createdAt: z.string(),
    lastSeenAt: z.string().nullable(),
    userId: z.string().nullable().optional(),
})
export type ClientToken = z.infer<typeof clientTokenSchema>

export const tokensResponseSchema = z.object({
    tokens: z.array(clientTokenSchema),
})
export type TokensResponse = z.infer<typeof tokensResponseSchema>

export const householdMemberSchema = z.object({
    id: z.string(),
    userId: z.string().nullable(),
    email: z.string(),
    displayName: z.string().nullable(),
    role: z.enum(['owner', 'member']),
    status: z.enum(['pending', 'active']),
    createdAt: z.string(),
})
export type HouseholdMember = z.infer<typeof householdMemberSchema>

export const membersResponseSchema = z.object({
    members: z.array(householdMemberSchema),
})
export type MembersResponse = z.infer<typeof membersResponseSchema>

export const inviteMemberRequestSchema = z.object({
    email: z.string().trim().min(1),
})
export type InviteMemberRequest = z.infer<typeof inviteMemberRequestSchema>

export const bootstrapOwnerRequestSchema = z.object({
    userId: z.string().trim().min(1),
    email: z.string().trim().min(1),
    displayName: z.string().optional(),
})
export type BootstrapOwnerRequest = z.infer<typeof bootstrapOwnerRequestSchema>

export const sessionMintResultSchema = z.object({
    clientToken: z.string(),
    controllerId: z.string(),
})
export type SessionMintResult = z.infer<typeof sessionMintResultSchema>

export const updateStatusResponseSchema = z.object({
    currentVersion: z.string(),
    updateAvailable: z.boolean(),
    image: z.string().optional(),
})
export type UpdateStatusResponse = z.infer<typeof updateStatusResponseSchema>

export const applyUpdateResponseSchema = z.object({
    started: z.boolean(),
})
export type ApplyUpdateResponse = z.infer<typeof applyUpdateResponseSchema>
