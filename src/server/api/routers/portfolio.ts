import { createId } from '@paralleldrive/cuid2'
import { TRPCError } from '@trpc/server'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'

import { ClientPortfolioItem, NemuImageData } from '~/core/structures'
import { get_blur_data } from '~/lib/blur_data'

import { artistProcedure, createTRPCRouter, publicProcedure } from '~/server/api/trpc'
import { AsRedisKey, cache, invalidate_cache } from '~/server/cache'
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
                id: createId(),
                artist_id: ctx.user.privateMetadata.artist_id as string,
                title: input.data.title,
                image_url: input.data.image,
                ut_key: input.data.utKey
            })

            // Invalidate Cache

            invalidate_cache(
                AsRedisKey('portfolios', ctx.user.privateMetadata.artist_id as string),
                'portfolio_list'
            )
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

            // Delete single item from kv cache
            await cache.json.del(
                AsRedisKey(
                    'portfolios',
                    ctx.user.privateMetadata.artist_id as string,
                    input.id
                )
            )

            // Invalidate Cache

            invalidate_cache(
                AsRedisKey('portfolios', ctx.user.privateMetadata.artist_id as string),
                'portfolio_list'
            )
        })
})
