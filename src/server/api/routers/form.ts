import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { artistProcedure, createTRPCRouter, protectedProcedure } from '~/server/api/trpc'
import { AsRedisKey, invalidate_cache } from '~/server/cache'
import { forms } from '~/server/db/schema'
import { TRPCError } from '@trpc/server'
import { createId } from '@paralleldrive/cuid2'

export const formRouter = createTRPCRouter({
    /**
     * Creates a new form with the given content
     */
    set_form: artistProcedure
        .input(
            z.object({
                name: z.string().min(2).max(50),
                description: z.string().max(256).optional()
            })
        )
        .mutation(async ({ input, ctx }) => {
            const form = await ctx.db
                .insert(forms)
                .values({
                    id: createId(),
                    name: input.name,
                    description: input.description,
                    artist_id: ctx.user.privateMetadata.artist_id as string
                })
                .returning()

            // Invalidate cache
            invalidate_cache(
                AsRedisKey('forms', form[0]?.artist_id as string),
                'forms_list'
            )
        }),

    /**
     * Sets the form content
     */
    set_form_content: artistProcedure
        .input(
            z.object({
                form_id: z.string(),
                content: z.string()
            })
        )
        .mutation(async ({ input, ctx }) => {
            const updated = (
                await ctx.db
                    .update(forms)
                    .set({
                        content: JSON.parse(input.content)
                    })
                    .where(eq(forms.id, input.form_id))
                    .returning()
            )[0]

            if (!updated) {
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'Unable to update form'
                })
            }

            // Invalidate Cache
            invalidate_cache(AsRedisKey('forms', updated.id), 'form')

            return { success: true }
        })
})
