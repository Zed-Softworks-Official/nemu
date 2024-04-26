import { z } from 'zod'
import { TRPCError } from '@trpc/server'

import { ClientCommissionItem, NemuImageData } from '~/core/structures'
import { artistProcedure, createTRPCRouter, publicProcedure } from '~/server/api/trpc'
import { AsRedisKey } from '~/server/cache'
import { get_blur_data } from '~/lib/server-utils'
import { format_to_currency } from '~/lib/utils'

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

            const commissions = await ctx.db.commission.findMany({
                where: {
                    artistId: input.artist_id
                },
                include: {
                    artist: true
                }
            })

            if (!commissions) {
                return undefined
            }

            // Format for client
            const result: ClientCommissionItem[] = []
            for (const commission of commissions) {
                if (!input.show_unpublished && !commission.published) {
                    continue
                }

                result.push({
                    title: commission.title,
                    description: commission.description,
                    price: format_to_currency(commission.price),
                    availability: commission.availability,
                    rating: commission.rating,
                    published: commission.published,
                    images: [
                        {
                            url: commission.images[0]!,
                            blur_data: (await get_blur_data(commission.images[0]!)).base64
                        }
                    ],
                    slug: commission.slug,
                    total_requests: input.include_stats
                        ? commission.totalRequests
                        : undefined,
                    new_requests: input.include_stats
                        ? commission.newRequests
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
                'EX',
                3600
            )

            return result
        }),

    /**
     * Gets a single commission given a commission slug
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
            const commission = await ctx.db.commission.findFirst({
                where: {
                    id: input.id
                },
                include: {
                    artist: input.req_data?.artist,
                    form: input.req_data?.form,
                    reviews: input.req_data?.reviews
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
                price: format_to_currency(commission.price),
                availability: commission.availability,
                rating: commission.rating,
                images: images,
                slug: commission.slug,
                published: commission.published,
                total_requests: commission.totalRequests,
                new_requests: commission.newRequests,

                artist: {
                    handle: commission.artist.handle,
                    supporter: commission.artist.supporter,
                    terms: commission.artist.terms
                }
            }

            await ctx.cache.set(
                AsRedisKey('commissions', input.id),
                JSON.stringify(result),
                'EX',
                3600
            )

            return result
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
                        reviews: z.boolean().optional(),
                        edit_data: z.boolean().optional()
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

            const artist = await ctx.db.artist.findFirst({
                where: {
                    handle: input.handle
                }
            })

            if (!artist) {
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR'
                })
            }

            // Get commission from db
            const commission = await ctx.db.commission.findFirst({
                where: {
                    slug: input.slug,
                    artistId: artist.id
                },
                include: {
                    artist: input.req_data?.artist,
                    form: input.req_data?.form,
                    reviews: input.req_data?.reviews
                        ? {
                              include: {
                                  user: true
                              }
                          }
                        : undefined
                }
            })
            console.log('Commission Data: ' + JSON.stringify(commission))

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
                price: format_to_currency(commission.price),
                availability: commission.availability,
                rating: commission.rating,
                images: images,
                slug: commission.slug,
                published: commission.published,

                max_commissions_until_waitlist: input.req_data?.edit_data
                    ? commission.maxCommissionsUntilWaitlist
                    : undefined,
                max_commissions_until_closed: input.req_data?.edit_data
                    ? commission.maxCommissionsUntilClosed
                    : undefined,
                raw_price: input.req_data?.edit_data ? commission.price : undefined,

                id: commission.id,
                form_id: commission.formId,

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
                'EX',
                3600
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
                        availability: z.number(),
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
                            availability: z.number().optional(),
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
            if (!ctx.session.user.artist_id) {
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'Artist does not exist!'
                })
            }

            ////////////////////////////
            // Update Commission
            ////////////////////////////
            if (input.type === 'update') {
                await ctx.db.commission.update({
                    where: {
                        id: input.commission_id
                    },
                    data: {
                        title: input.data.title,
                        description: input.data.description,
                        price: input.data.price,
                        images: input.data.images,
                        utKeys: input.data.utKeys,
                        availability: input.data.availability,
                        maxCommissionsUntilWaitlist:
                            input.data.max_commissions_until_waitlist,
                        maxCommissionsUntilClosed:
                            input.data.max_commissions_until_closed,
                        published: input.data.published,
                        formId: input.data.form_id
                    }
                })

                // Delete Cache
                await ctx.cache.del(
                    AsRedisKey('commissions', ctx.session.user.artist_id, 'standard')
                )
                await ctx.cache.del(
                    AsRedisKey('commissions', ctx.session.user.artist_id, 'dashboard')
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
            const slugExists = await ctx.db.commission.findFirst({
                where: {
                    slug: slug,
                    artistId: ctx.session.user.artist_id
                }
            })

            if (slugExists) {
                return { success: false, reason: 'Slug already exists!' }
            }

            // Create database object
            await ctx.db.commission.create({
                data: {
                    artistId: ctx.session.user.artist_id!,
                    title: input.data.title,
                    description: input.data.description,
                    price: input.data.price,
                    images: input.data.images,
                    utKeys: input.data.utKeys,
                    availability: input.data.availability,
                    slug: slug,
                    maxCommissionsUntilWaitlist:
                        input.data.max_commissions_until_waitlist,
                    maxCommissionsUntilClosed: input.data.max_commissions_until_closed,
                    published: input.data.published,
                    formId: input.data.form_id,
                    rushCharge: 0,
                    rushOrdersAllowed: false,
                    rushPercentage: false
                }
            })

            // Update Cache
            const commissions = await ctx.db.commission.findMany({
                where: {
                    artistId: ctx.session.user.artist_id
                }
            })

            await ctx.cache.set(
                AsRedisKey('commissions', ctx.session.user.artist_id),
                JSON.stringify(commissions),
                'EX',
                3600
            )

            return { success: true }
        })
})
