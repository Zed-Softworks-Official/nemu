import { clerkClient } from '@clerk/nextjs/server'
import { createId } from '@paralleldrive/cuid2'
import { z } from 'zod'
import { eq, type InferInsertModel, sql } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'

import { artistProcedure, createTRPCRouter, protectedProcedure } from '../trpc'

import {
    chats,
    commissions,
    delivery,
    forms,
    invoices,
    kanbans,
    requests
} from '~/server/db/schema'

import {
    type KanbanContainerData,
    type ClientRequestData,
    type Chat,
    type RequestQueue,
    type StripeInvoiceData
} from '~/lib/types'

import type { FormElementInstance } from '~/app/_components/form-builder/elements/form-elements'
import { sendNotification, KnockWorkflows } from '~/server/knock'
import { env } from '~/env'

import {
    StripeCreateCustomer,
    StripeCreateInvoice,
    StripeFinalizeInvoice,
    StripeUpdateInvoice
} from '~/lib/payments'

import { getRedisKey, redis } from '~/server/redis'
import { getUTUrl } from '~/lib/utils'
import { utapi } from '~/server/uploadthing'
import { isSupporter } from '~/app/api/stripe/sync'

export const requestRouter = createTRPCRouter({
    setForm: artistProcedure
        .input(
            z.object({
                name: z.string(),
                description: z.string().optional()
            })
        )
        .mutation(async ({ ctx, input }) => {
            const formId = createId()
            await ctx.db.insert(forms).values({
                id: formId,
                name: input.name,
                description: input.description,
                artistId: ctx.artist.id
            })

            return {
                id: formId
            }
        }),

    setFormContent: artistProcedure
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

    getFormById: protectedProcedure
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

    getFormsListAndPaymentMethod: artistProcedure.query(async ({ ctx }) => {
        const forms_list = await ctx.db.query.forms.findMany({
            where: eq(forms.artistId, ctx.artist.id)
        })

        return {
            forms: forms_list,
            defaultChargeMethod: ctx.artist.defaultChargeMethod
        }
    }),

    setRequest: protectedProcedure
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

            if (commission.availability === 'closed') {
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: 'How did you even get here?'
                })
            }

            const request_redis_key = getRedisKey('request_queue', input.commission_id)
            const request_queue = (
                await ctx.redis.json.get<RequestQueue[] | null>(request_redis_key, '$')
            )?.[0]

            if (!request_queue) {
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'Request queue not found'
                })
            }

            const order_id = createId()
            const is_waitlist = commission.availability === 'waitlist'

            await ctx.db.insert(requests).values({
                id: createId(),
                formId: commission.formId,
                userId: ctx.auth.userId,
                commissionId: input.commission_id,
                status: is_waitlist ? 'waitlist' : 'pending',
                content: JSON.parse(input.form_data) as Record<string, string>,
                orderId: order_id
            })

            if (
                request_queue.requests.length + 1 >=
                    commission.maxCommissionsUntilWaitlist &&
                commission.availability === 'open'
            ) {
                await ctx.db
                    .update(commissions)
                    .set({
                        availability: 'waitlist'
                    })
                    .where(eq(commissions.id, commission.id))
            } else if (
                commission.availability === 'waitlist' &&
                request_queue.waitlist.length + 1 + request_queue.requests.length >=
                    commission.maxCommissionsUntilClosed
            ) {
                await ctx.db
                    .update(commissions)
                    .set({
                        availability: 'closed'
                    })
                    .where(eq(commissions.id, commission.id))
            }

            const user_notification_promise = sendNotification({
                type: KnockWorkflows.CommissionRequestUserEnd,
                recipients: [ctx.auth.userId],
                data: {
                    commission_title: commission.title,
                    artist_handle: commission.artist.handle
                }
            })

            const artist_notification_promise = sendNotification({
                type: KnockWorkflows.CommissionRequestArtistEnd,
                recipients: [commission.artist.userId],
                data: {
                    commission_title: commission.title,
                    requests_url: `${env.BASE_URL}/dashboard/commissions/${commission.slug}`
                }
            })

            const path = is_waitlist ? '$.waitlist' : '$.requests'
            const update_request_queue_promise = ctx.redis.json.arrappend(
                request_redis_key,
                path,
                `"${order_id}"`
            )

            await Promise.all([
                user_notification_promise,
                artist_notification_promise,
                update_request_queue_promise
            ])
        }),

    determineRequest: artistProcedure
        .input(
            z.object({
                requestId: z.string(),
                accepted: z.boolean()
            })
        )
        .mutation(async ({ ctx, input }) => {
            const request = await ctx.db.query.requests.findFirst({
                where: eq(requests.id, input.requestId),
                with: {
                    commission: true
                }
            })

            if (!request) {
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: 'Request not found'
                })
            }

            let customer_id = await ctx.redis.get<string>(
                getRedisKey(
                    'stripe:artist:customer',
                    request.userId,
                    request.commission.artistId
                )
            )

            const clerk = await clerkClient()
            const request_user = await clerk.users.getUser(request.userId)

            if (!customer_id) {
                const customer = await StripeCreateCustomer(
                    ctx.artist.stripeAccount,
                    request_user.username ?? request_user.id,
                    request_user.emailAddresses[0]!.emailAddress
                )

                if (!customer) {
                    throw new TRPCError({
                        code: 'INTERNAL_SERVER_ERROR',
                        message: 'Failed to create Stripe customer'
                    })
                }

                customer_id = customer.id
                await ctx.redis.set<string>(
                    getRedisKey(
                        'stripe:artist:customer',
                        request.userId,
                        request.commission.artistId
                    ),
                    customer_id
                )

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
                    newRequests: sql`${commissions.newRequests} - 1`,
                    acceptedRequests: sql`${commissions.acceptedRequests} + ${input.accepted ? 1 : 0}`,
                    rejectedRequests: sql`${commissions.rejectedRequests} + ${input.accepted ? 0 : 1}`
                })
                .where(eq(commissions.id, request.commissionId))

            await sendNotification({
                type: KnockWorkflows.CommissionDetermineRequest,
                recipients: [request.userId],
                data: {
                    commission_title: request.commission.title,
                    artist_handle: ctx.artist.handle,
                    status: input.accepted ? 'accept' : 'reject'
                }
            })

            if (!input.accepted) {
                // Remove from request queue
                const redis_key = getRedisKey('request_queue', request.commissionId)
                const path = request.status === 'pending' ? '$.requests' : '$.waitlist'
                const index = await ctx.redis.json.arrindex(
                    redis_key,
                    path,
                    request.orderId
                )

                if (!index[0]) {
                    throw new TRPCError({
                        code: 'INTERNAL_SERVER_ERROR',
                        message: 'Request not found in request queue'
                    })
                }

                await ctx.redis.json.arrpop(redis_key, path, index[0])

                // Update request status
                await ctx.db
                    .update(requests)
                    .set({
                        status: 'rejected'
                    })
                    .where(eq(requests.id, request.id))

                return null
            }

            // Figure out what the charge method is
            // And then create the invoice(s) accordingly
            const is_down_payment = request.commission.chargeMethod === 'down_payment'
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
                    ctx.artist.stripeAccount,
                    customer_id,
                    request.orderId
                )

                if (!stripe_draft) {
                    throw new TRPCError({
                        code: 'INTERNAL_SERVER_ERROR',
                        message: 'Failed to create Stripe invoice'
                    })
                }

                invoice_values.push({
                    id: invoice_id,
                    customerId: customer_id,
                    artistId: ctx.artist.id,
                    stripeAccount: ctx.artist.stripeAccount,
                    userId: request.userId,
                    requestId: request.id,
                    total: request.commission.price,
                    stripeId: stripe_draft.id,
                    isFinal: invoice_index === invoice_ids.length - 1,
                    hostedUrl: stripe_draft.hosted_invoice_url,
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
                artistId: request.commission.artistId,
                userIds: [request.userId, ctx.artist.userId],
                requestId: request.id,
                commissionId: request.commissionId,
                messageRedisKey: getRedisKey('chats', request.orderId)
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
                requestId: request.id,
                containers: kanban_containers
            } satisfies InferInsertModel<typeof kanbans>

            const createInvoicesPromise = async () => {
                for (const invoice_value of invoice_values) {
                    await ctx.db.insert(invoices).values({
                        ...invoice_value,
                        status: 'creating'
                    })
                }
            }

            await Promise.all([
                createInvoicesPromise(),
                ctx.db.insert(chats).values(chat_values),
                ctx.db.insert(kanbans).values(kanban_values),
                ctx.db
                    .update(requests)
                    .set({
                        kanbanId: kanban_primary_key,
                        invoiceIds: invoice_ids,
                        status: 'accepted'
                    })
                    .where(eq(requests.id, request.id)),
                redis.json.set(chat_values.messageRedisKey, '$', {
                    id: request.orderId,
                    commissionTitle: request.commission.title,
                    messages: [],
                    users: [
                        {
                            userId: request.userId,
                            username: request_user.username ?? request.userId
                        },
                        {
                            userId: ctx.artist.userId,
                            username: ctx.artist.handle
                        }
                    ]
                } satisfies Chat)
            ])
        }),

    getRequestList: protectedProcedure.query(async ({ ctx }) => {
        const clerk = await clerkClient()
        const db_requests = await ctx.db.query.requests.findMany({
            where: eq(requests.userId, ctx.auth.userId),
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
            const user = await clerk.users.getUser(request.userId)

            result.push({
                ...request,
                commission: {
                    ...request.commission,
                    images: [
                        {
                            url: getUTUrl(request.commission.images[0]?.utKey ?? '')
                        }
                    ]
                },
                user: {
                    id: request.userId,
                    username: user.username ?? 'User'
                }
            })
        }

        return result
    }),

    getRequestById: protectedProcedure
        .input(
            z.object({
                orderId: z.string(),
                requester: z.literal('user').or(z.literal('artist'))
            })
        )
        .query(async ({ ctx, input }) => {
            const clerk = await clerkClient()
            const request = await ctx.db.query.requests.findFirst({
                where: eq(requests.orderId, input.orderId),
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

            if (input.requester === 'user' && request.userId !== ctx.auth.userId) {
                return undefined
            } else if (
                input.requester === 'artist' &&
                request.commission.artist.userId !== ctx.auth.userId
            ) {
                return undefined
            }

            let currentInvoiceIndex = 0
            for (const invoice of request.invoices) {
                if (invoice.isFinal) {
                    currentInvoiceIndex++
                }
            }

            const user = await clerk.users.getUser(request.userId)
            const result: ClientRequestData = {
                ...request,
                commission: {
                    ...request.commission,
                    images: request.commission.images.map((image) => ({
                        url: getUTUrl(image.utKey)
                    }))
                },
                user: {
                    id: request.userId,
                    username: user.username ?? 'User'
                },
                delivery: request.delivery ?? undefined,
                invoices: request.invoices ?? undefined,
                currentInvoiceIndex,
                kanban: request.kanban ?? undefined
            }

            return result
        }),

    updateRequestDelivery: artistProcedure
        .input(
            z.object({
                orderId: z.string(),
                fileKey: z.string(),
                fileType: z.string(),
                isFinal: z.boolean()
            })
        )
        .mutation(async ({ ctx, input }) => {
            const data = await ctx.db.query.requests.findFirst({
                where: eq(requests.orderId, input.orderId),
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
                    artistId: ctx.artist.id,
                    requestId: data.id,
                    userId: data.userId,
                    type: input.fileType === 'application/zip' ? 'archive' : 'image',
                    utKey: input.fileKey,
                    isFinal: input.isFinal
                })

                return
            }

            const delete_promise = utapi.deleteFiles([data.delivery.utKey])
            const update_promise = ctx.db
                .update(delivery)
                .set({
                    utKey: input.fileKey,
                    type: input.fileType === 'application/zip' ? 'archive' : 'image',
                    isFinal: input.isFinal
                })
                .where(eq(delivery.id, data.delivery.id))

            await Promise.all([delete_promise, update_promise])
        }),

    updateInvoiceItems: artistProcedure
        .input(
            z.object({
                invoiceId: z.string(),
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
                .where(eq(invoices.id, input.invoiceId))
        }),

    // TODO: Pass in InvoiceItems directly from the invoice editor, that way, when
    // We send the invoice, we send the most recent up to date items, rather then,
    // Possibly losing out on information if the user doesn't save before sending
    setInvoice: artistProcedure
        .input(
            z.object({
                invoiceId: z.string(),
                isDownpaymentInvoice: z.boolean()
            })
        )
        .mutation(async ({ ctx, input }) => {
            const invoice = await ctx.db.query.invoices.findFirst({
                where: eq(invoices.id, input.invoiceId),
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
                invoice.customerId,
                invoice.stripeAccount,
                invoice.stripeId,
                invoice.items,
                invoice.request.commission.chargeMethod === 'down_payment'
                    ? {
                          index: invoice.isFinal ? 1 : 0,
                          percentage: invoice.request.commission.downpaymentPercentage
                      }
                    : undefined
            )

            const supporter = await isSupporter(ctx.artist.userId)
            const finalized_invoice = await StripeFinalizeInvoice(
                invoice.stripeId,
                invoice.stripeAccount,
                supporter
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
                        status: 'pending',
                        sent: true,
                        stripeId: finalized_invoice.id,
                        hostedUrl: finalized_invoice.hosted_invoice_url,
                        total: finalized_invoice.total
                    })
                    .where(eq(invoices.id, input.invoiceId)),
                sendNotification({
                    type: KnockWorkflows.InvoiceSent,
                    recipients: [invoice.request.userId],
                    data: {
                        commission_title: invoice.request.commission.title,
                        artist_handle: ctx.artist.handle,
                        invoice_url: `${env.BASE_URL}/requests/${invoice.request.orderId}/invoice`
                    }
                }),
                ctx.redis.zadd('invoices_due_cron', {
                    score: finalized_invoice.due_date ?? 0,
                    member: finalized_invoice.id
                }),
                ctx.redis.set(getRedisKey('invoices', finalized_invoice.id), {
                    id: finalized_invoice.id,
                    dbId: invoice.id,
                    stripeAccount: invoice.stripeAccount,
                    customerId: invoice.customerId,
                    dueDate: finalized_invoice.due_date ?? 0,
                    status: 'pending',
                    requestId: invoice.requestId,
                    userId: invoice.userId,
                    commissionId: invoice.request.commissionId,
                    orderId: invoice.request.orderId
                } satisfies StripeInvoiceData)
            ])
        }),

    requestFailed: artistProcedure
        .input(
            z.object({
                fileKey: z.string()
            })
        )
        .mutation(async ({ input }) => {
            await utapi.deleteFiles([input.fileKey])
        })
})
