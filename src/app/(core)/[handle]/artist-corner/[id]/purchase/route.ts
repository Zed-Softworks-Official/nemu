import { clerkClient, getAuth } from '@clerk/nextjs/server'
import { notFound, redirect } from 'next/navigation'
import { type NextRequest } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { createId } from '@paralleldrive/cuid2'

import type { StripePaymentMetadata, StripeProductData } from '~/lib/types'
import { db } from '~/server/db'
import { products, purchase } from '~/server/db/schema'
import { getRedisKey, redis } from '~/server/redis'

import { stripe } from '~/server/stripe'
import { env } from '~/env'
import { isSupporter } from '~/app/api/stripe/sync'
import { calculateApplicationFee } from '~/lib/payments'

export async function GET(
    req: NextRequest,
    props: { params: Promise<{ handle: string; id: string }> }
) {
    const auth = getAuth(req)
    if (!auth.userId) return redirect('/u/login')
    const params = await props.params

    const product = await db.query.products.findFirst({
        where: eq(products.id, params.id),
        with: {
            artist: true
        }
    })
    if (!product) return notFound()

    if (product.isFree) {
        await db.insert(purchase).values({
            id: createId(),
            productId: params.id,
            userId: auth.userId,
            artistId: product.artist.id,
            status: 'completed'
        })

        return redirect(`${env.BASE_URL}/purchases`)
    }

    const alreadyPurchased = await db.query.purchase.findFirst({
        where: and(
            eq(purchase.productId, params.id),
            eq(purchase.userId, auth.userId),
            eq(purchase.artistId, product.artist.id),
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
        getRedisKey('stripe:artist:customer', auth.userId, product.artist.id)
    )

    if (!stripeCustomer) {
        const user = await (await clerkClient()).users.getUser(auth.userId)
        const customer = await stripe.customers.create(
            {
                name: user.username ?? user.emailAddresses[0]?.emailAddress ?? 'Unknown',
                email: user.emailAddresses[0]?.emailAddress
            },
            { stripeAccount: product.artist.stripeAccount }
        )
        stripeCustomer = customer.id

        await redis.set(
            getRedisKey('stripe:artist:customer', auth.userId, product.artist.id),
            stripeCustomer
        )
    }

    const productData = await redis.get<StripeProductData>(
        getRedisKey('product:stripe', params.id)
    )
    if (!productData) return notFound()

    const applicationFeeAmount = !(await isSupporter(product.artist.userId))
        ? calculateApplicationFee(productData.price)
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
                purchaseType: 'artist_corner',
                stripeAccount: product.artist.stripeAccount,
                purchaseId: purchaseId
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
            stripeAccount: product.artist.stripeAccount
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
        productId: params.id,
        userId: auth.userId,
        artistId: product.artist.id,
        status: 'pending'
    })

    return redirect(checkout.url)
}
