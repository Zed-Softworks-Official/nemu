import { z } from 'zod'
import { TRPCError } from '@trpc/server'

import {
    ClientCommissionItem,
    ClientCommissionItemEditable,
    ClientRequestData,
    CommissionAvailability,
    NemuImageData
} from '~/core/structures'
import { artistProcedure, createTRPCRouter, publicProcedure } from '~/server/api/trpc'
import { AsRedisKey, cache } from '~/server/cache'
import {
    convert_images_to_nemu_images,
    format_for_image_editor
} from '~/lib/server-utils'
import { get_blur_data } from '~/lib/blur_data'
import { format_to_currency } from '~/lib/utils'
import { artists, commissions } from '~/server/db/schema'

import { and, eq } from 'drizzle-orm'
import { createId } from '@paralleldrive/cuid2'
import { utapi } from '~/server/uploadthing'
import { clerkClient } from '@clerk/nextjs/server'
import { set_index, update_index } from '~/core/search'

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
                include_stats: z.boolean().optional()
            })
        )
        .query(async ({ input, ctx }) => {
            const cachedCommissions = await cache.json.get(
                AsRedisKey('commissions', input.artist_id)
            )

            if (cachedCommissions) {
                return cachedCommissions as ClientCommissionItem[]
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
                if (!commission.published) {
                    continue
                }

                result.push({
                    title: commission.title,
                    description: commission.description,
                    price: format_to_currency(Number(commission.price)),
                    availability: commission.availability as CommissionAvailability,
                    rating: Number(commission.rating),
                    published: commission.published,
                    images: [
                        {
                            url: commission.images[0]?.url!,
                            blur_data: await get_blur_data(commission.images[0]?.url!)
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

            await cache.json.set(AsRedisKey('commissions', input.artist_id), '$', result)

            return result
        }),

    /**
     * Gets a single commission given a commission slug
     */
    get_commission: publicProcedure
        .input(
            z.object({
                slug: z.string(),
                handle: z.string()
            })
        )
        .query(async ({ input, ctx }) => {
            // Check if we have the commission already cached
            const cachedCommission = await cache.json.get(
                AsRedisKey('commissions', input.handle, input.slug)
            )

            if (cachedCommission) {
                return cachedCommission as ClientCommissionItem
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
                    artist: true,
                    reviews: true
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
                availability: commission.availability as CommissionAvailability,
                rating: Number(commission.rating),
                images: images,
                slug: commission.slug,
                published: commission.published,

                id: commission.id,
                form_id: commission.form_id,

                artist: {
                    handle: commission.artist.handle,
                    supporter: commission.artist.supporter,
                    terms: commission.artist.terms
                }
            }

            await cache.json.set(
                AsRedisKey('commissions', input.handle, input.slug),
                '$',
                result
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
                        images: z.array(
                            z.object({
                                url: z.string(),
                                ut_key: z.string()
                            })
                        ),
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
                            images: z
                                .array(
                                    z.object({
                                        action: z
                                            .literal('create')
                                            .or(z.literal('update'))
                                            .or(z.literal('delete')),
                                        url: z.string(),
                                        ut_key: z.string()
                                    })
                                )
                                .optional(),
                            deleted_images: z
                                .array(
                                    z.object({
                                        action: z
                                            .literal('create')
                                            .or(z.literal('update'))
                                            .or(z.literal('delete')),
                                        url: z.string(),
                                        ut_key: z.string()
                                    })
                                )
                                .optional(),
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
                // Delete the images from uploadthing
                if (input.data.deleted_images) {
                    await utapi.deleteFiles(
                        input.data.deleted_images?.map((image) => image.ut_key)
                    )
                }

                // Update the database with the relavent information that has been updated
                const commission_udpated = (
                    await ctx.db
                        .update(commissions)
                        .set({
                            title: input.data.title,
                            description: input.data.description,
                            price: input.data.price,
                            images: input.data.images?.map((image) => ({
                                url: image.url,
                                ut_key: image.ut_key
                            })),
                            availability: input.data
                                .availability as CommissionAvailability,
                            max_commissions_until_waitlist:
                                input.data.max_commissions_until_waitlist,
                            max_commissions_until_closed:
                                input.data.max_commissions_until_closed,
                            published: input.data.published,
                            form_id: input.data.form_id
                        })
                        .where(eq(commissions.id, input.commission_id))
                        .returning()
                )[0]!

                // Update Algolia
                await update_index('commissions', {
                    objectID: commission_udpated.id,
                    title: commission_udpated.title,
                    price: format_to_currency(commission_udpated.price),
                    description: commission_udpated.description,
                    featured_image: commission_udpated.images[0]?.url!,
                    slug: commission_udpated.slug,
                    artist_handle: ctx.user.publicMetadata.handle as string,
                    published: commission_udpated.published
                })

                // Delete Cache
                // await ctx.cache.del(
                //     AsRedisKey(
                //         'commissions',
                //         ctx.user.privateMetadata.artist_id as string,
                //         'standard'
                //     )
                // )
                // await ctx.cache.del(
                //     AsRedisKey(
                //         'commissions',
                //         ctx.user.privateMetadata.artist_id as string,
                //         'dashboard'
                //     )
                // )

                return { success: true, updated: true }
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
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'Slug already exists!'
                })
            }

            // Create database object
            const commission = (
                await ctx.db
                    .insert(commissions)
                    .values({
                        id: createId(),
                        artist_id: ctx.user.privateMetadata.artist_id as string,
                        title: input.data.title,
                        description: input.data.description,
                        price: input.data.price,
                        images: input.data.images,
                        availability: input.data.availability as CommissionAvailability,
                        slug: slug,
                        max_commissions_until_waitlist:
                            input.data.max_commissions_until_waitlist,
                        max_commissions_until_closed:
                            input.data.max_commissions_until_closed,
                        published: input.data.published,
                        form_id: input.data.form_id,
                        rating: '5.00'
                        // rush_charge: 0,
                        // rush_orders_allowed: false,
                        // rush_percentage: false
                    })
                    .returning()
            )[0]!

            // Update Algolia
            await set_index('commissions', {
                objectID: commission.id,
                title: commission.title,
                price: format_to_currency(commission.price),
                description: commission.description,
                featured_image: commission.images[0]?.url!,
                slug: commission.slug,
                artist_handle: ctx.user.publicMetadata.handle as string,
                published: commission.published
            })

            // await ctx.cache.set(
            //     AsRedisKey('commissions', ctx.user.privateMetadata.artist_id as string),
            //     JSON.stringify(db_commissions),
            //     {
            //         EX: 3600
            //     }
            // )

            return { success: true }
        })
})
