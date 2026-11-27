import {
    type AccessClientKeyStore,
    createSecretAccessClientKeyStore,
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
 * Keys never leave this phone: not into iCloud or Google backups, and not
 * onto a new phone restored from one (ADR-0001). A restored phone pairs again.
 */
const KEY_OPTIONS: SecureStore.SecureStoreOptions = {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
}

/**
 * This phone's Access Client keys and Access grant, one record per Account
 * and Home, in the Keychain or Keystore. The crypto runs in JS on Hermes;
 * the operating system wraps the stored key bytes.
 *
 * A bearer token an alpha build kept for the Home is deleted when the Home
 * has no keys, so the phone asks to pair again and holds no token.
 */
export function createSecureAccessClientKeyStore(
    accountId: string
): AccessClientKeyStore {
    const keysKey = (controllerId: string) =>
        accountKey(
            accountId,
            `access-client-keys.${secureSegment(controllerId)}`
        )
    const legacyKey = (controllerId: string) =>
        accountKey(accountId, `access-client.${secureSegment(controllerId)}`)
    const store = createSecretAccessClientKeyStore({
        get: (controllerId) =>
            SecureStore.getItem(keysKey(controllerId), KEY_OPTIONS),
        set: (controllerId, value) =>
            SecureStore.setItem(keysKey(controllerId), value, KEY_OPTIONS),
        delete: (controllerId) =>
            SecureStore.deleteItemAsync(keysKey(controllerId), KEY_OPTIONS),
    })
    return {
        ...store,
        async load(controllerId) {
            const record = await store.load(controllerId)
            if (!record) {
                void SecureStore.deleteItemAsync(legacyKey(controllerId)).catch(
                    () => {}
                )
            }
            return record
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
