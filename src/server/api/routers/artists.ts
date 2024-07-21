import { TRPCError } from '@trpc/server'
import { eq } from 'drizzle-orm'
import { revalidateTag } from 'next/cache'
import { z } from 'zod'
import { update_index } from '~/core/search'
import { artistProcedure, createTRPCRouter } from '~/server/api/trpc'
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

            const artist_updated = await ctx.db.query.artists.findFirst({
                where: eq(artists.id, input.artist_id)
            })

            if (!artist_updated) {
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'Could not update artist'
                })
            }

            // Update Algolia
            await update_index('artists', {
                objectID: artist_updated.id,
                handle: artist_updated.handle,
                about: artist_updated.about,
                image_url: ctx.user.imageUrl
            })

            // Invalidate cache
            revalidateTag('artist_data')
        })
})
