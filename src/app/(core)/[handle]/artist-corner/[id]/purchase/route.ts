import { clerkClient, getAuth } from '@clerk/nextjs/server'
import { notFound, redirect } from 'next/navigation'
import { type NextRequest } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { createId } from '@paralleldrive/cuid2'

import type { StripePaymentMetadata, StripeProductData } from '~/lib/structures'
import { db } from '~/server/db'
import { artists, purchase } from '~/server/db/schema'
import { get_redis_key as getRedisKey, redis } from '~/server/redis'

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

    const alreadyPurchased = await db.query.purchase.findFirst({
        where: and(
            eq(purchase.product_id, params.id),
            eq(purchase.user_id, auth.userId),
            eq(purchase.artist_id, artist.id),
            eq(purchase.status, 'completed')
        )
    })

    if (alreadyPurchased) {
        return redirect(`${env.BASE_URL}/purchases`)
    }

    const sessionAlreadyExists = await redis.get<string>(
        getRedisKey('product:purchase', params.id, auth.userId)
    )
    if (sessionAlreadyExists) {
        return redirect(sessionAlreadyExists)
    }

    let stripeCustomer = await redis.get<string>(
        getRedisKey('stripe:artist:customer', auth.userId, artist.id)
    )

    if (!stripeCustomer) {
        const user = await (await clerkClient()).users.getUser(auth.userId)
        const customer = await stripe.customers.create(
            {
                name: user.username ?? user.emailAddresses[0]?.emailAddress ?? 'Unknown',
                email: user.emailAddresses[0]?.emailAddress
            },
            { stripeAccount: artist.stripe_account }
        )
        stripeCustomer = customer.id

        await redis.set(
            getRedisKey('stripe:artist:customer', auth.userId, artist.id),
            stripeCustomer
        )
    }

    const productData = await redis.get<StripeProductData>(
        getRedisKey('product:stripe', params.id)
    )
    if (!productData) return notFound()

    const applicationFeeAmount = !(await is_supporter(artist.user_id))
        ? calculate_application_fee(productData.price)
        : undefined

    const purchaseId = createId()

    const checkout = await stripe.checkout.sessions.create(
        {
            customer: stripeCustomer,
            line_items: [
                {
                    price: productData.priceId,
                    quantity: 1
                }
            ],
            metadata: {
                purchase_type: 'artist_corner',
                stripe_account: artist.stripe_account,
                purchase_id: purchaseId
            } satisfies StripePaymentMetadata,
            mode: 'payment',
            currency: 'usd',
            success_url: `${env.BASE_URL}/${params.handle}/artist-corner/${params.id}/success`,
            cancel_url: `${env.BASE_URL}/${params.handle}/artist-corner/${params.id}`,
            ui_mode: 'hosted',
            payment_intent_data: {
                application_fee_amount: applicationFeeAmount
            },
            payment_method_types: ['card', 'link'],
            expires_at: Math.floor(Date.now() / 1000) + 60 * 60 * 24 // 24 hours
        },
        {
            stripeAccount: artist.stripe_account
        }
    )

    if (!checkout.url) {
        throw new Error('[STRIPE] Checkout session URL not found')
    }

    await redis.set(
        getRedisKey('product:purchase', params.id, auth.userId),
        checkout.url,
        {
            ex: 60 * 60 * 24 // 24 hours
        }
    )

    await db.insert(purchase).values({
        id: purchaseId,
        product_id: params.id,
        user_id: auth.userId,
        artist_id: artist.id,
        status: 'pending'
    })

    return redirect(checkout.url)
}
