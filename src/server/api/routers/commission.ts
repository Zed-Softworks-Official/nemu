import { and, eq } from 'drizzle-orm'
import { createTRPCRouter, publicProcedure, artistProcedure } from '../trpc'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { createId } from '@paralleldrive/cuid2'
import type { JSONContent } from '@tiptap/react'

import { artists, commissions } from '~/server/db/schema'
import {
    commissionAvalabilities,
    chargeMethods,
    type RequestQueue,
    type CommissionEditIndex
} from '~/lib/types'
import { convertImagesToNemuImages, formatToCurrency, getUTUrl } from '~/lib/utils'
import { utapi } from '~/server/uploadthing'
import { delIndex, setIndex, updateIndex } from '~/server/algolia/collections'
import { clerkClient } from '@clerk/nextjs/server'
import { getRedisKey } from '~/server/redis'
import { isSupporter } from '~/app/api/stripe/sync'

const commissionSchema = z.object({
    title: z.string(),
    description: z.any(),
    price: z.number(),
    commissionAvailability: z.enum(commissionAvalabilities),
    images: z.array(z.string()),
    maxCommissionsUntilWaitlist: z.number().min(0),
    maxCommissionsUntilClosed: z.number().min(0),
    published: z.boolean(),
    formId: z.string(),
    chargeMethod: z.enum(chargeMethods),
    downpaymentPercentage: z.number().optional()
})

export const commissionRouter = createTRPCRouter({
    setCommission: artistProcedure
        .input(commissionSchema)
        .mutation(async ({ ctx, input }) => {
            const id = createId()
            const description = input.description as JSONContent

            const slug = input.title
                .toLowerCase()
                .replace(/[^a-zA-Z ]/g, '')
                .replaceAll(' ', '-')

            const existingSlug = await ctx.db.query.commissions.findFirst({
                where: and(
                    eq(commissions.artistId, ctx.artist.id),
                    eq(commissions.slug, slug)
                )
            })

            if (existingSlug) {
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: 'Slug already exists'
                })
            }

            try {
                // Step 1: Insert into database first
                await ctx.db.insert(commissions).values({
                    id,
                    ...input,
                    description,
                    slug,
                    images: input.images.map((image) => ({
                        utKey: image
                    })),
                    artistId: ctx.artist.id,
                    availability: input.commissionAvailability
                })

                // Step 2: Set up Redis request queue
                await ctx.redis.json.set(getRedisKey('request_queue', id), '$', {
                    requests: [],
                    waitlist: []
                } satisfies RequestQueue)

                const featuredImageKey = input.images[0]
                if (!featuredImageKey) {
                    throw new TRPCError({
                        code: 'BAD_REQUEST',
                        message: 'HOW???'
                    })
                }

                // Step 3: Update search index
                await setIndex('commissions', {
                    objectID: id,
                    artistHandle: ctx.artist.handle,
                    title: input.title,
                    price: formatToCurrency(input.price / 100),
                    featuredImage: getUTUrl(featuredImageKey),
                    published: false,
                    slug
                })

                // Step 4: Remove images from Redis
                await ctx.redis.zrem('commission:images', ...input.images)

                return { id, slug }
            } catch (error) {
                // Attempt to clean up if any step fails
                try {
                    // Try to delete from database if it was created
                    await ctx.db.delete(commissions).where(eq(commissions.id, id))

                    // Try to delete from Redis if it was created
                    await ctx.redis.del(getRedisKey('request_queue', id))

                    // Try to delete from search index if it was created
                    await delIndex('commissions', id)
                } catch (cleanupError) {
                    console.error('Error during cleanup:', cleanupError)
                }

                throw error
            }
        }),

    updateCommission: artistProcedure
        .input(commissionSchema.merge(z.object({ id: z.string() })))
        .mutation(async ({ ctx, input }) => {
            // Step 1: Fetch the current commission state for comparison and potential rollback
            const commission = await ctx.db.query.commissions.findFirst({
                where: eq(commissions.id, input.id)
            })

            if (!commission) {
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'Commission not found'
                })
            }

            const originalCommission = { ...commission }

            // Identify files to delete
            const itemsToDelete = commission.images.filter((image) => {
                return !input.images.find((value) => value === image.utKey)
            })

            const changes = {
                filesDeleted: false,
                dbUpdated: false,
                redisUpdated: false,
                algoliaUpdated: false
            }

            try {
                // Step 2: Delete files from uploadthing
                if (itemsToDelete.length > 0) {
                    await utapi.deleteFiles(itemsToDelete.map((image) => image.utKey))
                    changes.filesDeleted = true
                }

                // Step 3: Update database
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                const { id, ...items } = input
                await ctx.db
                    .update(commissions)
                    .set({
                        ...items,
                        description: input.description as JSONContent,
                        images: input.images.map((image) => ({
                            utKey: image
                        }))
                    })
                    .where(eq(commissions.id, input.id))
                changes.dbUpdated = true

                // Step 4: Update search index
                await updateIndex('commissions', {
                    objectID: input.id,
                    ...items,
                    price: input.price ? formatToCurrency(input.price / 100) : undefined,
                    featuredImage: input.images[0] ? getUTUrl(input.images[0]) : undefined
                } satisfies CommissionEditIndex)
                changes.algoliaUpdated = true

                // Step 5: Update Redis
                await ctx.redis.zrem(
                    getRedisKey('commission:images', ctx.artist.id),
                    ...itemsToDelete.map((item) => item.utKey)
                )
                changes.redisUpdated = true

                return { success: true, id: input.id }
            } catch (error) {
                // Step 6: Handle failures with rollback
                try {
                    console.error('Update failed, attempting rollback:', error)

                    // Rollback database if it was updated
                    if (changes.dbUpdated) {
                        await ctx.db
                            .update(commissions)
                            .set({
                                title: originalCommission.title,
                                description: originalCommission.description,
                                price: originalCommission.price,
                                images: originalCommission.images,
                                availability: originalCommission.availability,
                                chargeMethod: originalCommission.chargeMethod,
                                downpaymentPercentage:
                                    originalCommission.downpaymentPercentage,
                                published: originalCommission.published
                            })
                            .where(eq(commissions.id, input.id))
                    }

                    // Rollback Algolia if it was updated
                    if (changes.algoliaUpdated) {
                        await updateIndex('commissions', {
                            objectID: input.id,
                            title: originalCommission.title,
                            price: formatToCurrency(
                                Number(originalCommission.price) / 100
                            ),
                            featuredImage: originalCommission.images[0]
                                ? getUTUrl(originalCommission.images[0].utKey)
                                : undefined,
                            published: originalCommission.published
                        })
                    }

                    // Note: We can't rollback deleted files from uploadthing
                    // But we can restore Redis references if needed
                    if (changes.redisUpdated && itemsToDelete.length > 0) {
                        // Re-add the deleted image keys to Redis if possible
                        for (const item of itemsToDelete) {
                            await ctx.redis.zadd('commission:images', {
                                member: item.utKey,
                                score: Math.floor((Date.now() + 3600000) / 1000)
                            })
                        }
                    }

                    console.error('Rollback completed with best effort')
                } catch (rollbackError) {
                    console.error('Rollback failed:', rollbackError)
                }

                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'Failed to update commission. Changes have been rolled back.'
                })
            }
        }),

    publishCommission: artistProcedure
        .input(z.object({ id: z.string(), published: z.boolean() }))
        .mutation(async ({ ctx, input }) => {
            await ctx.db
                .update(commissions)
                .set({
                    published: input.published
                })
                .where(eq(commissions.id, input.id))

            await updateIndex('commissions', {
                objectID: input.id,
                published: input.published
            })
        }),

    getCommission: publicProcedure
        .input(
            z
                .object({
                    handle: z.string(),
                    slug: z.string().optional(),
                    id: z.string().optional()
                })
                .refine((data) => (data.slug !== undefined) !== (data.id !== undefined), {
                    message: 'Either slug or id must be provided, but not both'
                })
        )
        .query(async ({ input, ctx }) => {
            const clerk = await clerkClient()
            const commission = await ctx.db.query.commissions.findFirst({
                where: input.slug
                    ? eq(commissions.slug, input.slug)
                    : eq(commissions.id, input.id!),
                with: {
                    artist: true,
                    requests: true,
                    form: true
                }
            })

            if (!commission) {
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'Artist or Commission not found'
                })
            }

            const supporter = await isSupporter(commission.artist.userId)

            // Format images for client
            const images = await convertImagesToNemuImages(commission.images)

            return {
                title: commission.title,
                description: commission.description,
                price: formatToCurrency(Number(commission.price / 100)),
                availability: commission.availability,
                rating: Number(commission.rating),
                images: images,
                slug: commission.slug,
                published: commission.published,

                chargeMethod: commission.chargeMethod,
                downpaymentPercentage: commission.downpaymentPercentage,

                id: commission.id,
                formId: commission.formId,

                artist: {
                    handle: commission.artist.handle,
                    supporter,
                    terms: commission.artist.terms
                },
                requests: await Promise.all(
                    commission.requests.map(async (request) => {
                        const user = await clerk.users.getUser(request.userId)
                        return {
                            ...request,
                            user: {
                                id: request.userId,
                                username: user.username ?? 'Unknown User'
                            }
                        }
                    })
                ),
                form: commission.form
            }
        }),

    getCommissionByIdDashboard: artistProcedure
        .input(z.object({ id: z.string() }))
        .query(async ({ ctx, input }) => {
            const commission = await ctx.db.query.commissions.findFirst({
                where: eq(commissions.id, input.id)
            })

            if (!commission) {
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'Could not find commission'
                })
            }

            return {
                ...commission,
                images: commission.images.map((image) => ({
                    url: getUTUrl(image.utKey),
                    utKey: image.utKey
                }))
            }
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

        const supporter = await isSupporter(artist.userId)

        const result = []
        for (const commission of artist.commissions) {
            result.push({
                id: commission.id,
                title: commission.title,
                description: commission.description,
                price: formatToCurrency(Number(commission.price / 100)),
                availability: commission.availability,
                rating: Number(commission.rating),
                published: commission.published,
                images: [
                    {
                        url: getUTUrl(commission.images[0]?.utKey ?? '')
                    }
                ],
                slug: commission.slug,
                totalRequests: commission.totalRequests,
                newRequests: commission.newRequests,
                artist: {
                    handle: artist.handle ?? 'Nemu Jr',
                    supporter
                },
                chargeMethod: commission.chargeMethod,
                downpaymentPercentage: commission.downpaymentPercentage
            })
        }

        return result
    })
})
