import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { ClientPortfolioItem, NemuImageData } from '~/core/structures'
import { get_blur_data } from '~/lib/server-utils'
import { artistProcedure, createTRPCRouter, publicProcedure } from '~/server/api/trpc'
import { AsRedisKey } from '~/server/cache'
import { utapi } from '~/server/uploadthing'

export const portfolioRouter = createTRPCRouter({
    /**
     * Creates a new portfolio item for the given artist
     */
    set_portfolio_item: artistProcedure
        .input(
            z.object({
                image: z.string(),
                utKey: z.string(),
                name: z.string()
            })
        )
        .mutation(async ({ input, ctx }) => {
            await ctx.db.portfolio.create({
                data: {
                    artistId: ctx.session.user.artist_id!,
                    name: input.name,
                    image: input.image,
                    utKey: input.utKey
                }
            })

            await ctx.cache.del(
                AsRedisKey('portfolio_items', ctx.session.user.artist_id!)
            )
        }),

    /**
     * Gets ALL portfolio items of a given artist
     */
    get_portfolio_list: publicProcedure
        .input(
            z.object({
                artist_id: z.string()
            })
        )
        .query(async ({ input, ctx }) => {
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
        }),

    /**
     * Gets a SINGLE portfolio item
     */
    get_portfolio: publicProcedure
        .input(
            z.object({
                artist_id: z.string(),
                item_id: z.string()
            })
        )
        .query(async ({ input, ctx }) => {
            const cachedPorfolioItem = await ctx.cache.get(
                AsRedisKey('portfolio_items', input.artist_id, input.item_id)
            )

            if (cachedPorfolioItem) {
                return JSON.parse(cachedPorfolioItem) as ClientPortfolioItem
            }

            const portfolio_item = await ctx.db.portfolio.findFirst({
                where: {
                    artistId: input.artist_id,
                    id: input.item_id
                }
            })

            if (!portfolio_item) {
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'Unable to find portfolio item'
                })
            }

            const result: ClientPortfolioItem = {
                ...portfolio_item,
                image: {
                    url: portfolio_item.image,
                    blur_data: (await get_blur_data(portfolio_item.image)).base64
                }
            }

            await ctx.cache.set(
                AsRedisKey('portfolio_items', input.artist_id, input.item_id),
                JSON.stringify(result),
                'EX',
                3600
            )

            return result
        }),

    /**
     * Deletes a specified portfolio item
     */
    del_portfolio_item: artistProcedure
        .input(
            z.object({
                id: z.string(),
                utKey: z.string()
            })
        )
        .mutation(async ({ input, ctx }) => {
            // Delete from uploadthing
            await utapi.deleteFiles(input.utKey)

            // Delete from db
            await ctx.db.portfolio.delete({
                where: {
                    id: input.id
                }
            })
        }),

    /**
     * Updates a specified portfolio item
     */
    update_portfolio_item: artistProcedure
        .input(
            z.object({
                id: z.string(),
                name: z.string()
            })
        )
        .mutation(async ({ input, ctx }) => {
            await ctx.db.portfolio.update({
                where: {
                    id: input.id
                },
                data: {
                    name: input.name
                }
            })

            // Cache Update
        })
})
