import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { StripeCreateCustomer, StripeCreateInvoice } from '~/core/payments'
import {
    ClientRequestData,
    InvoiceStatus,
    KanbanContainerData,
    RequestStatus
} from '~/core/structures'
import { env } from '~/env'
import { update_commission_check_waitlist } from '~/lib/server-utils'
import { artistProcedure, createTRPCRouter, protectedProcedure } from '~/server/api/trpc'
import { AsRedisKey } from '~/server/cache'
import { novu } from '~/server/novu'
import { sendbird } from '~/server/sendbird'

export const requestRouter = createTRPCRouter({
    /**
     * Gets all requests for a commission
     */
    get_request_list: artistProcedure.input(z.string()).query(async ({ input, ctx }) => {
        const cachedRequests = await ctx.cache.get(AsRedisKey('requests', input))

        if (cachedRequests) {
            return JSON.parse(cachedRequests) as ClientRequestData[]
        }

        const requests = await ctx.db.request.findMany({
            where: {
                commissionId: input
            },
            include: {
                user: true
            }
        })

        if (!requests) {
            return undefined
        }

        await ctx.cache.set(
            AsRedisKey('requests', input),
            JSON.stringify(requests),
            'EX',
            3600
        )

        return requests
    }),

    /**
     * Gets a single request by order_id
     */
    get_request: artistProcedure.input(z.string()).query(async ({ input, ctx }) => {
        const request = await ctx.db.request.findFirst({
            where: {
                orderId: input
            },
            include: {
                user: true,
                commission: true
            }
        })

        if (!request) {
            return undefined
        }

        return request
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
            const request = await ctx.db.request.findFirst({
                where: {
                    id: input.request_id
                },
                include: {
                    commission: {
                        include: {
                            artist: true
                        }
                    },
                    user: true
                }
            })

            if (!request) {
                return new TRPCError({
                    code: 'NOT_FOUND',
                    message: 'Request not found'
                })
            }

            // Get stripe customer id
            let customer_id = await ctx.db.stripeCustomerIds.findFirst({
                where: {
                    userId: request.userId,
                    artistId: request.commission.artistId
                }
            })

            // If the stripe account does not exist, create one
            if (!customer_id) {
                // Create customer account in stripe
                const customer = await StripeCreateCustomer(
                    request.commission.artist.stripeAccount,
                    request.user.name || undefined,
                    request.user.email || undefined
                )

                if (!customer) {
                    return new TRPCError({
                        code: 'INTERNAL_SERVER_ERROR',
                        message: 'Failed to create customer account'
                    })
                }

                // Save the customer id in the database
                customer_id = await ctx.db.stripeCustomerIds.create({
                    data: {
                        userId: request.userId,
                        artistId: request.commission.artistId,
                        customerId: customer.id,
                        stripeAccount: request.commission.artist.stripeAccount
                    }
                })
            }

            // Update commission stats based on acceptance or rejection
            await ctx.db.commission.update({
                where: {
                    id: request.commissionId
                },
                data: {
                    newRequests: {
                        decrement: 1
                    },
                    acceptedRequests: {
                        increment: input.accepted ? 1 : 0
                    },
                    rejectedRequests: {
                        increment: input.accepted ? 0 : 1
                    }
                }
            })

            // Notify the user of the decision
            novu.trigger('commission-request-decision', {
                to: {
                    subscriberId: request.user.id
                },
                payload: {
                    username: request.commission.artist.handle,
                    commission_name: request.commission.title,
                    accepted: input.accepted
                }
            })

            // If rejected, Update the request to reflect the rejection and return
            if (!input.accepted) {
                await ctx.db.request.update({
                    where: {
                        id: request.id
                    },
                    data: {
                        status: RequestStatus.Rejected
                    }
                })

                return { success: true }
            }

            // If accepted, Create a stripe invoice draft
            const stripe_draft = await StripeCreateInvoice(customer_id.stripeAccount, {
                customer_id: customer_id.customerId,
                user_id: request.userId,
                commission_id: request.commissionId,
                order_id: request.orderId
            })

            // Create the invoice object in the database with the initial item
            const invoice = await ctx.db.invoice.create({
                data: {
                    stripeId: stripe_draft.id,
                    customerId: customer_id.customerId,
                    stripeAccount: customer_id.stripeAccount,
                    userId: customer_id.userId,
                    artistId: customer_id.artistId,
                    status: InvoiceStatus.Creating,
                    requestId: request.id,
                    items: {
                        create: [
                            {
                                name: request.commission.title,
                                quantity: 1,
                                price: request.commission.price
                            }
                        ]
                    }
                }
            })

            // Create a sendbird user if they don't exist
            await sendbird.CreateUser({
                user_id: request.user.id,
                nickname: request.user.name || 'User',
                profile_url: request.user.image || env.NEXTAUTH_URL + '/profile.png'
            })

            // Create a sendbird channel
            await sendbird.CreateGroupChannel({
                user_ids: [request.user.id, request.commission.artist.userId],
                name: request.user.name!,
                cover_url: request.user.image || env.NEXTAUTH_URL + '/profile.png',
                channel_url: request.orderId,
                operator_ids: [request.commission.artist.userId],
                block_sdk_user_channel_join: true,
                is_distinct: false,
                data: {
                    artist_id: request.commission.artistId,
                    commission_title: request.commission.title
                }
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

            const kanban = await ctx.db.kanban.create({
                data: {
                    requestId: request.id,
                    containers: JSON.stringify(containers)
                }
            })

            // Update the request to reflect the acceptance
            await ctx.db.request.update({
                where: {
                    id: request.id
                },
                data: {
                    status: RequestStatus.Accepted,
                    invoiceId: invoice.id,
                    kanbanId: kanban.id,
                    sendbirdChannelURL: request.orderId
                }
            })

            // Delete Dashboard Caches
            await ctx.cache.del(AsRedisKey('commissions', request.commission.artistId))
            await ctx.cache.del(AsRedisKey('requests', request.commissionId))

            return { success: true }
        })
})
