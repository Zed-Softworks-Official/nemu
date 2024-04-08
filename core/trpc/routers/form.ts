import { z } from 'zod'
import { artistProcedure, createTRPCRouter, protectedProcedure } from '../trpc'
import { redis } from '@/lib/redis'
import { prisma } from '@/lib/prisma'
import {
    Artist,
    Commission,
    Downloads,
    Form,
    Request,
    Kanban,
    User
} from '@prisma/client'
import { AsRedisKey } from '@/core/helpers'
import {
    CommissionAvailability,
    CommissionDataInvoice,
    CommissionStatus
} from '@/core/structures'
import { TRPCError } from '@trpc/server'
import { novu } from '@/lib/novu'
import { env } from '@/env'
import { UpdateCommissionAvailability } from '@/core/server-helpers'

export const formsRouter = createTRPCRouter({
    /**
     * Gets all forms from an artist
     */
    get_forms: protectedProcedure
        .input(z.object({ artist_id: z.string() }))
        .query(async (opts) => {
            const { input } = opts

            const cachedForms = await redis.get(AsRedisKey('forms', input.artist_id))

            if (cachedForms) {
                return JSON.parse(cachedForms) as Form[]
            }

            const forms = await prisma.form.findMany({
                where: {
                    artistId: input.artist_id
                }
            })

            if (!forms) {
                return undefined
            }

            await redis.set(
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
    get_form: protectedProcedure
        .input(
            z.object({
                artist_id: z.string(),
                form_id: z.string()
            })
        )
        .query(async (opts) => {
            const { input } = opts

            const cachedForm = await redis.get(
                AsRedisKey('forms', input.artist_id, input.form_id)
            )

            if (cachedForm) {
                return JSON.parse(cachedForm) as Form
            }

            const form = await prisma.form.findFirst({
                where: {
                    id: input.form_id
                }
            })

            if (!form) {
                return undefined
            }

            await redis.set(
                AsRedisKey('forms', input.artist_id, input.form_id),
                JSON.stringify(form),
                'EX',
                3600
            )

            return form
        }),

    /**
     * Gets a Request
     */
    get_request: protectedProcedure
        .input(
            z.object({
                order_id: z.string().optional(),
                request_id: z.string().optional(),
                channel_url: z.string().optional(),
                include_invoice_items: z.boolean().default(false).optional()
            })
        )
        .query(async (opts) => {
            const { input } = opts

            if (!input.order_id && !input.channel_url && !input.request_id) {
                return undefined
            }

            const cachedSubmission = await redis.get(
                AsRedisKey(
                    'form_submissions',
                    input.order_id || input.request_id || input.channel_url || 'undefined'
                )
            )

            if (cachedSubmission) {
                return JSON.parse(cachedSubmission) as {
                    submission: Request & {
                        form: Form & { artist: Artist; commission: Commission }
                        user: User
                    }
                    kanban: Kanban | undefined
                    download: Downloads | undefined
                    invoice: CommissionDataInvoice
                }
            }

            const request = await prisma.request.findFirst({
                where: {
                    orderId: input.order_id || undefined,
                    id: input.request_id || undefined,
                    sendbirdChannelURL: input.channel_url || undefined
                },
                include: {
                    form: {
                        include: {
                            artist: true,
                            commissions: true
                        }
                    },
                    user: true
                }
            })

            if (!request) {
                return undefined
            }

            const kanban = await prisma.kanban.findFirst({
                where: {
                    id: request.kanbanId || undefined
                }
            })

            const download = await prisma.downloads.findFirst({
                where: {
                    id: request.downloadId || undefined
                }
            })

            const invoice = await prisma.invoice.findFirst({
                where: {
                    id: request.invoiceId || undefined
                },
                include: {
                    items: input.include_invoice_items
                        ? input.include_invoice_items
                        : undefined
                }
            })

            const result = {
                submission: request,
                kanban: kanban || undefined,
                download: download || undefined,
                invoice: invoice || undefined
            }

            await redis.set(
                AsRedisKey(
                    'form_submissions',
                    input.order_id || input.request_id || input.channel_url || 'undefined'
                ),
                JSON.stringify(result),
                'EX',
                3600
            )

            return result
        }),

    /**
     * Creates a new submission for the user
     */
    set_request: protectedProcedure
        .input(
            z.object({
                commission_id: z.string(),
                form_id: z.string(),
                content: z.string()
            })
        )
        .mutation(async (opts) => {
            const { input, ctx } = opts

            const request = await prisma.request.create({
                data: {
                    userId: ctx.session.user.id!,
                    formId: input.form_id,
                    content: input.content,
                    commissionId: input.commission_id,
                    orderId: crypto.randomUUID()
                }
            })

            if (!request) {
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'Could not create request'
                })
            }

            // Update Commission availability
            await UpdateCommissionAvailability(input.form_id, input.commission_id)

            // Update form values
            const updated_form = await prisma.form.update({
                where: {
                    id: input.form_id
                },
                data: {
                    submissions: {
                        increment: 1
                    },
                    newSubmissions: {
                        increment: 1
                    }
                }
            })

            if (!updated_form) {
                throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' })
            }

            const commission = await prisma.commission.findFirst({
                where: {
                    id: input.commission_id
                },
                include: {
                    artist: true
                }
            })

            if (!commission) {
                throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' })
            }

            await prisma.request.update({
                where: {
                    id: request.id
                },
                data: {
                    waitlist:
                        commission.availability == CommissionAvailability.Waitlist
                            ? true
                            : false
                }
            })

            novu.trigger('commission-request', {
                to: {
                    subscriberId: commission.artist.userId!
                },
                payload: {
                    username: ctx.session.user.name!,
                    commission_name: commission.title,
                    slug: env.BASE_URL + `@${commission.artist.handle}/${commission.slug}`
                }
            })

            await redis.del(
                AsRedisKey('commissions', commission.artistId, commission.slug)
            )
        }),

    /**
     * Checks wether a user has submitted a commission for the artist
     */
    get_user_submitted: protectedProcedure.input(z.string()).query(async (opts) => {
        const { input, ctx } = opts

        const form = await prisma.form.findFirst({
            where: {
                id: input
            },
            include: {
                requests: true
            }
        })

        if (!form) {
            return undefined
        }

        const submitted = form.requests.find(
            (request) => request.userId === ctx.session.user.id!
        )

        if (!submitted) {
            return { user_submitted: false, content: form.content }
        }

        if (submitted.status != CommissionStatus.WaitingApproval) {
            return { user_submitted: true }
        }

        return {
            user_submitted: false,
            content: form.content
        }
    }),

    /**
     * Creates a new form
     */
    set_form: artistProcedure
        .input(
            z.object({
                artist_id: z.string(),
                form_name: z.string(),
                form_desc: z.string().optional(),
                commission_id: z.string().optional()
            })
        )
        .mutation(async (opts) => {
            const { input } = opts

            const form = await prisma.form.create({
                data: {
                    artistId: input.artist_id,
                    commissionId: input.commission_id,
                    name: input.form_name,
                    description: input.form_desc || 'No Description Added'
                }
            })

            if (!form) {
                return { success: false }
            }

            // Delete cached values
            const cachedForms = await redis.get(AsRedisKey('forms', input.artist_id))
            if (cachedForms) {
                await redis.del(AsRedisKey('forms', input.artist_id))
            }

            return { success: true }
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
        .mutation(async (opts) => {
            const { input } = opts

            const updated = await prisma.form.update({
                where: {
                    id: input.form_id
                },
                data: {
                    content: input.content
                }
            })

            if (!updated) {
                return { success: false }
            }

            // Update Cache
            await redis.set(
                AsRedisKey('forms', updated.artistId, updated.id),
                JSON.stringify(updated),
                'EX',
                3600
            )

            return { success: true }
        })
})
