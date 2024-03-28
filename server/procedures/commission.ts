import { z } from 'zod'
import { publicProcedure } from '../trpc'
import { redis } from '@/lib/redis'
import { prisma } from '@/lib/prisma'
import { AWSLocations, CommissionItem, ImageData } from '@/core/structures'
import { S3GetSignedURL } from '@/core/storage'
import { GetBlurData } from '@/core/server-helpers'

/**
 * Gets the commissions for a given artist
 */
export const get_commissions = publicProcedure
    .input(
        z.object({
            artist_id: z.string()
        })
    )
    .query(async (opts) => {
        // Get Artist Data
        const { input } = opts

        const cachedCommissions = await redis.get(`${input.artist_id}_commissions`)

        if (cachedCommissions) {
            return JSON.parse(cachedCommissions) as CommissionItem[]
        }

        const commissions = await prisma.commission.findMany({
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

        // Get Commission Data
        const result: CommissionItem[] = []
        for (let i = 0; i < commissions.length; i++) {
            // Get Featured Image from S3
            const featured_signed_url = await S3GetSignedURL(
                input.artist_id,
                AWSLocations.Commission,
                commissions[i].featuredImage
            )

            // Get the rest of the images
            const images: ImageData[] = []
            for (let j = 0; j < commissions[i].additionalImages.length; j++) {
                const signed_url = await S3GetSignedURL(
                    input.artist_id,
                    AWSLocations.Commission,
                    commissions[i].additionalImages[j]
                )

                images.push({
                    signed_url: signed_url,
                    blur_data: (await GetBlurData(signed_url)).base64
                })
            }

            result.push({
                title: commissions[i].title,
                description: commissions[i].description,
                price: commissions[i].price || -1,
                images: images,
                featured_image: {
                    signed_url: featured_signed_url,
                    blur_data: (await GetBlurData(featured_signed_url)).base64
                },
                availability: commissions[i].availability,
                slug: commissions[i].slug,
                form_id: commissions[i].formId || undefined,
                handle: commissions[i].artist.handle,
                commission_id: commissions[i].id,
                published: commissions[i].published
            })
        }

        await redis.set(
            `${input.artist_id}_commissions`,
            JSON.stringify(result),
            'EX',
            3600
        )

        return result
    })
