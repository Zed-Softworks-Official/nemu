import type { AuthConfig } from 'convex/server'
import {
    CONTROLLER_JWT_AUDIENCE,
    CONTROLLER_JWT_ISSUER,
    controllerJwksDataUri,
} from '../lib/controllerAuth'
import { env } from '~/env'

export default {
    providers: [
        {
            // Configure CLERK_JWT_ISSUER_DOMAIN on the Convex Dashboard
            // See https://docs.convex.dev/auth/clerk#configuring-dev-and-prod-instances
            domain: env.CLERK_JWT_ISSUER_DOMAIN,
            applicationID: 'convex',
        },
        {
            type: 'customJwt',
            applicationID: CONTROLLER_JWT_AUDIENCE,
            issuer: CONTROLLER_JWT_ISSUER,
            jwks: controllerJwksDataUri(),
            algorithm: 'ES256',
        },
    ],
} satisfies AuthConfig
