import { z } from 'zod'
import {
    artistProcedure,
    createTRPCRouter,
    protectedProcedure,
    publicProcedure
} from '../trpc'
import { redis } from '@/lib/redis'
import { prisma } from '@/lib/prisma'
import {
    Artist,
    Commission,
    Downloads,
    Form,
    FormSubmission,
    Kanban,
    User
} from '@prisma/client'
import { AsRedisKey } from '@/core/helpers'
import { CommissionDataInvoice, CommissionStatus, Role } from '@/core/structures'

export const formsRouter = createTRPCRouter({
    /**
     * Gets all forms from an artist
     */
    get_forms: publicProcedure
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
    get_form: publicProcedure
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
     * Gets a FormSubmission
     */
    get_submission: publicProcedure
        .input(
            z.object({
                order_id: z.string().optional(),
                submission_id: z.string().optional(),
                channel_url: z.string().optional(),
                include_invoice_items: z.boolean().default(false).optional()
            })
        )
        .query(async (opts) => {
            const { input } = opts

            if (!input.order_id && !input.channel_url && !input.submission_id) {
                return undefined
            }

            const cachedSubmission = await redis.get(
                AsRedisKey(
                    'form_submissions',
                    input.order_id ||
                        input.submission_id ||
                        input.channel_url ||
                        'undefined'
                )
            )

            if (cachedSubmission) {
                return JSON.parse(cachedSubmission) as {
                    submission: FormSubmission & {
                        form: Form & { artist: Artist; commission: Commission }
                        user: User
                    }
                    kanban: Kanban | undefined
                    download: Downloads | undefined
                    invoice: CommissionDataInvoice
                }
            }

            const submission = await prisma.formSubmission.findFirst({
                where: {
                    orderId: input.order_id || undefined,
                    id: input.submission_id || undefined,
                    sendbirdChannelURL: input.channel_url || undefined
                },
                include: {
                    form: {
                        include: {
                            artist: true,
                            commission: true
                        }
                    },
                    user: true
                }
            })

            if (!submission) {
                return undefined
            }

            const kanban = await prisma.kanban.findFirst({
                where: {
                    id: submission.kanbanId || undefined
                }
            })

            const download = await prisma.downloads.findFirst({
                where: {
                    id: submission.downloadId || undefined
                }
            })

            const invoice = await prisma.invoice.findFirst({
                where: {
                    id: submission.invoiceId || undefined
                },
                include: {
                    items: input.include_invoice_items
                        ? input.include_invoice_items
                        : undefined
                }
            })

            const result = {
                submission,
                kanban: kanban || undefined,
                download: download || undefined,
                invoice: invoice || undefined
            }

            await redis.set(
                AsRedisKey(
                    'form_submissions',
                    input.order_id ||
                        input.submission_id ||
                        input.channel_url ||
                        'undefined'
                ),
                JSON.stringify(result),
                'EX',
                3600
            )

            return result
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
                formSubmissions: true
            }
        })

        if (!form) {
            return undefined
        }

        const submitted = form.formSubmissions.find(
            (submission) => submission.userId === ctx.session.user.user_id!
        )

        if (!submitted) {
            return { user_submitted: false, content: form.content }
        }

        if (submitted.commissionStatus != CommissionStatus.WaitingApproval) {
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
        })
})
