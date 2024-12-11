import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { artistProcedure, createTRPCRouter, publicProcedure } from '~/server/api/trpc'
import { portfolios } from '~/server/db/schema'
import type { ClientPortfolioItem } from '~/core/structures'
import { createId } from '@paralleldrive/cuid2'

import { get_image_url } from '~/lib/utils'
import { TRPCError } from '@trpc/server'
import { utapi } from '~/server/uploadthing'

export const portfolio_router = createTRPCRouter({
    set_portfolio: artistProcedure
        .input(
            z.object({
                title: z.string().min(2).max(128),
                ut_key: z.string()
            })
        )
        .mutation(async ({ ctx, input }) => {
            await ctx.db.insert(portfolios).values({
                id: createId(),
                artist_id: ctx.artist.id,
                ut_key: input.ut_key,
                title: input.title
            })
        }),

    update_portfolio: artistProcedure
        .input(
            z.object({
                id: z.string(),
                title: z.string().min(2).max(128)
            })
        )
        .mutation(async ({ ctx, input }) => {
            await ctx.db
                .update(portfolios)
                .set({
                    title: input.title
                })
                .where(eq(portfolios.id, input.id))
        }),

    destroy_portfolio: artistProcedure
        .input(
            z.object({
                id: z.string()
            })
        )
        .mutation(async ({ ctx, input }) => {
            const portfolio = await ctx.db.query.portfolios.findFirst({
                where: eq(portfolios.id, input.id)
            })

            if (!portfolio) {
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: 'Portfolio not found'
                })
            }

            await Promise.all([
                utapi.deleteFiles([portfolio.ut_key]),
                ctx.db.delete(portfolios).where(eq(portfolios.id, input.id))
            ])
        }),

    get_portfolio_by_id: publicProcedure
        .input(
            z.object({
                id: z.string()
            })
        )
        .query(async ({ ctx, input }) => {
            const portfolio = await ctx.db.query.portfolios.findFirst({
                where: eq(portfolios.id, input.id)
            })

            if (!portfolio) {
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: 'Portfolio not found'
                })
            }

            return {
                ...portfolio,
                image: {
                    url: get_image_url(portfolio.ut_key)
                }
            } satisfies ClientPortfolioItem
        }),

    get_portfolio_list: publicProcedure
        .input(
            z.object({
                artist_id: z.string()
            })
        )
        .query(async ({ ctx, input }) => {
            const portfolio_items = await ctx.db.query.portfolios.findMany({
                where: eq(portfolios.artist_id, input.artist_id)
            })

            const result: ClientPortfolioItem[] = portfolio_items.map((item) => ({
                ...item,
                image: {
                    url: get_image_url(item.ut_key)
                }
            }))

            return result
        })
})
