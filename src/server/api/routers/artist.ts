import { createTRPCRouter, publicProcedure } from '~/server/api/trpc'

import { z } from 'zod'
import { AsRedisKey } from '~/server/cache'
import { Artist, Social, User } from '@prisma/client'
import { TRPCError } from '@trpc/server'

export const artistRouter = createTRPCRouter({
    /**
     * Gets a specific artist given a handle
     */
    get_artist: publicProcedure
        .input(
            z
                .object({
                    handle: z.string()
                })
                .optional()
        )
        .query(async (opts) => {
            const { input, ctx } = opts

            // Get the cached artist if they are cached
            const cachedArtist = await ctx.cache.get(
                AsRedisKey(
                    'artists',
                    input !== undefined ? input.handle : ctx.session?.user.handle!
                )
            )

            if (cachedArtist) {
                return JSON.parse(cachedArtist) as Artist & {
                    user: User
                    socials: Social[]
                }
            }

            // Fetch from database if they're not in the cache
            const artist = await ctx.db.artist.findFirst({
                where: {
                    handle: input ? input.handle : ctx.session?.user.handle!
                },
                include: {
                    user: true,
                    socials: true
                }
            })

            // If the artist wasn't found just return undefined
            if (!artist) {
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'Could not find artist!'
                })
            }

            await ctx.cache.set(
                AsRedisKey('artists', input ? input.handle : ctx.session?.user.handle!),
                JSON.stringify(artist),
                'EX',
                3600
            )

            return artist
        })
})
