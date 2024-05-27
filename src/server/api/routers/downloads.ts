import { createId } from '@paralleldrive/cuid2'
import { z } from 'zod'
import { artistProcedure, createTRPCRouter } from '~/server/api/trpc'
import { downloads } from '~/server/db/schema'

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
            await ctx.db.insert(downloads).values({
                id: createId(),
                user_id: input.user_id,
                request_id: input.request_id,
                url: input.url,
                ut_key: input.ut_key,
                artist_id: ctx.user.privateMetadata.artist_id as string
            })
        })
})
