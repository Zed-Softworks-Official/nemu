import { Redis } from '@upstash/redis'

import { env } from '~/env'

type RedisKey =
    | 'chats'
    | 'commissions'
    | 'artists'
    | 'home'
    | 'dashboard_links'
    | 'dashboard_data'
    | 'request_queue'
    | 'invoices'
    | 'stripe:user'
    | 'stripe:customer'

export const redis = new Redis({
    url: env.UPSTASH_REDIS_REST_URL,
    token: env.UPSTASH_REDIS_REST_TOKEN
})

export function get_redis_key(key: RedisKey, ...args: string[]) {
    return `${key}:${args.join(':')}`
}

export async function cache<T>(key: string, fn: () => Promise<T>, ttl?: number) {
    const cached_data = await redis.get<T>(key)

    if (cached_data) {
        return cached_data
    }

    const data = await fn()
    await redis.set(key, JSON.stringify(data), ttl ? { ex: ttl } : undefined)

    return data
}

export async function invalidate(key: string) {
    await redis.del(key)
}
