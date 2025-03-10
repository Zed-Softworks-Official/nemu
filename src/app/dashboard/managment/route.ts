import { currentUser } from '@clerk/nextjs/server'
import { eq } from 'drizzle-orm'
import { notFound, redirect } from 'next/navigation'

import {
    StripeCreateAccountLink,
    StripeCreateLoginLink,
    StripeGetAccount
} from '~/lib/payments'

import { db } from '~/server/db'
import { artists } from '~/server/db/schema'
import { getRedisKey, redis } from '~/server/redis'

export async function GET() {
    const user = await currentUser()
    if (user?.publicMetadata.role !== 'artist') {
        return notFound()
    }

    const artist = await db.query.artists.findFirst({
        where: eq(artists.userId, user.id)
    })

    if (!artist) {
        return notFound()
    }

    const dashboardLink = await redis.get<string>(
        getRedisKey('dashboard_links', artist.id)
    )

    if (dashboardLink) {
        return redirect(dashboardLink)
    }

    let url = '/'
    const stripeAccount = await StripeGetAccount(artist.stripeAccount)
    if (!stripeAccount.charges_enabled) {
        url = (await StripeCreateAccountLink(stripeAccount.id)).url
    } else {
        url = (await StripeCreateLoginLink(stripeAccount.id)).url
    }

    await redis.set<string>(getRedisKey('dashboard_links', artist.id), url, {
        ex: 3600
    })

    return redirect(url)
}
