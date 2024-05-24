import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { artistProcedure, createTRPCRouter, protectedProcedure } from '~/server/api/trpc'
import { AsRedisKey, cache } from '~/server/cache'
import { forms } from '~/server/db/schema'
import { ClientForm } from '~/core/structures'
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
            await cache.json.arrappend(
                AsRedisKey('forms', ctx.user.privateMetadata.artist_id as string),
                '$',
                form[0]
            )
        }),

    /**
     * Gets all forms from an artist
     */
    get_form_list: protectedProcedure
        .input(z.object({ artist_id: z.string() }))
        .query(async ({ input, ctx }) => {
            const cachedForms = await cache.json.get(AsRedisKey('forms', input.artist_id))
            if (cachedForms) {
                return cachedForms as ClientForm[]
            }

            const db_forms = await ctx.db.query.forms.findMany({
                where: eq(forms.artist_id, input.artist_id)
            })

            if (!db_forms) {
                return undefined
            }

            await cache.json.set(AsRedisKey('forms', input.artist_id), '$', db_forms)

            return db_forms
        }),

    /**
     * Gets a SINGLE from from an artist given the artist id and the form id
     */
    get_form: protectedProcedure.input(z.string()).query(async ({ input, ctx }) => {
        const cachedForm = await cache.json.get(AsRedisKey('forms', input))

        if (cachedForm) {
            return cachedForm as ClientForm
        }

        const form = await ctx.db.query.forms.findFirst({
            where: eq(forms.id, input)
        })

        if (!form) {
            return undefined
        }

        await cache.json.set(AsRedisKey('forms', input), '$', form)

        return form
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

            // Update Cache
            await cache.json.set(
                AsRedisKey('forms', input.form_id),
                '$.content',
                input.content
            )

            return { success: true }
        })
})
