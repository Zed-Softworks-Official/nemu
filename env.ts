import { z } from 'zod'
import { createEnv } from '@t3-oss/env-nextjs'

export const env = createEnv({
    server: {
        NEXTAUTH_URL: z.string(),
        NEXTAUTH_SECRET: z.string(),

        TWITTER_CLIENT_ID: z.string(),
        TWITTER_CLIENT_SECRET: z.string(),

        GOOGLE_CLIENT_ID: z.string(),
        GOOGLE_CLIENT_SECRET: z.string(),

        DISCORD_CLIENT_ID: z.string(),
        DISCORD_CLIENT_SECRET: z.string(),

        EMAIL_SERVER_USER: z.string(),
        EMAIL_SERVER_PASSWORD: z.string(),
        EMAIL_SERVER_HOST: z.string(),
        EMAIL_SERVER_PORT: z.string(),
        EMAIL_FROM: z.string(),

        DATABSE_URL: z.string(),
        REDIS_URL: z.string(),

        AWS_ACCESS_KEY_ID: z.string(),
        AWS_SECRET_ACCESS_KEY: z.string(),

        ALGOLIA_APP_ID: z.string(),
        ALGOLIA_API_KEY: z.string(),

        UPLOADTHING_SECRET: z.string(),
        UPLOADTHING_APP_ID: z.string(),

        NOVU_API_KEY: z.string(),

        SENDBIRD_APP_ID: z.string(),
        SENDBIRD_API_TOKEN: z.string(),

        STRIPE_API_KEY: z.string(),
        STRIPE_WEBHOOK_SECRET: z.string(),

        BASE_URL: z.string(),

        NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
        VERCEL_URL: z.string().optional(),
        PORT: z.string().optional()
    },
    client: {},
    runtimeEnv: {
        NEXTAUTH_URL: process.env.NEXTAUTH_URL,
        NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,

        TWITTER_CLIENT_ID: process.env.TWITTER_CLIENT_ID,
        TWITTER_CLIENT_SECRET: process.env.TWITTER_CLIENT_SECRET,

        GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
        GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,

        DISCORD_CLIENT_ID: process.env.DISCORD_CLIENT_ID,
        DISCORD_CLIENT_SECRET: process.env.DISCORD_CLIENT_SECRET,

        EMAIL_SERVER_USER: process.env.EMAIL_SERVER_USER,
        EMAIL_SERVER_PASSWORD: process.env.EMAIL_SERVER_PASSWORD,
        EMAIL_SERVER_HOST: process.env.EMAIL_SERVER_HOST,
        EMAIL_SERVER_PORT: process.env.EMAIL_SERVER_PORT,
        EMAIL_FROM: process.env.EMAIL_FROM,

        DATABSE_URL: process.env.DATABASE_URL,
        REDIS_URL: process.env.REDIS_URL,

        AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
        AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,

        ALGOLIA_APP_ID: process.env.ALGOLIA_APP_ID,
        ALGOLIA_API_KEY: process.env.ALGOLIA_API_KEY,

        NOVU_API_KEY: process.env.NOVU_API_KEY,

        UPLOADTHING_SECRET: process.env.UPLOADTHING_SECRET,
        UPLOADTHING_APP_ID: process.env.UPLOADTHING_APP_ID,

        SENDBIRD_APP_ID: process.env.SENDBIRD_APP_ID,
        SENDBIRD_API_TOKEN: process.env.SENDBIRD_API_TOKEN,

        STRIPE_API_KEY: process.env.STRIPE_API_KEY,
        STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,

        BASE_URL: process.env.NEXTAUTH_URL,
        NODE_ENV: process.env.NODE_ENV,
        VERCEL_URL: process.env.VERCEL_URL,
        PORT: process.env.PORT
    },
    emptyStringAsUndefined: true
})
