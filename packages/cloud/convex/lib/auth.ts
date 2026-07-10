import type { MutationCtx, QueryCtx } from '../_generated/server'

export type Identity = {
    subject: string
    tokenIdentifier: string
    issuer: string
    name?: string
    email?: string
}

export async function requireIdentity(
    ctx: QueryCtx | MutationCtx
): Promise<Identity> {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) {
        throw new Error('Not authenticated')
    }
    return {
        subject: identity.subject,
        tokenIdentifier: identity.tokenIdentifier,
        issuer: identity.issuer,
        name: identity.name,
        email: identity.email,
    }
}
