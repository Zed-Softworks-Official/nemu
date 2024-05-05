import { z } from 'zod'
import { TRPCError } from '@trpc/server'

import {
    ClientCommissionItem,
    CommissionAvailability,
    NemuImageData
} from '~/core/structures'
import { artistProcedure, createTRPCRouter, publicProcedure } from '~/server/api/trpc'
import { AsRedisKey } from '~/server/cache'
import { convert_images_to_nemu_images, get_blur_data } from '~/lib/server-utils'
import { format_to_currency } from '~/lib/utils'
import { artists, commissions } from '~/server/db/schema'

import { and, eq } from 'drizzle-orm'
import { createId } from '@paralleldrive/cuid2'

const request_data = z.object({
    artist: z.boolean().optional(),
    form: z.boolean().optional(),
    reviews: z.boolean().optional()
})

export const commissionRouter = createTRPCRouter({
    /**
     * Gets ALL commissions from a given artist
     */
    get_commission_list: publicProcedure
        .input(
            z.object({
                artist_id: z.string(),
                include_stats: z.boolean().optional(),
                show_unpublished: z.boolean().optional()
            })
        )
        .query(async ({ input, ctx }) => {
            const cachedCommissions = await ctx.cache.get(
                AsRedisKey(
                    'commissions',
                    input.artist_id,
                    input.show_unpublished ? 'dashboard' : 'standard'
                )
            )

            if (cachedCommissions) {
                return JSON.parse(cachedCommissions) as ClientCommissionItem[]
            }

            const db_commissions = await ctx.db.query.commissions.findMany({
                where: eq(commissions.artist_id, input.artist_id),
                with: {
                    artist: true
                }
            })

            if (!db_commissions) {
                return undefined
            }

            // Format for client
            const result: ClientCommissionItem[] = []
            for (const commission of db_commissions) {
                if (!input.show_unpublished && !commission.published) {
                    continue
                }

                result.push({
                    title: commission.title,
                    description: commission.description,
                    price: format_to_currency(Number(commission.price)),
                    availability: commission.availability,
                    rating: Number(commission.rating),
                    published: commission.published,
                    images: [
                        {
                            url: commission.images[0]!,
                            blur_data: (await get_blur_data(commission.images[0]!)).base64
                        }
                    ],
                    slug: commission.slug,
                    total_requests: input.include_stats
                        ? commission.total_requests
                        : undefined,
                    new_requests: input.include_stats
                        ? commission.new_requests
                        : undefined,

                    artist: {
                        handle: commission.artist.handle,
                        supporter: commission.artist.supporter
                    }
                })
            }

            await ctx.cache.set(
                AsRedisKey(
                    'commissions',
                    input.artist_id,
                    input.show_unpublished ? 'dashboard' : 'standard'
                ),
                JSON.stringify(result),
                {
                    EX: 3600
                }
            )

            return result
        }),

    /**
     * Gets a single commission given a commission id
     */
    get_commission_dashboard: publicProcedure
        .input(
            z.object({
                id: z.string(),
                req_data: request_data.optional()
            })
        )
        .query(async ({ input, ctx }) => {
            // Check if we have the commission already cached
            const cachedCommission = await ctx.cache.get(
                AsRedisKey('commissions', input.id)
            )

            // If we do return that
            if (cachedCommission) {
                return JSON.parse(cachedCommission) as ClientCommissionItem
            }

            // Get commission from db
            const commission = await ctx.db.query.commissions.findFirst({
                where: eq(commissions.id, input.id),
                with: {
                    artist: input.req_data?.artist || undefined,
                    form: input.req_data?.form || undefined,
                    reviews: input.req_data?.reviews || undefined
                }
            })

            if (!commission) {
                return undefined
            }

            // Format for client
            const images: NemuImageData[] = []

            for (const image of commission?.images) {
                images.push({
                    url: image,
                    blur_data: (await get_blur_data(image)).base64
                })
            }

            const result: ClientCommissionItem = {
                title: commission.title,
                description: commission.description,
                price: format_to_currency(Number(commission.price)),
                availability: commission.availability,
                rating: Number(commission.rating),
                images: images,
                slug: commission.slug,
                published: commission.published,
                total_requests: commission.total_requests,
                new_requests: commission.new_requests,

                artist: {
                    handle: commission.artist.handle,
                    supporter: commission.artist.supporter,
                    terms: commission.artist.terms
                }
            }

            await ctx.cache.set(
                AsRedisKey('commissions', input.id),
                JSON.stringify(result),
                {
                    EX: 3600
                }
            )

            return result
        }),

    /**
     * Gets a single commission given a commission id to be used for editing the commission in the dashboard
     */
    get_commission_edit: artistProcedure
        .input(z.object({ slug: z.string() }))
        .query(async ({ input, ctx }) => {
            // Get the artist from the db
            const artist = await ctx.db.query.artists.findFirst({
                where: eq(artists.user_id, ctx.user.privateMetadata.artist_id as string)
            })

            // Get the commission from the db
            const commission = await ctx.db.query.commissions.findFirst({
                where: eq(commissions.slug, input.slug),
                with: {
                    artist: true
                }
            })

            if (!commission) {
                return undefined
            }

            // Format for client
            return {
                title: commission.title,
                description: commission.description,
                price: format_to_currency(Number(commission.price)),
                availability: commission.availability,
                rating: Number(commission.rating),
                images: await convert_images_to_nemu_images(commission?.images),
                slug: commission.slug,
                published: commission.published,

                max_commissions_until_waitlist: commission.max_commissions_until_waitlist,
                max_commissions_until_closed: commission.max_commissions_until_closed,
                raw_price: Number(commission.price),

                id: commission.id,
                form_id: commission.form_id,

                artist: {
                    handle: commission.artist.handle,
                    supporter: commission.artist.supporter,
                    terms: commission.artist.terms
                }
            } satisfies ClientCommissionItem
        }),

    /**
     * Gets a single commission given a commission slug
     */
    get_commission: publicProcedure
        .input(
            z.object({
                slug: z.string(),
                handle: z.string(),
                req_data: z
                    .object({
                        artist: z.boolean().optional(),
                        form: z.boolean().optional(),
                        reviews: z.boolean().optional()
                    })
                    .optional()
            })
        )
        .query(async ({ input, ctx }) => {
            // Check if we have the commission already cached
            const cachedCommission = await ctx.cache.get(
                AsRedisKey('commissions', input.handle, input.slug)
            )

            // If we do return that
            if (cachedCommission) {
                return JSON.parse(cachedCommission) as ClientCommissionItem
            }

            const artist = await ctx.db.query.artists.findFirst({
                where: eq(artists.handle, input.handle)
            })

            if (!artist) {
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR'
                })
            }

            // Get commission from db
            const commission = await ctx.db.query.commissions.findFirst({
                where: and(
                    eq(commissions.slug, input.slug),
                    eq(commissions.artist_id, artist.id)
                ),
                with: {
                    artist: input.req_data?.artist || undefined,
                    form: input.req_data?.form || undefined,
                    reviews: input.req_data?.reviews
                        ? {
                              with: {
                                  user: true
                              }
                          }
                        : undefined
                }
            })

            if (!commission) {
                return undefined
            }

            // Format for client
            const images = await convert_images_to_nemu_images(commission?.images)

            const result: ClientCommissionItem = {
                title: commission.title,
                description: commission.description,
                price: format_to_currency(Number(commission.price)),
                availability: commission.availability,
                rating: Number(commission.rating),
                images: images,
                slug: commission.slug,
                published: commission.published,

                id: commission.id,
                form_id: commission.form_id,

                artist: input.req_data?.artist
                    ? {
                          handle: commission.artist.handle,
                          supporter: commission.artist.supporter,
                          terms: commission.artist.terms
                      }
                    : undefined
            }

            await ctx.cache.set(
                AsRedisKey('commissions', input.handle, input.slug),
                JSON.stringify(result),
                {
                    EX: 3600
                }
            )

            return result
        }),

    /**
     * Handles Creating and Updating Commissions
     */
    set_commission: artistProcedure
        .input(
            z
                .object({
                    type: z.literal('create'),
                    data: z.object({
                        title: z.string(),
                        description: z.string(),
                        price: z.number(),
                        availability: z.string(),
                        images: z.array(z.string()),
                        utKeys: z.array(z.string()),
                        // rush_orders_allowed: z.boolean(),
                        // rush_charge: z.number(),
                        // rush_percentage: z.boolean(),
                        form_id: z.string(),
                        max_commissions_until_closed: z.number().optional(),
                        max_commissions_until_waitlist: z.number().optional(),
                        published: z.boolean().default(false)
                    })
                })
                .or(
                    z.object({
                        type: z.literal('update'),
                        commission_id: z.string(),
                        data: z.object({
                            title: z.string().optional(),
                            description: z.string().optional(),
                            availability: z.string().optional(),
                            images: z.array(z.string()).optional(),
                            utKeys: z.array(z.string()).optional(),
                            // rush_orders_allowed: z.boolean().optional(),
                            // rush_charge: z.number().optional(),
                            // rush_percentage: z.boolean().optional(),
                            form_id: z.string().optional(),
                            price: z.number().optional(),
                            max_commissions_until_closed: z.number().optional(),
                            max_commissions_until_waitlist: z.number().optional(),
                            published: z.boolean().optional()
                        })
                    })
                )
        )
        .mutation(async ({ input, ctx }) => {
            // Make sure we have the artist id
            if (!ctx.user.privateMetadata.artist_id) {
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'Artist does not exist!'
                })
            }

            ////////////////////////////
            // Update Commission
            ////////////////////////////
            if (input.type === 'update') {
                await ctx.db
                    .update(commissions)
                    .set({
                        title: input.data.title,
                        description: input.data.description,
                        price: input.data.price?.toString(2),
                        images: input.data.images,
                        ut_keys: input.data.utKeys,
                        availability: input.data.availability as CommissionAvailability,
                        max_commissions_until_waitlist:
                            input.data.max_commissions_until_waitlist,
                        max_commissions_until_closed:
                            input.data.max_commissions_until_closed,
                        published: input.data.published,
                        form_id: input.data.form_id
                    })
                    .where(eq(commissions.id, input.commission_id))

                // Delete Cache
                await ctx.cache.del(
                    AsRedisKey(
                        'commissions',
                        ctx.user.privateMetadata.artist_id as string,
                        'standard'
                    )
                )
                await ctx.cache.del(
                    AsRedisKey(
                        'commissions',
                        ctx.user.privateMetadata.artist_id as string,
                        'dashboard'
                    )
                )

                return { success: true }
            }

            ////////////////////////////
            // Create New Commission
            ////////////////////////////
            // Create Slug
            const slug = input.data
                .title!.toLowerCase()
                .replace(/[^a-zA-Z ]/g, '')
                .replaceAll(' ', '-')

            // Check if it already exists for the artist
            const slugExists = await ctx.db.query.commissions.findFirst({
                where: and(
                    eq(
                        commissions.artist_id,
                        ctx.user.privateMetadata.artist_id as string
                    ),
                    eq(commissions.slug, slug)
                )
            })

            if (slugExists) {
                return { success: false, reason: 'Slug already exists!' }
            }

            // Create database object
            await ctx.db.insert(commissions).values({
                id: createId(),
                artist_id: ctx.user.privateMetadata.artist_id as string,
                title: input.data.title,
                description: input.data.description,
                price: input.data.price?.toPrecision(4),
                images: input.data.images,
                ut_keys: input.data.utKeys,
                availability: input.data.availability as CommissionAvailability,
                slug: slug,
                max_commissions_until_waitlist: input.data.max_commissions_until_waitlist,
                max_commissions_until_closed: input.data.max_commissions_until_closed,
                published: input.data.published,
                form_id: input.data.form_id,
                rating: '5.00'
                // rush_charge: 0,
                // rush_orders_allowed: false,
                // rush_percentage: false
            })

            // Update Cache
            const db_commissions = await ctx.db.query.commissions.findMany({
                where: eq(
                    commissions.artist_id,
                    ctx.user.privateMetadata.artist_id as string
                )
            })

            await ctx.cache.set(
                AsRedisKey('commissions', ctx.user.privateMetadata.artist_id as string),
                JSON.stringify(db_commissions),
                {
                    EX: 3600
                }
            )

            return { success: true }
        })
})
