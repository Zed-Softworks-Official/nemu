import {
    customMutation,
    customQuery,
} from 'convex-helpers/server/customFunctions'
import { mutation, query } from '../_generated/server'
import { requireIdentity } from './auth'

export const authedQuery = customQuery(query, {
    args: {},
    input: async (ctx, args) => {
        const identity = await requireIdentity(ctx)
        return { ctx: { ...ctx, identity }, args }
    },
})

export const authedMutation = customMutation(mutation, {
    args: {},
    input: async (ctx, args) => {
        const identity = await requireIdentity(ctx)
        return { ctx: { ...ctx, identity }, args }
    },
})
