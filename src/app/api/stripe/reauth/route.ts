import { currentUser } from '@clerk/nextjs/server'
import { eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { NextResponse } from 'next/server'

import { StripeCreateAccountLink } from '~/lib/payments'
import { db } from '~/server/db'
import { artists } from '~/server/db/schema'

export async function GET() {
    const user = await currentUser()
    if (!user) {
        return redirect('/u/login')
    }

    const artist = await db.query.artists.findFirst({
        where: eq(artists.userId, user.id)
    })

    if (!artist) {
        return redirect('/')
    }

    const accountLink = await StripeCreateAccountLink(artist.stripeAccount)
    return NextResponse.redirect(accountLink.url)
}
