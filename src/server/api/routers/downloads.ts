import { z } from 'zod'
import { artistProcedure, createTRPCRouter } from '~/server/api/trpc'

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

        })
})
