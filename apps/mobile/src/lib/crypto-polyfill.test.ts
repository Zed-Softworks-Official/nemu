// Hermes may have no `crypto` at all. The Access Client crypto (@noble, via
// @nemu/protocol/relay-crypto) and request ids read `globalThis.crypto` when
// they run, so the polyfill must provide both from expo-crypto.

describe('crypto polyfill', () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto')

    afterEach(() => {
        if (original) Object.defineProperty(globalThis, 'crypto', original)
        jest.resetModules()
    })

    it('backs getRandomValues and randomUUID with expo-crypto', () => {
        const getRandomValues = jest.fn((array: Uint8Array) => {
            array.fill(42)
            return array
        })
        const randomUUID = jest.fn(() => '00000000-0000-4000-8000-000000000000')
        jest.doMock('expo-crypto', () => ({ getRandomValues, randomUUID }))
        Object.defineProperty(globalThis, 'crypto', {
            value: undefined,
            configurable: true,
            writable: true,
        })

        jest.isolateModules(() => {
            require('~/lib/crypto-polyfill')
        })

        const bytes = globalThis.crypto.getRandomValues(new Uint8Array(4))
        expect(Array.from(bytes)).toEqual([42, 42, 42, 42])
        expect(globalThis.crypto.randomUUID()).toBe(
            '00000000-0000-4000-8000-000000000000'
        )
    })

    it('keeps a platform getRandomValues that already exists', () => {
        const platform = jest.fn((array: Uint8Array) => array)
        jest.doMock('expo-crypto', () => ({
            getRandomValues: jest.fn(),
            randomUUID: jest.fn(),
        }))
        Object.defineProperty(globalThis, 'crypto', {
            value: { getRandomValues: platform },
            configurable: true,
            writable: true,
        })

        jest.isolateModules(() => {
            require('~/lib/crypto-polyfill')
        })

        globalThis.crypto.getRandomValues(new Uint8Array(1))
        expect(platform).toHaveBeenCalled()
    })
})
