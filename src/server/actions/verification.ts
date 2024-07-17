'use server'

import { auth, clerkClient, type User } from '@clerk/nextjs/server'

import { type SocialAccount, SocialAgent, VerificationMethod } from '~/core/structures'
import { StripeCreateAccount } from '~/core/payments'
import { createId } from '@paralleldrive/cuid2'
import { db } from '~/server/db'
import { artist_codes, artist_verifications, artists } from '~/server/db/schema'
import { eq } from 'drizzle-orm'

import * as sendbird from '~/server/sendbird'
import { set_index } from '~/core/search'
import { verify_clerk_auth } from './auth'

import { type VerificationDataType, verification_data } from '~/core/structures'
import { novu } from '~/server/novu'

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
            userId: user.id,
            nickname: artist.handle,
            profileUrl: user.imageUrl
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
    if (!(await verify_clerk_auth()))
        return { success: false, error: 'User not logged in' }

    // Validate fields
    const validateFields = verification_data.safeParse({
        requested_handle: form_data.get('requested_handle'),
        twitter: form_data.get('twitter'),
        website: form_data.get('website'),
        location: form_data.get('location'),
        method: form_data.get('method'),
        artist_code: form_data.get('artist_code') ?? undefined
    })

    // Check if we have errors
    if (validateFields.error) {
        return { success: false, error: validateFields.error.message }
    }

    switch (validateFields.data.method) {
        case VerificationMethod.Code:
            {
                // Check if the artist code is present
                if (!validateFields.data.artist_code) {
                    return { success: false, error: 'Artist code is required' }
                }

                // Check if the artist code exists
                const artist_code = await db.query.artist_codes.findFirst({
                    where: eq(artist_codes.code, validateFields.data.artist_code)
                })

                if (!artist_code) {
                    return { success: false, error: 'Artist code does not exist' }
                }

                const user = auth()

                // Create the artist
                await create_artist(
                    validateFields.data,
                    await clerkClient.users.getUser(user.userId!)
                )

                await novu.trigger('sign-up-approved', {
                    to: {
                        subscriberId: user.userId!
                    },
                    payload: {
                        artist_handle: validateFields.data.requested_handle
                    }
                })
            }
            break
        case VerificationMethod.Twitter:
            {
                // Create the artist verification object in the db
                await db.insert(artist_verifications).values({
                    id: createId(),
                    user_id: auth().userId!,
                    requested_handle: validateFields.data.requested_handle,
                    location: validateFields.data.location,
                    twitter: validateFields.data.twitter,
                    website: validateFields.data.website
                })

                // Notify the user of the request
                await novu.trigger('status-pending', {
                    to: {
                        subscriberId: auth().userId!
                    },
                    payload: {}
                })
            }
            break
    }

    return {
        success: true
    }
}
