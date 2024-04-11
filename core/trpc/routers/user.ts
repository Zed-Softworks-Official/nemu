import { z } from 'zod'
import {
    adminProcedure,
    artistProcedure,
    createTRPCRouter,
    protectedProcedure
} from '../trpc'
import { redis } from '@/lib/redis'
import { Artist, Commission, Product, StripeCustomerIds, User } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { AWSLocations, DownloadData, Role } from '@/core/structures'
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
            AsRedisKey('stripe_accounts', input, ctx.session.user.id!)
        )

        if (cachedCustomerId) {
            return JSON.parse(cachedCustomerId) as StripeCustomerIds
        }

        const stripeAccountId = await prisma.stripeCustomerIds.findFirst({
            where: {
                artistId: input,
                userId: ctx.session.user.id!
            }
        })

        if (!stripeAccountId) {
            return undefined
        }

        await redis.set(
            AsRedisKey('stripe_accounts', input, ctx.session.user.id!),
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
        const user_id = ctx.session.user.id!

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

        // Update the username
        const username_set = await prisma.user.update({
            where: {
                id: ctx.session.user.id
            },
            data: {
                name: input
            }
        })

        if (!username_set) {
            throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Could not set username!'
            })
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
                request_id: z.string().optional()
            })
        )
        .mutation(async (opts) => {
            const { input, ctx } = opts

            const new_download = await prisma.downloads.create({
                data: {
                    userId: input.user_id,
                    fileKey: input.file_key,
                    receiptURL: input.receipt_url,

                    artistId: ctx.session.user.artist_id!,
                    productId: input.product_id,
                    commissionId: input.commission_id,
                    requestId: input.request_id
                }
            })

            if (!new_download) {
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'Could not create new download for user!'
                })
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
    get_requests: protectedProcedure.query(async (opts) => {
        const { ctx } = opts

        const requests = await prisma.request.findMany({
            where: {
                userId: ctx.session.user.id
            },
            orderBy: {
                createdAt: 'desc'
            },
            include: {
                form: true,
                commission: {
                    include: {
                        artist: true
                    }
                }
            }
        })

        if (!requests) {
            return []
        }

        for (const request of requests) {
            request.commission.featuredImage = await S3GetSignedURL(
                request.commission.artistId,
                AWSLocations.Commission,
                request.commission.featuredImage
            )
        }

        return requests
    }),

    /**
     * Gets the currently logged in user
     */
    get_user: protectedProcedure.query(async (opts) => {
        const { ctx } = opts

        const cachedUser = await redis.get(AsRedisKey('users', ctx.session.user.id))

        if (cachedUser) {
            return JSON.parse(cachedUser) as
                | { user: User; artist: Artist | undefined }
                | undefined
        }

        const user = await prisma.user.findFirst({
            where: {
                id: ctx.session.user.id
            }
        })

        if (!user) {
            throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Could not find user'
            })
        }

        // Get Signed Url for profile photo
        let profile_photo: string | null = null
        if (user.image) {
            if (!user.image.includes('https')) {
                profile_photo = await S3GetSignedURL(
                    ctx.session.user.id,
                    AWSLocations.Profile,
                    user.image
                )
            } else {
                profile_photo = user.image
            }
        }

        user.image = profile_photo

        if (ctx.session.user.role !== Role.Artist) {
            await redis.set(
                AsRedisKey('users', ctx.session.user.id!),
                JSON.stringify({ user: user }),
                'EX',
                3600
            )

            return {
                user,
                artist: undefined
            }
        }

        const artist = await prisma.artist.findFirst({
            where: {
                userId: ctx.session.user.id
            }
        })

        if (!artist) {
            throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Could not find artist with that userId'
            })
        }

        await redis.set(
            AsRedisKey('users', ctx.session.user.id),
            JSON.stringify({ user, artist }),
            'EX',
            3600
        )

        return { user, artist }
    }),

    /**
     * Updates a users profile image
     */
    set_profile_photo: protectedProcedure.input(z.string()).mutation(async (opts) => {
        const { input, ctx } = opts

        // Update Database
        const updated_user = await prisma.user.update({
            where: {
                id: ctx.session.user.id
            },
            data: {
                image: input
            }
        })

        if (!updated_user) {
            throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Could not update user'
            })
        }

        await redis.del(AsRedisKey('users', ctx.session.user.id))

        return { success: true }
    }),

    /**
     * Updates a users information
     */
    update_user: protectedProcedure
        .input(
            z.object({
                username: z.string().optional(),
                email: z.string().email().optional()
            })
        )
        .mutation(async (opts) => {
            const { input, ctx } = opts

            const updated_user = await prisma.user.update({
                where: {
                    id: ctx.session.user.id
                },
                data: {
                    name: input.username,
                    email: input.email
                }
            })

            if (!updated_user) {
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'Unable to update user account!'
                })
            }

            await redis.del(AsRedisKey('users', ctx.session.user.id!))

            return { success: true }
        })
})
