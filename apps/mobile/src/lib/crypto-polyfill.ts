import * as Crypto from 'expo-crypto'

/**
 * Hermes may not provide Web Crypto. The shared Controller client needs two
 * pieces of it: `crypto.randomUUID()` for request ids, and
 * `crypto.getRandomValues()` for Access Client keys, CPace and HPKE
 * (@noble, through `@nemu/protocol/relay-crypto`, reads it when it runs).
 * Back both with expo-crypto's secure generator, and never fall back to
 * Math.random. Import this first, before anything that uses them.
 */
type CryptoLike = {
    randomUUID?: () => string
    getRandomValues?: <T extends ArrayBufferView | null>(array: T) => T
}
const target = globalThis as { crypto?: CryptoLike }

const crypto: CryptoLike = target.crypto ?? {}
if (typeof crypto.randomUUID !== 'function') {
    crypto.randomUUID = Crypto.randomUUID
}
if (typeof crypto.getRandomValues !== 'function') {
    crypto.getRandomValues = ((
        array: Parameters<typeof Crypto.getRandomValues>[0]
    ) => Crypto.getRandomValues(array)) as CryptoLike['getRandomValues']
}
if (!target.crypto) target.crypto = crypto
