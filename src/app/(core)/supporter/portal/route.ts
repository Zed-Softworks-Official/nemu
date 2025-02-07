import { currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { get_redis_key, redis } from '~/server/redis'
import { stripe } from '~/server/stripe'

export async function GET() {
    const user = await currentUser()
    if (!user) {
        return redirect('/u/login')
    }

    const stripe_customer_id = await redis.get<string>(
        get_redis_key('stripe:user', user.id)
    )
    if (!stripe_customer_id) {
        return redirect('/')
    }

    const portal = await stripe.billingPortal.sessions.create({
        customer: stripe_customer_id
    })

    if (!portal.url) {
        console.log('[STRIPE]: Failed to create billing portal session', portal)
        return redirect('/supporter/failure')
    }

    return redirect(portal.url)
}
