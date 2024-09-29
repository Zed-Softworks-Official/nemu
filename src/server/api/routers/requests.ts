import { clerkClient } from '@clerk/nextjs/server'
import { createId } from '@paralleldrive/cuid2'
import { TRPCError } from '@trpc/server'
import { and, eq, sql } from 'drizzle-orm'
import { revalidateTag } from 'next/cache'
import { z } from 'zod'
import { StripeCreateCustomer, StripeCreateInvoice } from '~/core/payments'
import { InvoiceStatus, type KanbanContainerData, RequestStatus } from '~/core/structures'
import { env } from '~/env'
import { update_commission_check_waitlist } from '~/lib/server-utils'
import { artistProcedure, createTRPCRouter, protectedProcedure } from '~/server/api/trpc'
import {
    commissions,
    invoice_items,
    invoices,
    kanbans,
    requests,
    stripe_customer_ids
} from '~/server/db/schema'
import { knock, KnockWorkflows } from '~/server/knock'
import * as sendbird from '~/server/sendbird'

export const requestRouter = createTRPCRouter({
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
            const commission = await ctx.db.query.commissions.findFirst({
                where: eq(commissions.id, input.commission_id),
                with: {
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
            await ctx.db.insert(requests).values({
                id: createId(),
                form_id: input.form_id,
                user_id: ctx.user.id,
                status: waitlisted ? RequestStatus.Waitlist : RequestStatus.Pending,
                commission_id: input.commission_id,
                order_id: crypto.randomUUID(),
                content: JSON.parse(input.content)
            })

            // Notify the user of the request
            await knock.workflows.trigger(KnockWorkflows.CommissionRequestUserEnd, {
                recipients: [ctx.user.id],
                data: {
                    commission_title: commission.title,
                    artist_handle: commission.artist.handle
                }
            })

            // Notify the artist of a new request
            await knock.workflows.trigger(KnockWorkflows.CommissionRequestArtistEnd, {
                recipients: [commission.artist.user_id],
                data: {
                    commission_title: commission.title,
                    commission_requests_url:
                        env.BASE_URL + '/dashboard/commissions/' + commission.slug
                }
            })

            //  Invalidate Cache
            revalidateTag('commission_requests')
        }),

    /**
     * Handles the acceptance or rejection of a commission request
     */
    determine_request: artistProcedure
        .input(
            z.object({
                request_id: z.string(),
                accepted: z.boolean()
            })
        )
        .mutation(async ({ input, ctx }) => {
            // Get the request
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

            // Get stripe customer id
            let customer_id = await ctx.db.query.stripe_customer_ids.findFirst({
                where: and(
                    eq(stripe_customer_ids.user_id, request.user_id),
                    eq(stripe_customer_ids.artist_id, request.commission.artist_id)
                )
            })

            // If the stripe account does not exist, create one
            if (!customer_id) {
                const request_user = await clerkClient().users.getUser(request.user_id)

                // Create customer account in stripe
                const customer = await StripeCreateCustomer(
                    request.commission.artist.stripe_account,
                    request_user.username ?? request_user.firstName ?? undefined,
                    request_user.emailAddresses[0]?.emailAddress ?? undefined
                )

                if (!customer) {
                    return new TRPCError({
                        code: 'INTERNAL_SERVER_ERROR',
                        message: 'Failed to create customer account'
                    })
                }

                // Save the customer id in the database
                const generated_customer_id = createId()
                await ctx.db.insert(stripe_customer_ids).values({
                    id: generated_customer_id,
                    user_id: request.user_id,
                    artist_id: request.commission.artist_id,
                    customer_id: customer.id,
                    stripe_account: request.commission.artist.stripe_account
                })

                customer_id = await ctx.db.query.stripe_customer_ids.findFirst({
                    where: eq(stripe_customer_ids.id, generated_customer_id)
                })

                if (!customer_id) {
                    return new TRPCError({
                        code: 'INTERNAL_SERVER_ERROR',
                        message: 'Failed to create customer account'
                    })
                }
            }

            // Update commission stats based on acceptance or rejection
            const increase_amount = input.accepted ? 1 : 0
            const decrease_amount = input.accepted ? 0 : 1
            await ctx.db
                .update(commissions)
                .set({
                    new_requests: sql`${commissions.new_requests} - 1`,
                    accepted_requests: sql`${commissions.accepted_requests} + ${increase_amount}`,
                    rejected_requests: sql`${commissions.rejected_requests} + ${decrease_amount}`
                })
                .where(eq(commissions.id, request.commission_id))

            // Notify the user of the decision
            await knock.workflows.trigger(KnockWorkflows.CommissionDetermineRequest, {
                recipients: [request.user_id],
                data: {
                    commission_title: request.commission.title,
                    artist_handle: request.commission.artist.handle,
                    status: input.accepted ? 'accepted' : 'rejected'
                }
            })

            // If rejected, Update the request to reflect the rejection and return
            if (!input.accepted) {
                await ctx.db
                    .update(requests)
                    .set({
                        status: RequestStatus.Rejected
                    })
                    .where(eq(requests.id, request.id))

                return { success: true }
            }

            const generated_invoice_id = createId()

            // If accepted, Create a stripe invoice draft
            const stripe_draft = await StripeCreateInvoice(customer_id.stripe_account, {
                customer_id: customer_id.customer_id,
                user_id: request.user_id,
                commission_id: request.commission_id,
                order_id: request.order_id,
                invoice_id: generated_invoice_id
            })

            // Create the invoice object in the database with the initial item
            await ctx.db.insert(invoices).values({
                id: generated_invoice_id,
                stripe_id: stripe_draft.id,
                customer_id: customer_id.customer_id,
                stripe_account: customer_id.stripe_account,
                user_id: customer_id.user_id,
                artist_id: customer_id.artist_id,
                status: InvoiceStatus.Creating,
                request_id: request.id,
                total: request.commission.price
            })

            const invoice = await ctx.db.query.invoices.findFirst({
                where: eq(invoices.id, generated_invoice_id)
            })

            if (!invoice) {
                return new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'Failed to create invoice!'
                })
            }

            // Create invoice items
            await ctx.db.insert(invoice_items).values({
                id: createId(),
                invoice_id: invoice.id,
                name: request.commission.title,
                price: request.commission.price,
                quantity: 1
            })

            // Create a sendbird user if they don't exist
            const user = await clerkClient().users.getUser(request.user_id)
            if (!user.publicMetadata.has_sendbird_account) {
                await sendbird.create_user({
                    user_id: user.id,
                    nickname: user.username ?? 'User',
                    profile_url: user.imageUrl
                })

                await clerkClient().users.updateUserMetadata(user.id, {
                    publicMetadata: {
                        has_sendbird_account: true
                    }
                })
            }

            // Create a sendbird channel
            await sendbird.create_channel({
                users_ids: [user.id, request.commission.artist.user_id],
                name: `${request.commission.title} - ${user.username}`,
                cover_url:
                    request.commission.images[0]?.url ?? env.BASE_URL + '/profile.png',
                channel_url: request.order_id,
                operator_ids: [request.commission.artist.user_id],
                block_sdk_user_channel_join: true,
                is_distinct: false,
                data: JSON.stringify({
                    artist_id: request.commission.artist_id,
                    commission_title: request.commission.title
                })
            })

            // Create default containers for kanban
            const containers: KanbanContainerData[] = [
                {
                    id: crypto.randomUUID(),
                    title: 'Todo'
                },
                {
                    id: crypto.randomUUID(),
                    title: 'In Progress'
                },
                {
                    id: crypto.randomUUID(),
                    title: 'Done'
                }
            ]

            const kanban_id = createId()
            await ctx.db.insert(kanbans).values({
                id: kanban_id,
                request_id: request.id,
                containers: containers
            })

            const kanban = await ctx.db.query.kanbans.findFirst({
                where: eq(kanbans.id, kanban_id)
            })

            if (!kanban) {
                return new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'Failed to create kanban!'
                })
            }

            // Update the request to reflect the acceptance
            await ctx.db
                .update(requests)
                .set({
                    status: RequestStatus.Accepted,
                    invoice_id: invoice.id,
                    kanban_id: kanban.id,
                    sendbird_channel_url: request.order_id
                })
                .where(eq(requests.id, request.id))

            // Invalidate Cache
            revalidateTag('commission_requests')

            return { success: true }
        })
})
