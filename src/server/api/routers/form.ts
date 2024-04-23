import { Form } from '@prisma/client'
import { TRPCError } from '@trpc/server'
import { env } from 'process'
import { z } from 'zod'
import { RequestStatus } from '~/core/structures'

import { update_commission_check_waitlist } from '~/lib/server-utils'
import { artistProcedure, createTRPCRouter, protectedProcedure } from '~/server/api/trpc'
import { AsRedisKey } from '~/server/cache'
import { novu } from '~/server/novu'

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
            await ctx.db.form.create({
                data: {
                    name: input.name,
                    description: input.description,
                    artistId: ctx.session.user.artist_id!
                }
            })
        }),

    /**
     * Gets all forms from an artist
     */
    get_form_list: protectedProcedure
        .input(z.object({ artist_id: z.string() }))
        .query(async ({ input, ctx }) => {
            const cachedForms = await ctx.cache.get(AsRedisKey('forms', input.artist_id))

            if (cachedForms) {
                return JSON.parse(cachedForms) as Form[]
            }

            const forms = await ctx.db.form.findMany({
                where: {
                    artistId: input.artist_id
                }
            })

            if (!forms) {
                return undefined
            }

            await ctx.cache.set(
                AsRedisKey('forms', input.artist_id),
                JSON.stringify(forms),
                'EX',
                3600
            )

            return forms
        }),

    /**
     * Gets a SINGLE from from an artist given the artist id and the form id
     */
    get_form: protectedProcedure.input(z.string()).query(async ({ input, ctx }) => {
        const cachedForm = await ctx.cache.get(AsRedisKey('forms', input))

        if (cachedForm) {
            return JSON.parse(cachedForm) as Form
        }

        const form = await ctx.db.form.findFirst({
            where: {
                id: input
            }
        })

        if (!form) {
            return undefined
        }

        await ctx.cache.set(AsRedisKey('forms', input), JSON.stringify(form), 'EX', 3600)

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
            const updated = await ctx.db.form.update({
                where: {
                    id: input.form_id
                },
                data: {
                    content: input.content
                }
            })

            // Update Cache
            await ctx.cache.set(
                AsRedisKey('forms', updated.artistId, updated.id),
                JSON.stringify(updated),
                'EX',
                3600
            )

            return { success: true }
        }),

    /**
     * Submits a request to the given commission
     */
    set_request: protectedProcedure
        .input(
            z.object({
                form_id: z.string(),
                commission_id: z.string(),
                content: z.string()
            })
        )
        .mutation(async ({ input, ctx }) => {
            // Get commission data
            const commission = await ctx.db.commission.findFirst({
                where: {
                    id: input.commission_id
                },
                include: {
                    artist: true
                }
            })

            if (!commission) {
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: 'Commission not found'
                })
            }

            // Retrieve and Update the commission availability
            const waitlisted = await update_commission_check_waitlist(commission)

            // Create the request
            const request = await ctx.db.request.create({
                data: {
                    formId: input.form_id,
                    commissionId: input.commission_id,
                    content: input.content,
                    orderId: crypto.randomUUID(),
                    userId: ctx.session.user.id,
                    waitlist: waitlisted
                }
            })

            // Notify the artist of a new request
            novu.trigger('commission-request', {
                to: {
                    subscriberId: commission.artist.userId
                },
                payload: {
                    username: ctx.session.user.name!,
                    commission_name: commission.title,
                    slug: env.NEXTAUTH_URL + '/dashboard/commissions/' + commission.slug
                }
            })

            // Delete Cache
            await ctx.cache.del(
                AsRedisKey('commissions', commission.artistId, commission.slug)
            )
        }),

    /**
     * Checks if a user has already requested a commission
     */
    get_user_requsted: protectedProcedure
        .input(z.string())
        .query(async ({ input, ctx }) => {
            const request = await ctx.db.request.findFirst({
                where: {
                    formId: input,
                    userId: ctx.session.user.id
                }
            })

            if (!request) {
                return false
            }

            return true
        })
})
