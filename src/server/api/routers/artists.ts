import { clerkClient } from '@clerk/nextjs/server'
import { eq } from 'drizzle-orm'
import { revalidateTag } from 'next/cache'
import { z } from 'zod'
import { update_index } from '~/core/search'
import { get_blur_data } from '~/lib/blur_data'
import { artistProcedure, createTRPCRouter } from '~/server/api/trpc'
import { AsRedisKey, cache, invalidate_cache } from '~/server/cache'
import { artists } from '~/server/db/schema'

export const artistRouter = createTRPCRouter({
    set_artist: artistProcedure
        .input(
            z.object({
                artist_id: z.string(),
                about: z.string().max(256),
                location: z.string(),
                terms: z.string(),

                tipJarUrl: z
                    .string()
                    .url('Needs to be a valid url!')
                    .optional()
                    .or(z.literal('')),
                automatedMessageEnabled: z.boolean(),
                automatedMessage: z.string().optional()
            })
        )
        .mutation(async ({ input, ctx }) => {
            const artist_updated = (
                await ctx.db
                    .update(artists)
                    .set({
                        about: input.about,
                        location: input.location,
                        terms: input.terms,
                        tip_jar_url: input.tipJarUrl,
                        automated_message_enabled: input.automatedMessageEnabled,
                        automated_message: input.automatedMessage
                    })
                    .where(eq(artists.id, input.artist_id))
                    .returning()
            )[0]!

            // Update Algolia
            await update_index('artists', {
                objectID: artist_updated.id,
                handle: artist_updated.handle,
                about: artist_updated.about,
                image_url: ctx.user.imageUrl
            })

            // Invalidate cache
            const new_cache_item = {
                ...artist_updated,
                user: clerkClient.users.getUser(artist_updated.user_id),
                header: {
                    url: artist_updated.header_photo,
                    blur_data: await get_blur_data(artist_updated.header_photo)
                }
            }

            invalidate_cache(
                AsRedisKey('artists', artist_updated.handle),
                'artist-data',
                new_cache_item
            )
        })
})
