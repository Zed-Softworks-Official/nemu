import { createWebAccessClientKeyStore } from '@nemu/controller'

/**
 * This browser's Access Client keys: non-extractable Web Crypto keys in
 * IndexedDB, one record per Home (ADR-0001). IndexedDB opens on first use,
 * so server rendering never touches it. Browsers without Web Crypto Ed25519
 * or X25519 fall back to keys kept as bytes (see `WebKeyProtection`).
 */
export const dashboardKeyStore = createWebAccessClientKeyStore()
