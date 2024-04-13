import { z } from 'zod'
import { artistProcedure, createTRPCRouter, publicProcedure } from '../trpc'
import { redis } from '@/lib/redis'
import { prisma } from '@/lib/prisma'
import { AWSEndpoint, PortfolioItem, Role } from '@/core/structures'
import { S3GetSignedURL } from '@/core/storage'
import { AsRedisKey } from '@/core/helpers'
import { GetBlurData } from '@/core/server-helpers'

export const portfolioRouter = createTRPCRouter({
    /**
     * Gets ALL portfolio items of a given artist
     */
    get_portfolio_items: publicProcedure
        .input(
            z.object({
                artist_id: z.string()
            })
        )
        .query(async (opts) => {
            const { input } = opts

            const cachedPorfolioItems = await redis.get(
                AsRedisKey('portfolio_items', input.artist_id)
            )

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
                    AWSEndpoint.Portfolio,
                    portfolio[i].image
                )

                if (!signed_url) {
                    return result
                }

                result.push({
                    data: {
                        signed_url: signed_url,
                        blur_data: (await GetBlurData(signed_url)).base64,
                        image_key: portfolio[i].image
                    },
                    name: portfolio[i].name
                })
            }

            await redis.set(
                AsRedisKey('portfolio_items', input.artist_id),
                JSON.stringify(result),
                'EX',
                3600
            )

            return result
        }),
    /**
     * Gets a SINGLE portfolio item
     */
    get_portfolio_item: publicProcedure
        .input(
            z.object({
                artist_id: z.string(),
                item_id: z.string()
            })
        )
        .query(async (opts) => {
            const { input } = opts

            const cachedPorfolioItems = await redis.get(
                AsRedisKey('portfolio_items', input.artist_id, input.item_id)
            )

            if (cachedPorfolioItems) {
                return JSON.parse(cachedPorfolioItems) as PortfolioItem
            }

            const portfolio_item = await prisma.portfolio.findFirst({
                where: {
                    artistId: input.artist_id,
                    image: input.item_id
                }
            })

            if (!portfolio_item) {
                return undefined
            }

            const signed_url = await S3GetSignedURL(
                input.artist_id,
                AWSEndpoint.Portfolio,
                portfolio_item.image
            )

            const result: PortfolioItem = {
                data: {
                    signed_url: signed_url,
                    blur_data: (await GetBlurData(signed_url)).base64,
                    image_key: portfolio_item.image
                },
                name: portfolio_item.name
            }

            await redis.set(
                AsRedisKey('portfolio_items', input.artist_id, input.item_id),
                JSON.stringify(result),
                'EX',
                3600
            )

            return result
        }),

    /**
     * Creates a new portfolio item for the given artist
     */
    set_portfolio_item: artistProcedure
        .input(
            z.object({
                artist_id: z.string(),
                iamge_key: z.string(),
                name: z.string()
            })
        )
        .mutation(async (opts) => {
            const { input } = opts

            const new_item = await prisma.portfolio.create({
                data: {
                    artistId: input.artist_id,
                    name: input.name,
                    image: input.iamge_key
                }
            })

            if (!new_item) {
                return { success: false }
            }

            await redis.del(AsRedisKey('portfolio_items', input.artist_id))

            return { success: true }
        }),

    /**
     * Updates a specific portfolio item
     */
    update_portfolio_item: artistProcedure
        .input(
            z.object({
                artist_id: z.string(),
                image_key: z.string(),
                new_image_key: z.string().optional(),
                name: z.string().optional()
            })
        )
        .mutation(async (opts) => {
            const { input } = opts

            const portfolio_item = await prisma.portfolio.findFirst({
                where: {
                    artistId: input.artist_id,
                    image: input.image_key
                }
            })

            // Check if it exists
            if (!portfolio_item) {
                return { success: false }
            }

            // Update the item
            const updated_item = await prisma.portfolio.update({
                where: {
                    id: portfolio_item.id
                },
                data: {
                    image: input.new_image_key || undefined,
                    name: input.name || undefined
                }
            })

            // Check if it's updated
            if (!updated_item) {
                return { success: false }
            }

            // Check if the cache of the item exists
            const cachedPortolioItem = await redis.get(
                AsRedisKey('portfolio_items', input.artist_id, input.image_key!)
            )

            if (cachedPortolioItem) {
                await redis.del(AsRedisKey('portfolio_items', input.artist_id))
                await redis.del(
                    AsRedisKey('portfolio_items', input.artist_id, input.image_key)
                )
            }

            return { success: true }
        }),

    /**
     * Deletes a specific portfolio item
     */
    del_portfolio_item: artistProcedure
        .input(
            z.object({
                artist_id: z.string(),
                image_key: z.string()
            })
        )
        .mutation(async (opts) => {
            const { input } = opts

            // Get Portfolio Item
            const portfolio_item = await prisma.portfolio.findFirstOrThrow({
                where: {
                    artistId: input.artist_id,
                    image: input.image_key
                }
            })

            // Check if it exists
            if (!portfolio_item) {
                return { success: false }
            }

            // Delete from database
            const deleted_item = await prisma.portfolio.delete({
                where: {
                    id: portfolio_item.id
                }
            })

            // Check if it was successful
            if (!deleted_item) {
                return { success: false }
            }

            await redis.del(AsRedisKey('portfolio_items', input.artist_id))

            return { success: true }
        })
})
