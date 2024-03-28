import { z } from 'zod'
import { publicProcedure } from '../trpc'
import { redis } from '@/lib/redis'
import { Artist } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { ShopItem } from '@/core/structures'
import { CreateShopItemFromProducts } from '@/core/server-helpers'

/**
 * Gets the products for a given artist
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

/**
 * Gets singular store product
 */
export const get_product = publicProcedure
    .input(
        z.object({
            slug: z.string(),
            artist_handle: z.string(),
            options: z
                .object({
                    editable: z.boolean().optional(),
                    get_download_asset: z.boolean().optional(),
                    get_download_key: z.boolean().optional(),
                    get_featured_image_key: z.boolean().optional()
                })
                .optional()
        })
    )
    .query(async (opts) => {
        const { input } = opts

        // Retreieve Cached Product
        const cahcedProduct = await redis.get(
            `${input.artist_handle}_${input.slug}_product`
        )

        if (cahcedProduct) {
            return JSON.parse(cahcedProduct) as ShopItem
        }

        // Attempt to retrieve the cached artist
        const cachedArtist = await redis.get(input.artist_handle)
        let artist: Artist | undefined | null = undefined

        if (cachedArtist) {
            artist = JSON.parse(cachedArtist) as Artist
        } else {
            artist = await prisma.artist.findFirst({
                where: {
                    handle: input.artist_handle
                }
            })

            await redis.set(input.artist_handle, JSON.stringify(artist), 'EX', 3600)
        }

        if (!artist) {
            return undefined
        }

        const product = await prisma.product.findFirst({
            where: {
                artistId: artist.id,
                slug: input.slug
            }
        })

        if (!product) {
            return undefined
        }

        const result = await CreateShopItemFromProducts(product, artist, input.options)

        await redis.set(
            `${input.artist_handle}_${input.slug}_product`,
            JSON.stringify(result),
            'EX',
            3600
        )

        return result
    })
