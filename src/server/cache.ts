import { kv } from '@vercel/kv'

export const cache = kv

/**
 * Creates a redis key from a
 *
 * @param object - The object that's being cached
 * @param unique_identifiers - The unique identifiers for the object
 */
export function AsRedisKey(
    object:
        | 'users'
        | 'portfolio_items'
        | 'stripe_accounts'
        | 'stripe'
        | 'products'
        | 'products_metadata'
        | 'forms'
        | 'requests'
        | 'artists'
        | 'commissions'
        | 'kanbans'
        | 'invoices'
        | 'downloads'
        | 'reviews',
    ...unique_identifiers: string[]
) {
    return `${object}:${unique_identifiers.join(':')}`
}

export namespace nemu_cache {
    export async function invalidate() {}

    export async function set_hash(key: string, data: { [field: string]: unknown }) {
        return await kv.hset(key, data)
    }

    export async function set(
        key: string,
        data: { [field: string]: unknown },
        ttl?: number
    ) {
        return await kv.set(key, data, ttl ? { ex: ttl } : undefined)
    }
}
