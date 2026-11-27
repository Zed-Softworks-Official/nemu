import { z } from 'zod'
import {
    accessClientSchema,
    applyUpdateRequestSchema,
    applyUpdateResponseSchema,
    assignRoomRequestSchema,
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
import { commissioningStepEventSchema } from './commissioning-progress.ts'
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
 * message: ADR-0034's interim limit keeps pairing codes and Wi-Fi
 * credentials off Relay until NEM-98 lifts it, even though envelopes are now
 * sealed end to end. Cancelling Matter carries neither, so a commissioning
 * started over LAN can still be stopped.
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

/**
 * One action, as a sealed Relay request's plaintext (`JSON.stringify` of
 * it, encrypted to the Controller). The clear header carries the requestId;
 * nothing else is in the clear (ADR-0001).
 */
export const relayRequestMessageSchema = z.union([
    ...setupRelayMessageSchemas,
    ...commissioningRelayMessageSchemas,
    relayCommandMessageSchema,
    z.object({ type: z.literal('getDevices') }),
    z.object({ type: z.literal('getRooms') }),
    z.object({ type: z.literal('listMembers') }),
    z.object({ type: z.literal('inviteMember'), email: z.string() }),
    z.object({ type: z.literal('removeMember'), memberId: z.string() }),
    /** The Home's Access Clients, by Access Client ID. */
    z.object({ type: z.literal('listAccessClients') }),
    /** Revokes one Access Client by its Access Client ID. */
    z.object({
        type: z.literal('revokeAccessClient'),
        accessClientId: z.string(),
    }),
    /** Access Client revocation: only the calling Access Client loses access. */
    z.object({ type: z.literal('revokeCurrent') }),
    /** Leaving a Home: ends the caller's own Membership. */
    z.object({ type: z.literal('leaveHome') }),
    z.object({ type: z.literal('getCapabilitySnapshot') }),
    /**
     * Registers a capability watch. Its pushes are sealed with the key this
     * request exports. `renews` names the watch it replaces, so each tab
     * holds one live watch.
     */
    z.object({
        type: z.literal('watchCapabilityChanges'),
        renews: z.string().min(1).max(256).optional(),
    }),
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

export type RelayRequestMessage = z.infer<typeof relayRequestMessageSchema>

/** One reply, as a sealed Relay response's plaintext. */
export const relayReplyMessageSchema = z.union([
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
        type: z.literal('members'),
        members: z.array(householdMemberSchema),
    }),
    z.object({
        type: z.literal('member'),
        member: householdMemberSchema,
    }),
    z.object({
        type: z.literal('accessClients'),
        accessClients: z.array(accessClientSchema),
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
])
export type RelayReplyMessage = z.infer<typeof relayReplyMessageSchema>

/**
 * One push, as a sealed Relay push's plaintext. Pushes ride the capability
 * watch: its changes and snapshots, and commissioning progress. Progress
 * never answers a request, so it is not a reply.
 */
export const relayPushMessageSchema = z.union([
    capabilityChangeEventSchema,
    capabilitySnapshotEventSchema,
    commissioningStepEventSchema,
])
export type RelayPushMessage = z.infer<typeof relayPushMessageSchema>
