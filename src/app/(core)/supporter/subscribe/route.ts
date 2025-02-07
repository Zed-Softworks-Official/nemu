import { currentUser } from '@clerk/nextjs/server'
import { type NextRequest, NextResponse } from 'next/server'

import { env } from '~/env'
import { get_redis_key, redis } from '~/server/redis'
import { stripe } from '~/server/stripe'

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams
    const period = searchParams.get('period')
    if (period !== 'monthly' && period !== 'annual') {
        throw new Error('Invalid period')
    }

    const user = await currentUser()
    if (!user) {
        return NextResponse.redirect('/u/login')
    }

    let stripe_customer_id = await redis.get<string>(
        get_redis_key('stripe:user', user.id)
    )
    if (!stripe_customer_id) {
        const new_customer = await stripe.customers.create({
            email: user.emailAddresses[0]?.emailAddress,
            metadata: {
                user_id: user.id
            }
        })

        await redis.set(get_redis_key('stripe:user', user.id), new_customer.id)
        stripe_customer_id = new_customer.id
    }

    const price_id =
        period === 'monthly'
            ? env.STRIPE_SUPPORTER_MONTHLY_PRICE_ID
            : env.STRIPE_SUPPORTER_ANNUAL_PRICE_ID
    const checkout_session = await stripe.checkout.sessions.create({
        customer: stripe_customer_id,
        success_url: `${env.BASE_URL}/supporter/sync`,
        cancel_url: `${env.BASE_URL}/supporter`,
        line_items: [
            {
                price: price_id,
                quantity: 1
            }
        ],
        mode: 'subscription',
        metadata: {
            purchase_type: 'supporter'
        },
        subscription_data: {
            metadata: {
                user_id: user.id
            }
        }
    })

    if (!checkout_session.url) {
        throw new Error('Failed to create checkout session')
    }

    return NextResponse.redirect(checkout_session.url)
}
