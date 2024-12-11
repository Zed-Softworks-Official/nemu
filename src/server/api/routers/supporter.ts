import { z } from 'zod'
import { createTRPCRouter, protectedProcedure } from '../trpc'
import { eq } from 'drizzle-orm'
import { artists } from '~/server/db/schema'
import { TRPCError } from '@trpc/server'
import { StripeCreateCustomerZed, StripeCreateSupporterCheckout } from '~/lib/payments'
import { clerkClient } from '@clerk/nextjs/server'

export const supporter_router = createTRPCRouter({
    generate_url: protectedProcedure
        .input(z.literal('monthly').or(z.literal('annual')))
        .mutation(async ({ input, ctx }) => {
            const artist = await ctx.db.query.artists.findFirst({
                where: eq(artists.user_id, ctx.auth.userId)
            })

            const clerk_client = await clerkClient()
            const user = await clerk_client.users.getUser(ctx.auth.userId)

            if (!artist) {
                throw new TRPCError({
                    code: 'NOT_FOUND'
                })
            }

            if (!artist.zed_customer_id) {
                const stripe_account = await StripeCreateCustomerZed(
                    artist.handle,
                    user.emailAddresses[0]?.emailAddress ?? undefined
                )

                await ctx.db
                    .update(artists)
                    .set({
                        zed_customer_id: stripe_account.id
                    })
                    .where(eq(artists.id, artist.id))

                artist.zed_customer_id = stripe_account.id
            }

            return {
                redirect_url: (
                    await StripeCreateSupporterCheckout(
                        artist.id,
                        input,
                        artist.zed_customer_id
                    )
                ).url
            }
        })
})
