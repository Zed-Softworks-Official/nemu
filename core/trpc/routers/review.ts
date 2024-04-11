import { z } from 'zod'
import { createTRPCRouter, protectedProcedure } from '../trpc'
import { TRPCError } from '@trpc/server'

export const reviewRouter = createTRPCRouter({
    /**
     * Creates a review for an item
     */
    set_review: protectedProcedure
        .input(
            z.object({
                id: z.string(),
                type: z.literal('product').or(z.literal('commission')),

                rating: z.number(),
                description: z.string()
            })
        )
        .mutation(async (opts) => {
            const { input, ctx } = opts

            throw new TRPCError({ code: 'NOT_IMPLEMENTED' })
        })
})
