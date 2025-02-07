import { clerkClient } from '@clerk/nextjs/server'
import { TRPCError } from '@trpc/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { is_supporter } from '~/app/api/stripe/sync'
import { chargeMethods, SocialAgent } from '~/lib/structures'
import { get_ut_url } from '~/lib/utils'
import { update_index } from '~/server/algolia/collections'

import { artistProcedure, createTRPCRouter, publicProcedure } from '~/server/api/trpc'
import { artists, commissions } from '~/server/db/schema'
import { utapi } from '~/server/uploadthing'

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
                    commissions: {
                        where: eq(commissions.published, true)
                    },
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
                    url: get_ut_url(portfolio.ut_key)
                }
            }))

            const commission_list = artist.commissions.map((commission) => ({
                ...commission,
                images: commission.images.map((image) => ({
                    url: get_ut_url(image.ut_key ?? '')
                }))
            }))

            const supporter = await is_supporter(artist.user_id)
            return {
                ...artist,
                supporter,
                header_photo: get_ut_url(artist.header_photo),
                portfolio: portfolio_items,
                commissions: commission_list,
                user: {
                    username: user.username,
                    profile_picture: user.imageUrl
                }
            }
        }),

    get_artist_settings: artistProcedure.query(async ({ ctx }) => {
        return {
            about: ctx.artist.about,
            location: ctx.artist.location,
            terms: ctx.artist.terms,
            tip_jar_url: ctx.artist.tip_jar_url,
            socials: ctx.artist.socials,
            charge_method: ctx.artist.default_charge_method
        }
    }),

    set_artist_settings: artistProcedure
        .input(
            z.object({
                about: z.string().optional(),
                location: z.string().optional(),
                terms: z.string().optional(),
                tip_jar_url: z.string().url().nullable(),
                socials: z
                    .array(
                        z.object({
                            url: z.string().url(),
                            agent: z.nativeEnum(SocialAgent)
                        })
                    )
                    .optional(),
                header_image_key: z.string().optional(),
                default_charge_method: z.enum(chargeMethods)
            })
        )
        .mutation(async ({ ctx, input }) => {
            if (input.header_image_key) {
                const delete_promise = utapi.deleteFiles(ctx.artist.header_photo)

                const algolia_update = update_index('artists', {
                    objectID: ctx.artist.id,
                    handle: ctx.artist.handle,
                    about: ctx.artist.about,
                    image_url: get_ut_url(input.header_image_key)
                })

                await Promise.all([delete_promise, algolia_update])
            }

            await ctx.db
                .update(artists)
                .set({
                    about: input.about,
                    location: input.location,
                    terms: input.terms,
                    tip_jar_url: input.tip_jar_url,
                    socials: input.socials,
                    header_photo: input.header_image_key,
                    default_charge_method: input.default_charge_method
                })
                .where(eq(artists.id, ctx.artist.id))
        })
})
