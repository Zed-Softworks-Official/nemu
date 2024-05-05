import { createTRPCRouter, publicProcedure } from '~/server/api/trpc'

import { z } from 'zod'
import { AsRedisKey } from '~/server/cache'
import { clerkClient } from '@clerk/nextjs/server'
import { ClientArtist } from '~/core/structures'

import { eq } from 'drizzle-orm'
import { artists } from '~/server/db/schema'

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
                return JSON.parse(cachedArtist) as ClientArtist
            }

            // Fetch from database if they're not in the cache
            const artist = await ctx.db.query.artists.findFirst({
                where: eq(
                    artists.handle,
                    input ? input.handle : (ctx.user?.publicMetadata.handle as string)
                )
            })

            // If the artist wasn't found just return undefined
            if (!artist) {
                return null
            }

            const result: ClientArtist = {
                id: artist.id,
                handle: artist.handle,
                supporter: artist.supporter,
                terms: artist.terms,
                header_photo: artist.header_photo,
                about: artist.about,
                location: artist.location,
                socials: artist.socials,
                user: await clerkClient.users.getUser(artist.user_id)
            }

            await ctx.cache.set(
                AsRedisKey(
                    'artists',
                    input ? input.handle : (ctx.user?.publicMetadata.handle as string)
                ),
                JSON.stringify(result),
                {
                    EX: 3600
                }
            )

            return result
        })
})
