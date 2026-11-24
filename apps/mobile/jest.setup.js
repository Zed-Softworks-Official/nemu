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

// Native SwiftUI and Compose toggles can't render under Jest; use the
// React Native Switch fallback the web build uses.
jest.mock('~/components/native-toggle', () =>
    jest.requireActual('~/components/native-toggle.tsx')
)

// Likewise native sliders: use the range input the web build uses.
jest.mock('~/components/native-slider', () =>
    jest.requireActual('~/components/native-slider.tsx')
)

// Likewise the SwiftUI and Compose pickers: use the web fallback's buttons.
jest.mock('~/components/native-picker', () =>
    jest.requireActual('~/components/native-picker.tsx')
)
