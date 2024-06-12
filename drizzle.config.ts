import { type Config } from 'drizzle-kit'

import { env } from '~/env'

export default {
    dialect: 'mysql',
    schema: './src/server/db/schema.ts',
    dbCredentials: {
        url: env.DATABASE_URL
    },
    tablesFilter: ['nemu_*']
} satisfies Config
