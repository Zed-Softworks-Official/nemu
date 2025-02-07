import { artistProcedure, createTRPCRouter } from '../trpc'

import { type StripeDashboardData } from '~/lib/structures'

import {
    StripeGetAccount,
    StripeCreateAccountLink,
    StripeCreateLoginLink
} from '~/lib/payments'
import { get_redis_key } from '~/server/redis'

export const stripe_router = createTRPCRouter({
    get_dashboard_links: artistProcedure.query(async ({ ctx }) => {
        const redis_key = get_redis_key('dashboard_links', ctx.artist.id)
        const cached_data = await ctx.redis.get(redis_key)

        if (cached_data) {
            return cached_data as StripeDashboardData
        }

        const result: StripeDashboardData = {
            onboarded: false,
            managment: {
                type: 'dashboard',
                url: ''
            }
        }

        const stripe_account = await StripeGetAccount(ctx.artist.stripe_account)

        // If the user has not completed the onboarding, return an onboarding url
        // else return the stripe connect url
        if (!stripe_account.charges_enabled) {
            result.managment = {
                type: 'onboarding',
                url: (await StripeCreateAccountLink(stripe_account.id)).url
            }
        } else {
            result.onboarded = true
            result.managment = {
                type: 'dashboard',
                url: (await StripeCreateLoginLink(stripe_account.id)).url
            }
        }

        await ctx.redis.set(redis_key, result, {
            ex: 3600
        })

        return result
    })
})
