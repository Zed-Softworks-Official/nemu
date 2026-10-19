import { z } from 'zod'
import { clientTokenSchema, householdMemberSchema } from './api.ts'
import {
    capabilityChangeEventSchema,
    capabilitySnapshotEventSchema,
} from './capability.ts'
import { deviceStateSchema } from './device.ts'
import {
    historyQueryMessageSchema,
    historyQueryResultSchema,
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

const authenticatedRelayMessageSchema = z.union([
    relayCommandMessageSchema,
    z.object({ type: z.literal('getDevices') }),
    z.object({ type: z.literal('listMembers') }),
    z.object({ type: z.literal('inviteMember'), email: z.string() }),
    z.object({ type: z.literal('removeMember'), memberId: z.string() }),
    z.object({ type: z.literal('listTokens') }),
    z.object({ type: z.literal('revokeToken'), tokenId: z.string() }),
    z.object({ type: z.literal('revokeCurrent') }),
    z.object({
        type: z.literal('bootstrapOwner'),
        userId: z.string(),
        email: z.string(),
        displayName: z.string().optional(),
    }),
    z.object({ type: z.literal('getCapabilitySnapshot') }),
    z.object({ type: z.literal('watchCapabilityChanges') }),
    historyQueryMessageSchema,
])

export const relayToControllerEnvelopeSchema = z.union([
    z.object({
        requestId: z.string(),
        message: sessionMintMessageSchema,
    }),
    z.object({
        requestId: z.string(),
        clientToken: z.string(),
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
    ]),
})
export type RelayToClientEnvelope = z.infer<typeof relayToClientEnvelopeSchema>

export const relayEnvelopeSchema = z.union([
    relayToControllerEnvelopeSchema,
    relayToClientEnvelopeSchema,
])
export type RelayEnvelope = z.infer<typeof relayEnvelopeSchema>
