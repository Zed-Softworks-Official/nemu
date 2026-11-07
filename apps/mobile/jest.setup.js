// expo-secure-store is native-only; tests use an in-memory keychain.
jest.mock('expo-secure-store', () => {
    const items = new Map()
    return {
        getItem: (key) => items.get(key) ?? null,
        setItem: (key, value) => {
            items.set(key, value)
        },
        deleteItemAsync: async (key) => {
            items.delete(key)
        },
        __reset: () => items.clear(),
    }
})

// lucide ships untranspiled ESM; icons carry no behavior under test.
jest.mock(
    'lucide-react-native',
    () =>
        new Proxy(
            {},
            { get: (_, name) => (name === '__esModule' ? true : () => null) }
        )
)
