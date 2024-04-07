import { env } from '@/env'
import { Redis } from 'ioredis'

const globalForRedis = global as unknown as { redis: Redis }

export const redis = globalForRedis.redis || new Redis(env.REDIS_URL)

if (env.NODE_ENV !== 'production') globalForRedis.redis = redis
