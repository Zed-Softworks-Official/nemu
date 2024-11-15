import { get_request_list_cache } from '~/server/db/query'
import { createTRPCRouter, protectedProcedure } from '../trpc'

export const request_router = createTRPCRouter({
    get_request_list: protectedProcedure.query(async ({ ctx }) => {
        return await get_request_list_cache(ctx.auth.userId)
    })
})
