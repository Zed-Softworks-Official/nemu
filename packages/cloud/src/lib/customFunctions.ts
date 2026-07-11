import { mutation, query } from '@nemu/cloud/server'
import {
    customMutation,
    customQuery,
} from 'convex-helpers/server/customFunctions'
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
