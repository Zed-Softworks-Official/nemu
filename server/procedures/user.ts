import { z } from 'zod'
import { protectedProcedure, publicProcedure } from '../trpc'
import { redis } from '@/lib/redis'
import { Commission, Product, StripeCustomerIds } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { AWSLocations, DownloadData } from '@/core/structures'
import { S3GetSignedURL } from '@/core/storage'
import { Role } from '@/core/structures'


/**
 * Gets the stripe customer id and stripe customer data
 */
export const get_customer_id = publicProcedure
    .input(
        z.object({
            user_id: z.string(),
            artist_id: z.string()
        })
    )
    .query(async (opts) => {
        const { input } = opts

        const cachedCustomerId = await redis.get(
            `${input.artist_id}_${input.user_id}_stripe_accounts`
        )

        if (cachedCustomerId) {
            return JSON.parse(cachedCustomerId) as StripeCustomerIds
        }

        const stripeAccountId = await prisma.stripeCustomerIds.findFirst({
            where: {
                artistId: input.artist_id,
                userId: input.user_id
            }
        })

        if (!stripeAccountId) {
            return undefined
        }

        await redis.set(
            `${input.artist_id}_${input.user_id}_stripe_accounts`,
            JSON.stringify(stripeAccountId),
            'EX',
            3600
        )

        return stripeAccountId
    })

/**
 * Gets all downloads associated with the user
 */
export const get_downloads = publicProcedure.input(z.string()).query(async (opts) => {
    const { input } = opts

    const cachedDownloads = await redis.get(`${input}_downloads`)

    if (cachedDownloads) {
        return JSON.parse(cachedDownloads) as DownloadData[]
    }

    const downloads = await prisma.downloads.findMany({
        where: {
            userId: input
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

    await redis.set(`${input}_downloads`, JSON.stringify(result), 'EX', 3600)

    return result
})

/**
 * Update the users username
 */
export const update_username = protectedProcedure
    .input(
        z.object({
            user_id: z.string(),
            username: z.string()
        })
    )
    .mutation(async (opts) => {
        const { input } = opts

        // Check if username already exists
        const username = await prisma.user.findFirst({
            where: {
                name: input.username
            }
        })

        if (username) {
            return { success: false }
        }

        // Update the username
        const response = await prisma.user.update({
            where: {
                id: input.user_id
            },
            data: {
                name: input.username
            }
        })

        if (!response) {
            return { success: false }
        }

        return { success: true }
    })

/**
 * Updates a users role
 */
export const update_role = protectedProcedure
    .input(
        z.object({
            user_id: z.string(),
            role: z.number()
        })
    )
    .mutation(async (opts) => {
        const { input, ctx } = opts

        if (ctx.session.user.role != Role.Admin) {
            return { success: false }
        }

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
    })
