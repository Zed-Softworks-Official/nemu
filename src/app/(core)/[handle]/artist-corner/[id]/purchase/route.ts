import { clerkClient, getAuth } from '@clerk/nextjs/server'
import { notFound, redirect } from 'next/navigation'
import { type NextRequest } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { createId } from '@paralleldrive/cuid2'

import type { StripePaymentMetadata, StripeProductData } from '~/lib/structures'
import { db } from '~/server/db'
import { artists, purchase } from '~/server/db/schema'
import { get_redis_key, redis } from '~/server/redis'

import { stripe } from '~/server/stripe'
import { env } from '~/env'
import { is_supporter } from '~/app/api/stripe/sync'
import { calculate_application_fee } from '~/lib/payments'

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

    const already_purchased = await db.query.purchase.findFirst({
        where: and(
            eq(purchase.product_id, params.id),
            eq(purchase.user_id, auth.userId),
            eq(purchase.status, 'completed')
        )
    })

    if (already_purchased) {
        return redirect(`${env.BASE_URL}/purchases`)
    }

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

    const application_fee_amount = !(await is_supporter(artist.user_id))
        ? calculate_application_fee(product_data.price)
        : undefined

    const purchase_id = createId()

    const checkout = await stripe.checkout.sessions.create(
        {
            customer: stripe_customer,
            line_items: [
                {
                    price: product_data.price_id,
                    quantity: 1
                }
            ],
            metadata: {
                purchase_type: 'artist_corner',
                stripe_account: artist.stripe_account,
                purchase_id
            } satisfies StripePaymentMetadata,
            mode: 'payment',
            currency: 'usd',
            success_url: `${env.BASE_URL}/${params.handle}/artist-corner/${params.id}/success`,
            cancel_url: `${env.BASE_URL}/${params.handle}/artist-corner/${params.id}`,
            ui_mode: 'hosted',
            payment_intent_data: {
                application_fee_amount
            },
            payment_method_types: ['card', 'link']
        },
        {
            stripeAccount: artist.stripe_account
        }
    )

    if (!checkout.url) {
        throw new Error('[STRIPE] Checkout session URL not found')
    }

    await db.insert(purchase).values({
        id: purchase_id,
        product_id: params.id,
        user_id: auth.userId,
        artist_id: artist.id,
        status: 'pending'
    })

    return redirect(checkout.url)
}
