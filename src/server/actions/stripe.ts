'use server'

import { db } from '~/server/db'
import { artists } from '~/server/db/schema'
import { eq } from 'drizzle-orm'

import {
    StripeGetAccount,
    StripeCreateAccountLink,
    StripeCreateLoginLink,
    StripeCreateSupporterBilling
} from '~/lib/payments'
import { type StripeDashboardData } from '~/lib/structures'

export async function get_dashboard_links(user_id: string) {
    // Get the artist from the db
    let artist
    try {
        artist = await db.query.artists.findFirst({
            where: eq(artists.user_id, user_id)
        })
    } catch (e) {
        console.error('Failed to get artist: ', e)
        return undefined
    }

    if (!artist) {
        console.error('Artist not found')
        return undefined
    }

    const result: StripeDashboardData = {
        managment: {
            type: 'dashboard',
            url: ''
        },
        checkout_portal: ''
    }

    // Get the stripe account if they have one
    const stripe_account = await StripeGetAccount(artist.stripe_account)

    // If the user has not completed the onboarding, return an onboarding url
    // else return the stripe connect url
    if (!stripe_account.charges_enabled) {
        result.managment = {
            type: 'onboarding',
            url: (await StripeCreateAccountLink(stripe_account.id)).url
        }
    } else {
        result.managment = {
            type: 'dashboard',
            url: (await StripeCreateLoginLink(stripe_account.id)).url
        }
    }

    if (artist.zed_customer_id) {
        const portal_url = (await StripeCreateSupporterBilling(artist.zed_customer_id))
            .url

        result.checkout_portal = portal_url
    }

    return result
}
