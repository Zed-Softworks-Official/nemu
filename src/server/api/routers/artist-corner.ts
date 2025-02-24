import { createId } from '@paralleldrive/cuid2'
import { type JSONContent } from '@tiptap/react'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { type StripeProductData } from '~/lib/structures'
import { format_to_currency, get_ut_url } from '~/lib/utils'

import { artistProcedure, createTRPCRouter } from '~/server/api/trpc'
import { products } from '~/server/db/schema'
import { get_redis_key } from '~/server/redis'
import { stripe } from '~/server/stripe'

export const artist_corner_router = createTRPCRouter({
    set_product: artistProcedure
        .input(
            z.object({
                name: z.string(),
                description: z.string(),
                price: z.number(),
                download: z.string(),
                images: z.array(z.string())
            })
        )
        .mutation(async ({ input, ctx }) => {
            const id = createId()
            const description = JSON.parse(input.description) as JSONContent
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

            const stripe_promise = stripe.products.create(
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

            const [stripe_product] = await Promise.all([
                stripe_promise,
                insert_promise,
                remove_image_from_redis_promise,
                remove_download_from_redis_promise
            ])

            await ctx.redis.set(get_redis_key('product:stripe', id), {
                product_id: stripe_product.id,
                revenue: 0,
                sold: 0,
                refund_count: 0,
                refund_amount: 0
            } satisfies StripeProductData)
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

    get_product_by_id: artistProcedure
        .input(
            z.object({
                id: z.string()
            })
        )
        .query(async ({ ctx, input }) => {
            const product_promise = ctx.db.query.products.findFirst({
                where: eq(products.id, input.id)
            })

            const sales_promise = ctx.redis.get<StripeProductData>(
                get_redis_key('product:stripe', input.id)
            )

            const [product, sales] = await Promise.all([product_promise, sales_promise])

            return {
                product,
                sales
            }
        })
})
