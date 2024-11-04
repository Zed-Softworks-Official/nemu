'use server'

import { createId } from '@paralleldrive/cuid2'
import { and, eq } from 'drizzle-orm'

import { db } from '~/server/db'
import { verify_auth } from '~/server/actions/auth'
import { artists, stripe_customer_ids } from '~/server/db/schema'
import {
    StripeCreateAccountLink,
    StripeCreateCustomer,
    StripeCreateLoginLink,
    StripeCreateSupporterBilling,
    StripeGetAccount
} from '~/core/payments'
import { type StripeDashboardData } from '~/core/structures'

// TODO: Fix this because this seems bad
export async function set_customer_id(artist_id: string) {
    const auth_data = await verify_auth()
    if (!auth_data) return { success: false }

    // Check if the user and the artist already have a stripe linked together
    let customer_id
    try {
        customer_id = await db.query.stripe_customer_ids.findFirst({
            where: and(
                eq(stripe_customer_ids.user_id, auth_data.user.id),
                eq(stripe_customer_ids.artist_id, artist_id)
            )
        })
    } catch (e) {
        console.error('Failed to get customer id: ', e)
        return { success: false }
    }

    // If the customer id exists then return that we have one
    if (customer_id) {
        return {
            stripe_account: customer_id.stripe_account,
            customer_id: customer_id.customer_id
        }
    }

    // Otherwise we need to create a customer id for the user
    let artist
    try {
        artist = await db.query.artists.findFirst({
            where: eq(artists.id, artist_id)
        })
    } catch (e) {
        console.error('Failed to get artist: ', e)
        return { success: false }
    }

    if (!artist) {
        console.error('Artist not found')
        return { success: false }
    }

    let stripe_customer
    try {
        stripe_customer = await StripeCreateCustomer(
            artist.stripe_account,
            auth_data.user.username ?? auth_data.user.firstName ?? 'User',
            auth_data.user.emailAddresses[0]?.emailAddress ?? undefined
        )
    } catch (e) {
        console.error('Failed to create customer: ', e)
        return { success: false }
    }

    if (!stripe_customer) {
        console.error('Failed to create customer')
        return { success: false }
    }

    // Create a customer object in the database for the given artist
    const generated_id = createId()
    try {
        await db.insert(stripe_customer_ids).values({
            id: generated_id,
            user_id: auth_data.user.id,
            artist_id: artist_id,
            stripe_account: artist.stripe_account,
            customer_id: stripe_customer.id
        })
    } catch (e) {
        console.error('Failed to create customer id: ', e)
        return { success: false }
    }

    return {
        customer_id: stripe_customer.id,
        stripe_account: artist.stripe_account
    }
}

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
