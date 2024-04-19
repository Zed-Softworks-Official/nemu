import { z } from 'zod'
import { TRPCError } from '@trpc/server'

import { ClientCommissionItem, NemuImageData } from '~/core/structures'
import { createTRPCRouter, publicProcedure } from '~/server/api/trpc'
import { AsRedisKey } from '~/server/cache'
import { get_blur_data } from '~/lib/server-utils'

export const commissionRouter = createTRPCRouter({
    /**
     * Gets ALL commissions from a given artist
     */
    get_commission_list: publicProcedure
        .input(
            z.object({
                artist_id: z.string().optional()
            })
        )
        .query(async ({ input, ctx }) => {
            // Get Artist Data
            if (!input.artist_id) {
                throw new TRPCError({
                    code: 'BAD_REQUEST'
                })
            }

            const cachedCommissions = await ctx.cache.get(
                AsRedisKey('commissions', input.artist_id)
            )

            if (cachedCommissions) {
                return JSON.parse(cachedCommissions) as ClientCommissionItem[]
            }

            const commissions = await ctx.db.commission.findMany({
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

            // Format for client
            const result: ClientCommissionItem[] = []
            for (const commission of commissions) {
                const images: NemuImageData[] = []
                for (const image of commission.images) {
                    images.push({
                        url: image,
                        blur_data: (await get_blur_data(image)).base64
                    })
                }
                result.push({
                    ...commission,
                    images
                })
            }

            await ctx.cache.set(
                AsRedisKey('commissions', input.artist_id),
                JSON.stringify(result),
                'EX',
                3600
            )

            return result
        })
})
