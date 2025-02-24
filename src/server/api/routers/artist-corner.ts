import { createId } from '@paralleldrive/cuid2'
import { type JSONContent } from '@tiptap/react'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { format_to_currency } from '~/lib/utils'

import { artistProcedure, createTRPCRouter } from '~/server/api/trpc'
import { products } from '~/server/db/schema'
import { get_redis_key } from '~/server/redis'

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
            const insert_promise = ctx.db.insert(products).values({
                id: createId(),
                artist_id: ctx.artist.id,
                ...input,
                description: JSON.parse(input.description) as JSONContent
            })

            const remove_image_from_redis_promise = ctx.redis.zrem(
                get_redis_key('product:images', ctx.artist.id),
                ...input.images
            )

            const remove_download_from_redis_promise = ctx.redis.zrem(
                get_redis_key('product:downloads', ctx.artist.id),
                input.download
            )

            await Promise.all([
                insert_promise,
                remove_image_from_redis_promise,
                remove_download_from_redis_promise
            ])
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
    })
})
