import { Webhook } from 'svix'
import { headers } from 'next/headers'

import { env } from '~/env'
import { type NextRequest, NextResponse } from 'next/server'
import { clerkClient, type WebhookEvent } from '@clerk/nextjs/server'
import { UserRole } from '~/core/structures'
import { db } from '~/server/db'
import { artists, users } from '~/server/db/schema'
import { knock } from '~/server/knock'
import { eq } from 'drizzle-orm'
import { update_index } from '~/server/algolia/collections'

export async function POST(req: NextRequest) {
    const clerk_client_promise = clerkClient()

    const headerPayload = await headers()
    const svix_id = headerPayload.get('svix-id')
    const svix_timestamp = headerPayload.get('svix-timestamp')
    const svix_signature = headerPayload.get('svix-signature')

    if (!svix_id || !svix_timestamp || !svix_signature) {
        return new NextResponse('Missing svix headers', { status: 400 })
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const payload = await req.json()
    const body = JSON.stringify(payload)

    const wh = new Webhook(env.CLERK_WEBHOOK_SECRET)
    let evt: WebhookEvent
    try {
        evt = wh.verify(body, {
            'svix-id': svix_id,
            'svix-timestamp': svix_timestamp,
            'svix-signature': svix_signature
        }) as WebhookEvent
    } catch (error) {
        console.error(error)
        return new NextResponse('Error verifying webhook', { status: 400 })
    }

    const clerk_client = await clerk_client_promise
    switch (evt.type) {
        case 'user.created':
            {
                let username = evt.data.username

                if (!username && evt.data.first_name) {
                    username = evt.data.first_name
                } else if (!username && evt.data.email_addresses[0]?.email_address) {
                    const email = evt.data.email_addresses[0]?.email_address

                    username = email.split('@')[0] ?? 'Unknown User'
                }

                const user_update = clerk_client.users.updateUserMetadata(evt.data.id, {
                    publicMetadata: {
                        role: UserRole.Standard
                    }
                })

                const db_insert = db.insert(users).values({
                    clerk_id: evt.data.id,
                    role: UserRole.Standard
                })

                const knock_indentify = knock.users.identify(evt.data.id, {
                    username,
                    email: evt.data.email_addresses[0]?.email_address
                })

                await Promise.all([user_update, db_insert, knock_indentify])

                return new NextResponse('User created', { status: 200 })
            }
            break
        case 'user.updated':
            {
                if (evt.data.public_metadata.role !== UserRole.Artist) {
                    return new NextResponse('User is not an artist', { status: 200 })
                }

                const artist = await db.query.artists.findFirst({
                    where: eq(artists.user_id, evt.data.id)
                })

                if (!artist) {
                    return new NextResponse('Artist not found!', { status: 400 })
                }

                await update_index('artists', {
                    objectID: artist.id,
                    handle: artist.handle,
                    about: artist.about,
                    image_url: evt.data.image_url
                })

                return new NextResponse('User Updated', { status: 200 })
            }
            break
        case 'user.deleted':
            {
                return new Response('User Delete Triggered', { status: 200 })
            }
            break
    }

    return new NextResponse('Unhandled Event', { status: 400 })
}
