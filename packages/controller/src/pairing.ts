import {
    ApiError,
    type IdentifyResponse,
    identifyResponseSchema,
    type PairingSecret,
    pairingConfirmResponseSchema,
    pairingExchangeRequestSchema,
    pairingExchangeResponseSchema,
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
import type {
    AccessClientEnrollment,
    AccessClientKeyStore,
} from './access-client-keys.ts'
import { createControllerHttp } from './http.ts'

export type PairWithControllerInput = {
    code: string
    clientLabel: string
    userId: string
    email: string
    displayName?: string
    /** Refuse to pair when the Controller is not this Home. */
    expectedControllerId?: string
    /** Where the new Access Client keys and Access grant are kept. */
    keyStore: AccessClientKeyStore
    /**
     * `recoveryKey` pairs a new Owner Access Client with the Recovery Key
     * in `code` (ADR-0012). Defaults to the Pairing code.
     */
    secret?: PairingSecret
}

export type PairWithControllerResult = {
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
 * Pairs on the home network. The Access Client creates its own keys and runs
 * CPace keyed by the Pairing code (ADR-0037), so the exchange is as safe over
 * plain HTTP or a self-signed certificate as over trusted HTTPS. It pins the
 * Controller's keys from the exchange and keeps them with its keys and the
 * Access grant. No bearer token is issued or kept.
 */
export async function pairWithController(
    baseUrl: string,
    input: PairWithControllerInput
): Promise<PairWithControllerResult> {
    const normalized = baseUrl.replace(/\/$/, '')
    const http = createControllerHttp(normalized, { timeoutMs: 8_000 })
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
