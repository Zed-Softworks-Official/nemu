import { currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { env } from '~/env'

import { getRedisKey, redis } from '~/server/redis'
import { stripe } from '~/server/stripe'

export async function GET() {
    const user = await currentUser()
    if (!user) {
        return redirect('/u/login')
    }

    const stripe_customer_id = await redis.get<string>(
        getRedisKey('stripe:user', user.id)
    )
    if (!stripe_customer_id) {
        return redirect('/')
    }

    const portal = await stripe.billingPortal.sessions.create({
        customer: stripe_customer_id,
        return_url: `${env.BASE_URL}`
    })

    if (!portal.url) {
        console.log('[STRIPE]: Failed to create billing portal session', portal)
        return redirect('/supporter/failure')
    }

    return redirect(portal.url)
}
