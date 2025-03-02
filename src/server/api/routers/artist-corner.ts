import { createId } from '@paralleldrive/cuid2'
import { type JSONContent } from '@tiptap/react'
import { TRPCError } from '@trpc/server'
import { and, desc, eq, lt } from 'drizzle-orm'
import { z } from 'zod'

import { type StripeProductData } from '~/lib/structures'
import { formatToCurrency, get_ut_url } from '~/lib/utils'

import {
    artistProcedure,
    createTRPCRouter,
    protectedProcedure,
    publicProcedure
} from '~/server/api/trpc'
import { products, purchase } from '~/server/db/schema'
import { get_redis_key } from '~/server/redis'
import { stripe } from '~/server/stripe'
import { utapi } from '~/server/uploadthing'

const productSchema = z.object({
    name: z.string(),
    description: z.any(),
    price: z.number(),
    download: z.object({
        utKey: z.string(),
        filename: z.string(),
        size: z.number()
    }),
    images: z.array(z.string()),
    is_free: z.boolean()
})

export const artist_corner_router = createTRPCRouter({
    set_product: artistProcedure.input(productSchema).mutation(async ({ input, ctx }) => {
        const id = createId()
        const description = input.description as JSONContent

        try {
            // Step 1: Create Stripe product first (if not free)
            // This is the external dependency most likely to fail
            let stripeData: StripeProductData | undefined = undefined

            if (!input.is_free) {
                const stripe_product = await stripe.products.create(
                    {
                        name: input.name,
                        images: input.images.map((image) => get_ut_url(image)),
                        default_price_data: {
                            currency: 'usd',
                            unit_amount: input.price
                        },
                        metadata: {
                            actual_id: id
                        }
                    },
                    {
                        stripeAccount: ctx.artist.stripe_account
                    }
                )

                stripeData = {
                    productId: stripe_product.id,
                    price: input.price,
                    priceId:
                        typeof stripe_product.default_price === 'string'
                            ? stripe_product.default_price
                            : stripe_product.id,
                    revenue: 0,
                    sold: 0,
                    soldAmount: 0,
                    refundCount: 0,
                    refundAmount: 0
                } satisfies StripeProductData
            }

            // Step 2: Insert into database
            await ctx.db.insert(products).values({
                id,
                artist_id: ctx.artist.id,
                ...input,
                description
            })

            // Step 3: Update Redis only after database insertion succeeds
            await Promise.all([
                // Only set stripe data in Redis if it exists
                stripeData
                    ? ctx.redis.set(get_redis_key('product:stripe', id), stripeData)
                    : Promise.resolve(),

                // Remove images and downloads from Redis
                ctx.redis.zrem('product:images', ...input.images),
                ctx.redis.zrem('product:downloads', input.download.utKey)
            ])

            return { success: true, id }
        } catch (error) {
            // Step 4: Handle failures with rollback
            try {
                // Rollback: Delete from database if it was inserted
                await ctx.db.delete(products).where(eq(products.id, id))

                // Rollback: Delete Stripe product if it was created
                if (!input.is_free) {
                    const stripeData = await ctx.redis.get<StripeProductData>(
                        get_redis_key('product:stripe', id)
                    )

                    if (stripeData) {
                        await stripe.products.del(stripeData.productId, {
                            stripeAccount: ctx.artist.stripe_account
                        })

                        await ctx.redis.del(get_redis_key('product:stripe', id))
                    }
                }
            } catch (rollbackError) {
                // Log rollback errors but don't expose to client
                console.error('Rollback failed:', rollbackError)
            }

            // Re-throw the original error
            throw error
        }
    }),

    update_product: artistProcedure
        .input(productSchema.merge(z.object({ id: z.string() })))
        .mutation(async ({ input, ctx }) => {
            // Step 1: Fetch the current product state for comparison and potential rollback
            const product = await ctx.db.query.products.findFirst({
                where: eq(products.id, input.id)
            })

            if (!product) {
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'Product not found'
                })
            }

            // Save original state for potential rollback
            const originalProduct = { ...product }

            // Identify files to delete
            const items_to_delete = product.images.filter((ut_key) => {
                return !input.images.find((value) => value === ut_key)
            })

            if (product.download.utKey !== input.download.utKey) {
                items_to_delete.push(product.download.utKey)
            }

            // Track changes for rollback
            const changes = {
                filesDeleted: false,
                dbUpdated: false,
                stripeUpdated: false,
                newStripeProductId: null as string | null,
                redisUpdated: false
            }

            try {
                // Step 2: Handle Stripe updates first (most likely to fail)
                if (product.price !== input.price || product.is_free !== input.is_free) {
                    const stripe_data = await ctx.redis.get<StripeProductData>(
                        get_redis_key('product:stripe', input.id)
                    )

                    if (stripe_data) {
                        // Update existing Stripe product
                        const stripe_price_id = await stripe.prices.create({
                            currency: 'usd',
                            unit_amount: input.price,
                            product: stripe_data.productId
                        })

                        if (!stripe_price_id) {
                            throw new TRPCError({
                                code: 'INTERNAL_SERVER_ERROR',
                                message: '[STRIPE]: Failed to create new price id'
                            })
                        }

                        await stripe.products.update(
                            stripe_data.productId,
                            {
                                default_price: stripe_price_id.id,
                                images: input.images.map((image) => get_ut_url(image)),
                                name: input.name
                            },
                            {
                                stripeAccount: ctx.artist.stripe_account
                            }
                        )

                        // Update Redis with new price
                        await ctx.redis.set(get_redis_key('product:stripe', input.id), {
                            ...stripe_data,
                            price: input.price,
                            priceId: stripe_price_id.id
                        })

                        changes.stripeUpdated = true
                    } else if (!input.is_free) {
                        // Create new Stripe product if switching from free to paid
                        const stripe_product = await stripe.products.create(
                            {
                                name: input.name,
                                images: input.images.map((image) => get_ut_url(image)),
                                default_price_data: {
                                    currency: 'usd',
                                    unit_amount: input.price
                                },
                                metadata: {
                                    actual_id: input.id
                                }
                            },
                            {
                                stripeAccount: ctx.artist.stripe_account
                            }
                        )

                        changes.newStripeProductId = stripe_product.id

                        const newStripeData = {
                            productId: stripe_product.id,
                            price: input.price,
                            priceId:
                                typeof stripe_product.default_price === 'string'
                                    ? stripe_product.default_price
                                    : stripe_product.id,
                            revenue: 0,
                            sold: 0,
                            soldAmount: 0,
                            refundCount: 0,
                            refundAmount: 0
                        } satisfies StripeProductData

                        await ctx.redis.set(
                            get_redis_key('product:stripe', input.id),
                            newStripeData
                        )

                        changes.stripeUpdated = true
                    }

                    changes.redisUpdated = true
                }

                // Step 3: Delete files from uploadthing
                if (items_to_delete.length > 0) {
                    await utapi.deleteFiles(items_to_delete)
                    changes.filesDeleted = true
                }

                // Step 4: Update database
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                const { id, ...items } = input
                await ctx.db
                    .update(products)
                    .set({
                        ...items,
                        description: input.description as JSONContent
                    })
                    .where(eq(products.id, input.id))

                changes.dbUpdated = true

                // Step 5: Update Redis
                await Promise.all([
                    ctx.redis.zrem('product:images', ...input.images),
                    ctx.redis.zrem('product:downloads', input.download.utKey)
                ])

                changes.redisUpdated = true

                return { success: true, id: input.id }
            } catch (error) {
                // Step 6: Handle failures with rollback
                try {
                    console.error('Update failed, attempting rollback:', error)

                    // Rollback database if it was updated
                    if (changes.dbUpdated) {
                        await ctx.db
                            .update(products)
                            .set({
                                name: originalProduct.name,
                                description: originalProduct.description,
                                price: originalProduct.price,
                                images: originalProduct.images,
                                download: originalProduct.download,
                                is_free: originalProduct.is_free
                            })
                            .where(eq(products.id, input.id))
                    }

                    // Rollback Stripe changes
                    if (changes.stripeUpdated) {
                        const stripe_data = await ctx.redis.get<StripeProductData>(
                            get_redis_key('product:stripe', input.id)
                        )

                        if (changes.newStripeProductId) {
                            // Delete newly created Stripe product
                            await stripe.products.del(changes.newStripeProductId, {
                                stripeAccount: ctx.artist.stripe_account
                            })
                        } else if (stripe_data) {
                            // Restore original price and state
                            if (originalProduct.is_free) {
                                // If it was originally free, archive the product
                                await stripe.products.update(
                                    stripe_data.productId,
                                    { active: false },
                                    { stripeAccount: ctx.artist.stripe_account }
                                )

                                await ctx.redis.del(
                                    get_redis_key('product:stripe', input.id)
                                )
                            } else {
                                // Otherwise restore the original price
                                const original_stripe_data =
                                    await ctx.redis.get<StripeProductData>(
                                        get_redis_key('product:stripe', input.id)
                                    )

                                if (original_stripe_data) {
                                    await stripe.products.update(
                                        stripe_data.productId,
                                        {
                                            default_price: original_stripe_data.priceId,
                                            images: originalProduct.images.map((image) =>
                                                get_ut_url(image)
                                            ),
                                            name: originalProduct.name
                                        },
                                        { stripeAccount: ctx.artist.stripe_account }
                                    )
                                }
                            }
                        }
                    }

                    // Note: We can't rollback deleted files from uploadthing
                    // This is a limitation we should document
                } catch (rollbackError) {
                    // Log rollback errors but don't expose to client
                    console.error('Rollback failed:', rollbackError)
                }

                // Re-throw the original error
                throw error
            }
        }),

    get_products: artistProcedure.query(async ({ ctx }) => {
        const all_products = await ctx.db.query.products.findMany({
            where: eq(products.artist_id, ctx.artist.id)
        })

        return all_products.map((product) => ({
            id: product.id,
            name: product.name,
            price: formatToCurrency(product.price / 100),
            published: product.published
        }))
    }),

    get_product_by_id_dashboard: artistProcedure
        .input(z.object({ id: z.string() }))
        .query(async ({ ctx, input }) => {
            const product_promise = ctx.db.query.products.findFirst({
                where: eq(products.id, input.id)
            })

            const sales_promise = ctx.redis.get<StripeProductData>(
                get_redis_key('product:stripe', input.id)
            )

            const charges_promise = stripe.checkout.sessions.list(
                {
                    created: {
                        gte: Math.floor(Date.now() / 1000) - 180 * 24 * 60 * 60
                    },
                    status: 'complete'
                },
                { stripeAccount: ctx.artist.stripe_account }
            )

            const [product, sales, charges] = await Promise.all([
                product_promise,
                sales_promise,
                charges_promise
            ])

            return {
                product,
                sales,
                charges
            }
        }),

    get_product_by_id: publicProcedure
        .input(
            z.object({
                id: z.string()
            })
        )
        .query(async ({ ctx, input }) => {
            const data = await ctx.db.query.products.findFirst({
                where: eq(products.id, input.id)
            })

            if (!data) {
                return null
            }

            return {
                name: data.name,
                description: data.description,
                images: data.images.map((key) => get_ut_url(key)),
                price: formatToCurrency(data.price / 100),
                is_free: data.is_free
            }
        }),

    publish_product_by_id: artistProcedure
        .input(z.object({ id: z.string(), published: z.boolean() }))
        .mutation(async ({ ctx, input }) => {
            await ctx.db
                .update(products)
                .set({
                    published: input.published
                })
                .where(eq(products.id, input.id))
        }),

    get_purchased: protectedProcedure
        .input(
            z.object({
                limit: z.number().min(1).max(50).default(10),
                cursor: z.string().nullish(), // for pagination
                skip: z.number().optional()
            })
        )
        .query(async ({ ctx, input }) => {
            const { limit, cursor, skip } = input

            // Build the where clause
            const where = and(
                eq(purchase.user_id, ctx.auth.userId),
                eq(purchase.status, 'completed'),
                // Add cursor-based filtering if cursor is provided
                cursor ? lt(purchase.created_at, new Date(cursor)) : undefined
            )

            // Fetch one more item than requested to determine if there are more items
            const purchases = await ctx.db.query.purchase.findMany({
                where,
                limit: limit + 1,
                offset: skip,
                orderBy: desc(purchase.created_at),
                with: {
                    product: true,
                    artist: true
                }
            })

            // Check if there are more results
            const hasMore = purchases.length > limit
            // Remove the extra item if we fetched more than requested
            const items = hasMore ? purchases.slice(0, limit) : purchases

            // Get the next cursor (timestamp of the last item)
            const nextCursor =
                items.length > 0
                    ? items[items.length - 1]?.created_at?.toISOString()
                    : null

            // Transform the data
            const transformedItems = items.map((data) => ({
                id: data.id,
                created_at: data.created_at,
                product: {
                    id: data.product.id,
                    name: data.product.name,
                    download: {
                        filename: data.product.download.filename
                    }
                },
                artist: {
                    handle: data.artist.handle
                }
            }))

            // Return paginated result
            return {
                items: transformedItems,
                nextCursor,
                hasMore
            }
        })
})
