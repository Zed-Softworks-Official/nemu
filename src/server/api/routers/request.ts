import { clerkClient } from '@clerk/nextjs/server'
import { createId } from '@paralleldrive/cuid2'
import { z } from 'zod'
import { and, eq, sql, type InferSelectModel } from 'drizzle-orm'

import { artistProcedure, createTRPCRouter, protectedProcedure } from '../trpc'

import {
    chats,
    commissions,
    type downloads,
    forms,
    invoices,
    kanbans,
    requests,
    stripe_customer_ids
} from '~/server/db/schema'
import {
    InvoiceStatus,
    type KanbanContainerData,
    RequestStatus,
    type ClientRequestData
} from '~/core/structures'
import type { FormElementInstance } from '~/components/form-builder/elements/form-elements'
import { TRPCError } from '@trpc/server'
import { knock, KnockWorkflows } from '~/server/knock'
import { env } from '~/env'
import { StripeCreateCustomer, StripeCreateInvoice } from '~/core/payments'
import { get_redis_key } from '~/server/redis'

export const request_router = createTRPCRouter({
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
                    content: JSON.parse(input.content) as FormElementInstance[]
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
    }),

    set_request: protectedProcedure
        .input(
            z.object({
                commission_id: z.string(),
                form_data: z.string()
            })
        )
        .mutation(async ({ ctx, input }) => {
            const commission = await ctx.db.query.commissions.findFirst({
                where: eq(commissions.id, input.commission_id),
                with: {
                    artist: true,
                    requests: true
                }
            })

            if (!commission) {
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: 'Commission not found'
                })
            }

            let waitlist = false
            if (
                commission.max_commissions_until_waitlist > 0 &&
                commission.requests.length >= commission.max_commissions_until_waitlist
            ) {
                waitlist = true
            }

            await ctx.db.insert(requests).values({
                id: createId(),
                form_id: commission.form_id,
                user_id: ctx.auth.userId,
                commission_id: input.commission_id,
                status: waitlist ? RequestStatus.Waitlist : RequestStatus.Pending,
                content: JSON.parse(input.form_data) as FormElementInstance[],
                order_id: createId()
            })

            const user_notification_promise = knock.workflows.trigger(
                KnockWorkflows.CommissionRequestUserEnd,
                {
                    recipients: [ctx.auth.userId],
                    data: {
                        commission_title: commission.title,
                        artist_handle: commission.artist.handle
                    }
                }
            )

            const artist_notification_promise = knock.workflows.trigger(
                KnockWorkflows.CommissionRequestArtistEnd,
                {
                    recipients: [commission.artist.id],
                    data: {
                        commission_title: commission.title,
                        commission_requests_url: `${env.BASE_URL}/dashboard/commissions/${commission.slug}`
                    }
                }
            )

            await Promise.all([user_notification_promise, artist_notification_promise])
        }),

    determine_request: artistProcedure
        .input(
            z.object({
                request_id: z.string(),
                accepted: z.boolean()
            })
        )
        .mutation(async ({ ctx, input }) => {
            const request = await ctx.db.query.requests.findFirst({
                where: eq(requests.id, input.request_id),
                with: {
                    commission: {
                        with: {
                            artist: true
                        }
                    }
                }
            })

            if (!request) {
                return new TRPCError({
                    code: 'NOT_FOUND',
                    message: 'Request not found'
                })
            }

            let customer_id = await ctx.db.query.stripe_customer_ids.findFirst({
                where: and(
                    eq(stripe_customer_ids.user_id, request.user_id),
                    eq(stripe_customer_ids.artist_id, request.commission.artist_id)
                )
            })

            if (!customer_id) {
                const clerk_client = await clerkClient()
                const user = await clerk_client.users.getUser(ctx.auth.userId)

                const customer = await StripeCreateCustomer(
                    user.id,
                    user.username ?? user.id,
                    user.emailAddresses[0]!.emailAddress
                )

                if (!customer) {
                    return new TRPCError({
                        code: 'INTERNAL_SERVER_ERROR',
                        message: 'Failed to create Stripe customer'
                    })
                }

                customer_id = (
                    await ctx.db
                        .insert(stripe_customer_ids)
                        .values({
                            id: createId(),
                            user_id: user.id,
                            artist_id: request.commission.artist_id,
                            customer_id: customer.id,
                            stripe_account: request.commission.artist.stripe_account
                        })
                        .returning()
                ).at(0)

                if (!customer_id) {
                    return new TRPCError({
                        code: 'INTERNAL_SERVER_ERROR',
                        message: 'Failed to create Stripe customer'
                    })
                }
            }

            await ctx.db
                .update(commissions)
                .set({
                    new_requests: sql`${commissions.new_requests} - 1`,
                    accepted_requests: sql`${commissions.accepted_requests} + ${input.accepted ? 1 : 0}`,
                    rejected_requests: sql`${commissions.rejected_requests} + ${input.accepted ? 0 : 1}`
                })
                .where(eq(commissions.id, request.commission_id))

            await knock.workflows.trigger(KnockWorkflows.CommissionDetermineRequest, {
                recipients: [request.user_id],
                data: {
                    commission_title: request.commission.title,
                    artist_handle: request.commission.artist.handle,
                    status: input.accepted ? 'accepted' : 'rejected'
                }
            })

            if (!input.accepted) {
                await ctx.db
                    .update(requests)
                    .set({
                        status: RequestStatus.Rejected
                    })
                    .where(eq(requests.id, request.id))

                return null
            }

            const invoice_id = createId()
            const stripe_draft = await StripeCreateInvoice(customer_id.customer_id, {
                customer_id: customer_id.customer_id,
                user_id: ctx.auth.userId,
                commission_id: request.commission_id,
                order_id: request.order_id,
                invoice_id
            })

            if (!stripe_draft) {
                return new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'Failed to create Stripe invoice'
                })
            }

            const kanban_primary_key = createId()
            const chat_primary_key = createId()

            const invoice_values = {
                id: invoice_id,
                stripe_id: stripe_draft.id,
                customer_id: customer_id.customer_id,
                artist_id: customer_id.artist_id,
                stripe_account: customer_id.stripe_account,
                user_id: ctx.auth.userId,
                status: InvoiceStatus.Creating,
                request_id: request.id,
                total: request.commission.price,
                items: [
                    {
                        id: createId(),
                        name: request.commission.title,
                        price: request.commission.price,
                        quantity: 1
                    }
                ]
            }

            const chat_values = {
                id: chat_primary_key,
                artist_id: request.commission.artist_id,
                user_id: ctx.auth.userId,
                request_id: request.id,
                commission_id: request.commission_id,
                message_redis_key: get_redis_key('chats', request.order_id)
            }

            const kanban_containers: KanbanContainerData[] = [
                {
                    id: createId(),
                    title: 'Todo'
                },
                {
                    id: createId(),
                    title: 'In Progress'
                },
                {
                    id: createId(),
                    title: 'Done'
                }
            ]

            const kanban_values = {
                id: kanban_primary_key,
                request_id: request.id,
                containers: kanban_containers
            }

            const request_values = {
                status: RequestStatus.Accepted,
                invoice_id,
                kanban_id: kanban_primary_key
            }

            await Promise.all([
                ctx.db.insert(invoices).values(invoice_values),
                ctx.db.insert(chats).values(chat_values),
                ctx.db.insert(kanbans).values(kanban_values),
                ctx.db
                    .update(requests)
                    .set(request_values)
                    .where(eq(requests.id, request.id))
            ])
        }),

    get_request_list: protectedProcedure.query(async ({ ctx }) => {
        const clerk_client = await clerkClient()
        const db_requests = await ctx.db.query.requests.findMany({
            where: eq(requests.user_id, ctx.auth.userId),
            with: {
                commission: {
                    with: {
                        artist: true
                    }
                }
            }
        })

        if (!db_requests) {
            return []
        }

        // Format for client
        const result: ClientRequestData[] = []
        for (const request of db_requests) {
            const user = await clerk_client.users.getUser(request.user_id)

            result.push({
                ...request,
                commission: {
                    ...request.commission,
                    images: [
                        {
                            url: request.commission.images[0]!.url
                        }
                    ]
                },
                user: {
                    id: request.user_id,
                    username: user.username ?? 'User'
                }
            })
        }

        return result
    }),

    get_request_by_id: protectedProcedure
        .input(
            z.object({
                order_id: z.string()
            })
        )
        .query(async ({ ctx, input }) => {
            const clerk_client = await clerkClient()
            const request = await ctx.db.query.requests.findFirst({
                where: eq(requests.order_id, input.order_id),
                with: {
                    commission: {
                        with: {
                            artist: true
                        }
                    },
                    download: true,
                    invoice: true,
                    kanban: true
                }
            })

            if (!request) {
                return undefined
            }

            let delivery:
                | (InferSelectModel<typeof downloads> & {
                      blur_data?: string
                      file_type: 'image' | 'zip'
                  })
                | undefined = undefined

            if (request.download) {
                const file_type: 'image' | 'zip' = request.download.url.includes('.zip')
                    ? 'zip'
                    : 'image'

                delivery = {
                    ...request.download,
                    file_type
                }
            }

            const user = await clerk_client.users.getUser(request.user_id)
            const result: ClientRequestData = {
                ...request,
                user: {
                    id: request.user_id,
                    username: user.username ?? 'User'
                },
                delivery,
                invoice: request.invoice ?? undefined,
                kanban: request.kanban ?? undefined
            }

            return result
        })
})
