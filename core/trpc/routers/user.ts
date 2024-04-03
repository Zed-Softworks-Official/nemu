import { z } from 'zod'
import {
    adminProcedure,
    artistProcedure,
    createTRPCRouter,
    protectedProcedure
} from '../trpc'
import { redis } from '@/lib/redis'
import { Commission, Product, StripeCustomerIds } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { AWSLocations, DownloadData } from '@/core/structures'
import { S3GetSignedURL } from '@/core/storage'
import { AsRedisKey } from '@/core/helpers'
import { novu } from '@/lib/novu'
import { TRPCError } from '@trpc/server'

export const userRouter = createTRPCRouter({
    /**
     * Gets the stripe customer id and stripe customer data
     */
    get_customer_id: protectedProcedure.input(z.string()).query(async (opts) => {
        const { input, ctx } = opts

        const cachedCustomerId = await redis.get(
            AsRedisKey('stripe_accounts', input, ctx.session.user.user_id!)
        )

        if (cachedCustomerId) {
            return JSON.parse(cachedCustomerId) as StripeCustomerIds
        }

        const stripeAccountId = await prisma.stripeCustomerIds.findFirst({
            where: {
                artistId: input,
                userId: ctx.session.user.user_id!
            }
        })

        if (!stripeAccountId) {
            return undefined
        }

        await redis.set(
            AsRedisKey('stripe_accounts', input, ctx.session.user.user_id!),
            JSON.stringify(stripeAccountId),
            'EX',
            3600
        )

        return stripeAccountId
    }),
    /**
     * Gets all downloads associated with the user
     */
    get_downloads: protectedProcedure.query(async (opts) => {
        const { ctx } = opts
        const user_id = ctx.session.user.user_id!

        const cachedDownloads = await redis.get(AsRedisKey('downloads', user_id))

        if (cachedDownloads) {
            return JSON.parse(cachedDownloads) as DownloadData[]
        }

        const downloads = await prisma.downloads.findMany({
            where: {
                userId: user_id
            }
        })

        if (!downloads) {
            return undefined
        }

        const result: DownloadData[] = []
        for (const download of downloads) {
            const artist = await prisma.artist.findFirst({
                where: {
                    id: download.artistId
                }
            })

            if (!artist) {
                return result
            }

            let item: Commission | Product | undefined | null
            if (download.commissionId) {
                item = await prisma.commission.findFirst({
                    where: {
                        id: download.commissionId
                    }
                })
            } else if (download.productId) {
                item = await prisma.product.findFirst({
                    where: {
                        id: download.productId
                    }
                })
            }

            if (!item) {
                return undefined
            }

            result.push({
                download_url: await S3GetSignedURL(
                    artist.id,
                    AWSLocations.Downloads,
                    download.fileKey
                ),
                receipt_url: download.receiptURL || undefined,
                created_at: download.createdAt,
                artist_handle: artist.handle
            })
        }

        await redis.set(
            AsRedisKey('downloads', user_id),
            JSON.stringify(result),
            'EX',
            3600
        )

        return result
    }),
    /**
     * Update the users username
     */
    set_username: protectedProcedure.input(z.string()).mutation(async (opts) => {
        const { input, ctx } = opts

        // Check if username already exists
        const username = await prisma.user.findFirst({
            where: {
                name: input
            }
        })

        if (username) {
            return new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '' })
        }

        // Update the username
        const response = await prisma.user.update({
            where: {
                id: ctx.session.user.user_id
            },
            data: {
                name: input
            }
        })

        if (!response) {
            return { success: false }
        }

        return { success: true }
    }),
    /**
     * Updates a users role
     */
    set_role: adminProcedure
        .input(
            z.object({
                user_id: z.string(),
                role: z.number()
            })
        )
        .mutation(async (opts) => {
            const { input } = opts

            const updated_user = await prisma.user.update({
                where: {
                    id: input.user_id
                },
                data: {
                    role: input.role
                }
            })

            if (!updated_user) {
                return { success: false }
            }

            return { success: true }
        }),
    /**
     * Creates a new download for a given user
     */
    set_download: artistProcedure
        .input(
            z.object({
                user_id: z.string(),
                file_key: z.string(),
                receipt_url: z.string(),

                artist_id: z.string(),
                product_id: z.string().optional(),
                commission_id: z.string().optional(),
                form_submission_id: z.string().optional()
            })
        )
        .mutation(async (opts) => {
            const { input } = opts

            const new_download = await prisma.downloads.create({
                data: {
                    userId: input.user_id!,
                    fileKey: input.file_key!,
                    receiptURL: input.receipt_url,

                    artistId: input.artist_id!,
                    productId: input.product_id,
                    commissionId: input.commission_id,
                    formSubmissionId: input.form_submission_id
                }
            })

            if (!new_download) {
                return { success: false }
            }

            // Notify User
            const commission = await prisma.commission.findFirst({
                where: {
                    id: input.commission_id!
                },
                include: {
                    artist: true
                }
            })

            novu.trigger('downloads-available', {
                to: {
                    subscriberId: input.user_id!
                },
                payload: {
                    item_name: commission?.title,
                    artist_handle: commission?.artist.handle
                }
            })

            return { success: true }
        }),

    /**
     * Gets all of the submissions for the user
     */
    get_submissions: protectedProcedure.query(async (opts) => {
        const { ctx } = opts

        const submissions = await prisma.formSubmission.findMany({
            where: {
                userId: ctx.session.user.user_id
            },
            include: {
                form: {
                    include: {
                        commission: {
                            include: {
                                artist: true
                            }
                        }
                    }
                }
            }
        })

        if (!submissions) {
            return []
        }

        return submissions
    })
})
