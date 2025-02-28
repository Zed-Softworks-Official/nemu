import { createId } from '@paralleldrive/cuid2'
import { type JSONContent } from '@tiptap/react'
import { TRPCError } from '@trpc/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { type StripeProductData } from '~/lib/structures'
import { format_to_currency, get_ut_url } from '~/lib/utils'

import { artistProcedure, createTRPCRouter, publicProcedure } from '~/server/api/trpc'
import { products } from '~/server/db/schema'
import { get_redis_key } from '~/server/redis'
import { stripe } from '~/server/stripe'
import { utapi } from '~/server/uploadthing'

const productSchema = z.object({
    name: z.string(),
    description: z.any(),
    price: z.number(),
    download: z.object({
        ut_key: z.string(),
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
        const insert_promise = ctx.db.insert(products).values({
            id,
            artist_id: ctx.artist.id,
            ...input,
            description
        })

        const remove_image_from_redis_promise = ctx.redis.zrem(
            get_redis_key('product:images', ctx.artist.id),
            ...input.images
        )

        const remove_download_from_redis_promise = ctx.redis.zrem(
            get_redis_key('product:downloads', ctx.artist.id),
            input.download
        )

        const stripe_promise = async () => {
            if (input.is_free) return

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

            await ctx.redis.set(get_redis_key('product:stripe', id), {
                product_id: stripe_product.id,
                price: input.price,
                price_id:
                    typeof stripe_product.default_price === 'string'
                        ? stripe_product.default_price
                        : stripe_product.id,
                revenue: 0,
                sold: 0,
                sold_amount: 0,
                refund_count: 0,
                refund_amount: 0
            } satisfies StripeProductData)
        }

        await Promise.all([
            stripe_promise(),
            insert_promise,
            remove_image_from_redis_promise,
            remove_download_from_redis_promise
        ])
    }),

    update_product: artistProcedure
        .input(productSchema.merge(z.object({ id: z.string() })))
        .mutation(async ({ input, ctx }) => {
            const product = await ctx.db.query.products.findFirst({
                where: eq(products.id, input.id)
            })

            if (!product) {
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'How did you get here?'
                })
            }

            // Get the images that don't match
            const items_to_delete = product.images.filter((ut_key) => {
                if (input.images.find((value) => value === ut_key)) return false

                return true
            })

            // Check if the download has changed
            if (product.download.ut_key !== input.download.ut_key) {
                items_to_delete.push(product.download.ut_key)
            }

            // Delete the files from ut
            const ut_promise = utapi.deleteFiles(items_to_delete)

            // Update db
            const { id, ...items } = input
            const db_promise = ctx.db
                .update(products)
                .set({
                    ...items,
                    description: input.description as JSONContent
                })
                .where(eq(products.id, input.id))

            // Remove from redis
            const redis_promise = ctx.redis.zrem(
                get_redis_key('product:images', ctx.artist.id),
                input.images
            )

            // Possibly update price on stripe product
            const stripe_promise = async () => {
                if (product.price === input.price) return

                let stripe_data = await ctx.redis.get<StripeProductData>(
                    get_redis_key('product:stripe', input.id)
                )

                if (stripe_data) {
                    const stripe_price_id = await stripe.prices.create({
                        currency: 'usd',
                        unit_amount: input.price,
                        product: stripe_data.product_id
                    })

                    if (!stripe_price_id) {
                        throw new TRPCError({
                            code: 'INTERNAL_SERVER_ERROR',
                            message: '[STRIPE]: Failed to create new price id'
                        })
                    }

                    await stripe.products.update(
                        stripe_data.product_id,
                        {
                            default_price: stripe_price_id.id
                        },
                        {
                            stripeAccount: ctx.artist.stripe_account
                        }
                    )

                    return
                }

                // If stripe data doesn't exist, product was previously free and must get stripe product
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

                stripe_data = {
                    product_id: stripe_product.id,
                    price: input.price,
                    price_id:
                        typeof stripe_product.default_price === 'string'
                            ? stripe_product.default_price
                            : stripe_product.id,
                    revenue: 0,
                    sold: 0,
                    sold_amount: 0,
                    refund_count: 0,
                    refund_amount: 0
                } satisfies StripeProductData

                await ctx.redis.set<StripeProductData>(
                    get_redis_key('product:stripe', input.id),
                    stripe_data
                )
            }

            await Promise.all([ut_promise, db_promise, stripe_promise(), redis_promise])
        }),

    get_products: artistProcedure.query(async ({ ctx }) => {
        const all_products = await ctx.db.query.products.findMany({
            where: eq(products.artist_id, ctx.artist.id)
        })

        return all_products.map((product) => ({
            id: product.id,
            name: product.name,
            price: format_to_currency(product.price / 100),
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
                price: format_to_currency(data.price / 100),
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
        })
})
