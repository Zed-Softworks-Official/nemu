import { currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'

import { syncStripeSubData } from '~/app/api/stripe/sync'
import { tryCatch } from '~/lib/try-catch'
import { getRedisKey, redis } from '~/server/redis'

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

    const { error } = await tryCatch(syncStripeSubData(stripe_customer_id))
    if (error) {
        console.log('[STRIPE]: Error syncing subscription data', error)
        return redirect('/supporter/failure')
    }

    return redirect('/supporter/success')
}
