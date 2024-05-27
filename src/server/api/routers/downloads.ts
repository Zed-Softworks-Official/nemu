import { createId } from '@paralleldrive/cuid2'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { artistProcedure, createTRPCRouter } from '~/server/api/trpc'
import { downloads, requests } from '~/server/db/schema'

export const downloadsRouter = createTRPCRouter({
    set_download: artistProcedure
        .input(
            z.object({
                url: z.string(),
                ut_key: z.string().optional(),
                user_id: z.string(),
                request_id: z.string()
            })
        )
        .mutation(async ({ input, ctx }) => {
            // Create download object
            const download = await ctx.db
                .insert(downloads)
                .values({
                    id: createId(),
                    user_id: input.user_id,
                    request_id: input.request_id,
                    url: input.url,
                    ut_key: input.ut_key,
                    artist_id: ctx.user.privateMetadata.artist_id as string
                })
                .returning()

            // Update the request to include the download id
            await ctx.db
                .update(requests)
                .set({
                    download_id: download[0]?.id
                })
                .where(eq(requests.id, input.request_id))
        })
})
