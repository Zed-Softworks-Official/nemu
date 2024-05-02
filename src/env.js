import { createEnv } from '@t3-oss/env-nextjs'
import { z } from 'zod'

export const env = createEnv({
    /**
     * Specify your server-side environment variables schema here. This way you can ensure the app
     * isn't built with invalid env vars.
     */
    server: {
        BASE_URL: z.string().url(),
        DATABASE_URL: z.string().url(),
        REDIS_HOST: z.string(),
        REDIS_PORT: z.number(),
        REDIS_PASSWORD: z.string(),
        NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
        WEBHOOK_SECRET: z.string(),
        NOVU_API_KEY: z.string(),
        STRIPE_API_KEY: z.string(),
        STRIPE_WEHBOOK_SECRET: z.string(),
        ALGOLIA_APP_ID: z.string(),
        ALGOLIA_API_KEY: z.string(),
        SENDBIRD_APP_ID: z.string(),
        SENDBIRD_API_TOKEN: z.string(),
        UPLOADTHING_SECRET: z.string(),
        UPLOADTHING_APP_ID: z.string(),
        SENTRY_AUTH_TOKEN: z.string()
    },

    /**
     * Specify your client-side environment variables schema here. This way you can ensure the app
     * isn't built with invalid env vars. To expose them to the client, prefix them with
     * `NEXT_PUBLIC_`.
     */
    client: {
        // NEXT_PUBLIC_CLIENTVAR: z.string(),
    },

    /**
     * You can't destruct `process.env` as a regular object in the Next.js edge runtimes (e.g.
     * middlewares) or client-side so we need to destruct manually.
     */
    runtimeEnv: {
        BASE_URL: process.env.BASE_URL,
        DATABASE_URL: process.env.DATABASE_URL,
        REDIS_HOST: process.env.REDIS_HOST,
        REDIS_PORT: Number(process.env.REDIS_PORT),
        REDIS_PASSWORD: process.env.REDIS_PASSWORD,
        NODE_ENV: process.env.NODE_ENV,
        WEBHOOK_SECRET: process.env.WEBHOOK_SECRET,
        NOVU_API_KEY: process.env.NOVU_API_KEY,
        STRIPE_API_KEY: process.env.STRIPE_API_KEY,
        STRIPE_WEHBOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
        ALGOLIA_APP_ID: process.env.ALGOLIA_APP_ID,
        ALGOLIA_API_KEY: process.env.ALGOLIA_API_KEY,
        SENDBIRD_APP_ID: process.env.SENDBIRD_APP_ID,
        SENDBIRD_API_TOKEN: process.env.SENDBIRD_API_TOKEN,
        UPLOADTHING_APP_ID: process.env.UPLOADTHING_APP_ID,
        UPLOADTHING_SECRET: process.env.UPLOADTHING_SECRET,
        SENTRY_AUTH_TOKEN: process.env.SENTRY_AUTH_TOKEN
    },
    /**
     * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially
     * useful for Docker builds.
     */
    skipValidation: !!process.env.SKIP_ENV_VALIDATION,
    /**
     * Makes it so that empty strings are treated as undefined. `SOME_VAR: z.string()` and
     * `SOME_VAR=''` will throw an error.
     */
    emptyStringAsUndefined: true
})
