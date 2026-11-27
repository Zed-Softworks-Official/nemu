import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import {
    forgetLegacyClientTokens,
    getRememberedBaseUrl,
    getRememberedControllerId,
    setRememberedBaseUrl,
    setRememberedControllerId,
} from './storage.ts'

class MemoryStorage {
    private readonly items = new Map<string, string>()
    get length(): number {
        return this.items.size
    }
    key(index: number): string | null {
        return [...this.items.keys()][index] ?? null
    }
    getItem(key: string): string | null {
        return this.items.get(key) ?? null
    }
    setItem(key: string, value: string): void {
        this.items.set(key, value)
    }
    removeItem(key: string): void {
        this.items.delete(key)
    }
    keys(): string[] {
        return [...this.items.keys()]
    }
}

const globals = globalThis as { window?: unknown; localStorage?: unknown }

describe('the remembered Home', () => {
    let storage: MemoryStorage
    beforeEach(() => {
        storage = new MemoryStorage()
        globals.window = {}
        globals.localStorage = storage
    })
    afterEach(() => {
        delete globals.window
        delete globals.localStorage
    })

    it('remembers the Home and its LAN address, which are not credentials', () => {
        setRememberedControllerId('home-a')
        setRememberedBaseUrl('https://a.lan.nemu.sh:6368/')
        assert.equal(getRememberedControllerId(), 'home-a')
        assert.equal(getRememberedBaseUrl(), 'https://a.lan.nemu.sh:6368')
        assert.deepEqual(storage.keys().sort(), [
            'nemu.controller.baseUrl',
            'nemu.controller.id',
        ])
    })

    it('forgets every bearer token an alpha build left, and keeps the Home', () => {
        setRememberedControllerId('home-a')
        storage.setItem('nemu.controller.clientToken', 'token-a')
        storage.setItem(
            'nemu.controller.credential.home-a',
            JSON.stringify({ clientToken: 'token-a' })
        )
        storage.setItem(
            'nemu.controller.credential.home-b',
            JSON.stringify({ clientToken: 'token-b' })
        )

        forgetLegacyClientTokens()

        assert.deepEqual(storage.keys(), ['nemu.controller.id'])
        assert.equal(getRememberedControllerId(), 'home-a')
    })

    it('does nothing without browser storage', () => {
        delete globals.window
        delete globals.localStorage
        forgetLegacyClientTokens()
        assert.equal(getRememberedControllerId(), null)
    })
})
