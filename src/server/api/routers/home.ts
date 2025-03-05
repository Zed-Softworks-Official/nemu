import { and, asc, eq, gt } from 'drizzle-orm'
import { z } from 'zod'
import { type JSONContent } from '@tiptap/react'

import { commissions, products } from '~/server/db/schema'
import { createTRPCRouter, publicProcedure } from '~/server/api/trpc'

import { formatToCurrency, getUTUrl } from '~/lib/utils'
import type { CommissionAvailability } from '~/lib/types'
import { cache, getRedisKey } from '~/server/redis'

type CommissionResult = {
    id: string
    title: string
    description: JSONContent
    featuredImage: string
    slug: string
    availability: CommissionAvailability
    price: string
    artist: {
        handle: string
    }
}

type ProductResult = {
    id: string
    name: string
    description: JSONContent | null
    featuredImage: string
    price: string
    artist: {
        handle: string
    }
}

export const homeRouter = createTRPCRouter({
    getCommissionsInfinite: publicProcedure
        .input(
            z.object({
                limit: z.number().min(1).max(20).default(10),
                cursor: z.date().max(new Date()).nullish()
            })
        )
        .query(async ({ ctx, input }) => {
            const data = await ctx.db.query.commissions.findMany({
                limit: input.limit,
                with: {
                    artist: true
                },
                orderBy: (commission) => asc(commission.createdAt),
                where: input.cursor
                    ? and(
                          gt(commissions.createdAt, input.cursor),
                          eq(commissions.published, true)
                      )
                    : eq(commissions.published, true)
            })

            const res: CommissionResult[] = data.map((commission) => ({
                id: commission.id,
                title: commission.title,
                description: commission.description,
                slug: commission.slug,
                availability: commission.availability,
                featuredImage: getUTUrl(commission.images[0]?.utKey ?? ''),
                price: formatToCurrency(commission.price / 100),
                artist: {
                    handle: commission.artist.handle
                }
            }))

            return { res, next_cursor: data[data.length - 1]?.createdAt }
        }),

    getProductsInfinite: publicProcedure
        .input(
            z.object({
                cursor: z.date().optional(),
                limit: z.number().min(1).max(20).default(10)
            })
        )
        .query(async ({ input, ctx }) => {
            const data = await ctx.db.query.products.findMany({
                limit: input.limit,
                with: {
                    artist: true
                },
                orderBy: (product) => asc(product.createdAt),
                where: input.cursor
                    ? and(
                          gt(products.createdAt, input.cursor),
                          eq(products.published, true)
                      )
                    : eq(products.published, true)
            })

            const res: ProductResult[] = data.map((product) => ({
                id: product.id,
                name: product.name,
                description: product.description,
                featuredImage: getUTUrl(product.images[0] ?? ''),
                price: formatToCurrency(product.price / 100),
                artist: {
                    handle: product.artist.handle
                }
            }))

            return { res, nextCursor: data[data.length - 1]?.createdAt }
        }),

    getFeaturedProducts: publicProcedure.query(async ({ ctx }) => {
        return await cache(
            getRedisKey('product:featured', 'home'),
            async () => {
                const data = await ctx.db.query.products.findMany({
                    limit: 3,
                    where: eq(products.published, true),
                    with: {
                        artist: true
                    }
                })

                const res: ProductResult[] = data.map((product) => ({
                    id: product.id,
                    name: product.name,
                    description: product.description,
                    featuredImage: getUTUrl(product.images[0] ?? ''),
                    price: formatToCurrency(product.price / 100),
                    artist: {
                        handle: product.artist.handle
                    }
                }))

                return res
            },
            3600
        )
    })
})
