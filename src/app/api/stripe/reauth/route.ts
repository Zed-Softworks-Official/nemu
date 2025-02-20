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
        where: eq(artists.user_id, user.id)
    })

    if (!artist) {
        return redirect('/')
    }

    const account_link = await StripeCreateAccountLink(artist.stripe_account)
    return NextResponse.redirect(account_link.url)
}
