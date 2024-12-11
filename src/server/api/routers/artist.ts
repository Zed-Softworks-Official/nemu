import { clerkClient } from '@clerk/nextjs/server'
import { TRPCError } from '@trpc/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { get_image_url } from '~/lib/utils'

import { createTRPCRouter, publicProcedure } from '~/server/api/trpc'
import { artists } from '~/server/db/schema'

export const artist_router = createTRPCRouter({
    get_artist_data: publicProcedure
        .input(
            z.object({
                handle: z.string()
            })
        )
        .query(async ({ ctx, input }) => {
            const clerk_client_promise = clerkClient()
            const artist_promise = ctx.db.query.artists.findFirst({
                where: eq(artists.handle, input.handle),
                with: {
                    commissions: true,
                    portfolio: true,
                    forms: true
                }
            })

            const [clerk_client, artist] = await Promise.all([
                clerk_client_promise,
                artist_promise
            ])

            if (!artist) {
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: 'Artist not found'
                })
            }

            const user = await clerk_client.users.getUser(artist.user_id)
            const portfolio_items = artist.portfolio.map((portfolio) => ({
                ...portfolio,
                image: {
                    url: get_image_url(portfolio.ut_key)
                }
            }))

            const commissions = artist.commissions.map((commission) => ({
                ...commission,
                images: commission.images.map((image) => ({
                    url: get_image_url(image.ut_key ?? '')
                }))
            }))

            return {
                ...artist,
                header_photo: get_image_url(artist.header_photo),
                portfolio: portfolio_items,
                commissions: commissions,
                user: {
                    username: user.username,
                    profile_picture: user.imageUrl
                }
            }
        })
})
