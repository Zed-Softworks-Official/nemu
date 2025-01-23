import { clerkClient } from '@clerk/nextjs/server'
import { createId } from '@paralleldrive/cuid2'
import { z } from 'zod'
import { and, eq, type InferInsertModel, sql } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'

import { artistProcedure, createTRPCRouter, protectedProcedure } from '../trpc'

import {
    chats,
    commissions,
    delivery,
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
    type ClientRequestData,
    type Chat,
    DownloadType,
    ChargeMethod
} from '~/lib/structures'

import type { FormElementInstance } from '~/components/form-builder/elements/form-elements'
import { knock, KnockWorkflows } from '~/server/knock'
import { env } from '~/env'

import {
    StripeCreateCustomer,
    StripeCreateInvoice,
    StripeFinalizeInvoice,
    StripeUpdateInvoice
} from '~/lib/payments'

import { get_redis_key, redis } from '~/server/redis'
import { get_ut_url } from '~/lib/utils'
import { utapi } from '~/server/uploadthing'

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

    get_forms_list_and_payment_method: artistProcedure.query(async ({ ctx }) => {
        const forms_list = await ctx.db.query.forms.findMany({
            where: eq(forms.artist_id, ctx.artist.id)
        })

        return {
            forms: forms_list,
            default_charge_method: ctx.artist.default_charge_method
        }
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
                content: JSON.parse(input.form_data) as Record<string, string>,
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
                    recipients: [commission.artist.user_id],
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
                throw new TRPCError({
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

            const clerk_client = await clerkClient()
            const request_user = await clerk_client.users.getUser(request.user_id)

            if (!customer_id) {
                const customer = await StripeCreateCustomer(
                    request.commission.artist.stripe_account,
                    request_user.username ?? request_user.id,
                    request_user.emailAddresses[0]!.emailAddress
                )

                if (!customer) {
                    throw new TRPCError({
                        code: 'INTERNAL_SERVER_ERROR',
                        message: 'Failed to create Stripe customer'
                    })
                }

                customer_id = (
                    await ctx.db
                        .insert(stripe_customer_ids)
                        .values({
                            id: createId(),
                            user_id: request_user.id,
                            artist_id: request.commission.artist_id,
                            customer_id: customer.id,
                            stripe_account: request.commission.artist.stripe_account
                        })
                        .returning()
                ).at(0)

                if (!customer_id) {
                    throw new TRPCError({
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

            // TODO:
            // Figure out what the charge method is
            // And then create the invoice(s) accordingly
            const is_down_payment =
                request.commission.charge_method === ChargeMethod.DownPayment
            const invoice_ids: string[] = is_down_payment
                ? [createId(), createId()]
                : [createId()]
            const invoice_values: Omit<InferInsertModel<typeof invoices>, 'status'>[] = []

            const kanban_primary_key = createId()
            const chat_primary_key = createId()

            for (
                let invoice_index = 0;
                invoice_index < invoice_ids.length;
                invoice_index++
            ) {
                const invoice_id = invoice_ids[invoice_index]

                if (!invoice_id) {
                    throw new TRPCError({
                        code: 'INTERNAL_SERVER_ERROR',
                        message: 'Invoice ID not found'
                    })
                }

                const stripe_draft = await StripeCreateInvoice(
                    customer_id.stripe_account,
                    {
                        customer_id: customer_id.customer_id,
                        user_id: request.user_id,
                        commission_id: request.commission_id,
                        order_id: request.order_id,
                        invoice_id,
                        artist_id: request.commission.artist_id
                    }
                )

                if (!stripe_draft) {
                    throw new TRPCError({
                        code: 'INTERNAL_SERVER_ERROR',
                        message: 'Failed to create Stripe invoice'
                    })
                }

                invoice_values.push({
                    id: invoice_id,
                    customer_id: customer_id.customer_id,
                    artist_id: customer_id.artist_id,
                    stripe_account: customer_id.stripe_account,
                    user_id: customer_id.user_id,
                    request_id: request.id,
                    total: request.commission.price,
                    stripe_id: stripe_draft.id,
                    is_final: invoice_index !== 0,
                    hosted_url: stripe_draft.hosted_invoice_url,
                    items: [
                        {
                            id: createId(),
                            name: request.commission.title,
                            price: request.commission.price,
                            quantity: 1
                        }
                    ]
                })
            }

            const chat_values = {
                id: chat_primary_key,
                artist_id: request.commission.artist_id,
                user_ids: [request.user_id, request.commission.artist.user_id],
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
            } satisfies InferInsertModel<typeof kanbans>

            const request_values = {
                status: RequestStatus.Accepted,
                invoice_ids,
                kanban_id: kanban_primary_key
            }

            await Promise.all([
                async () => {
                    for (const invoice_value of invoice_values) {
                        await ctx.db.insert(invoices).values({
                            ...invoice_value,
                            status: InvoiceStatus.Creating
                        })
                    }
                },
                ctx.db.insert(chats).values(chat_values),
                ctx.db.insert(kanbans).values(kanban_values),
                ctx.db
                    .update(requests)
                    .set(request_values)
                    .where(eq(requests.id, request.id)),
                redis.json.set(chat_values.message_redis_key, '$', {
                    id: request.order_id,
                    commission_title: request.commission.title,
                    messages: [],
                    users: [
                        {
                            user_id: request.user_id,
                            username: request_user.username ?? request.user_id
                        },
                        {
                            user_id: request.commission.artist.user_id,
                            username: request.commission.artist.handle
                        }
                    ]
                } satisfies Chat)
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
                            url: get_ut_url(request.commission.images[0]?.ut_key ?? '')
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
                order_id: z.string(),
                requester: z.literal('user').or(z.literal('artist'))
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
                    delivery: true,
                    invoices: true,
                    kanban: true
                }
            })

            if (!request) {
                return undefined
            }

            if (input.requester === 'user' && request.user_id !== ctx.auth.userId) {
                return undefined
            } else if (
                input.requester === 'artist' &&
                request.commission.artist.user_id !== ctx.auth.userId
            ) {
                return undefined
            }

            let current_invoice_index = 0
            for (const invoice of request.invoices) {
                if (invoice.is_final) {
                    current_invoice_index++
                }
            }

            const user = await clerk_client.users.getUser(request.user_id)
            const result: ClientRequestData = {
                ...request,
                commission: {
                    ...request.commission,
                    images: request.commission.images.map((image) => ({
                        url: get_ut_url(image.ut_key)
                    }))
                },
                user: {
                    id: request.user_id,
                    username: user.username ?? 'User'
                },
                delivery: request.delivery ?? undefined,
                invoices: request.invoices ?? undefined,
                current_invoice_index,
                kanban: request.kanban ?? undefined
            }

            return result
        }),

    update_request_delivery: artistProcedure
        .input(
            z.object({
                order_id: z.string(),
                file_key: z.string(),
                file_type: z.string()
            })
        )
        .mutation(async ({ ctx, input }) => {
            const data = await ctx.db.query.requests.findFirst({
                where: eq(requests.order_id, input.order_id),
                with: {
                    delivery: true
                }
            })

            if (!data) {
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: 'Request not found'
                })
            }

            if (!data?.delivery) {
                await ctx.db.insert(delivery).values({
                    id: createId(),
                    artist_id: ctx.artist.id,
                    request_id: data.id,
                    user_id: data.user_id,
                    type:
                        input.file_type === 'application/zip'
                            ? DownloadType.Archive
                            : DownloadType.Image,
                    ut_key: input.file_key
                })

                return
            }

            const delete_promise = utapi.deleteFiles([data.delivery.ut_key])
            const update_promise = ctx.db
                .update(delivery)
                .set({
                    ut_key: input.file_key,
                    type:
                        input.file_type === 'application/zip'
                            ? DownloadType.Archive
                            : DownloadType.Image
                })
                .where(eq(delivery.id, data.delivery.id))

            await Promise.all([delete_promise, update_promise])
        }),

    update_invoice_items: artistProcedure
        .input(
            z.object({
                invoice_id: z.string(),
                items: z.array(
                    z.object({
                        id: z.string(),
                        name: z.string(),
                        price: z.number(),
                        quantity: z.number()
                    })
                )
            })
        )
        .mutation(async ({ ctx, input }) => {
            await ctx.db
                .update(invoices)
                .set({
                    items: input.items,
                    total: input.items.reduce(
                        (acc, item) => acc + item.price * item.quantity,
                        0
                    )
                })
                .where(eq(invoices.id, input.invoice_id))
        }),

    // TODO: Pass in InvoiceItems directly from the invoice editor, that way, when
    // We send the invoice, we send the most recent up to date items, rather then,
    // Possibly losing out on information if the user doesn't save before sending
    send_invoice: artistProcedure
        .input(
            z.object({
                invoice_id: z.string(),
                is_downpayment_invoice: z.boolean()
            })
        )
        .mutation(async ({ ctx, input }) => {
            const invoice = await ctx.db.query.invoices.findFirst({
                where: eq(invoices.id, input.invoice_id),
                with: {
                    request: {
                        with: {
                            commission: true
                        }
                    }
                }
            })

            if (!invoice) {
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: 'Invoice not found!'
                })
            }

            await StripeUpdateInvoice(
                invoice.customer_id,
                invoice.stripe_account,
                invoice.stripe_id,
                invoice.items,
                ctx.artist.supporter
            )

            const finalized_invoice = await StripeFinalizeInvoice(
                invoice.stripe_id,
                invoice.stripe_account
            )

            if (!finalized_invoice) {
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'Failed to finalize invoice'
                })
            }

            await Promise.all([
                ctx.db
                    .update(invoices)
                    .set({
                        status: InvoiceStatus.Pending,
                        sent: true,
                        stripe_id: finalized_invoice.id,
                        hosted_url: finalized_invoice.hosted_invoice_url,
                        total: finalized_invoice.total
                    })
                    .where(eq(invoices.id, input.invoice_id)),
                knock.workflows.trigger(KnockWorkflows.InvoiceSent, {
                    recipients: [invoice.request.user_id],
                    data: {
                        commission_title: invoice.request.commission.title,
                        artist_handle: ctx.artist.handle,
                        invoice_url: `${env.BASE_URL}/requests/${invoice.request.order_id}/invoice`
                    }
                })
            ])
        }),

    request_failed: artistProcedure
        .input(
            z.object({
                file_key: z.string()
            })
        )
        .mutation(async ({ input }) => {
            await utapi.deleteFiles([input.file_key])
        })
})
