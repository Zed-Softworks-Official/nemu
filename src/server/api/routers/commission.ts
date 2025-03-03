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
} from '~/lib/types'
import { convertImagesToNemuImages, formatToCurrency, getUTUrl } from '~/lib/utils'
import { utapi } from '~/server/uploadthing'
import { updateIndex } from '~/server/algolia/collections'
import { clerkClient } from '@clerk/nextjs/server'
import { getRedisKey } from '~/server/redis'
import { isSupporter } from '~/app/api/stripe/sync'

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
                        utKey: z.string()
                    })
                ),
                maxCommissionsUntilWaitlist: z.number().min(0),
                maxCommissionsUntilClosed: z.number().min(0),
                published: z.boolean(),
                formId: z.string(),
                chargeMethod: z.enum(chargeMethods),
                downpaymentPercentage: z.number().optional()
            })
        )
        .mutation(async ({ ctx, input }) => {
            // Create Slug
            const slug = input.title
                .toLowerCase()
                .replace(/[^a-zA-Z ]/g, '')
                .replaceAll(' ', '-')

            // Check if it already exists for the artist
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

            // Create database object
            const commission_id = createId()

            await ctx.db.insert(commissions).values({
                id: commission_id,
                artistId: ctx.artist.id,
                title: input.title,
                description: input.description,
                price: input.price,
                images: input.images,
                availability: input.availability,
                slug: slug,
                maxCommissionsUntilWaitlist: input.maxCommissionsUntilWaitlist,
                maxCommissionsUntilClosed: input.maxCommissionsUntilClosed,
                published: input.published ?? false,
                formId: input.formId,
                rating: '5.00',
                chargeMethod: input.chargeMethod,
                downpaymentPercentage: input.downpaymentPercentage
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
                    deletedImages: z.array(z.string()).optional(),
                    maxCommissionsUntilWaitlist: z.number().optional(),
                    maxCommissionsUntilClosed: z.number().optional(),
                    published: z.boolean().optional(),
                    chargeMethod: z.enum(chargeMethods).optional(),
                    downpaymentPercentage: z.number().optional()
                })
            })
        )
        .mutation(async ({ ctx, input }) => {
            // Delete the images from uploadthing
            let deletedImagesPromise: Promise<{
                readonly success: boolean
                readonly deletedCount: number
            }> | null = null

            if (input.data.deletedImages) {
                deletedImagesPromise = utapi.deleteFiles(input.data.deletedImages)
            }

            // Update the database with the relavent information that has been changed
            const updatedData = {
                title: input.data.title,
                description: input.data.description,
                price: input.data.price,
                availability: input.data.availability,
                maxCommissionsUntilWaitlist: input.data.maxCommissionsUntilWaitlist,
                maxCommissionsUntilClosed: input.data.maxCommissionsUntilClosed,
                images: input.data.images?.map((image) => ({
                    utKey: image
                })),
                published: input.data.published,
                chargeMethod: input.data.chargeMethod,
                downpaymentPercentage: input.data.downpaymentPercentage
            }

            const updatedCommissionPromise = ctx.db
                .update(commissions)
                .set(updatedData)
                .where(eq(commissions.id, input.id))

            // Wait for all promises to resolve
            await Promise.all([deletedImagesPromise, updatedCommissionPromise])

            // Update algolia
            await updateIndex('commissions', {
                objectID: input.id,
                title: updatedData.title,
                price: updatedData.price
                    ? formatToCurrency(updatedData.price / 100)
                    : undefined,
                description: updatedData.description,
                featuredImage: getUTUrl(updatedData.images?.[0]?.utKey ?? ''),
                artistHandle: ctx.artist.handle,
                published: updatedData.published
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
            const clerk = await clerkClient()
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

            const supporter = await isSupporter(data.userId)

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

                chargeMethod: data.commissions[0].chargeMethod,
                downpaymentPercentage: data.commissions[0].downpaymentPercentage,

                id: data.commissions[0].id,
                formId: data.commissions[0].formId,

                artist: {
                    handle: data.handle,
                    supporter,
                    terms: data.terms
                },
                requests: await Promise.all(
                    data.commissions[0].requests.map(async (request) => {
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
                    eq(commissions.artistId, ctx.artist.id)
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

                formName: commission.form.name,

                availability: commission.availability,
                slug: commission.slug,
                published: commission.published,

                images: commission.images.map((image) => ({
                    id: createId(),
                    data: {
                        action: 'update',
                        imageData: {
                            url: getUTUrl(image.utKey),
                            utKey: image.utKey
                        }
                    }
                })),

                chargeMethod: commission.chargeMethod,
                downpaymentPercentage: commission.downpaymentPercentage,

                maxCommissionsUntilClosed: commission.maxCommissionsUntilClosed,
                maxCommissionsUntilWaitlist: commission.maxCommissionsUntilWaitlist
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

        const supporter = await isSupporter(artist.userId)

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
