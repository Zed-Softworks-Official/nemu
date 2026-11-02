import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import {
    clearClientToken,
    createLocalStorageCredentialStore,
    createMemoryCredentialStore,
    getClientToken,
    getRememberedControllerId,
} from './storage.ts'

class MemoryStorage {
    private readonly items = new Map<string, string>()
    getItem(key: string): string | null {
        return this.items.get(key) ?? null
    }
    setItem(key: string, value: string): void {
        this.items.set(key, value)
    }
    removeItem(key: string): void {
        this.items.delete(key)
    }
}

const globals = globalThis as { window?: unknown; localStorage?: unknown }

describe('memory credential store', () => {
    it('keeps one Access Client credential per Home', () => {
        const store = createMemoryCredentialStore()
        store.set('home-a', { clientToken: 'token-a' })
        store.set('home-b', {
            clientToken: 'token-b',
            baseUrl: 'https://b.lan.nemu.sh:6368',
        })

        assert.deepEqual(store.get('home-a'), { clientToken: 'token-a' })
        assert.equal(store.get('home-b')?.clientToken, 'token-b')

        store.clear('home-a')
        assert.equal(store.get('home-a'), null)
        assert.equal(store.get('home-b')?.clientToken, 'token-b')
    })
})

describe('localStorage credential store', () => {
    beforeEach(() => {
        globals.window = {}
        globals.localStorage = new MemoryStorage()
    })
    afterEach(() => {
        delete globals.window
        delete globals.localStorage
    })

    it('keys credentials by Home', () => {
        const store = createLocalStorageCredentialStore()
        store.set('home-a', { clientToken: 'token-a' })
        store.set('home-b', { clientToken: 'token-b' })

        assert.equal(store.get('home-a')?.clientToken, 'token-a')
        assert.equal(store.get('home-b')?.clientToken, 'token-b')
    })

    it('reads a credential saved before per-Home storage existed', () => {
        const storage = globals.localStorage as MemoryStorage
        storage.setItem('nemu.controller.clientToken', 'legacy-token')
        storage.setItem('nemu.controller.id', 'home-a')
        storage.setItem('nemu.controller.baseUrl', 'https://a.local:6368')

        const store = createLocalStorageCredentialStore()
        assert.deepEqual(store.get('home-a'), {
            clientToken: 'legacy-token',
            baseUrl: 'https://a.local:6368',
        })
        assert.equal(store.get('home-b'), null)
    })

    it('keeps the dashboard single-Home helpers in sync', () => {
        const store = createLocalStorageCredentialStore()
        store.set('home-a', { clientToken: 'token-a' })
        assert.equal(getClientToken(), 'token-a')
        assert.equal(getRememberedControllerId(), 'home-a')

        // Dashboard unpair clears the token first, then the remembered id.
        clearClientToken()
        assert.equal(store.get('home-a'), null)
    })
})

describe('without browser storage', () => {
    it('does not throw on React Native', () => {
        globals.window = {}
        try {
            const store = createLocalStorageCredentialStore()
            store.set('home-a', { clientToken: 'token-a' })
            assert.equal(store.get('home-a'), null)
        } finally {
            delete globals.window
        }
    })
})
