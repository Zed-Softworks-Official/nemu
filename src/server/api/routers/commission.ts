import { and, eq } from 'drizzle-orm'
import { createTRPCRouter, publicProcedure, artistProcedure } from '../trpc'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { createId } from '@paralleldrive/cuid2'

import { artists, commissions } from '~/server/db/schema'
import {
    commissionAvalabilities,
    chargeMethods,
    type ClientCommissionItem,
    type ClientCommissionItemEditable,
    type RequestQueue
} from '~/lib/structures'
import { convertImagesToNemuImages, formatToCurrency, getUTUrl } from '~/lib/utils'
import { utapi } from '~/server/uploadthing'
import { updateIndex } from '~/server/algolia/collections'
import { clerkClient } from '@clerk/nextjs/server'
import { getRedisKey } from '~/server/redis'
import { is_supporter } from '~/app/api/stripe/sync'

export const commissionRouter = createTRPCRouter({
    setCommission: artistProcedure
        .input(
            z.object({
                title: z.string(),
                description: z.string(),
                price: z.number(),
                availability: z.enum(commissionAvalabilities),
                images: z.array(
                    z.object({
                        ut_key: z.string()
                    })
                ),
                max_commissions_until_waitlist: z.number(),
                max_commissions_until_closed: z.number(),
                published: z.boolean(),
                form_id: z.string(),
                charge_method: z.enum(chargeMethods),
                downpayment_percentage: z.number().optional()
            })
        )
        .mutation(async ({ ctx, input }) => {
            // Create Slug
            const slug = input.title
                .toLowerCase()
                .replace(/[^a-zA-Z ]/g, '')
                .replaceAll(' ', '-')

            // Check if it already exists for the artist
            const slug_exists = await ctx.db.query.commissions.findFirst({
                where: and(
                    eq(commissions.artist_id, ctx.artist.id),
                    eq(commissions.slug, slug)
                )
            })

            if (slug_exists) {
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: 'Slug already exists'
                })
            }

            // Create database object
            const commission_id = createId()

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
                rating: '5.00',
                charge_method: input.charge_method,
                downpayment_percentage: input.downpayment_percentage
            })

            // Create request queue
            await ctx.redis.json.set(getRedisKey('request_queue', commission_id), '$', {
                requests: [],
                waitlist: []
            } satisfies RequestQueue)
        }),

    updateCommission: artistProcedure
        .input(
            z.object({
                id: z.string(),
                data: z.object({
                    title: z.string().optional(),
                    description: z.string().optional(),
                    price: z.number().optional(),
                    availability: z.enum(commissionAvalabilities).optional(),
                    images: z.array(z.string()).optional(),
                    deleted_images: z.array(z.string()).optional(),
                    max_commissions_until_waitlist: z.number().optional(),
                    max_commissions_until_closed: z.number().optional(),
                    published: z.boolean().optional(),
                    charge_method: z.enum(chargeMethods).optional(),
                    downpayment_percentage: z.number().optional()
                })
            })
        )
        .mutation(async ({ ctx, input }) => {
            // Delete the images from uploadthing
            let deleted_iamges_promise: Promise<{
                readonly success: boolean
                readonly deletedCount: number
            }> | null = null

            if (input.data.deleted_images) {
                deleted_iamges_promise = utapi.deleteFiles(input.data.deleted_images)
            }

            // Update the database with the relavent information that has been changed
            const updated_data = {
                title: input.data.title,
                description: input.data.description,
                price: input.data.price,
                availability: input.data.availability,
                max_commissions_until_waitlist: input.data.max_commissions_until_waitlist,
                max_commissions_until_closed: input.data.max_commissions_until_closed,
                images: input.data.images?.map((image) => ({
                    ut_key: image
                })),
                published: input.data.published,
                charge_method: input.data.charge_method,
                downpayment_percentage: input.data.downpayment_percentage
            }

            const updated_commission_promise = ctx.db
                .update(commissions)
                .set(updated_data)
                .where(eq(commissions.id, input.id))

            // Wait for all promises to resolve
            await Promise.all([deleted_iamges_promise, updated_commission_promise])

            // Update algolia
            await updateIndex('commissions', {
                objectID: input.id,
                title: updated_data.title,
                price: updated_data.price
                    ? formatToCurrency(updated_data.price / 100)
                    : undefined,
                description: updated_data.description!,
                featured_image: getUTUrl(updated_data.images![0]!.ut_key),
                artist_handle: ctx.artist.handle,
                published: updated_data.published
            })
        }),

    getCommission: publicProcedure
        .input(
            z.object({
                handle: z.string(),
                slug: z.string()
            })
        )
        .query(async ({ input, ctx }) => {
            const clerk_client = await clerkClient()
            const data = await ctx.db.query.artists.findFirst({
                where: eq(artists.handle, input.handle),
                with: {
                    commissions: {
                        where: eq(commissions.slug, input.slug),
                        with: {
                            requests: true,
                            form: true
                        }
                    }
                }
            })

            if (!data?.commissions[0]) {
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'Artist or Commission not found'
                })
            }

            const supporter = await is_supporter(data.user_id)

            // Format images for client
            const images = await convertImagesToNemuImages(data.commissions[0].images)
            const result: ClientCommissionItem = {
                title: data.commissions[0].title,
                description: data.commissions[0].description,
                price: formatToCurrency(Number(data.commissions[0].price / 100)),
                availability: data.commissions[0].availability,
                rating: Number(data.commissions[0].rating),
                images: images,
                slug: data.commissions[0].slug,
                published: data.commissions[0].published,

                charge_method: data.commissions[0].charge_method,
                downpayment_percentage: data.commissions[0].downpayment_percentage,

                id: data.commissions[0].id,
                form_id: data.commissions[0].form_id,

                artist: {
                    handle: data.handle,
                    supporter,
                    terms: data.terms
                },
                requests: await Promise.all(
                    data.commissions[0].requests.map(async (request) => {
                        const user = await clerk_client.users.getUser(request.user_id)
                        return {
                            ...request,
                            user: {
                                id: request.user_id,
                                username: user.username ?? 'Unknown User'
                            }
                        }
                    })
                ),
                form: data.commissions[0].form
            }

            return result
        }),

    getCommissionForEditing: artistProcedure
        .input(
            z.object({
                slug: z.string()
            })
        )
        .query(async ({ ctx, input }) => {
            const commission = await ctx.db.query.commissions.findFirst({
                where: and(
                    eq(commissions.slug, input.slug),
                    eq(commissions.artist_id, ctx.artist.id)
                ),
                with: {
                    form: true
                }
            })

            if (!commission) {
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'Commission not found'
                })
            }

            const result: ClientCommissionItemEditable = {
                id: commission.id,
                title: commission.title,
                description: commission.description,
                price: (commission.price / 100).toFixed(2),

                form_name: commission.form.name,

                availability: commission.availability,
                slug: commission.slug,
                published: commission.published,

                images: commission.images.map((image) => ({
                    id: createId(),
                    data: {
                        action: 'update',
                        image_data: {
                            url: getUTUrl(image.ut_key ?? ''),
                            ut_key: image.ut_key
                        }
                    }
                })),

                charge_method: commission.charge_method,
                downpayment_percentage: commission.downpayment_percentage,

                max_commissions_until_closed: commission.max_commissions_until_closed,
                max_commissions_until_waitlist: commission.max_commissions_until_waitlist
            }

            return result
        }),

    getCommissionList: artistProcedure.query(async ({ ctx }) => {
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

        const supporter = await is_supporter(artist.user_id)

        const result: ClientCommissionItem[] = []
        for (const commission of artist.commissions) {
            result.push({
                title: commission.title,
                description: commission.description,
                price: formatToCurrency(Number(commission.price / 100)),
                availability: commission.availability,
                rating: Number(commission.rating),
                published: commission.published,
                images: [
                    {
                        url: getUTUrl(commission.images[0]!.ut_key)
                    }
                ],
                slug: commission.slug,
                total_requests: commission.total_requests,
                new_requests: commission.new_requests,
                artist: {
                    handle: artist.handle ?? 'Nemu Jr',
                    supporter
                },
                charge_method: commission.charge_method,
                downpayment_percentage: commission.downpayment_percentage
            })
        }

        return result
    })
})
