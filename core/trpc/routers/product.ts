import { z } from 'zod'
import {
    artistProcedure,
    createTRPCRouter,
    protectedProcedure,
    publicProcedure
} from '../trpc'
import { redis } from '@/lib/redis'
import { Artist } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { ImageData, Role, ShopItem } from '@/core/structures'
import { CreateShopItemFromProducts } from '@/core/server-helpers'
import { AsRedisKey } from '@/core/helpers'

export const artistCornerRouter = createTRPCRouter({
    /**
     * Gets the products for a given artist
     */
    get_products: publicProcedure
        .input(
            z.object({
                artist_id: z.string()
            })
        )
        .query(async (opts) => {
            const { input } = opts

            const cachedProducts = await redis.get(
                AsRedisKey('products', input.artist_id)
            )

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

            await redis.set(
                AsRedisKey('products', input.artist_id),
                JSON.stringify(result),
                'EX',
                3600
            )

            return result
        }),

    /**
     * Gets a SINGLE store product
     */
    get_product: publicProcedure
        .input(
            z.object({
                slug: z.string(),
                artist_handle: z.string()
            })
        )
        .query(async (opts) => {
            const { input } = opts

            // Retreieve Cached Product
            const cahcedProduct = await redis.get(
                AsRedisKey('products', input.artist_handle, input.slug)
            )

            if (cahcedProduct) {
                return JSON.parse(cahcedProduct) as ShopItem
            }

            // Attempt to retrieve the cached artist
            const cachedArtist = await redis.get(
                AsRedisKey('artists', input.artist_handle)
            )
            let artist: Artist | undefined | null = undefined

            if (cachedArtist) {
                artist = JSON.parse(cachedArtist) as Artist
            } else {
                artist = await prisma.artist.findFirst({
                    where: {
                        handle: input.artist_handle
                    }
                })

                await redis.set(
                    AsRedisKey('artists', input.artist_handle),
                    JSON.stringify(artist),
                    'EX',
                    3600
                )
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

            const result = await CreateShopItemFromProducts(product, artist)

            await redis.set(
                AsRedisKey('products', input.artist_handle, input.slug),
                JSON.stringify(result),
                'EX',
                3600
            )

            return result
        }),

    /**
     * Gets a SINGLE product with all editable attributes requested
     */
    get_product_editable: protectedProcedure
        .input(
            z.object({
                product_id: z.string().optional(),
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

            if (!input.product_id) {
                return undefined
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
                    id: input.product_id
                }
            })

            if (!product) {
                return undefined
            }

            const result = await CreateShopItemFromProducts(
                product,
                artist,
                input.options
                    ? {
                          editable: input.options?.editable,
                          get_download_asset: input.options.get_download_asset,
                          get_download_key: input.options.get_download_key,
                          get_featured_image_key: input.options.get_featured_image_key
                      }
                    : undefined
            )

            if (!result) {
                return undefined
            }

            return result
        }),

    /**
     * Creates a new product for the given artist
     */
    set_product: artistProcedure
        .input(
            z.object({
                artist_id: z.string(),
                product_data: z.object({
                    title: z.string(),
                    description: z.string(),
                    price: z.number(),
                    featured_image: z.string(),
                    additional_images: z.array(z.string()),
                    downloadable_asset: z.string(),
                    published: z.boolean()
                })
            })
        )
        .mutation(async (opts) => {
            const { input } = opts

            // Get Artist
            const artist = await prisma.artist.findFirst({
                where: {
                    id: input.artist_id
                }
            })

            if (!artist) {
                return { success: false }
            }

            // Create Product Slug
            const slug = input.product_data
                .title!.toLowerCase()
                .replace(/[^a-zA-Z ]/g, '')
                .replaceAll(' ', '-')

            // Create the item in the database
            await prisma.product.create({
                data: {
                    artistId: input.artist_id,
                    title: input.product_data.title!,
                    description: input.product_data.description!,
                    price: input.product_data.price!,
                    featuredImage: input.product_data.featured_image!,
                    additionalImages: input.product_data.additional_images!,
                    downloadableAsset: input.product_data.downloadable_asset!,
                    slug: slug
                }
            })

            await redis.del(AsRedisKey('products', artist.id))

            return { success: true }
        }),

    /**
     * Updates a product given the product id
     */
    update_product: artistProcedure
        .input(
            z.object({
                product_id: z.string(),
                product_data: z.object({
                    title: z.string().optional(),
                    description: z.string().optional(),
                    price: z.number().optional(),
                    featured_image: z.string().optional(),
                    additional_images: z.array(z.string()).optional(),
                    downloadable_asset: z.string().optional(),
                    published: z.boolean().optional()
                })
            })
        )
        .mutation(async (opts) => {
            const { input } = opts

            const updated_product = await prisma.product.update({
                where: {
                    id: input.product_id
                },
                data: {
                    title: input.product_data.title || undefined,
                    description: input.product_data.description || undefined,
                    price: input.product_data.price || undefined,
                    featuredImage: input.product_data.featured_image || undefined,
                    additionalImages: input.product_data.additional_images || undefined,
                    downloadableAsset: input.product_data.downloadable_asset || undefined,
                    published:
                        input.product_data.published != undefined
                            ? input.product_data.published
                            : undefined
                }
            })

            if (!updated_product) {
                return { success: false }
            }

            await redis.del(AsRedisKey('products', updated_product.artistId))

            return { success: true }
        }),

    /**
     * Retreives data from commissions to use for metadata when someone
     * pastes a link
     */
    get_metadata: publicProcedure
        .input(
            z.object({
                handle: z.string(),
                product_slug: z.string()
            })
        )
        .query(async (opts) => {
            const { input } = opts

            const cachedMetadata = await redis.get(
                AsRedisKey('products_metadata', input.handle, input.product_slug)
            )

            if (cachedMetadata) {
                return JSON.parse(cachedMetadata) as {
                    title: string
                    description: string
                    featured_image: ImageData
                }
            }

            const artist = await prisma.artist.findFirst({
                where: {
                    handle: input.handle
                }
            })

            const db_product = await prisma.product.findFirst({
                where: {
                    artistId: artist?.id,
                    slug: input.product_slug
                }
            })

            const product = await CreateShopItemFromProducts(db_product!, artist!)
            const truncate = 128

            const result = {
                title: product.title,
                description:
                    product.description.length > truncate
                        ? product.description.substring(0, truncate) + '...'
                        : product.description,
                featured_image: product.featured_image
            }

            await redis.set(
                AsRedisKey('products_metadata', input.handle, input.product_slug),
                JSON.stringify(result),
                'EX',
                3600
            )

            return result
        })
})
