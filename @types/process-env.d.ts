declare namespace NodeJS {
    export interface ProcessEnv {
        NEXTAUTH_URL: string
        NEXTAUTH_SECRET: string

        TWITTER_CLIENT_ID: string
        TWITTER_CLIENT_SECRET: string

        EMAIL_SERVER_USER: string
        EMAIL_SERVER_PASSWORD: string
        EMAIL_SERVER_HOST: string
        EMAIL_SERVER_PORT: nunber
        EMAIL_FROM: string

        MAILGUN_API_KEY: string
        MAILGUN_DOMAIN_NAME: string

        DATABASE_URL: string

        AWS_ACCESS_KEY_ID: string
        AWS_SECRET_ACCESS_KEY: string

        STRIPE_API_KEY: string
        STRIPE_WEBHOOK_SECRET: string

        SENDBIRD_APP_ID: string
        SENDBIRD_API_TOKEN: string

        NOVU_API_KEY: string

        ALGOLIA_APP_ID: string
        ALGOLIA_API_KEY: string

        BASE_URL: string
    }
}
