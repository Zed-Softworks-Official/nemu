import { currentUser } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { sync_sub_stripe_data } from '~/app/api/stripe/sync'
import { tryCatch } from '~/lib/try-catch'
import { get_redis_key, redis } from '~/server/redis'

export async function GET() {
    const user = await currentUser()
    if (!user) {
        return NextResponse.redirect('/u/login')
    }

    const stripe_customer_id = await redis.get<string>(
        get_redis_key('stripe:user', user.id)
    )
    if (!stripe_customer_id) {
        return NextResponse.redirect('/')
    }

    const { error } = await tryCatch(sync_sub_stripe_data(stripe_customer_id))
    if (error) {
        console.log('[STRIPE]: Error syncing subscription data', error)
        return NextResponse.redirect('/supporter/failure')
    }

    return NextResponse.redirect('/supporter/success')
}
