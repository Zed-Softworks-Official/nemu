import { env } from '~/env'
import { createClient } from 'redis'

const createRedisClient = () =>
    createClient({
        password: env.REDIS_PASSWORD,
        socket: {
            host: env.REDIS_HOST,
            port: env.REDIS_PORT
        }
    })

const globalForRedis = globalThis as unknown as {
    redis: ReturnType<typeof createRedisClient> | undefined
}

export const cache = globalForRedis.redis ?? createRedisClient()

if (env.NODE_ENV !== 'production') globalForRedis.redis = cache

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
