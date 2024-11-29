import { and, eq } from 'drizzle-orm'
import { createTRPCRouter, publicProcedure, artistProcedure } from '../trpc'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { createId } from '@paralleldrive/cuid2'

import { artists, commissions } from '~/server/db/schema'
import { type ClientCommissionItem, CommissionAvailability } from '~/core/structures'
import { convert_images_to_nemu_images, format_to_currency } from '~/lib/utils'

export const commission_router = createTRPCRouter({
    set_commission: artistProcedure
        .input(
            z.object({
                title: z.string(),
                description: z.string(),
                price: z.number(),
                availability: z.nativeEnum(CommissionAvailability),
                images: z.array(
                    z.object({
                        url: z.string(),
                        ut_key: z.string()
                    })
                ),
                max_commissions_until_waitlist: z.number(),
                max_commissions_until_closed: z.number(),
                published: z.boolean(),
                form_id: z.string()
            })
        )
        .mutation(async ({ ctx, input }) => {
            // Create Slug
            const slug = input.title
                .toLowerCase()
                .replace(/[^a-zA-Z ]/g, '')
                .replaceAll(' ', '-')

            // Check if it already exists for the artist
            let slug_exists
            try {
                slug_exists = await ctx.db.query.commissions.findFirst({
                    where: and(
                        eq(commissions.artist_id, ctx.artist.id),
                        eq(commissions.slug, slug)
                    )
                })

                if (slug_exists === undefined) {
                    console.error('An error occurred while checking for slug existence')
                    return { success: false }
                }
            } catch (e) {
                console.error('Failed to check for slug existence: ', e)
                return { success: false }
            }

            if (slug_exists) {
                console.error('Slug already exists')
                return { success: false }
            }

            // Create database object
            const commission_id = createId()

            try {
                await ctx.db.insert(commissions).values({
                    id: commission_id,
                    artist_id: ctx.artist.id,
                    title: input.title,
                    description: input.description,
                    price: input.price,
                    images: input.images,
                    availability: input.availability,
                    slug: slug,
                    max_commissions_until_waitlist: input.max_commissions_until_waitlist,
                    max_commissions_until_closed: input.max_commissions_until_closed,
                    published: input.published ?? false,
                    form_id: input.form_id,
                    rating: '5.00'
                })
            } catch (e) {
                console.error('Failed to create commission: ', e)
                return { success: false }
            }

            return { success: true }
        }),

    get_commission: publicProcedure
        .input(
            z.object({
                handle: z.string(),
                slug: z.string()
            })
        )
        .query(async ({ input, ctx }) => {
            const data = await ctx.db.query.artists.findFirst({
                where: eq(artists.handle, input.handle),
                with: {
                    commissions: {
                        where: and(
                            eq(commissions.slug, input.slug),
                            eq(commissions.artist_id, artists.id)
                        )
                    }
                }
            })

            if (!data?.commissions[0]) {
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'Artist or Commission not found'
                })
            }

            // Format images for client
            const images = await convert_images_to_nemu_images(data.commissions[0].images)
            const result: ClientCommissionItem = {
                title: data.commissions[0].title,
                description: data.commissions[0].description,
                price: format_to_currency(Number(data.commissions[0].price / 100)),
                availability: data.commissions[0].availability as CommissionAvailability,
                rating: Number(data.commissions[0].rating),
                images: images,
                slug: data.commissions[0].slug,
                published: data.commissions[0].published,

                id: data.commissions[0].id,
                form_id: data.commissions[0].form_id,

                artist: {
                    handle: data.handle,
                    supporter: data.supporter,
                    terms: data.terms
                }
            }

            return result
        }),

    get_commission_list_by_id: artistProcedure.query(async ({ ctx }) => {
        const artist = await ctx.db.query.artists.findFirst({
            where: eq(artists.id, ctx.artist.id),
            with: {
                commissions: true
            }
        })

        if (!artist) {
            throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Artist not found'
            })
        }

        if (!artist?.commissions) {
            return []
        }

        const result: ClientCommissionItem[] = []
        for (const commission of artist.commissions) {
            result.push({
                title: commission.title,
                description: commission.description,
                price: format_to_currency(Number(commission.price / 100)),
                availability: commission.availability as CommissionAvailability,
                rating: Number(commission.rating),
                published: commission.published,
                images: [
                    {
                        url: commission.images[0]!.url
                    }
                ],
                slug: commission.slug,
                total_requests: commission.total_requests,
                new_requests: commission.new_requests,
                artist: {
                    handle: artist.handle ?? 'Nemu Jr',
                    supporter: artist.supporter
                }
            })
        }

        return result
    })
})
