// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from '@sentry/nextjs'
import { env } from '~/env'

Sentry.init({
    dsn: 'https://af7e5dfe1f2404ee5923cb20e1860452@o4507107982966784.ingest.us.sentry.io/4507107984211968',

    // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
    tracesSampleRate: 1,

    // Setting this option to true will print useful information to the console while you're setting up Sentry.
    debug: false,
    enabled: env.NODE_ENV === 'production'
})
