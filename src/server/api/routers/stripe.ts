import { number, z } from 'zod'
import { artistProcedure, createTRPCRouter, protectedProcedure } from '~/server/api/trpc'

import {
    StripeCreateAccountLink,
    StripeCreateCustomer,
    StripeCreateLoginLink,
    StripeCreateProductPaymentIntent,
    StripeCreateSupporterBilling,
    StripeGetAccount
} from '~/core/payments'

import { TRPCError } from '@trpc/server'
import { clerkClient } from '@clerk/nextjs/server'
import { and, eq } from 'drizzle-orm'
import {
    artists,
    customerIdRelations,
    products,
    stripe_customer_ids
} from '~/server/db/schema'
import { AsRedisKey } from '~/server/cache'

export const stripeRouter = createTRPCRouter({
    /**
     * Creates a new customer id for an artist and a user if it doesn't exist
     */
    set_customer_id: protectedProcedure
        .input(z.string())
        .mutation(async ({ input, ctx }) => {
            const customer_id = await ctx.db.query.stripe_customer_ids.findFirst({
                where: and(
                    eq(stripe_customer_ids.user_id, ctx.user.id),
                    eq(stripe_customer_ids.artist_id, input)
                )
            })

            // If it exists then return that we have one
            if (customer_id) {
                return {
                    stripe_account: customer_id.stripe_account,
                    customer_id: customer_id.customer_id
                }
            }

            const user = await clerkClient.users.getUser(ctx.user.id)

            if (!user) {
                throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' })
            }

            const artist = await ctx.db.query.artists.findFirst({
                where: eq(artists.id, input)
            })

            if (!artist) {
                throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' })
            }

            // Otherwise we need to create a customer id for the user
            const stripe_customer = await StripeCreateCustomer(
                artist.stripe_account,
                user.username!,
                user.emailAddresses[0]?.emailAddress
            )

            // Create a customer id object in the data for this user
            const customer = await ctx.db
                .insert(stripe_customer_ids)
                .values({
                    user_id: user.id,
                    artist_id: artist.id,
                    stripe_account: artist.stripe_account,
                    customer_id: stripe_customer.id
                })
                .returning({
                    customer_id: stripe_customer_ids.customer_id,
                    stripe_account: stripe_customer_ids.stripe_account
                })

            return {
                customer_id: customer[0]?.customer_id,
                stripe_account: customer[0]?.stripe_account
            }
        }),

    /**
     * Gets the onboarding or dashboard url for stripe depending on the what
     * the account needs
     */
    get_managment_url: artistProcedure.query(
        async ({ ctx }): Promise<{ type: 'dashboard' | 'onboarding'; url: string }> => {
            const cachedManagmentUrl = await ctx.cache.get(AsRedisKey('stripe', ctx.user.id, 'managment'))

            if (cachedManagmentUrl) {
                return JSON.parse(cachedManagmentUrl) as { type: 'dashboard' | 'onboarding'; url: string }
            }

            const artist = await ctx.db.query.artists.findFirst({
                where: eq(artists.id, ctx.user.privateMetadata.artist_id as string)
            })

            if (!artist) {
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'Artist does not exist'
                })
            }

            // Get the stripe account if they have one
            const stripe_account = await StripeGetAccount(artist.stripe_account)

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
        }
    ),

    /**
     * Gets stripe checkout data
     */
    get_client_secret: protectedProcedure
        .input(
            z.object({
                stripe_account: z.string(),
                product_id: z.string(),
                return_url: z.string()
            })
        )
        .query(async ({ input, ctx }) => {
            // Get Product from db
            const product = await ctx.db.query.products.findFirst({
                where: eq(products.id, input.product_id),
                with: {
                    artist: true
                }
            })

            if (!product) {
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'Could not find product!'
                })
            }

            // Find customer id if we have one,
            // If not then just create one
            let db_customer_link = await ctx.db.query.stripe_customer_ids.findFirst({
                where: and(
                    eq(stripe_customer_ids.user_id, ctx.user.id),
                    eq(stripe_customer_ids.artist_id, product.artist_id)
                )
            })

            if (!db_customer_link) {
                const new_stripe_customer = await StripeCreateCustomer(
                    input.stripe_account,
                    ctx.user.username || undefined,
                    ctx.user.emailAddresses[0]?.emailAddress || undefined
                )

                db_customer_link = (
                    await ctx.db
                        .insert(stripe_customer_ids)
                        .values({
                            stripe_account: input.stripe_account,
                            customer_id: new_stripe_customer.id,
                            artist_id: product.artist_id,
                            user_id: ctx.user.id
                        })
                        .returning()
                )[0]!
            }

            // Create the payment intent
            const payment_intent = await StripeCreateProductPaymentIntent({
                customer_id: db_customer_link.customer_id,
                price: Number(product.price),
                stripe_account: input.stripe_account,
                return_url: input.return_url,
                product_id: input.product_id,
                user_id: ctx.user.id,
                artist_id: product.artist_id,
                supporter: product.artist.supporter
            })

            return { client_secret: payment_intent.client_secret }
        }),

    /**
     * Gets the billing portal url so the user can edit their subscription
     */
    get_checkout_portal: artistProcedure.query(async ({ ctx }) => {
        const cachedCheckoutPortal = await ctx.cache.get(AsRedisKey('stripe', ctx.user.id, 'checkout_portal'))

        if (cachedCheckoutPortal) {
            return JSON.parse(cachedCheckoutPortal) as string
        }

        const artist = await ctx.db.query.artists.findFirst({
            where: eq(artists.id, ctx.user.privateMetadata.artist_id as string)
        })

        if (!artist) {
            throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Failed to find artist'
            })
        }

        if (!artist.zed_customer_id) {
            return undefined
        }

        return (await StripeCreateSupporterBilling(artist.zed_customer_id)).url
    })
})
