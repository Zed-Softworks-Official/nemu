/** Hosts browsers treat as trustworthy for mixed-content exemptions. */
export function isLoopbackHostname(hostname: string): boolean {
    const host = hostname.toLowerCase().replace(/^\[|\]$/g, '')
    return host === 'localhost' || host === '127.0.0.1' || host === '::1'
}

export function isSecureDocument(): boolean {
    return typeof globalThis.window !== 'undefined' && window.isSecureContext
}

/**
 * True when this page is HTTPS and `url` is cleartext HTTP/WS to a
 * non-loopback host. Browsers block those as mixed content (including
 * `ws://nemu.local`), so we must not construct the socket.
 */
export function isMixedContentUrl(url: string): boolean {
    if (!isSecureDocument()) return false
    try {
        const parsed = new URL(url)
        if (parsed.protocol === 'https:' || parsed.protocol === 'wss:') {
            return false
        }
        if (parsed.protocol === 'http:' || parsed.protocol === 'ws:') {
            return !isLoopbackHostname(parsed.hostname)
        }
        return false
    } catch {
        return false
    }
}
