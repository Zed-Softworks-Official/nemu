import {
    type IdentifyResponse,
    identifyResponseSchema,
    type PairResponse,
    pairRequestSchema,
    pairResponseSchema,
    relayToClientEnvelopeSchema,
    type SessionMintResult,
    sessionMintResultSchema,
} from '@nemu/protocol'
import type { ConvexReactClient } from 'convex/react'
import type { FunctionReference } from 'convex/server'
import { createControllerHttp } from './http'
import {
    setClientToken,
    setRememberedBaseUrl,
    setRememberedControllerId,
} from './storage'

export type PairWithControllerResult = {
    baseUrl: string
    identity: IdentifyResponse
    pair: PairResponse
}

export type PairWithControllerInput = {
    code: string
    clientLabel: string
    userId: string
    email: string
    displayName?: string
}

/**
 * Identify a controller, exchange a pairing code for a client token, and
 * persist credentials in localStorage for the connection manager.
 */
export async function pairWithController(
    baseUrl: string,
    input: PairWithControllerInput
): Promise<PairWithControllerResult> {
    const normalized = baseUrl.replace(/\/$/, '')
    const http = createControllerHttp(normalized, () => null, 8_000)

    const identifyRes = await http.get('/api/identify')
    const identity = identifyResponseSchema.parse(identifyRes.data)

    const body = pairRequestSchema.parse({
        code: input.code,
        clientLabel: input.clientLabel,
        userId: input.userId,
        email: input.email,
        displayName: input.displayName,
    })
    const pairRes = await http.post('/api/pair', body)
    const pair = pairResponseSchema.parse(pairRes.data)

    setClientToken(pair.clientToken)
    setRememberedBaseUrl(normalized)
    setRememberedControllerId(pair.controllerId || identity.controllerId)

    return { baseUrl: normalized, identity, pair }
}

type SessionMintRequestArgs = {
    controllerId: string
    requestId: string
    clientLabel: string
    displayName?: string
}

type RelayResponseDoc = {
    requestId: string
    payload: string
    direction: 'toController' | 'toClient'
}

export type SessionMintApi = {
    request: FunctionReference<
        'mutation',
        'public',
        SessionMintRequestArgs,
        unknown
    >
    responses: FunctionReference<
        'query',
        'public',
        { requestIds: string[] },
        RelayResponseDoc[]
    >
}

export async function mintSessionViaRelay(options: {
    convex: ConvexReactClient
    api: SessionMintApi
    controllerId: string
    clientLabel: string
    displayName?: string
    timeoutMs?: number
    pollIntervalMs?: number
}): Promise<SessionMintResult> {
    const requestId = crypto.randomUUID()
    const timeoutMs = options.timeoutMs ?? 25_000
    const pollIntervalMs = options.pollIntervalMs ?? 1_000

    await options.convex.mutation(options.api.request, {
        controllerId: options.controllerId,
        requestId,
        clientLabel: options.clientLabel,
        displayName: options.displayName,
    })

    const started = Date.now()
    while (Date.now() - started <= timeoutMs) {
        const messages = await options.convex.query(options.api.responses, {
            requestIds: [requestId],
        })
        const match = messages.find(
            (message) =>
                message.requestId === requestId &&
                message.direction === 'toClient'
        )
        if (match) {
            const parsed = relayToClientEnvelopeSchema.safeParse(
                JSON.parse(match.payload)
            )
            if (!parsed.success) {
                throw new Error('Unexpected session mint response')
            }
            if (parsed.data.message.type === 'commandResult') {
                throw new Error(
                    parsed.data.message.error?.message ??
                        'Could not create a dashboard session'
                )
            }
            if (parsed.data.message.type !== 'sessionMintResult') {
                throw new Error('Unexpected session mint response')
            }
            const result = sessionMintResultSchema.parse({
                clientToken: parsed.data.message.clientToken,
                controllerId: parsed.data.message.controllerId,
            })
            setClientToken(result.clientToken)
            setRememberedControllerId(result.controllerId)
            return result
        }
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
    }

    throw new Error('Timed out waiting for the controller to mint a session')
}
