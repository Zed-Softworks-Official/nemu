import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { artistProcedure, createTRPCRouter, publicProcedure } from '~/server/api/trpc'
import { portfolios } from '~/server/db/schema'
import type { ClientPortfolioItem } from '~/lib/types'
import { createId } from '@paralleldrive/cuid2'

import { getUTUrl } from '~/lib/utils'
import { TRPCError } from '@trpc/server'
import { utapi } from '~/server/uploadthing'

export const portfolioRouter = createTRPCRouter({
    setPortfolio: artistProcedure
        .input(
            z.object({
                title: z.string().min(2).max(128),
                ut_key: z.string()
            })
        )
        .mutation(async ({ ctx, input }) => {
            await ctx.db.insert(portfolios).values({
                id: createId(),
                artistId: ctx.artist.id,
                utKey: input.ut_key,
                title: input.title
            })
        }),

    updatePortfolio: artistProcedure
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

    destroyPortfolio: artistProcedure
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
                utapi.deleteFiles([portfolio.utKey]),
                ctx.db.delete(portfolios).where(eq(portfolios.id, input.id))
            ])
        }),

    getPortfolioById: publicProcedure
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
                    url: getUTUrl(portfolio.utKey)
                }
            } satisfies ClientPortfolioItem
        }),

    getPortfolioList: artistProcedure.query(async ({ ctx }) => {
        const portfolio_items = await ctx.db.query.portfolios.findMany({
            where: eq(portfolios.artistId, ctx.artist.id)
        })

        const result: ClientPortfolioItem[] = portfolio_items.map((item) => ({
            ...item,
            image: {
                url: getUTUrl(item.utKey)
            }
        }))

        return result
    })
})
