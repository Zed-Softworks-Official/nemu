'use server'

import { z } from 'zod'
import { clerkClient, type User } from '@clerk/nextjs/server'

import { type SocialAccount, SocialAgent } from '~/core/structures'
import { StripeCreateAccount } from '~/core/payments'
import { createId } from '@paralleldrive/cuid2'
import { db } from '~/server/db'
import { artists } from '~/server/db/schema'
import { eq } from 'drizzle-orm'

import * as sendbird from '~/server/sendbird'
import { set_index } from '~/core/search'
import { verify_clerk_auth } from './auth'

import { type VerificationDataType, verification_data } from '~/core/structures'

async function create_artist(input: VerificationDataType, user: User) {
    const social_accounts: SocialAccount[] = []

    if (input.twitter) {
        social_accounts.push({
            agent: SocialAgent.Twitter,
            url: input.twitter
        })
    }

    if (input.website) {
        social_accounts.push({
            agent: SocialAgent.Website,
            url: input.website
        })
    }

    // Create Stripe Account for artist
    const generated_stripe_account = await StripeCreateAccount()

    // Gnerate the artist's id'
    const generated_id = createId()

    // Create the artist in the database
    await db.insert(artists).values({
        id: generated_id,
        stripe_account: generated_stripe_account.id,
        location: input.location,
        user_id: user.id,
        handle: input.requested_handle,
        socials: social_accounts
    })

    const artist = await db.query.artists.findFirst({
        where: eq(artists.id, generated_id)
    })

    if (!artist) {
        throw new Error('Artist could not be created!')
    }

    // Check if the user already has a sendbird account
    if (!user.publicMetadata.has_sendbird_account) {
        // Create Sendbird user
        await sendbird.create_user({
            user_id: user.id,
            nickname: artist.handle,
            profile_url: user.imageUrl
        })
    }

    await clerkClient.users.updateUserMetadata(user.id, {
        publicMetadata: {
            has_sendbird_account: true
        },
        privateMetadata: {
            artist_id: artist.id
        }
    })

    // Update Algolia
    await set_index('artists', {
        objectID: artist.id,
        handle: artist.handle,
        about: artist.about,
        image_url: user.imageUrl
    })

    return artist
}

export async function verify_artist(prev_state: unknown, form_data: FormData) {
    // Check if the user is logged in,
    // if the user is not logged in, return a failure state
    if (!(await verify_clerk_auth())) return { success: false }

    // Validate fields
    const validateFields = verification_data.safeParse({
        requested_handle: form_data.get('requested_handle'),
        twitter: form_data.get('twitter'),
        website: form_data.get('website'),
        location: form_data.get('location'),
        method: form_data.get('method'),
        artist_code: form_data.get('artist_code')
    })

    console.log(validateFields.data)

    return {
        success: true
    }
}
