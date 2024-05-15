import { defineConfig } from 'drizzle-kit'

import { env } from '~/env'

export default defineConfig({
    dialect: 'postgresql',
    driver: 'pg',
    schema: './src/server/db/schema.ts',
    dbCredentials: {
        url: env.POSTGRES_URL
    },
    tablesFilter: ['nemu_*']
})
