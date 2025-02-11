import { eq, sql } from 'drizzle-orm'
import { z } from 'zod'

import { commissions } from '~/server/db/schema'
import { cache, get_redis_key } from '~/server/redis'
import { createTRPCRouter, publicProcedure } from '~/server/api/trpc'

import { format_to_currency, get_ut_url } from '~/lib/utils'
import type { CommissionAvailability } from '~/lib/structures'

type RandomCommissions = {
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
                cursor: z.string().nullish()
            })
        )
        .query(async () => {
            console.log('Hello, World!')
        }),

    random_commissions: publicProcedure.query(async ({ ctx }) => {
        return await cache(
            get_redis_key('home', 'random_commissions'),
            async () => {
                const data = await ctx.db.query.commissions.findMany({
                    limit: 10,
                    orderBy: () => sql`RANDOM()`,
                    with: {
                        artist: true
                    },
                    where: eq(commissions.published, true)
                })

                const random_commissions: RandomCommissions[] = data.map(
                    (commission) => ({
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
                    })
                )

                return random_commissions
            },
            3600
        )
    })
})
