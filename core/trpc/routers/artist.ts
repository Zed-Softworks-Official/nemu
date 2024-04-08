import { z } from 'zod'
import { artistProcedure, createTRPCRouter, publicProcedure } from '../trpc'
import { redis } from '@/lib/redis'
import { Artist, Social, User } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { AsRedisKey } from '@/core/helpers'
import { RandomArtists } from '@/core/structures'
import { TRPCError } from '@trpc/server'
import { GetProfilePhoto } from '@/core/server-helpers'

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
            const cachedArtist = await redis.get(
                AsRedisKey('artists', input !== undefined ? input.handle : ctx.session?.user.handle!)
            )

            if (cachedArtist) {
                return JSON.parse(cachedArtist) as Artist & {
                    user: User
                    socials: Social[]
                }
            }

            // Fetch from database if they're not in the cache
            const artist = await prisma.artist.findFirst({
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

            artist.user.image = await GetProfilePhoto(artist.user)

            await redis.set(
                AsRedisKey('artists', input ? input.handle : ctx.session?.user.handle!),
                JSON.stringify(artist),
                'EX',
                3600
            )

            return artist
        }),

    /**
     * Gets random artists from the database
     */
    get_random: publicProcedure.query(async (opts) => {
        const randomArtistCache = await redis.get(AsRedisKey('artists', 'random'))

        if (randomArtistCache) {
            return JSON.parse(randomArtistCache) as RandomArtists[]
        }

        const artistCount = await prisma.artist.count()
        const artistSkip = Math.floor(Math.random() * artistCount)

        const randomArtists = await prisma.artist.findMany({
            // take: 5,
            // skip: artistSkip,
            include: {
                user: true
            }
        })

        for (const artist of randomArtists) {
            if (!artist.user.image?.includes('http')) {
                artist.user.image = await GetProfilePhoto(artist.user)
            }
        }

        await redis.set(
            AsRedisKey('artists', 'random'),
            JSON.stringify(randomArtists),
            'EX',
            3600
        )

        return randomArtists
    }),

    /**
     * Creates a new social item object for a given artist
     */
    set_social: artistProcedure
        .input(
            z.object({
                artist_id: z.string(),
                agent: z.string(),
                url: z.string()
            })
        )
        .mutation(async (opts) => {
            const { input } = opts

            const social = await prisma.social.create({
                data: {
                    artistId: input.artist_id,
                    agent: input.agent,
                    url: input.url
                }
            })

            if (!social) {
                return { success: false }
            }

            return { success: true }
        }),

    /**
     * Updates artist with the provided information
     */
    update_artist: artistProcedure
        .input(
            z.object({
                about: z.string().optional(),
                location: z.string().optional(),
                terms: z.string().optional(),
                tipJarUrl: z.string().url().optional().or(z.literal('')),
                automatedMessageEnabled: z.boolean().optional(),
                automatedMessage: z.string().optional()
            })
        )
        .mutation(async (opts) => {
            const { input, ctx } = opts

            const updated_artist = await prisma.artist.update({
                where: {
                    id: ctx.session.user.artist_id!
                },
                data: {
                    about: input.about,
                    location: input.location,
                    terms: input.terms,
                    tipJarUrl: input.tipJarUrl === '' ? undefined : input.tipJarUrl,
                    automatedMessageEnabled: input.automatedMessageEnabled,
                    automatedCommissionMessage: input.automatedMessage
                }
            })

            if (!updated_artist) {
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'Failed to update artist!'
                })
            }

            return { success: true }
        })
})
