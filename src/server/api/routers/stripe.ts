import { artistProcedure, createTRPCRouter } from '../trpc'

import { type StripeDashboardData } from '~/lib/structures'

import {
    StripeGetAccount,
    StripeCreateAccountLink,
    StripeCreateLoginLink
} from '~/lib/payments'
import { getRedisKey } from '~/server/redis'

export const stripeRouter = createTRPCRouter({
    getDashboardLinks: artistProcedure.query(async ({ ctx }) => {
        const redisKey = getRedisKey('dashboard_links', ctx.artist.id)
        const cachedData = await ctx.redis.get(redisKey)

        if (cachedData) {
            return cachedData as StripeDashboardData
        }

        const result: StripeDashboardData = {
            onboarded: false,
            managment: {
                type: 'dashboard',
                url: ''
            }
        }

        const stripeAccount = await StripeGetAccount(ctx.artist.stripe_account)

        // If the user has not completed the onboarding, return an onboarding url
        // else return the stripe connect url
        if (!stripeAccount.charges_enabled) {
            result.managment = {
                type: 'onboarding',
                url: (await StripeCreateAccountLink(stripeAccount.id)).url
            }
        } else {
            result.onboarded = true
            result.managment = {
                type: 'dashboard',
                url: (await StripeCreateLoginLink(stripeAccount.id)).url
            }
        }

        await ctx.redis.set(redisKey, result, {
            ex: 3600
        })

        return result
    })
})
