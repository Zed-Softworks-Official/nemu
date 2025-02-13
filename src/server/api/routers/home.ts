import { and, asc, eq, gt } from 'drizzle-orm'
import { z } from 'zod'

import { commissions } from '~/server/db/schema'
import { createTRPCRouter, publicProcedure } from '~/server/api/trpc'

import { format_to_currency, get_ut_url } from '~/lib/utils'
import type { CommissionAvailability } from '~/lib/structures'

type CommissionResult = {
    id: string
    title: string
    description: string
    featured_image: string
    slug: string
    availability: CommissionAvailability
    price: string
    artist: {
        handle: string
    }
}

export const home_router = createTRPCRouter({
    get_commissions: publicProcedure
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
                orderBy: (commission) => asc(commission.created_at),
                where: input.cursor
                    ? and(
                          gt(commissions.created_at, input.cursor),
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
                featured_image: get_ut_url(commission.images[0]?.ut_key ?? ''),
                price: format_to_currency(commission.price / 100),
                artist: {
                    handle: commission.artist.handle
                }
            }))

            return { res, next_cursor: data[data.length - 1]?.created_at }
        })
})
