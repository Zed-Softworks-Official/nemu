import { createClient } from '@vercel/kv'
import { env } from '~/env'

const globalForRedis = global as unknown as { cache: ReturnType<typeof createClient> }

export const cache =
    globalForRedis.cache ||
    createClient({
        url: env.KV_REST_API_URL,
        token: env.KV_REST_API_TOKEN
    })

if (env.NODE_ENV !== 'production') globalForRedis.cache = cache

/**
 * Creates a redis key from a
 *
 * @param object - The object that's being cached
 * @param unique_identifiers - The unique identifiers for the object
 */
export function AsRedisKey(
    object: 'artists' | 'commissions' | 'portfolios',
    ...unique_identifiers: string[]
) {
    return `${object}:${unique_identifiers.join(':')}`
}
