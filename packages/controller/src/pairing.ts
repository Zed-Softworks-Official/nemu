import {
    type IdentifyResponse,
    identifyResponseSchema,
    type PairResponse,
    pairRequestSchema,
    pairResponseSchema,
} from '@nemu/protocol'
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

/**
 * Identify a controller, exchange a pairing code for a client token, and
 * persist credentials in localStorage for the connection manager.
 */
export async function pairWithController(
    baseUrl: string,
    code: string,
    clientLabel: string
): Promise<PairWithControllerResult> {
    const normalized = baseUrl.replace(/\/$/, '')
    const http = createControllerHttp(normalized, () => null, 8_000)

    const identifyRes = await http.get('/api/identify')
    const identity = identifyResponseSchema.parse(identifyRes.data)

    const body = pairRequestSchema.parse({ code, clientLabel })
    const pairRes = await http.post('/api/pair', body)
    const pair = pairResponseSchema.parse(pairRes.data)

    setClientToken(pair.clientToken)
    setRememberedBaseUrl(normalized)
    setRememberedControllerId(pair.controllerId || identity.controllerId)

    return { baseUrl: normalized, identity, pair }
}
