import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { ClientPortfolioItem, NemuImageData } from '~/core/structures'
import { get_blur_data } from '~/lib/server-utils'
import { artistProcedure, createTRPCRouter, publicProcedure } from '~/server/api/trpc'
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
        }),

    /**
     * Gets ALL portfolio items of a given artist
     */
    get_portfolio_items: publicProcedure
        .input(
            z.object({
                artist_id: z.string()
            })
        )
        .query(async (opts) => {
            const { input, ctx } = opts

            const cachedPorfolioItems = await ctx.cache.get(
                AsRedisKey('portfolio_items', input.artist_id)
            )

            if (cachedPorfolioItems) {
                return JSON.parse(cachedPorfolioItems) as ClientPortfolioItem[]
            }

            const portfolioItems = await ctx.db.portfolio.findMany({
                where: {
                    artistId: input.artist_id
                }
            })

            // Format for client
            const result: ClientPortfolioItem[] = []
            for (const portfolio of portfolioItems) {
                result.push({
                    ...portfolio,
                    image: {
                        url: portfolio.image,
                        blur_data: (await get_blur_data(portfolio.image)).base64
                    }
                })
            }

            await ctx.cache.set(
                AsRedisKey('portfolio_items', input.artist_id),
                JSON.stringify(result),
                'EX',
                3600
            )

            return result
        })
})
