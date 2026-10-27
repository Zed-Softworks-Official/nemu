import { createEnv } from '@t3-oss/env-core'
import { z } from 'zod'

export const env = createEnv({
    /**
     * Client variables must use the EXPO_PUBLIC_ prefix. Expo inlines only
     * direct `process.env.EXPO_PUBLIC_*` references in this package, so each
     * variable is listed again in runtimeEnvStrict.
     */
    clientPrefix: 'EXPO_PUBLIC_',
    client: {
        EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string(),
        EXPO_PUBLIC_CONVEX_URL: z
            .string()
            .url()
            .transform((url) => url.replace(/\/$/, '')),
    },
    runtimeEnvStrict: {
        EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY:
            process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY,
        EXPO_PUBLIC_CONVEX_URL: process.env.EXPO_PUBLIC_CONVEX_URL,
    },
    /**
     * Run with SKIP_ENV_VALIDATION=1 to skip env validation.
     */
    skipValidation: !!process.env.SKIP_ENV_VALIDATION,
    /**
     * Empty strings are treated as unset, so `SOME_VAR=` fails a required string.
     */
    emptyStringAsUndefined: true,
})
