'use server'

import { auth, clerkClient } from '@clerk/nextjs/server'

import {
    type SocialAccount,
    SocialAgent,
    UserRole,
    VerificationMethod
} from '~/core/structures'
import { StripeCreateAccount } from '~/core/payments'
import { createId } from '@paralleldrive/cuid2'
import { db } from '~/server/db'
import { artist_codes, artist_verifications, artists, users } from '~/server/db/schema'
import { eq, or } from 'drizzle-orm'

import * as sendbird from '~/server/sendbird'
import { set_index } from '~/core/search'
import { verify_clerk_auth } from './auth'

import { type VerificationDataType, verification_data } from '~/core/structures'
import { knock, KnockWorkflows } from '~/server/knock'

async function create_artist(input: VerificationDataType, user_id: string) {
    const social_accounts: SocialAccount[] = []
    const clerk_client = await clerkClient()

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

    // Get the user from the database
    const user = await db.query.users.findFirst({
        where: eq(users.clerk_id, user_id)
    })

    if (!user) {
        throw new Error('User could not be found!')
    }

    // Get the user's profile url
    const profile_url = (await clerk_client.users.getUser(user_id)).imageUrl

    // Create Stripe Account for artist
    const generated_stripe_account = await StripeCreateAccount()

    // Gnerate the artist's id'
    const generated_id = createId()

    // Create the artist in the database
    await db.insert(artists).values({
        id: generated_id,
        stripe_account: generated_stripe_account.id,
        location: input.location,
        user_id: user.clerk_id,
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
    if (!user.has_sendbird_account) {
        // Create Sendbird user
        await sendbird.create_user({
            user_id: user.clerk_id,
            nickname: artist.handle,
            profile_url: profile_url
        })
    }

    // Update the user in the database
    await db
        .update(users)
        .set({
            role: UserRole.Artist,
            has_sendbird_account: true,
            artist_id: artist.id
        })
        .where(eq(users.clerk_id, user.clerk_id))

    // Update the user in clerk
    await clerk_client.users.updateUserMetadata(user.clerk_id, {
        publicMetadata: {
            handle: artist.handle,
            role: UserRole.Artist,
            artist_id: artist.id
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
        image_url: user.clerk_id
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

                const user = await auth()

                if (!user.userId) {
                    return { success: false, error: 'User not found' }
                }

                // Create the artist
                await create_artist(validateFields.data, user.userId)

                // Notify the user that they've been approved
                await knock.workflows.trigger(KnockWorkflows.VerificationApproved, {
                    recipients: [user.userId],
                    data: {
                        artist_handle: validateFields.data.requested_handle
                    }
                })

                // Delete artist code
                await db
                    .delete(artist_codes)
                    .where(eq(artist_codes.code, validateFields.data.artist_code))
            }
            break
        case VerificationMethod.Twitter:
            {
                // Create the artist verification object in the db
                await db.insert(artist_verifications).values({
                    id: createId(),
                    user_id: (await auth()).userId!,
                    requested_handle: validateFields.data.requested_handle,
                    location: validateFields.data.location,
                    twitter: validateFields.data.twitter,
                    website: validateFields.data.website
                })

                // Notify the user of the request
                await knock.workflows.trigger(KnockWorkflows.VerificationPending, {
                    recipients: [(await auth()).userId!]
                })
            }
            break
    }

    return {
        success: true,
        route:
            validateFields.data.method === VerificationMethod.Twitter
                ? '/artists/apply/further-steps'
                : '/artists/apply/success'
    }
}

export async function handle_exists(handle: string) {
    const auth_data = await auth()
    if (!auth_data.userId) {
        console.error('User not logged in')
        return { success: false }
    }

    // Check if the handle has already been taken by another artist
    // also check if the handle has been taken by an upcoming artist
    try {
        const results = await db
            .select({
                artistHandle: artists.handle,
                verificationHandle: artist_verifications.requested_handle
            })
            .from(artists)
            .fullJoin(
                artist_verifications,
                eq(artists.handle, artist_verifications.requested_handle)
            )
            .where(
                or(
                    eq(artists.handle, handle),
                    eq(artist_verifications.requested_handle, handle)
                )
            )

        if (results.length > 0) {
            return { success: true, exists: true }
        }
    } catch (e) {
        console.error('Failed to check for handle: ', e)
        return { success: false }
    }

    return { success: true, exists: false }
}

export async function get_artist_code(code: string) {
    // Check if the user is logged in
    const auth_data = await auth()
    if (!auth_data.userId) {
        console.error('User not logged in')
        return { success: false }
    }

    const result = await db.query.artist_codes.findFirst({
        where: eq(artist_codes.code, code)
    })

    if (!result) {
        return { success: false }
    }

    return { success: true }
}

type SetArtistCodeReturnType = Promise<
    { success: false } | { success: true; codes: string[] }
>

export async function set_artist_code(amount: number): SetArtistCodeReturnType {
    // Check if the user is logged in
    const auth_data = await auth()
    if (!auth_data.userId) {
        console.error('User not logged in')
        return { success: false }
    }

    // Check if the user is an admin
    const clerk_client = await clerkClient()
    const user = await clerk_client.users.getUser(auth_data.userId)
    if (user.publicMetadata.role !== UserRole.Admin) {
        console.error('User is not an admin')
        return { success: false }
    }

    // Check if the amount is greater than 0
    if (amount <= 0) {
        console.error('Amount must be greater than 0')
        return { success: false }
    }

    // Check if the amount is less than or equal to 100
    if (amount > 100) {
        console.error('Amount must be less than or equal to 100')
        return { success: false }
    }

    // Create the new artist codes
    const result: string[] = []
    for (let i = 0; i < amount; i++) {
        const new_code = 'NEMU-' + crypto.randomUUID()
        await db.insert(artist_codes).values({
            id: createId(),
            code: new_code
        })

        result.push(new_code)
    }

    return { success: true, codes: result }
}
