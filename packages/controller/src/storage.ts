/**
 * The dashboard's remembered Home: which Controller it last used and where
 * that Controller answered on the home network. Not a credential; Access
 * Client keys live in their own store (`access-client-keys.ts`).
 */
const BASE_URL_KEY = 'nemu.controller.baseUrl'
const CONTROLLER_ID_KEY = 'nemu.controller.id'
/** Where alpha builds kept bearer tokens (NEM-131 retired them). */
const LEGACY_TOKEN_KEY = 'nemu.controller.clientToken'
const LEGACY_CREDENTIAL_KEY_PREFIX = 'nemu.controller.credential.'

function canUseStorage(): boolean {
    return typeof window !== 'undefined' && typeof localStorage !== 'undefined'
}

function normalizeBaseUrl(baseUrl: string): string {
    return baseUrl.replace(/\/$/, '')
}

export function getRememberedBaseUrl(): string | null {
    if (!canUseStorage()) return null
    return localStorage.getItem(BASE_URL_KEY)
}

export function setRememberedBaseUrl(baseUrl: string): void {
    if (!canUseStorage()) return
    localStorage.setItem(BASE_URL_KEY, normalizeBaseUrl(baseUrl))
}

export function clearRememberedBaseUrl(): void {
    if (!canUseStorage()) return
    localStorage.removeItem(BASE_URL_KEY)
}

export function getRememberedControllerId(): string | null {
    if (!canUseStorage()) return null
    return localStorage.getItem(CONTROLLER_ID_KEY)
}

export function setRememberedControllerId(controllerId: string): void {
    if (!canUseStorage()) return
    localStorage.setItem(CONTROLLER_ID_KEY, controllerId)
}

export function clearRememberedControllerId(): void {
    if (!canUseStorage()) return
    localStorage.removeItem(CONTROLLER_ID_KEY)
}

/**
 * Deletes every bearer token an alpha build left in this browser. They no
 * longer work (the Controller answers `bearer_token_retired`), and nothing
 * reads them.
 */
export function forgetLegacyClientTokens(): void {
    if (!canUseStorage()) return
    localStorage.removeItem(LEGACY_TOKEN_KEY)
    const legacy: string[] = []
    for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i)
        if (key?.startsWith(LEGACY_CREDENTIAL_KEY_PREFIX)) legacy.push(key)
    }
    for (const key of legacy) localStorage.removeItem(key)
}
