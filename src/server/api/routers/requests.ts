import { clerkClient } from '@clerk/nextjs/server'
import { createId } from '@paralleldrive/cuid2'
import { TRPCError } from '@trpc/server'
import { and, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { StripeCreateCustomer, StripeCreateInvoice } from '~/core/payments'
import {
    ClientRequestData,
    InvoiceStatus,
    KanbanContainerData,
    NemuImageData,
    RequestStatus
} from '~/core/structures'
import { env } from '~/env'
import { get_blur_data } from '~/lib/blur_data'
import { update_commission_check_waitlist } from '~/lib/server-utils'
import { artistProcedure, createTRPCRouter, protectedProcedure } from '~/server/api/trpc'
import { AsRedisKey } from '~/server/cache'
import {
    commissions,
    invoice_items,
    invoices,
    kanbans,
    requests,
    stripe_customer_ids
} from '~/server/db/schema'
import { novu } from '~/server/novu'
import { sendbird } from '~/server/sendbird'

export const requestRouter = createTRPCRouter({
    get_request_list_client: protectedProcedure.query(async ({ ctx }) => {
        // const cachedRequests = await ctx.cache.get(AsRedisKey('requests', ctx.user.id))

        // if (cachedRequests) {
        //     return JSON.parse(cachedRequests) as ClientRequestData[]
        // }

        const db_requests = await ctx.db.query.requests.findMany({
            where: eq(requests.user_id, ctx.user.id),
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
            result.push({
                ...request,
                commission: {
                    ...request.commission,
                    images: [
                        {
                            url: request.commission.images[0]?.url!,
                            blur_data: await get_blur_data(
                                request.commission.images[0]?.url!
                            )
                        }
                    ]
                },
                user: await clerkClient.users.getUser(request.user_id)
            })
        }

        // await ctx.cache.set(AsRedisKey('requests', ctx.user.id), JSON.stringify(result), {
        //     EX: 3600
        // })

        return result
    }),

    /**
     * Gets all request details for a given order_id
     */
    get_request_details: protectedProcedure
        .input(z.string())
        .query(async ({ input, ctx }) => {
            // const cachedRequestDetails = await ctx.cache.get(
            //     AsRedisKey('requests', input, 'details')
            // )

            // if (cachedRequestDetails) {
            //     return JSON.parse(cachedRequestDetails) as ClientRequestData
            // }

            const request = await ctx.db.query.requests.findFirst({
                where: eq(requests.order_id, input),
                with: {
                    commission: {
                        with: {
                            artist: true
                        }
                    }
                }
            })

            if (!request) {
                return undefined
            }

            const result: ClientRequestData = {
                ...request,
                user: await clerkClient.users.getUser(request.user_id)
            }

            // await ctx.cache.set(
            //     AsRedisKey('requests', input, 'details'),
            //     JSON.stringify(result),
            //     {
            //         EX: 3600
            //     }
            // )

            return result
        }),

    get_request_invoice: protectedProcedure
        .input(z.string())
        .query(async ({ input, ctx }) => {
            const request = await ctx.db.query.requests.findFirst({
                where: eq(requests.order_id, input),
                with: {
                    invoice: {
                        with: {
                            invoice_items: true
                        }
                    }
                }
            })

            if (!request) {
                return undefined
            }

            return request.invoice
        }),

    get_request_download: protectedProcedure
        .input(z.string())
        .query(async ({ input, ctx }) => {
            const request = await ctx.db.query.requests.findFirst({
                where: eq(requests.order_id, input),
                with: {
                    download: true
                }
            })

            if (!request) {
                return undefined
            }

            return request.download
        }),

    get_request_client: protectedProcedure
        .input(z.string())
        .query(async ({ input, ctx }) => {
            // const cachedRequest = await ctx.cache.get(
            //     AsRedisKey('requests', ctx.user.id, input)
            // )

            // if (cachedRequest) {
            //     return JSON.parse(cachedRequest) as ClientRequestData
            // }

            const request = await ctx.db.query.requests.findFirst({
                where: and(
                    eq(requests.order_id, input),
                    eq(requests.user_id, ctx.user.id)
                ),
                with: {
                    commission: {
                        with: {
                            artist: true
                        }
                    }
                }
            })

            if (!request) {
                return undefined
            }

            // Format for client
            const images: NemuImageData[] = []

            for (const image of request.commission.images) {
                images.push({
                    url: image.url,
                    blur_data: await get_blur_data(image.url)
                })
            }

            const result: ClientRequestData = {
                ...request,
                commission: {
                    ...request.commission,
                    images
                },
                user: await clerkClient.users.getUser(request.user_id)
            }

            // await ctx.cache.set(
            //     AsRedisKey('requests', ctx.user.id, input),
            //     JSON.stringify(result),
            //     {
            //         EX: 3600
            //     }
            // )

            return result
        }),

    /**
     * Gets a single request by order_id
     */
    get_request: artistProcedure.input(z.string()).query(async ({ input, ctx }) => {
        const request = await ctx.db.query.requests.findFirst({
            where: eq(requests.order_id, input),
            with: {
                user: true,
                commission: true,
                download: true
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

            // Notify the artist of a new request
            novu.trigger('commission-request', {
                to: {
                    subscriberId: commission.artist.user_id
                },
                payload: {
                    username: ctx.user.username!,
                    commission_name: commission.title,
                    slug: env.BASE_URL + '/dashboard/commissions/' + commission.slug
                }
            })

            // Invalidate Cache
            // await ctx.cache.del(
            //     AsRedisKey('commissions', commission.artist_id, commission.slug)
            // )
        }),

    /**
     * Checks if a user has already requested a commission
     */
    get_user_requsted: protectedProcedure
        .input(z.string())
        .query(async ({ input, ctx }) => {
            const request = await ctx.db.query.requests.findFirst({
                where: and(eq(requests.user_id, ctx.user.id), eq(requests.form_id, input))
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
                const request_user = await clerkClient.users.getUser(request.user_id)

                // Create customer account in stripe
                const customer = await StripeCreateCustomer(
                    request.commission.artist.stripe_account,
                    request_user.username || request_user.firstName || undefined,
                    request_user.emailAddresses[0]?.emailAddress || undefined
                )

                if (!customer) {
                    return new TRPCError({
                        code: 'INTERNAL_SERVER_ERROR',
                        message: 'Failed to create customer account'
                    })
                }

                // Save the customer id in the database
                customer_id = (
                    await ctx.db
                        .insert(stripe_customer_ids)
                        .values({
                            id: createId(),
                            user_id: request.user_id,
                            artist_id: request.commission.artist_id,
                            customer_id: customer.id,
                            stripe_account: request.commission.artist.stripe_account
                        })
                        .returning()
                )[0]!
            }

            // Update commission stats based on acceptance or rejection
            await ctx.db
                .update(commissions)
                .set({
                    new_requests: sql`${commissions.new_requests} - 1`,
                    accepted_requests: input.accepted
                        ? sql`${commissions.accepted_requests} + 1`
                        : sql`${commissions.accepted_requests} - 1`,
                    rejected_requests: input.accepted
                        ? sql`${commissions.rejected_requests} - 1`
                        : sql`${commissions.rejected_requests} + 1`
                })
                .where(eq(commissions.id, request.commission_id))

            // Notify the user of the decision
            // novu.trigger('commission-request-decision', {
            //     to: {
            //         subscriberId: request.user_id
            //     },
            //     payload: {
            //         username: request.commission.artist.handle,
            //         commission_name: request.commission.title,
            //         accepted: input.accepted
            //     }
            // })

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

            // If accepted, Create a stripe invoice draft
            const stripe_draft = await StripeCreateInvoice(customer_id.stripe_account, {
                customer_id: customer_id.customer_id,
                user_id: request.user_id,
                commission_id: request.commission_id,
                order_id: request.order_id
            })

            // Create the invoice object in the database with the initial item
            const invoice = (
                await ctx.db
                    .insert(invoices)
                    .values({
                        id: createId(),
                        stripe_id: stripe_draft.id,
                        customer_id: customer_id.customer_id,
                        stripe_account: customer_id.stripe_account,
                        user_id: customer_id.user_id,
                        artist_id: customer_id.artist_id,
                        status: InvoiceStatus.Creating,
                        request_id: request.id,
                        total: request.commission.price
                    })
                    .returning()
            )[0]!

            // Create invoice items
            await ctx.db.insert(invoice_items).values({
                id: createId(),
                invoice_id: invoice.id,
                name: request.commission.title,
                price: request.commission.price,
                quantity: 1
            })

            // Create a sendbird user if they don't exist
            const user = await clerkClient.users.getUser(request.user_id)
            if (!user.publicMetadata.has_sendbird_account) {
                await sendbird.CreateUser({
                    user_id: user.id,
                    nickname: user.username || 'User',
                    profile_url: user.imageUrl
                })
            }

            // Create a sendbird channel
            await sendbird.CreateGroupChannel({
                user_ids: [user.id, request.commission.artist.user_id],
                name: `${request.commission.title} - ${user.username}`,
                cover_url:
                    request.commission.images[0]?.url || env.BASE_URL + '/profile.png',
                channel_url: request.order_id,
                operator_ids: [request.commission.artist.user_id],
                block_sdk_user_channel_join: true,
                is_distinct: false,
                data: {
                    artist_id: request.commission.artist_id,
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

            const kanban = (
                await ctx.db
                    .insert(kanbans)
                    .values({
                        id: createId(),
                        request_id: request.id,
                        containers: containers
                    })
                    .returning()
            )[0]!

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

            // Delete Dashboard Caches
            // await ctx.cache.del(AsRedisKey('commissions', request.commission.artist_id))
            // await ctx.cache.del(AsRedisKey('requests', request.commission_id))

            return { success: true }
        })
})
