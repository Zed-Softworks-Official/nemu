import { artistProcedure, createTRPCRouter, protectedProcedure } from '../trpc'
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

    set_form_content: artistProcedure
        .input(
            z.object({
                id: z.string(),
                content: z.string()
            })
        )
        .mutation(async ({ ctx, input }) => {
            await ctx.db
                .update(forms)
                .set({
                    content: input.content
                })
                .where(eq(forms.id, input.id))
        }),

    get_form_by_id: protectedProcedure
        .input(
            z.object({
                id: z.string()
            })
        )
        .query(async ({ ctx, input }) => {
            return await ctx.db.query.forms.findFirst({
                where: eq(forms.id, input.id)
            })
        }),

    get_forms_list: artistProcedure.query(async ({ ctx }) => {
        return await ctx.db.query.forms.findMany({
            where: eq(forms.artist_id, ctx.artist.id)
        })
    })
})
