import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { artistProcedure, createTRPCRouter } from '~/server/api/trpc'
import { AsRedisKey } from '~/server/cache'

export const portfolioRouter = createTRPCRouter({
    /**
     * Creates a new portfolio item for the given artist
     */
    set_portfolio_item: artistProcedure
        .input(
            z.object({
                image: z.string(),
                name: z.string()
            })
        )
        .mutation(async (opts) => {
            const { input, ctx } = opts

            await ctx.db.portfolio.create({
                data: {
                    artistId: ctx.session.user.artist_id!,
                    name: input.name,
                    image: input.image
                }
            })

            await ctx.cache.del(
                AsRedisKey('portfolio_items', ctx.session.user.artist_id!)
            )
        })
})
