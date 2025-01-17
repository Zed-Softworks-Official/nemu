import { eq, sql } from 'drizzle-orm'
import { z } from 'zod'

import { createTRPCRouter, publicProcedure } from '../trpc'
import { cache, get_redis_key } from '~/server/redis'
import type { CommissionAvailability } from '~/lib/structures'
import { format_to_currency, get_ut_url } from '~/lib/utils'
import { commissions, users } from '~/server/db/schema'

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
                        availability: commission.availability as CommissionAvailability,
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
    }),

    get_user_profile: publicProcedure
        .input(
            z.object({
                user_id: z.string().optional()
            })
        )
        .query(async ({ ctx, input }) => {
            if (!input.user_id) {
                return null
            }

            const user_profile = await ctx.db.query.users.findFirst({
                where: eq(users.clerk_id, input.user_id)
            })

            return user_profile
        })
})
