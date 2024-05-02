import { createTRPCRouter, publicProcedure } from '~/server/api/trpc'

import { z } from 'zod'
import { AsRedisKey } from '~/server/cache'
import { Artist, Social } from '@prisma/client'
import { clerkClient, User } from '@clerk/nextjs/server'

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
        .query(async ({ input, ctx }) => {
            // Get the cached artist if they are cached
            const cachedArtist = await ctx.cache.get(
                AsRedisKey(
                    'artists',
                    input !== undefined
                        ? input.handle
                        : (ctx.user?.publicMetadata.handle as string)
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
                    handle: input ? input.handle : ctx.user?.publicMetadata.handle!
                },
                include: {
                    socials: true
                }
            })

            // If the artist wasn't found just return undefined
            if (!artist) {
                return null
            }

            await ctx.cache.set(
                AsRedisKey(
                    'artists',
                    input ? input.handle : (ctx.user?.publicMetadata.handle as string)
                ),
                JSON.stringify(artist),
                {
                    EX: 3600
                }
            )

            return {
                ...artist,
                user: await clerkClient.users.getUser(artist.userId)
            }
        })
})
