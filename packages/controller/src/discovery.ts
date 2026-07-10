import {
    type HealthResponse,
    type IdentifyResponse,
    healthResponseSchema,
    identifyResponseSchema,
} from '@nemu/protocol'
import { createControllerHttp } from './http'
import { getRememberedBaseUrl } from './storage'

export const DEFAULT_LAN_CANDIDATES = [
    'http://nemu.local:3000',
    'http://localhost:3000',
] as const

export type ProbeResult = {
    baseUrl: string
    health: HealthResponse
}

export async function probeController(
    baseUrl: string,
    timeoutMs = 2_000
): Promise<ProbeResult> {
    const http = createControllerHttp(baseUrl, () => null, timeoutMs)
    const { data } = await http.get('/api/health')
    const health = healthResponseSchema.parse(data)
    return { baseUrl: baseUrl.replace(/\/$/, ''), health }
}

export async function identifyController(
    baseUrl: string,
    timeoutMs = 3_000
): Promise<IdentifyResponse> {
    const http = createControllerHttp(baseUrl, () => null, timeoutMs)
    const { data } = await http.get('/api/identify')
    return identifyResponseSchema.parse(data)
}

/**
 * Probe remembered address first, then well-known LAN candidates.
 * Returns the first reachable base URL, or null if none respond.
 */
export async function discoverController(
    candidates: string[] = [...DEFAULT_LAN_CANDIDATES]
): Promise<ProbeResult | null> {
    const ordered: string[] = []
    const remembered = getRememberedBaseUrl()
    if (remembered) ordered.push(remembered)
    for (const candidate of candidates) {
        if (!ordered.includes(candidate)) ordered.push(candidate)
    }

    for (const baseUrl of ordered) {
        try {
            return await probeController(baseUrl)
        } catch {
            // try next candidate
        }
    }
    return null
}
