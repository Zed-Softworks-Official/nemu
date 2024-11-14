import { createEnv } from '@t3-oss/env-nextjs'
import { z } from 'zod'

export const env = createEnv({
    /**
     * Specify your server-side environment variables schema here. This way you can ensure the app
     * isn't built with invalid env vars.
     */
    server: {
        DATABASE_URL: z
            .string()
            .url()
            .refine(
                (str) => !str.includes('YOUR_MYSQL_URL_HERE'),
                'You forgot to change the default URL'
            ),
        BASE_URL: z.string().url(),
        NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
        DATABASE_HOST: z.string(),
        DATABASE_USERNAME: z.string(),
        DATABASE_PASSWORD: z.string(),

        CLERK_SECRET_KEY: z.string(),
        CLERK_WEBHOOK_SECRET: z.string(),

        KNOCK_API_KEY: z.string(),

        STRIPE_API_KEY: z.string(),
        STRIPE_WEBHOOK_SECRET: z.string(),

        ALGOLIA_APP_ID: z.string(),
        ALGOLIA_API_KEY: z.string(),

        SENDBIRD_APP_ID: z.string(),
        SENDBIRD_API_TOKEN: z.string(),

        UPLOADTHING_SECRET: z.string(),

        SENTRY_AUTH_TOKEN: z.string()
    },

    /**
     * Specify your client-side environment variables schema here. This way you can ensure the app
     * isn't built with invalid env vars. To expose them to the client, prefix them with
     * `NEXT_PUBLIC_`.
     */
    client: {
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string(),

        NEXT_PUBLIC_KNOCK_PUBLIC_API_KEY: z.string(),
        NEXT_PUBLIC_KNOCK_FEED_ID: z.string(),

        NEXT_PUBLIC_ALGOLIA_APP_ID: z.string(),
        NEXT_PUBLIC_ALGOLIA_SEARCH_API_KEY: z.string(),

        NEXT_PUBLIC_SENDBIRD_APP_ID: z.string(),

        NEXT_PUBLIC_UPLOADTHING_APP_ID: z.string(),

        NEXT_PUBLIC_POSTHOG_KEY: z.string(),
        NEXT_PUBLIC_POSTHOG_HOST: z.string()
        // NEXT_PUBLIC_CLIENTVAR: z.string(),
    },

    /**
     * You can't destruct `process.env` as a regular object in the Next.js edge runtimes (e.g.
     * middlewares) or client-side so we need to destruct manually.
     */
    runtimeEnv: {
        BASE_URL: process.env.BASE_URL,
        DATABASE_URL: process.env.DATABASE_URL,
        NODE_ENV: process.env.NODE_ENV,
        DATABASE_HOST: process.env.DATABASE_HOST,
        DATABASE_USERNAME: process.env.DATABASE_USERNAME,
        DATABASE_PASSWORD: process.env.DATABASE_PASSWORD,

        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
        CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
        CLERK_WEBHOOK_SECRET: process.env.CLERK_WEBHOOK_SECRET,

        KNOCK_API_KEY: process.env.KNOCK_API_KEY,
        NEXT_PUBLIC_KNOCK_PUBLIC_API_KEY: process.env.NEXT_PUBLIC_KNOCK_PUBLIC_API_KEY,
        NEXT_PUBLIC_KNOCK_FEED_ID: process.env.NEXT_PUBLIC_KNOCK_FEED_ID,

        STRIPE_API_KEY: process.env.STRIPE_API_KEY,
        STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,

        ALGOLIA_APP_ID: process.env.ALGOLIA_APP_ID,
        ALGOLIA_API_KEY: process.env.ALGOLIA_API_KEY,
        NEXT_PUBLIC_ALGOLIA_APP_ID: process.env.NEXT_PUBLIC_ALGOLIA_APP_ID,
        NEXT_PUBLIC_ALGOLIA_SEARCH_API_KEY:
            process.env.NEXT_PUBLIC_ALGOLIA_SEARCH_API_KEY,

        NEXT_PUBLIC_SENDBIRD_APP_ID: process.env.NEXT_PUBLIC_SENDBIRD_APP_ID,
        SENDBIRD_API_TOKEN: process.env.SENDBIRD_API_TOKEN,
        SENDBIRD_APP_ID: process.env.SENDBIRD_APP_ID,

        NEXT_PUBLIC_UPLOADTHING_APP_ID: process.env.NEXT_PUBLIC_UPLOADTHING_APP_ID,
        UPLOADTHING_SECRET: process.env.UPLOADTHING_SECRET,

        NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
        NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,

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
