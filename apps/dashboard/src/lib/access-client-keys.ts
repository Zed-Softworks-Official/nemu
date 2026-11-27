import { createWebAccessClientKeyStore } from '@nemu/controller'

/**
 * This browser's Access Client keys: non-extractable Web Crypto keys in
 * IndexedDB, one record per Home (ADR-0001). IndexedDB opens on first use,
 * so server rendering never touches it. Browsers without Web Crypto Ed25519
 * or X25519 cannot pair (`supported()` is false; `generate` throws
 * `unsupported_browser`).
 */
export const dashboardKeyStore = createWebAccessClientKeyStore()
