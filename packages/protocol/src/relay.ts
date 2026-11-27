import { z } from 'zod'
import {
    applyUpdateRequestSchema,
    applyUpdateResponseSchema,
    assignRoomRequestSchema,
    clientTokenSchema,
    commissionResponseSchema,
    createRoomRequestSchema,
    deleteRoomRequestSchema,
    householdMemberSchema,
    memberHealthSummarySchema,
    ownerHealthSummarySchema,
    permitJoinRequestSchema,
    permitJoinResponseSchema,
    releaseChannelSchema,
    releaseStatusSchema,
    renameDeviceRequestSchema,
    sessionResponseSchema,
    switchReleaseChannelResponseSchema,
} from './api.ts'
import {
    capabilityChangeEventSchema,
    capabilitySnapshotEventSchema,
} from './capability.ts'
import { deviceSchema, deviceStateSchema, roomSchema } from './device.ts'
import {
    designateHomeMeterMessageSchema,
    exportHistoryBackupMessageSchema,
    getHomeMeterDesignationMessageSchema,
    historyBackupRestoredSchema,
    historyBackupResultSchema,
    historyCursorMessageSchema,
    historyQueryMessageSchema,
    historyQueryRestartSchema,
    historyQueryResultSchema,
    homeMeterDesignationResultSchema,
    importHistoryBackupMessageSchema,
} from './history.ts'

const relayCommandMessageSchema = z.object({
    type: z.literal('command'),
    deviceId: z.string(),
    payload: deviceStateSchema,
})

const relayCommandResultMessageSchema = z.object({
    type: z.literal('commandResult'),
    ok: z.boolean(),
    outcome: z.string().optional(),
    error: z
        .object({
            code: z.string(),
            message: z.string(),
            details: z.unknown().optional(),
        })
        .optional(),
})

const relaySnapshotMessageSchema = z.object({
    type: z.literal('snapshot'),
    devices: z.array(z.unknown()),
})

const sessionMintMessageSchema = z.object({
    type: z.literal('sessionMint'),
    userId: z.string(),
    email: z.string(),
    clientLabel: z.string(),
    displayName: z.string().optional(),
})

/** Device and Room setup. Same requests and outcomes as LAN (ADR-0023). */
const setupRelayMessageSchemas = [
    renameDeviceRequestSchema.extend({ type: z.literal('renameDevice') }),
    assignRoomRequestSchema.extend({ type: z.literal('assignRoom') }),
    z.object({ type: z.literal('removeDevice'), deviceId: z.string().min(1) }),
    createRoomRequestSchema.extend({ type: z.literal('createRoom') }),
    z.object({
        type: z.literal('updateRoom'),
        roomId: z.string().min(1),
        name: z.string().trim().min(1).max(255).optional(),
        sortOrder: z.number().int().optional(),
    }),
    deleteRoomRequestSchema.extend({
        type: z.literal('deleteRoom'),
        roomId: z.string().min(1),
    }),
] as const

/**
 * Commissioning every Membership may do over Relay (ADR-0034). Starting
 * Matter commissioning and reading or saving Matter Wi-Fi have no Relay
 * message: pairing codes and Wi-Fi credentials must not cross Relay until
 * its envelopes are encrypted end to end (NEM-63). Cancelling Matter carries
 * neither, so a commissioning started over LAN can still be stopped.
 */
const commissioningRelayMessageSchemas = [
    z.object({ type: z.literal('cancelMatterCommission') }),
    permitJoinRequestSchema.extend({ type: z.literal('permitJoin') }),
] as const

const commissioningRelayResultSchemas = [
    commissionResponseSchema.extend({
        type: z.literal('cancelMatterCommission'),
    }),
    permitJoinResponseSchema.extend({ type: z.literal('permitJoin') }),
] as const

const authenticatedRelayMessageSchema = z.union([
    ...setupRelayMessageSchemas,
    ...commissioningRelayMessageSchemas,
    relayCommandMessageSchema,
    z.object({ type: z.literal('getDevices') }),
    z.object({ type: z.literal('getRooms') }),
    z.object({ type: z.literal('listMembers') }),
    z.object({ type: z.literal('inviteMember'), email: z.string() }),
    z.object({ type: z.literal('removeMember'), memberId: z.string() }),
    z.object({ type: z.literal('listTokens') }),
    z.object({ type: z.literal('revokeToken'), tokenId: z.string() }),
    /** Access Client revocation: only the calling Access Client loses access. */
    z.object({ type: z.literal('revokeCurrent') }),
    /** Leaving a Home: ends the caller's own Membership. */
    z.object({ type: z.literal('leaveHome') }),
    z.object({
        type: z.literal('bootstrapOwner'),
        userId: z.string(),
        email: z.string(),
        displayName: z.string().optional(),
    }),
    z.object({ type: z.literal('getCapabilitySnapshot') }),
    z.object({ type: z.literal('watchCapabilityChanges') }),
    historyQueryMessageSchema,
    historyCursorMessageSchema,
    designateHomeMeterMessageSchema,
    getHomeMeterDesignationMessageSchema,
    exportHistoryBackupMessageSchema,
    importHistoryBackupMessageSchema,
    z.object({ type: z.literal('releaseStatus') }),
    applyUpdateRequestSchema.extend({ type: z.literal('installRelease') }),
    z.object({ type: z.literal('rollbackRelease') }),
    z.object({
        type: z.literal('switchReleaseChannel'),
        channel: releaseChannelSchema,
    }),
    z.object({ type: z.literal('getSession') }),
    z.object({ type: z.literal('getHealthSummary') }),
])

export const relayToControllerEnvelopeSchema = z.union([
    z.object({
        requestId: z.string(),
        message: sessionMintMessageSchema,
    }),
    z.object({
        requestId: z.string(),
        clientToken: z.string(),
        /**
         * Unix milliseconds after which the sender gave up on a write. The
         * Controller refuses it from then on, so a write Convex held while
         * disconnected does not run later. Older Controllers ignore it.
         */
        expiresAt: z.number().int().optional(),
        message: authenticatedRelayMessageSchema,
    }),
])
export type RelayToControllerEnvelope = z.infer<
    typeof relayToControllerEnvelopeSchema
>

export const relayToClientEnvelopeSchema = z.object({
    requestId: z.string(),
    signature: z.string(),
    message: z.union([
        relayCommandResultMessageSchema,
        relaySnapshotMessageSchema,
        z.object({
            type: z.literal('devices'),
            devices: z.array(z.unknown()),
        }),
        z.object({
            type: z.literal('rooms'),
            rooms: z.array(roomSchema),
        }),
        z.object({ type: z.literal('device'), device: deviceSchema }),
        z.object({ type: z.literal('room'), room: roomSchema }),
        z.object({
            type: z.literal('sessionMintResult'),
            clientToken: z.string(),
            controllerId: z.string(),
        }),
        z.object({
            type: z.literal('members'),
            members: z.array(householdMemberSchema),
        }),
        z.object({
            type: z.literal('member'),
            member: householdMemberSchema,
        }),
        z.object({
            type: z.literal('tokens'),
            tokens: z.array(clientTokenSchema),
        }),
        capabilitySnapshotEventSchema,
        capabilityChangeEventSchema,
        z.object({ type: z.literal('capabilityWatchAck') }),
        historyQueryResultSchema,
        historyQueryRestartSchema,
        homeMeterDesignationResultSchema,
        historyBackupResultSchema,
        historyBackupRestoredSchema,
        releaseStatusSchema.extend({
            type: z.literal('releaseStatus'),
        }),
        applyUpdateResponseSchema.extend({
            type: z.literal('installRelease'),
        }),
        applyUpdateResponseSchema.extend({
            type: z.literal('rollbackRelease'),
        }),
        switchReleaseChannelResponseSchema.extend({
            type: z.literal('switchReleaseChannel'),
        }),
        ...commissioningRelayResultSchemas,
        sessionResponseSchema.extend({ type: z.literal('session') }),
        ownerHealthSummarySchema.extend({ type: z.literal('healthSummary') }),
        memberHealthSummarySchema.extend({ type: z.literal('healthSummary') }),
    ]),
})
export type RelayToClientEnvelope = z.infer<typeof relayToClientEnvelopeSchema>

export const relayEnvelopeSchema = z.union([
    relayToControllerEnvelopeSchema,
    relayToClientEnvelopeSchema,
])
export type RelayEnvelope = z.infer<typeof relayEnvelopeSchema>
