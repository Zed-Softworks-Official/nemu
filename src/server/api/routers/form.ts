import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { artistProcedure, createTRPCRouter, protectedProcedure } from '~/server/api/trpc'
import { AsRedisKey } from '~/server/cache'
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
            await ctx.db.insert(forms).values({
                id: createId(),
                name: input.name,
                description: input.description,
                artist_id: ctx.user.privateMetadata.artist_id as string
            })

            await ctx.cache.del(
                AsRedisKey('forms', ctx.user.privateMetadata.artist_id as string)
            )
        }),

    /**
     * Gets all forms from an artist
     */
    get_form_list: protectedProcedure
        .input(z.object({ artist_id: z.string() }))
        .query(async ({ input, ctx }) => {
            const cachedForms = await ctx.cache.get(AsRedisKey('forms', input.artist_id))

            if (cachedForms) {
                return JSON.parse(cachedForms) as ClientForm[]
            }

            const db_forms = await ctx.db.query.forms.findMany({
                where: eq(forms.artist_id, input.artist_id)
            })

            if (!db_forms) {
                return undefined
            }

            await ctx.cache.set(
                AsRedisKey('forms', input.artist_id),
                JSON.stringify(db_forms),
                {
                    EX: 3600
                }
            )

            return db_forms
        }),

    /**
     * Gets a SINGLE from from an artist given the artist id and the form id
     */
    get_form: protectedProcedure.input(z.string()).query(async ({ input, ctx }) => {
        const cachedForm = await ctx.cache.get(AsRedisKey('forms', input))

        if (cachedForm) {
            return JSON.parse(cachedForm) as ClientForm
        }

        const form = await ctx.db.query.forms.findFirst({
            where: eq(forms.id, input)
        })

        if (!form) {
            return undefined
        }

        await ctx.cache.set(AsRedisKey('forms', input), JSON.stringify(form), {
            EX: 3600
        })

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
            await ctx.cache.set(
                AsRedisKey('forms', updated.id),
                JSON.stringify(updated),
                { EX: 3600 }
            )

            return { success: true }
        })
})
