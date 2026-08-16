import { z } from 'zod'
import { clientTokenSchema, householdMemberSchema } from './api'
import { deviceStateSchema } from './device'

const relayCommandMessageSchema = z.object({
    type: z.literal('command'),
    deviceId: z.string(),
    payload: deviceStateSchema,
})

const relayCommandResultMessageSchema = z.object({
    type: z.literal('commandResult'),
    ok: z.boolean(),
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
    ]),
})
export type RelayToClientEnvelope = z.infer<typeof relayToClientEnvelopeSchema>

export const relayEnvelopeSchema = z.union([
    relayToControllerEnvelopeSchema,
    relayToClientEnvelopeSchema,
])
export type RelayEnvelope = z.infer<typeof relayEnvelopeSchema>
