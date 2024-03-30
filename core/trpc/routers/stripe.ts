import { z } from 'zod'
import { createTRPCRouter, protectedProcedure } from '../trpc'
import { prisma } from '@/lib/prisma'
import {
    StripeCreateAccount,
    StripeCreateAccountLink,
    StripeCreateCustomer,
    StripeCreateLoginLink,
    StripeGetAccount
} from '@/core/payments'

export const stripeRouter = createTRPCRouter({
    /**
     * Creates a new customer id for an artist and a user if it doesn't exist
     */
    set_customer_id: protectedProcedure.input(z.string()).mutation(async (opts) => {
        const { input, ctx } = opts

        const customer_id = await prisma.stripeCustomerIds.findFirst({
            where: {
                userId: ctx.session.user.user_id!,
                artistId: input
            }
        })

        // If it exists then return that we have one
        if (customer_id) {
            return {
                success: true,
                stripe_account: customer_id.stripeAccount,
                customer_id: customer_id.customerId
            }
        }

        const user = await prisma.user.findFirst({
            where: {
                id: ctx.session.user.user_id!
            }
        })

        if (!user) {
            return { success: false }
        }

        const artist = await prisma.artist.findFirst({
            where: {
                id: input
            }
        })

        if (!artist) {
            return { success: false }
        }

        // Otherwise we need to create a customer id for the user
        const stripe_customer = await StripeCreateCustomer(
            artist.stripeAccount!,
            user.name!,
            user.email!
        )

        // Create a customer id object in the data for this user
        const customer = await prisma.stripeCustomerIds.create({
            data: {
                userId: user.id,
                artistId: artist.id,
                stripeAccount: artist.stripeAccount,
                customerId: stripe_customer.id
            }
        })

        return {
            success: true,
            customer_id: customer.customerId,
            stripe_account: customer.stripeAccount
        }
    }),

    /**
     * Gets the onboarding or dashboard url for stripe depending on the what
     * the account needs
     */
    get_managment_url: protectedProcedure.input(z.string()).query(async (opts) => {
        const { input } = opts

        const artist = await prisma.artist.findFirst({
            where: {
                id: input
            }
        })

        // Check if they have a stripe account
        // if they don't then create one and return the onboarding url
        if (!artist?.stripeAccount) {
            const stripe_account = await StripeCreateAccount()

            return {
                type: 'onboarding',
                url: (await StripeCreateAccountLink(stripe_account.id)).url
            }
        }

        // Get the stripe account if they have one
        const stripe_account = await StripeGetAccount(artist?.stripeAccount)

        // If the user has not completed the onboarding, return an onboarding url
        if (!stripe_account.charges_enabled) {
            return {
                type: 'onboarding',
                url: (await StripeCreateAccountLink(stripe_account.id)).url
            }
        }

        // Return the dashboard url if the artist has completed onboarding and has an account
        return {
            type: 'dashboard',
            url: (await StripeCreateLoginLink(stripe_account.id)).url
        }
    })
})
