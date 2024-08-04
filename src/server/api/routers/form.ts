import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { artistProcedure, createTRPCRouter } from '~/server/api/trpc'
import { forms, users } from '~/server/db/schema'
import { createId } from '@paralleldrive/cuid2'
import { revalidateTag } from 'next/cache'
import { db } from '~/server/db'
import { TRPCError } from '@trpc/server'

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
            const user = await db.query.users.findFirst({
                where: eq(users.clerk_id, ctx.user.id)
            })

            if (!user?.artist_id) {
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'User does not exist!'
                })
            }

            await ctx.db.insert(forms).values({
                id: createId(),
                name: input.name,
                description: input.description,
                artist_id: user.artist_id
            })

            // Invalidate cache
            revalidateTag('forms_list')
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
            await ctx.db
                .update(forms)
                .set({
                    content: JSON.parse(input.content)
                })
                .where(eq(forms.id, input.form_id))

            // Invalidate Cache
            revalidateTag('form')

            return { success: true }
        })
})
