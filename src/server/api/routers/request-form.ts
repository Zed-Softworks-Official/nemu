import { artistProcedure, createTRPCRouter } from '../trpc'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { createId } from '@paralleldrive/cuid2'

import { forms } from '~/server/db/schema'

export const request_form_router = createTRPCRouter({
    set_form: artistProcedure
        .input(
            z.object({
                name: z.string(),
                description: z.string().optional()
            })
        )
        .mutation(async ({ ctx, input }) => {
            await ctx.db.insert(forms).values({
                id: createId(),
                name: input.name,
                description: input.description,
                artist_id: ctx.artist.id
            })
        }),

    get_forms_list: artistProcedure.query(async ({ ctx }) => {
        return await ctx.db.query.forms.findMany({
            where: eq(forms.artist_id, ctx.artist.id)
        })
    })
})
