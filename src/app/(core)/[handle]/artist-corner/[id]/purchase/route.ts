import { clerkClient, getAuth } from '@clerk/nextjs/server'
import { notFound, redirect } from 'next/navigation'
import { type NextRequest } from 'next/server'
import { eq } from 'drizzle-orm'

import type { StripeProductData } from '~/lib/structures'
import { db } from '~/server/db'
import { artists } from '~/server/db/schema'
import { get_redis_key, redis } from '~/server/redis'

import { stripe } from '~/server/stripe'
import { env } from '~/env'

export async function GET(
    req: NextRequest,
    props: { params: Promise<{ handle: string; id: string }> }
) {
    const auth = getAuth(req)
    if (!auth.userId) return redirect('/u/login')
    const params = await props.params

    const artist = await db.query.artists.findFirst({
        where: eq(
            artists.handle,
            params.handle.substring(params.handle.indexOf('@') + 1, params.handle.length)
        )
    })
    if (!artist) return notFound()

    let stripe_customer = await redis.get<string>(
        get_redis_key('stripe:artist:customer', auth.userId, artist.id)
    )

    if (!stripe_customer) {
        const user = await (await clerkClient()).users.getUser(auth.userId)
        const customer = await stripe.customers.create(
            {
                name: user.username ?? user.emailAddresses[0]?.emailAddress ?? 'Unknown',
                email: user.emailAddresses[0]?.emailAddress
            },
            { stripeAccount: artist.stripe_account }
        )
        stripe_customer = customer.id

        await redis.set(
            get_redis_key('stripe:artist:customer', auth.userId, artist.id),
            stripe_customer
        )
    }

    const product_data = await redis.get<StripeProductData>(
        get_redis_key('product:stripe', params.id)
    )
    if (!product_data) return notFound()

    const checkout = await stripe.checkout.sessions.create(
        {
            customer: stripe_customer,
            line_items: [
                {
                    price: product_data.price_id,
                    quantity: 1
                }
            ],
            mode: 'payment',
            currency: 'usd',
            success_url: `${env.BASE_URL}/${params.handle}/artist-corner/${params.id}/success`,
            cancel_url: `${env.BASE_URL}/${params.handle}/artist-corner/${params.id}`
        },
        {
            stripeAccount: artist.stripe_account
        }
    )

    return redirect(checkout.url ?? '/artist-corner')
}
