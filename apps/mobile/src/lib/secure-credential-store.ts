import {
    type AccessClientCredential,
    type ControllerCredentialStore,
    parseCredential,
    serializeCredential,
} from '@nemu/controller'
import * as SecureStore from 'expo-secure-store'

import type { MobileHome } from '~/components/home-session'

/** SecureStore keys allow only alphanumerics, `.`, `-`, and `_`. */
function secureSegment(value: string): string {
    return value.replace(/[^A-Za-z0-9._-]/g, '_')
}

/**
 * Everything here is scoped to the signed-in Account: a second Account on the
 * same phone must not inherit the first one's Access Client or Homes.
 */
function accountKey(accountId: string, name: string): string {
    return `nemu.${secureSegment(accountId)}.${name}`
}

/**
 * Access Client credentials in the device keychain, one per Home.
 * Reads go through a memory cache because transports read the token on
 * every request and SecureStore only deletes asynchronously.
 */
export function createSecureCredentialStore(
    accountId: string
): ControllerCredentialStore {
    const secureKey = (controllerId: string) =>
        accountKey(accountId, `access-client.${secureSegment(controllerId)}`)
    const cache = new Map<string, AccessClientCredential | null>()
    return {
        get(controllerId) {
            if (!cache.has(controllerId)) {
                cache.set(
                    controllerId,
                    parseCredential(
                        SecureStore.getItem(secureKey(controllerId))
                    )
                )
            }
            return cache.get(controllerId) ?? null
        },
        set(controllerId, credential) {
            SecureStore.setItem(
                secureKey(controllerId),
                serializeCredential(credential)
            )
            cache.set(controllerId, { ...credential })
        },
        clear(controllerId) {
            cache.set(controllerId, null)
            void SecureStore.deleteItemAsync(secureKey(controllerId))
        },
    }
}

/** The selected Home is an identity reference, kept beside credentials. */
export type ActiveHomeStore = {
    get(): string | null
    set(controllerId: string): void
    clear(): void
}

export function createSecureActiveHomeStore(
    accountId: string
): ActiveHomeStore {
    const key = accountKey(accountId, 'active-home')
    let cached: string | null | undefined
    return {
        get() {
            if (cached === undefined) {
                cached = SecureStore.getItem(key)
            }
            return cached
        },
        set(controllerId) {
            SecureStore.setItem(key, controllerId)
            cached = controllerId
        },
        clear() {
            cached = null
            void SecureStore.deleteItemAsync(key)
        },
    }
}

/**
 * The last Home list from the cloud: identity references only, so a paired
 * phone can still open its Home and use LAN while the internet is down.
 */
export type HomeListStore = {
    get(): MobileHome[] | null
    set(homes: MobileHome[]): void
}

export function createSecureHomeListStore(accountId: string): HomeListStore {
    const key = accountKey(accountId, 'homes')
    return {
        get() {
            const raw = SecureStore.getItem(key)
            if (!raw) return null
            try {
                const parsed: unknown = JSON.parse(raw)
                return Array.isArray(parsed) ? (parsed as MobileHome[]) : null
            } catch {
                return null
            }
        },
        set(homes) {
            SecureStore.setItem(key, JSON.stringify(homes))
        },
    }
}
