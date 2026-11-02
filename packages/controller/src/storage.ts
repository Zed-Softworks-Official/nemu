/**
 * The Access Client credential for one Home. Apps keep a separate
 * credential per Home (ADR-0008) and never upload it.
 */
export type AccessClientCredential = {
    clientToken: string
    /** Last LAN address that answered for this Home. */
    baseUrl?: string
}

/**
 * Per-Home credential storage. Reads are synchronous because transports
 * read the token on every request. Platforms supply their own store:
 * the dashboard uses localStorage, mobile uses secure storage.
 */
export interface ControllerCredentialStore {
    get(controllerId: string): AccessClientCredential | null
    set(controllerId: string, credential: AccessClientCredential): void
    clear(controllerId: string): void
}

const BASE_URL_KEY = 'nemu.controller.baseUrl'
const CONTROLLER_ID_KEY = 'nemu.controller.id'
const TOKEN_KEY = 'nemu.controller.clientToken'
const CREDENTIAL_KEY_PREFIX = 'nemu.controller.credential.'

function canUseStorage(): boolean {
    return typeof window !== 'undefined' && typeof localStorage !== 'undefined'
}

function normalizeBaseUrl(baseUrl: string): string {
    return baseUrl.replace(/\/$/, '')
}

export function parseCredential(
    raw: string | null
): AccessClientCredential | null {
    if (!raw) return null
    try {
        const value: unknown = JSON.parse(raw)
        if (
            typeof value !== 'object' ||
            value === null ||
            !('clientToken' in value) ||
            typeof value.clientToken !== 'string' ||
            !value.clientToken
        ) {
            return null
        }
        const credential: AccessClientCredential = {
            clientToken: value.clientToken,
        }
        if ('baseUrl' in value && typeof value.baseUrl === 'string') {
            credential.baseUrl = value.baseUrl
        }
        return credential
    } catch {
        return null
    }
}

export function serializeCredential(
    credential: AccessClientCredential
): string {
    return JSON.stringify(
        credential.baseUrl
            ? {
                  clientToken: credential.clientToken,
                  baseUrl: normalizeBaseUrl(credential.baseUrl),
              }
            : { clientToken: credential.clientToken }
    )
}

export function createMemoryCredentialStore(
    initial: Record<string, AccessClientCredential> = {}
): ControllerCredentialStore {
    const credentials = new Map(Object.entries(initial))
    return {
        get: (controllerId) => credentials.get(controllerId) ?? null,
        set: (controllerId, credential) => {
            credentials.set(controllerId, { ...credential })
        },
        clear: (controllerId) => {
            credentials.delete(controllerId)
        },
    }
}

/**
 * Browser store. Credentials are keyed by Home. The legacy single-Home
 * keys still mirror the most recently paired Home so existing dashboard
 * pages that read `getClientToken()` keep working.
 */
export function createLocalStorageCredentialStore(): ControllerCredentialStore {
    return {
        get(controllerId) {
            if (!canUseStorage()) return null
            const stored = parseCredential(
                localStorage.getItem(CREDENTIAL_KEY_PREFIX + controllerId)
            )
            if (stored) return stored
            if (localStorage.getItem(CONTROLLER_ID_KEY) !== controllerId) {
                return null
            }
            const clientToken = localStorage.getItem(TOKEN_KEY)
            if (!clientToken) return null
            const baseUrl = localStorage.getItem(BASE_URL_KEY)
            return baseUrl ? { clientToken, baseUrl } : { clientToken }
        },
        set(controllerId, credential) {
            if (!canUseStorage()) return
            localStorage.setItem(
                CREDENTIAL_KEY_PREFIX + controllerId,
                serializeCredential(credential)
            )
            localStorage.setItem(TOKEN_KEY, credential.clientToken)
            localStorage.setItem(CONTROLLER_ID_KEY, controllerId)
            if (credential.baseUrl) {
                localStorage.setItem(
                    BASE_URL_KEY,
                    normalizeBaseUrl(credential.baseUrl)
                )
            }
        },
        clear(controllerId) {
            if (!canUseStorage()) return
            localStorage.removeItem(CREDENTIAL_KEY_PREFIX + controllerId)
            if (localStorage.getItem(CONTROLLER_ID_KEY) === controllerId) {
                localStorage.removeItem(TOKEN_KEY)
            }
        },
    }
}

export const defaultCredentialStore = createLocalStorageCredentialStore()

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

/** Dashboard single-Home view: the token of the remembered Home. */
export function getClientToken(): string | null {
    if (!canUseStorage()) return null
    return localStorage.getItem(TOKEN_KEY)
}

export function setClientToken(token: string): void {
    if (!canUseStorage()) return
    localStorage.setItem(TOKEN_KEY, token)
}

/** Clears the remembered Home's token, including its per-Home entry. */
export function clearClientToken(): void {
    if (!canUseStorage()) return
    const controllerId = localStorage.getItem(CONTROLLER_ID_KEY)
    if (controllerId) {
        localStorage.removeItem(CREDENTIAL_KEY_PREFIX + controllerId)
    }
    localStorage.removeItem(TOKEN_KEY)
}
