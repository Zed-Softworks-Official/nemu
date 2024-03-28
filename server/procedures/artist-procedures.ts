import { z } from 'zod'
import { publicProcedure } from '../trpc'
import { redis } from '@/lib/redis'
import { Artist, Social, User } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import {
    AWSLocations,
    CommissionItem,
    ImageData,
    PortfolioItem,
    ShopItem
} from '@/core/structures'
import { S3GetSignedURL } from '@/core/storage'
import { CreateShopItemFromProducts, GetBlurData } from '@/core/server-helpers'

/**
 *
 */
export const get_artist = publicProcedure
    .input(
        z.object({
            handle: z.string()
        })
    )
    .query(async (opts) => {
        const { input } = opts

        // Get the cached artist if they are cached
        const cachedArtist = await redis.get(input.handle)

        if (cachedArtist) {
            return JSON.parse(cachedArtist) as Artist & { user: User } & {
                socials: Social[]
            }
        }

        // Fetch from database if they're not in the cache
        const artist = await prisma.artist.findFirst({
            where: {
                handle: input.handle || undefined
            },
            include: {
                user: true,
                socials: true
            }
        })

        // If the artist wasn't found just return undefined
        if (!artist) {
            return undefined
        }

        await redis.set(input.handle!, JSON.stringify(artist), 'EX', 3600)

        return artist
    })

/**
 *
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

/**
 *
 */
export const get_products = publicProcedure
    .input(
        z.object({
            artist_id: z.string()
        })
    )
    .query(async (opts) => {
        const { input } = opts

        const cachedProducts = await redis.get(`${input.artist_id}_products`)

        if (cachedProducts) {
            return JSON.parse(cachedProducts) as ShopItem[]
        }

        const products = await prisma.product.findMany({
            where: {
                artistId: input.artist_id
            },
            include: {
                artist: true
            }
        })

        if (!products) {
            return undefined
        }

        const result: ShopItem[] = []
        for (const product of products) {
            result.push(await CreateShopItemFromProducts(product, product.artist))
        }

        await redis.set(`${input.artist_id}_products`, JSON.stringify(result), 'EX', 3600)

        return result
    })

export const get_portfolio_items = publicProcedure
    .input(
        z.object({
            artist_id: z.string()
        })
    )
    .query(async (opts) => {
        const { input } = opts

        const cachedPorfolioItems = await redis.get(`${input.artist_id}_porfolio_items`)

        if (cachedPorfolioItems) {
            return JSON.parse(cachedPorfolioItems) as PortfolioItem[]
        }

        const result: PortfolioItem[] = []
        const portfolio = await prisma.portfolio.findMany({
            where: {
                artistId: input.artist_id
            }
        })

        for (let i = 0; i < portfolio.length; i++) {
            const signed_url = await S3GetSignedURL(
                input.artist_id,
                AWSLocations.Portfolio,
                portfolio[i].image
            )

            if (!signed_url) {
                return result
            }

            result.push({
                signed_url: signed_url,
                image_key: portfolio[i].image,
                name: portfolio[i].name
            })
        }

        await redis.set(
            `${input.artist_id}_portfolio_items`,
            JSON.stringify(result),
            'EX',
            3600
        )

        return result
    })
