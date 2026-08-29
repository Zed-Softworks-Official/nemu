'use node'

import { importPKCS8, SignJWT } from 'jose'
import { v } from 'convex/values'
import {
    CONTROLLER_JWT_AUDIENCE,
    CONTROLLER_JWT_ISSUER,
    CONTROLLER_JWT_TTL_SECONDS,
    controllerJwtKid,
} from '../lib/controllerAuth'
import { internalAction } from './_generated/server'

async function signingKey() {
    const pem = process.env.CONTROLLER_JWT_PRIVATE_KEY
    if (!pem) {
        throw new Error('CONTROLLER_JWT_PRIVATE_KEY is not configured')
    }
    return await importPKCS8(pem, 'ES256')
}

export const mintControllerSession = internalAction({
    args: {
        controllerId: v.string(),
    },
    returns: v.object({
        token: v.string(),
        expiresAt: v.number(),
    }),
    handler: async (_ctx, args) => {
        const key = await signingKey()
        const kid = controllerJwtKid()
        const expiresAt =
            Math.floor(Date.now() / 1000) + CONTROLLER_JWT_TTL_SECONDS

        const header: { alg: 'ES256'; kid?: string } = { alg: 'ES256' }
        if (kid) header.kid = kid

        const token = await new SignJWT({})
            .setProtectedHeader(header)
            .setSubject(args.controllerId)
            .setIssuer(CONTROLLER_JWT_ISSUER)
            .setAudience(CONTROLLER_JWT_AUDIENCE)
            .setIssuedAt()
            .setExpirationTime(expiresAt)
            .sign(key)

        return {
            token,
            expiresAt: expiresAt * 1000,
        }
    },
})
