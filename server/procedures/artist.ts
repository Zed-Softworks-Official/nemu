import { z } from 'zod'
import { publicProcedure } from '../trpc'
import { redis } from '@/lib/redis'
import { Artist, Social, User } from '@prisma/client'
import { prisma } from '@/lib/prisma'

/**
 * Gets the artist data along with the accompanying user and socials for the artist
 */
export const get_artist = publicProcedure
    .input(
        z.object({
            handle: z.string()
        })
    )
    .query(async (opts) => {
        const { input } = opts

        // Get the cached artist if they are cached
        const cachedArtist = await redis.get(input.handle)

        if (cachedArtist) {
            return JSON.parse(cachedArtist) as Artist & { user: User } & {
                socials: Social[]
            }
        }

        // Fetch from database if they're not in the cache
        const artist = await prisma.artist.findFirst({
            where: {
                handle: input.handle || undefined
            },
            include: {
                user: true,
                socials: true
            }
        })

        // If the artist wasn't found just return undefined
        if (!artist) {
            return undefined
        }

        await redis.set(input.handle!, JSON.stringify(artist), 'EX', 3600)

        return artist
    })
