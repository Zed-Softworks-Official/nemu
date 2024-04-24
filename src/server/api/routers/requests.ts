import { TRPCError } from '@trpc/server'
import { request } from 'http'
import { z } from 'zod'
import { ClientRequestData } from '~/core/structures'
import { env } from '~/env'
import { update_commission_check_waitlist } from '~/lib/server-utils'
import { artistProcedure, createTRPCRouter, protectedProcedure } from '~/server/api/trpc'
import { AsRedisKey } from '~/server/cache'
import { novu } from '~/server/novu'

export const requestRouter = createTRPCRouter({
    /**
     * Gets all requests for a commission
     */
    get_requests: protectedProcedure.input(z.string()).query(async ({ input, ctx }) => {
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

            // Get stripe account

            // If the stripe account does not exist, create one

            // Update commission based on acceptance or rejection

            // Notify the user of the decision

            // If rejected, Update the request to reflect the rejection and return

            // If accepted, Create a stripe invoice draft

            // Create the invoice object in the database with the initial item

            // Create a sendbird user if they don't exist

            // Create a sendbird channel

            // Create default containers for kanban

            // Update the request to reflect the acceptance

            // Delete Dashboard Caches
        })
})
