import {
    type HealthResponse,
    healthResponseSchema,
    type IdentifyResponse,
    identifyResponseSchema,
} from '@nemu/protocol'
import { createControllerHttp } from './http'
import { isMixedContentUrl, isSecureDocument } from './mixedContent'
import { getRememberedBaseUrl } from './storage'

export const DEFAULT_LAN_CANDIDATES = [
    'http://nemu.local:6368',
    'http://localhost:6368',
] as const

export const DEFAULT_HTTPS_LAN_CANDIDATES = [
    'https://nemu.local:6368',
    'https://localhost:6368',
] as const

export const TLS_TRUST_URL = 'https://nemu.local:6368/'
export const TLS_TRUSTED_MESSAGE = 'nemu-tls-trusted'

export function buildTlsTrustUrl(
    controllerBase?: string,
    returnTo?: string
): string {
    let url: URL
    try {
        url = new URL(controllerBase?.trim() || TLS_TRUST_URL)
        if (url.protocol === 'http:') url.protocol = 'https:'
        url.pathname = '/'
        url.search = ''
        url.hash = ''
    } catch {
        url = new URL(TLS_TRUST_URL)
    }
    if (returnTo) {
        url.searchParams.set('next', returnTo)
    }
    return url.toString()
}

export type ProbeResult = {
    baseUrl: string
    health: HealthResponse
}

export function upgradeToHttps(url: string): string | null {
    try {
        const parsed = new URL(url)
        if (parsed.protocol === 'https:') {
            return parsed.toString().replace(/\/$/, '')
        }
        if (parsed.protocol !== 'http:') return null
        parsed.protocol = 'https:'
        return parsed.toString().replace(/\/$/, '')
    } catch {
        return null
    }
}

/**
 * HTTPS-first on secure pages (app.nemu.sh) so LAN WebSockets can use wss://.
 * Loopback HTTP stays available because browsers exempt it from mixed content.
 */
export function isLanControllerOrigin(origin: string): boolean {
    try {
        const url = new URL(origin)
        const host = url.hostname
        return (
            host === 'nemu.local' ||
            host === 'localhost' ||
            host === '127.0.0.1' ||
            host.endsWith('.lan.nemu.sh') ||
            /^\d{1,3}(\.\d{1,3}){3}$/.test(host)
        )
    } catch {
        return false
    }
}

export function lanUrlsFromHostnames(
    hostnames: Array<string | null | undefined>
): string[] {
    const urls: string[] = []
    for (const hostname of hostnames) {
        if (!hostname) continue
        const host = hostname.replace(/^https?:\/\//, '').replace(/\/$/, '')
        if (!host) continue
        urls.push(`https://${host}:6368`)
    }
    return urls
}

export function lanDiscoveryCandidates(extra: string[] = []): string[] {
    const httpsFirst = isSecureDocument()
    const builtIn = httpsFirst
        ? [...DEFAULT_HTTPS_LAN_CANDIDATES, 'http://localhost:6368']
        : [...DEFAULT_LAN_CANDIDATES, ...DEFAULT_HTTPS_LAN_CANDIDATES]

    const ordered: string[] = []
    const push = (url: string) => {
        const normalized = url.replace(/\/$/, '')
        if (!ordered.includes(normalized)) ordered.push(normalized)
    }

    for (const url of extra) {
        if (httpsFirst) {
            const https = upgradeToHttps(url)
            if (https) push(https)
        }
        if (!httpsFirst || !isMixedContentUrl(url)) {
            push(url)
        }
    }
    for (const url of builtIn) {
        push(url)
    }
    return ordered
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
    candidates?: string[]
): Promise<ProbeResult | null> {
    const ordered: string[] = []
    const remembered = getRememberedBaseUrl()
    if (remembered) {
        if (isSecureDocument()) {
            const https = upgradeToHttps(remembered)
            if (https) ordered.push(https)
        }
        if (!isMixedContentUrl(remembered) && !ordered.includes(remembered)) {
            ordered.push(remembered)
        }
    }
    for (const candidate of candidates ?? lanDiscoveryCandidates()) {
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
