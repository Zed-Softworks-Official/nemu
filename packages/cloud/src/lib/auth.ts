import type { MutationCtx, QueryCtx } from '@nemu/cloud/server'
import { isControllerIssuer } from './controllerAuth'

export type Identity = {
    subject: string
    tokenIdentifier: string
    issuer: string
    name?: string
    email?: string
}

export type ControllerIdentity = {
    controllerId: string
    tokenIdentifier: string
    issuer: string
}

export async function requireIdentity(
    ctx: QueryCtx | MutationCtx
): Promise<Identity> {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) {
        throw new Error('Not authenticated')
    }
    if (isControllerIssuer(identity.issuer)) {
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

export async function requireControllerIdentity(
    ctx: QueryCtx | MutationCtx
): Promise<ControllerIdentity> {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) {
        throw new Error('Not authenticated')
    }
    if (!isControllerIssuer(identity.issuer)) {
        throw new Error('Controller authentication required')
    }
    return {
        controllerId: identity.subject,
        tokenIdentifier: identity.tokenIdentifier,
        issuer: identity.issuer,
    }
}
