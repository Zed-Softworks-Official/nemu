import { Webhook } from 'svix'
import { headers } from 'next/headers'
import { eq } from 'drizzle-orm'

import { clerkClient, type WebhookEvent } from '@clerk/nextjs/server'

import { env } from '~/env'
import { type PublicUserMetadata, UserRole } from '~/core/structures'
import { db } from '~/server/db'
import { users } from '~/server/db/schema'
import { update_index } from '~/core/search'
import { AsRedisKey, invalidate_cache } from '~/server/cache'
import * as sendbird from '~/server/sendbird'

/**
 * Handles Clerk Webhook Events
 */
export async function POST(req: Request) {
    // Get the headers
    const headersPayload = headers()
    const svix_id = headersPayload.get('svix-id')
    const svix_timestamp = headersPayload.get('svix-timestamp')
    const svix_signature = headersPayload.get('svix-signature')

    // If there are no headers throw an error
    if (!svix_id || !svix_timestamp || !svix_signature) {
        return new Response('Missing headers', { status: 400 })
    }

    // Get Body
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const payload = await req.json()
    const body = JSON.stringify(payload)

    // Create a new svix instance with your secret
    const wh = new Webhook(env.CLERK_WEBHOOK_SECRET)

    let event: WebhookEvent

    // Verify the payload with headers
    try {
        event = wh.verify(body, {
            'svix-id': svix_id,
            'svix-signature': svix_signature,
            'svix-timestamp': svix_timestamp
        }) as WebhookEvent
    } catch (e) {
        console.error(e)
        return new Response('An Error Occured', { status: 400 })
    }

    // Switch on the type of event that we received
    switch (event.type) {
        case 'user.created':
            {
                // Add metadata to the user
                const publicMetadata: PublicUserMetadata = {
                    role: UserRole.Standard,
                    has_sendbird_account: false
                }

                await clerkClient.users.updateUserMetadata(event.data.id, {
                    publicMetadata
                })

                // Add a username to the user if it doesn't exist
                if (!event.data.username && event.data.first_name) {
                    await clerkClient.users.updateUser(event.data.id, {
                        username: event.data.first_name
                    })
                }

                if (!event.data.username && event.data.email_addresses.length > 0) {
                    const email = event.data.email_addresses[0]?.email_address

                    await clerkClient.users.updateUser(event.data.id, {
                        username: email?.substring(0, email.indexOf('@'))
                    })
                }

                // Create a new user in the database
                await db.insert(users).values({
                    clerk_id: event.data.id,
                    role: UserRole.Standard
                })

                return new Response('User Created', { status: 200 })
            }
            break
        case 'user.updated':
            {
                // Update the users profile photo if it's changed inside of
                // algolia, sendbird, and invalidate the cache
                const artist = await db.query.artists.findFirst({
                    where: eq(users.clerk_id, event.data.id)
                })

                if (!artist) {
                    return new Response('Artist not found', { status: 400 })
                }

                // Update Algolia
                await update_index('artists', {
                    objectID: event.data.id,
                    handle: artist.handle,
                    about: artist.about,
                    image_url: event.data.image_url
                })

                // Invalidate Cache
                await invalidate_cache(
                    AsRedisKey('artists', artist.handle),
                    'artist_data'
                )

                // Update Sendbird
                await sendbird.update_user({
                    profile_url: event.data.image_url
                })

                return new Response('User Updated', { status: 200 })
            }
            break
        case 'user.deleted':
            {
                return new Response('User Deleted', { status: 200 })
            }
            break
    }

    return new Response('Unhandled Event', { status: 400 })
}
