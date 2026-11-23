import * as Crypto from 'expo-crypto'

/**
 * The shared Controller client mints request ids with
 * `crypto.randomUUID()`, which Hermes may not provide. Back it with
 * expo-crypto's secure generator. Never fall back to Math.random: Relay
 * request ids gate access to session-mint responses.
 */
type CryptoLike = { randomUUID?: () => string }
const target = globalThis as { crypto?: CryptoLike }

if (typeof target.crypto?.randomUUID !== 'function') {
    if (target.crypto) {
        target.crypto.randomUUID = Crypto.randomUUID
    } else {
        target.crypto = { randomUUID: Crypto.randomUUID }
    }
}
