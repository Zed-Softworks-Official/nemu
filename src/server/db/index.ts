import { env } from '~/env'

import { Client } from '@planetscale/database'
import { drizzle } from 'drizzle-orm/planetscale-serverless'

import * as schema from '~/server/db/schema'

export const db = drizzle(
    new Client({
        host: env.DATABASE_HOST,
        username: env.DATABASE_USERNAME,
        password: env.DATABASE_PASSWORD
    }),
    { schema }
)
