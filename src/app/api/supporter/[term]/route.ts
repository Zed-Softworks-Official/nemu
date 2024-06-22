import { clerkClient, getAuth } from '@clerk/nextjs/server'
import { eq } from 'drizzle-orm'
import { type NextRequest, NextResponse } from 'next/server'
import { StripeCreateCustomerZed, StripeCreateSupporterCheckout } from '~/core/payments'
import { db } from '~/server/db'
import { artists } from '~/server/db/schema'

export async function GET(
    req: NextRequest,
    { params }: { params: { term: 'monthly' | 'annual' } }
) {
    // Check if the term is valid
    if (params.term !== 'monthly' && params.term !== 'annual') {
        return NextResponse.redirect('/')
    }

    // Get user from session
    const auth = getAuth(req)
    if (!auth.userId) {
        return NextResponse.redirect('/u/login')
    }

    const user = await clerkClient.users.getUser(auth.userId)

    // Get artist from db
    const artist = await db.query.artists.findFirst({
        where: eq(artists.user_id, auth.userId)
    })

    // If the user doesn't have an artist id, redirect to home page
    if (!artist) {
        return NextResponse.redirect('/')
    }

    // Check if the artist has a zed customer id, and if not, create one
    if (!artist.zed_customer_id) {
        const stripe_customer = await StripeCreateCustomerZed(
            artist.handle,
            user.emailAddresses[0]?.emailAddress
        )

        await db
            .update(artists)
            .set({
                zed_customer_id: stripe_customer.id
            })
            .where(eq(artists.id, artist.id))

        artist.zed_customer_id = stripe_customer.id
    }

    // Generate the stripe checkout session
    return NextResponse.redirect(
        (
            await StripeCreateSupporterCheckout(
                artist.id,
                params.term,
                artist.zed_customer_id
            )
        ).url!
    )
}
