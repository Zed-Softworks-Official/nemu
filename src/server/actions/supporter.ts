'use server'

import { auth, clerkClient } from '@clerk/nextjs/server'
import { UserRole } from '~/core/structures'

import { eq } from 'drizzle-orm'
import { StripeCreateCustomerZed, StripeCreateSupporterCheckout } from '~/core/payments'

import { env } from '~/env'
import { db } from '~/server/db'
import { artists } from '~/server/db/schema'

export async function supporter_monthly() {
    return await generate_url('monthly')
}

export async function supporter_annual() {
    return await generate_url('annual')
}

async function generate_url(term: 'monthly' | 'annual') {
    // Check if the user is logged in
    const auth_data = auth()
    if (!auth_data.userId) {
        return {
            redirect_url: env.BASE_URL + '/u/login'
        }
    }

    // Check if the user is an artist
    const user = await clerkClient().users.getUser(auth_data.userId)
    if (user.publicMetadata.role !== UserRole.Artist) {
        return {
            redirect_url: env.BASE_URL + '/u/login'
        }
    }

    // Get the artist from the db
    const artist = await db.query.artists.findFirst({
        where: eq(artists.user_id, auth_data.userId)
    })

    if (!artist) {
        throw new Error('Artist not found!')
    }

    // Check if the artist has a zed customer id, and if not, create one
    if (!artist.zed_customer_id) {
        const stripe_account = await StripeCreateCustomerZed(
            artist.handle,
            user.emailAddresses[0]?.emailAddress ?? undefined
        )

        await db
            .update(artists)
            .set({
                zed_customer_id: stripe_account.id
            })
            .where(eq(artists.id, artist.id))

        artist.zed_customer_id = stripe_account.id
    }

    // Generate the stripe checkout session
    return {
        redirect_url: (
            await StripeCreateSupporterCheckout(artist.id, term, artist.zed_customer_id)
        ).url
    }
}
