export const RELAY_TTL_MS = 5 * 60 * 1000

/** Kept small so one cleanup run stays under per-mutation write limits. */
export const CLEANUP_BATCH_SIZE = 100
