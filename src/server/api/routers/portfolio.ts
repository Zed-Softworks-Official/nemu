import { TRPCError } from '@trpc/server'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'

import { ClientPortfolioItem, NemuImageData } from '~/core/structures'
import { get_blur_data } from '~/lib/server-utils'

import { artistProcedure, createTRPCRouter, publicProcedure } from '~/server/api/trpc'
import { AsRedisKey } from '~/server/cache'
import { portfolios } from '~/server/db/schema'

import { utapi } from '~/server/uploadthing'

export const portfolioRouter = createTRPCRouter({
    /**
     * Creates or Updates a portfolio item for the given user
     */
    set_portfolio_item: artistProcedure
        .input(
            z
                .object({
                    type: z.literal('create'),
                    data: z.object({
                        title: z.string(),
                        image: z.string(),
                        utKey: z.string()
                    })
                })
                .or(
                    z.object({
                        type: z.literal('update'),
                        id: z.string(),
                        data: z.object({
                            title: z.string()
                        })
                    })
                )
        )
        .mutation(async ({ input, ctx }) => {
            // Check if we actually have the artist id
            if (!ctx.user.privateMetadata.artist_id) {
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR'
                })
            }

            // If it's an update
            if (input.type === 'update') {
                await ctx.db
                    .update(portfolios)
                    .set({
                        title: input.data.title
                    })
                    .where(eq(portfolios.id, input.id))

                return
            }

            // Create the portfolio item
            await ctx.db.insert(portfolios).values({
                artist_id: ctx.user.privateMetadata.artist_id as string,
                title: input.data.title,
                image_url: input.data.image,
                ut_key: input.data.utKey
            })

            // Update Cache
            const portfolioItems = await ctx.db.query.portfolios.findMany({
                where: eq(
                    portfolios.artist_id,
                    ctx.user.privateMetadata.artist_id as string
                )
            })

            // Format for client
            const result: ClientPortfolioItem[] = []
            for (const portfolio of portfolioItems) {
                result.push({
                    id: portfolio.id,
                    title: portfolio.title,
                    image: {
                        url: portfolio.image_url,
                        blur_data: (await get_blur_data(portfolio.image_url)).base64
                    }
                })
            }

            await ctx.cache.set(
                AsRedisKey(
                    'portfolio_items',
                    ctx.user.privateMetadata.artist_id as string
                ),
                JSON.stringify(result),
                {
                    EX: 3600
                }
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

            const portfolioItems = await ctx.db.query.portfolios.findMany({
                where: eq(portfolios.artist_id, input.artist_id)
            })

            // Format for client
            const result: ClientPortfolioItem[] = []
            for (const portfolio of portfolioItems) {
                result.push({
                    id: portfolio.id,
                    title: portfolio.title,
                    image: {
                        url: portfolio.image_url,
                        blur_data: (await get_blur_data(portfolio.image_url)).base64
                    }
                })
            }

            await ctx.cache.set(
                AsRedisKey('portfolio_items', input.artist_id),
                JSON.stringify(result),
                { EX: 3600 }
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

            const portfolio_item = await ctx.db.query.portfolios.findFirst({
                where: and(
                    eq(portfolios.artist_id, input.artist_id),
                    eq(portfolios.id, input.item_id)
                )
            })

            if (!portfolio_item) {
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'Unable to find portfolio item'
                })
            }

            const result: ClientPortfolioItem = {
                id: portfolio_item.id,
                title: portfolio_item.title,
                image: {
                    url: portfolio_item.image_url,
                    blur_data: (await get_blur_data(portfolio_item.image_url)).base64
                }
            }

            await ctx.cache.set(
                AsRedisKey('portfolio_items', input.artist_id, input.item_id),
                JSON.stringify(result),
                { EX: 3600 }
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
            await ctx.db.delete(portfolios).where(eq(portfolios.id, input.id))
        })
})
