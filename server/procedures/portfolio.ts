import { z } from 'zod'
import { protectedProcedure, publicProcedure } from '../trpc'
import { redis } from '@/lib/redis'
import { prisma } from '@/lib/prisma'
import { AWSLocations, PortfolioItem, Role } from '@/core/structures'
import { S3GetSignedURL } from '@/core/storage'

/**
 * Gets all portfolio items of a given artist
 */
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

/**
 * Gets a single portfolio item
 */
export const get_portfolio_item = publicProcedure
    .input(
        z.object({
            artist_id: z.string(),
            item_id: z.string()
        })
    )
    .query(async (opts) => {
        const { input } = opts

        const cachedPorfolioItems = await redis.get(
            `${input.artist_id}_${input.item_id}_porfolio_item`
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
            AWSLocations.Portfolio,
            portfolio_item.image
        )

        const result: PortfolioItem = {
            signed_url: signed_url,
            image_key: portfolio_item.image,
            name: portfolio_item.name
        }

        await redis.set(
            `${input.artist_id}_${input.item_id}_porfolio_item`,
            JSON.stringify(result),
            'EX',
            3600
        )

        return result
    })

/**
 * Creates a new portfolio item for the given artist
 */
export const set_portfolio_item = protectedProcedure
    .input(
        z.object({
            artist_id: z.string(),
            iamge_key: z.string(),
            name: z.string()
        })
    )
    .mutation(async (opts) => {
        const { input, ctx } = opts

        if (ctx.session.user.role != Role.Artist) {
            return { success: false }
        }

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

        return { success: true }
    })

/**
 * Updates a specific portfolio item
 */
export const update_portfolio_item = protectedProcedure
    .input(
        z.object({
            artist_id: z.string(),
            image_key: z.string().optional(),
            new_image_key: z.string().optional(),
            name: z.string().optional()
        })
    )
    .mutation(async (opts) => {
        const { input, ctx } = opts

        if (ctx.session.user.role != Role.Artist) {
            return { success: false }
        }

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

        return { success: true }
    })

/**
 * Deletes a specific portfolio item
 */
export const del_portfolio_item = protectedProcedure
    .input(
        z.object({
            artist_id: z.string(),
            image_key: z.string()
        })
    )
    .mutation(async (opts) => {
        const { input, ctx } = opts

        if (ctx.session.user.role != Role.Artist) {
            return { success: false }
        }

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

        return { success: true }
    })
