import { Redis } from '@upstash/redis'
import { env } from '~/env'

type RedisKey = 'chats' | 'commissions' | 'artists' | 'home'

export const redis = new Redis({
    url: env.UPSTASH_REDIS_REST_URL,
    token: env.UPSTASH_REDIS_REST_TOKEN
})

export function get_redis_key(key: RedisKey, ...args: string[]) {
    return `${key}:${args.join(':')}`
}
