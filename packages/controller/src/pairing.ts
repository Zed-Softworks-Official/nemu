import {
    ApiError,
    type IdentifyResponse,
    identifyResponseSchema,
    type PairingSecret,
    type PairResponse,
    pairingConfirmResponseSchema,
    pairingExchangeRequestSchema,
    pairingExchangeResponseSchema,
    pairRequestSchema,
    pairResponseSchema,
    relayToClientEnvelopeSchema,
    type SessionMintResult,
    sessionMintResultSchema,
    startPairingResponseSchema,
} from '@nemu/protocol'
import {
    b64urlDecode,
    b64urlEncode,
    CpaceError,
    CpaceInitiator,
    GrantError,
    verifyGrant,
} from '@nemu/protocol/relay-crypto'
import type { AxiosInstance } from 'axios'
import type { ConvexReactClient } from 'convex/react'
import type { FunctionReference } from 'convex/server'
import type {
    AccessClientEnrollment,
    AccessClientKeyStore,
} from './access-client-keys.ts'
import { createControllerHttp } from './http.ts'
import {
    type ControllerCredentialStore,
    defaultCredentialStore,
} from './storage.ts'
import {
    acknowledgeRelayResponses,
    type RelayAcknowledgeRef,
} from './transports/relay-acknowledge.ts'

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
    /** Refuse to pair when the Controller is not this Home. */
    expectedControllerId?: string
    credentialStore?: ControllerCredentialStore
}

export type PairWithKeysInput = Omit<
    PairWithControllerInput,
    'credentialStore'
> & {
    /** Where the new Access Client keys and Access grant are kept. */
    keyStore: AccessClientKeyStore
    /**
     * `recoveryKey` pairs a new Owner Access Client with the Recovery Key
     * in `code` (ADR-0012). Defaults to the Pairing code.
     */
    secret?: PairingSecret
    /** Not written: an Access Client with keys holds no bearer token. */
    credentialStore?: ControllerCredentialStore
}

export type PairWithKeysResult = {
    baseUrl: string
    identity: IdentifyResponse
    enrollment: AccessClientEnrollment
}

/** Error code when the Access grant does not match the pairing. */
export const INVALID_GRANT_ERROR_CODE = 'invalid_grant'

/** Error code when a LAN Controller is not the selected Home. */
export const WRONG_HOME_ERROR_CODE = 'wrong_home'

async function identifyHome(
    http: AxiosInstance,
    expectedControllerId: string | undefined
): Promise<IdentifyResponse> {
    const identifyRes = await http.get('/api/identify')
    const identity = identifyResponseSchema.parse(identifyRes.data)
    if (
        expectedControllerId &&
        identity.controllerId !== expectedControllerId
    ) {
        throw new ApiError(
            WRONG_HOME_ERROR_CODE,
            'This Controller belongs to a different Home'
        )
    }
    return identity
}

function decode(text: string): Uint8Array {
    const bytes = b64urlDecode(text)
    if (!bytes) {
        throw new ApiError('protocol_mismatch', 'Malformed pairing message')
    }
    return bytes
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
    return a.length === b.length && a.every((byte, i) => byte === b[i])
}

/**
 * Pairs on the home network.
 *
 * With `keyStore`, the Access Client creates its own keys and runs CPace
 * keyed by the Pairing code (ADR-0037), so the exchange is as safe over plain
 * HTTP or a self-signed certificate as over trusted HTTPS. It pins the
 * Controller's keys from the exchange and keeps them with its keys and the
 * Access grant.
 *
 * Without `keyStore`, it exchanges the code for a bearer token, until
 * NEM-130 moves the apps to keys and NEM-131 removes tokens.
 */
export async function pairWithController(
    baseUrl: string,
    input: PairWithKeysInput
): Promise<PairWithKeysResult>
export async function pairWithController(
    baseUrl: string,
    input: PairWithControllerInput
): Promise<PairWithControllerResult>
export async function pairWithController(
    baseUrl: string,
    input: PairWithControllerInput | PairWithKeysInput
): Promise<PairWithControllerResult | PairWithKeysResult> {
    if ('keyStore' in input) return await pairWithKeys(baseUrl, input)

    const normalized = baseUrl.replace(/\/$/, '')
    const http = createControllerHttp(normalized, () => null, 8_000)
    const identity = await identifyHome(http, input.expectedControllerId)

    const body = pairRequestSchema.parse({
        code: input.code,
        clientLabel: input.clientLabel,
        userId: input.userId,
        email: input.email,
        displayName: input.displayName,
    })
    const pairRes = await http.post('/api/pair', body)
    const pair = pairResponseSchema.parse(pairRes.data)

    const store = input.credentialStore ?? defaultCredentialStore
    store.set(pair.controllerId || identity.controllerId, {
        clientToken: pair.clientToken,
        baseUrl: normalized,
    })

    return { baseUrl: normalized, identity, pair }
}

async function pairWithKeys(
    baseUrl: string,
    input: PairWithKeysInput
): Promise<PairWithKeysResult> {
    const normalized = baseUrl.replace(/\/$/, '')
    const http = createControllerHttp(normalized, () => null, 8_000)
    const identity = await identifyHome(http, input.expectedControllerId)
    const controllerId = identity.controllerId
    const keys = await input.keyStore.generate()

    const { data: started } = await http.post(
        '/api/pairing/runs',
        input.secret ? { secret: input.secret } : undefined
    )
    const run = startPairingResponseSchema.parse(started)
    if (run.controllerId !== controllerId) {
        throw new ApiError(
            WRONG_HOME_ERROR_CODE,
            'This Controller belongs to a different Home'
        )
    }
    const runPath = `/api/pairing/runs/${encodeURIComponent(run.runId)}`
    const initiator = new CpaceInitiator(
        { code: input.code, controllerId, sid: decode(run.sid) },
        { signingKey: keys.signingKey, encryptionKey: keys.encryptionKey }
    )

    const { data: answered } = await http.post(
        `${runPath}/exchange`,
        pairingExchangeRequestSchema.parse({
            ya: b64urlEncode(initiator.message.ya),
            adA: b64urlEncode(initiator.message.adA),
            clientLabel: input.clientLabel,
            userId: input.userId,
            email: input.email,
            displayName: input.displayName,
        })
    )
    const reply = pairingExchangeResponseSchema.parse(answered)
    let outcome: ReturnType<CpaceInitiator['finish']>
    try {
        outcome = initiator.finish({
            yb: decode(reply.yb),
            adB: decode(reply.adB),
            tagB: decode(reply.tagB),
        })
    } catch (error) {
        // A wrong code and an impostor Controller look the same from here.
        if (error instanceof CpaceError) {
            throw new ApiError(
                'invalid_code',
                'Pairing code is invalid or expired'
            )
        }
        throw error
    }

    const { data: confirmed } = await http.post(`${runPath}/confirm`, {
        tagA: b64urlEncode(outcome.tagA),
    })
    const paired = pairingConfirmResponseSchema.parse(confirmed)
    const pinned = outcome.controllerKeys
    try {
        const grant = verifyGrant(paired.grant, controllerId, pinned.signingKey)
        if (
            grant.accessClientId !== paired.accessClientId ||
            grant.membershipId !== paired.membershipId ||
            !equalBytes(grant.signingKey, keys.signingKey) ||
            !equalBytes(grant.encryptionKey, keys.encryptionKey)
        ) {
            throw new GrantError('malformed')
        }
    } catch (error) {
        if (error instanceof GrantError) {
            throw new ApiError(
                INVALID_GRANT_ERROR_CODE,
                'The Controller issued an Access grant that does not match this pairing'
            )
        }
        throw error
    }

    const enrollment: AccessClientEnrollment = {
        controllerId,
        accessClientId: paired.accessClientId,
        membershipId: paired.membershipId,
        grant: paired.grant,
        controllerSigningKey: pinned.signingKey,
        controllerEncryptionKey: pinned.encryptionKey,
    }
    await input.keyStore.save({ keys, enrollment })
    return { baseUrl: normalized, identity, enrollment }
}

type SessionMintRequestArgs = {
    controllerId: string
    requestId: string
    clientLabel: string
    displayName?: string
}

type RelayResponseDoc = {
    _id: string
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
    acknowledge: RelayAcknowledgeRef
}

export async function mintSessionViaRelay(options: {
    convex: ConvexReactClient
    api: SessionMintApi
    controllerId: string
    clientLabel: string
    displayName?: string
    timeoutMs?: number
    pollIntervalMs?: number
    credentialStore?: ControllerCredentialStore
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
            // Privacy: the response carries a Client token, so delete it now.
            acknowledgeRelayResponses(options.convex, options.api.acknowledge, [
                match._id,
            ])
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
            if (result.controllerId !== options.controllerId) {
                throw new Error('The session was minted for a different Home')
            }
            const store = options.credentialStore ?? defaultCredentialStore
            store.set(result.controllerId, {
                clientToken: result.clientToken,
            })
            return result
        }
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
    }

    throw new Error('Timed out waiting for the controller to mint a session')
}
